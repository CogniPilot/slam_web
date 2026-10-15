// Compact host manifest for a Rumoca native_step export directory. The export's
// layout.json lists every typed lane (hundreds of thousands of entries); the
// browser needs only the memory geometry, the declared input slots, the carried
// state tables and the handful of derived scalar outputs.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {join} from 'node:path';

export const SLAM_NATIVE_FILES=['module.wasm','y.bin','p.bin','lanes.bin','state_in.bin','state_out.bin','state_lane.bin','state_init.bin'];
const SCALAR_INPUTS=['depthUnits','disparityNoise','noiseReferenceFx','baseline','h','intervalTime'];
const ARRAY_INPUTS={rgbCalibration:4,depthCalibration:4,opticalToBody:9,cameraOriginBody:3,accel:3,gyro:3,gravity:3};

/** Reduce an export layout to what the host program needs. Input offsets come
 * from `--set` settings or the compiler's model_inputs table; both are absolute
 * byte offsets into the one linear memory. */
export function compactLayout(model,layout){
  const required=['pages','y_bytes','p_offset','scratch_offset','typed_offset','typed_bytes','y_count','p_count','state','carry','outputs'];
  for(const key of required)if(layout[key]===undefined)throw new Error(`native_step layout lacks ${key} for ${model}`);
  const settings=new Map((layout.settings??[]).map(([name,offset])=>[name,offset]));
  const inputs={};
  const fromTable=new Map((layout.model_inputs??[]).map(entry=>[entry.name,entry]));
  const realOffset=(name)=>{
    if(settings.has(name))return settings.get(name);
    const base=name.replace(/\[.*$/,''),entry=fromTable.get(base);
    if(entry&&entry.kind==='Real'){
      const index=name===base?0:indexWithin(name,entry);
      const first=typeof entry.offset==='number'?entry.offset:layout.p_offset+entry.p_index*8;
      return first+index*8;
    }
    return undefined;
  };
  for(const name of SCALAR_INPUTS){const offset=realOffset(name);if(offset!==undefined)inputs[name]={offset,count:1,lane:'f64'};}
  for(const [name,count] of Object.entries(ARRAY_INPUTS)){
    const first=realOffset(elementName(name,0,count));
    if(first===undefined)continue;
    for(let i=1;i<count;i++)if(realOffset(elementName(name,i,count))!==first+8*i)throw new Error(`${model} input ${name} is not contiguous`);
    inputs[name]={offset:first,count,lane:'f64'};
  }
  const slots=layout.frames?.slots;
  if(slots?.rgb)inputs.rgb={offset:slots.rgb[0],count:slots.rgb[1],lane:'f64'};
  if(slots?.depth)inputs.depth={offset:slots.depth[0],count:slots.depth[1],lane:'f64'};
  if(slots?.interval_time!=null)inputs.intervalTime??={offset:slots.interval_time,count:1,lane:'f64'};
  if(slots?.image_epoch!=null)inputs.imageEpoch={offset:slots.image_epoch,count:1,lane:'i64'};
  // Typed (Integer, Boolean) inputs come only from the compiler's table.
  for(const entry of layout.model_inputs??[]){
    if(inputs[entry.name]||typeof entry.offset!=='number')continue;
    if(entry.lane==='i64'||entry.lane==='u8')inputs[entry.name]={offset:entry.offset,count:entry.count,lane:entry.lane};
    else if(entry.kind==='Real')inputs[entry.name]={offset:entry.offset,count:entry.count,lane:'f64'};
  }
  for(const unsourced of layout.unsourced_inputs_zero_filled??[]){
    const base=String(unsourced.name??'').replace(/\[.*$/,'');
    if(unsourced.kind==='Real'&&!inputs[base])inputs[base]={offset:layout.p_offset+unsourced.p_index*8,count:unsourced.count,lane:'f64'};
  }
  // Keep the small typed loop-pair vectors as well as scalar diagnostics.
  // Other flattened arrays (especially carried State) stay out of the manifest.
  const outputs=layout.outputs.filter(entry=>typeof entry.name==='string'&&!entry.name.startsWith('next.')&&
    (!entry.name.includes('[')||/^loop(?:ReferenceId|CurrentId|Score)\[\d+\]$/.test(entry.name)))
    .map(({name,lane,offset})=>({name,lane,offset:layout.typed_offset+offset}));
  return {
    model,pages:layout.pages,y_bytes:layout.y_bytes,p_offset:layout.p_offset,scratch_offset:layout.scratch_offset,
    typed_offset:layout.typed_offset,typed_bytes:layout.typed_bytes,y_count:layout.y_count,p_count:layout.p_count,
    state:{count:layout.state.count,previous_hash:layout.state.previous_hash,next_hash:layout.state.next_hash},
    carry:[...layout.carry],inputs,outputs,
    y_names:[...(layout.y_names??[])],
    model_outputs:(layout.model_outputs??[]).map(({name,index,count})=>({name,index,count})),
    state_runs:(layout.state_runs??[]).map(({name,lane,previous,next,count})=>({name,lane,previous,
      next:publishedStateOffset(next,count*(lane==='u8'?1:8),layout),count})),
  };
}
// In-place programs publish carried outputs in their input cells. The export's
// declaration table still names the original output slots; its carry aliases
// are the compiler's authoritative mapping to the current value.
function publishedStateOffset(offset,bytes,layout){
  for(const aliases of [layout.carried??[],layout.carried_lanes??[]]){
    for(let i=0;i<aliases.length;i+=3){
      const [from,to,size]=aliases.slice(i,i+3);
      if(offset>=from&&offset+bytes<=from+size)return to+offset-from;
      if(offset<from+size&&offset+bytes>from)throw new Error('Native carried state splits a named state run');
    }
  }
  return offset;
}
function elementName(name,index,count){
  if(count===9)return `${name}[${Math.floor(index/3)+1},${index%3+1}]`;
  return `${name}[${index+1}]`;
}
function indexWithin(name,entry){
  const match=/\[([\d,]+)\]$/.exec(name);if(!match)throw new Error(`Unexpected input name ${name}`);
  const parts=match[1].split(',').map(Number);
  if(parts.length===1)return parts[0]-1;
  if(parts.length===2&&entry.count===9)return (parts[0]-1)*3+parts[1]-1;
  throw new Error(`Unsupported input shape for ${name}`);
}

/** Read one export directory into a compact layout plus its raw files. */
export async function readExport(model,directory){
  const layout=JSON.parse(await readFile(join(directory,'layout.json'),'utf8'));
  const files={};
  for(const name of SLAM_NATIVE_FILES){
    try{files[name]=await readFile(join(directory,name));}
    catch(error){if(error.code!=='ENOENT'||name!=='state_init.bin')throw error;}
  }
  if(files['state_init.bin']?.length===0)delete files['state_init.bin'];
  return {layout:compactLayout(model,layout),files};
}

/** Publish a content-addressed, gzip-compressed asset set with one manifest. */
export function publishedAssets(exports,metadata={}){
  const blobs=new Map(),models={};
  for(const [key,{layout,files}] of Object.entries(exports)){
    const references={};
    for(const [name,bytes] of Object.entries(files)){
      const sha256=createHash('sha256').update(bytes).digest('hex');
      const published=`${sha256.slice(0,16)}-${name}.gz`;
      if(!blobs.has(published))blobs.set(published,{bytes:gzipSync(bytes,{level:6}),sha256,rawBytes:bytes.length});
      references[name.replace(/\.(wasm|bin)$/,'')]={file:published,sha256,bytes:bytes.length,encoding:'gzip'};
    }
    models[key]={...layout,files:references};
  }
  const manifest={schemaVersion:1,...metadata,models};
  return {manifest,blobs};
}
