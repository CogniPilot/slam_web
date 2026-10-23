// Browser-safe readonly helpers. Invoke at the explicitly named boundary;
// addresses belong to the exact native manifest, never to a guessed scratch ABI.
const widths={f64:8,i64:8,u8:1};
function read(layout,memory,name,side,start=0,count){
  const run=layout.state_runs.find(row=>row.name==='estimator.localization.catalog.'+name);
  if(!run)throw Error('Missing native catalog run '+name);
  count??=run.count;
  const width=widths[run.lane],offset=run[side]+start*width;
  if(!width||!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(count)||start<0||start+count>run.count||offset+count*width>memory.buffer.byteLength)
    throw Error('Invalid native catalog span '+name);
  const view=new DataView(memory.buffer);
  return Array.from({length:count},(_,i)=>{
    const at=offset+i*width,value=run.lane==='f64'?view.getFloat64(at,true):run.lane==='i64'?Number(view.getBigInt64(at,true)):view.getUint8(at);
    if(!Number.isFinite(value)||run.lane==='i64'&&!Number.isSafeInteger(value))throw Error('Invalid native catalog value '+name);
    return value;
  });
}

export function snapshotPriorCatalogReference(layout,memory,{referenceId}={}){
  // BEFORE the original eval_assignments, AFTER SlamNativeProgram.step carry.
  const side='previous',capacity=layout.state_runs.find(row=>row.name==='estimator.localization.catalog.occupied')?.count;
  if(!Number.isInteger(capacity)||capacity<1)throw Error('Missing native catalog capacity');
  const nextId=read(layout,memory,'nextId',side)[0],generation=read(layout,memory,'generation',side)[0];
  if(!Number.isInteger(nextId)||nextId<2)throw Error('No retained prior keyframe');
  const id=referenceId??nextId-1;
  if(!Number.isSafeInteger(id)||id<1||id>=nextId)throw Error('Invalid reference identity');
  const slot=(id-1)%capacity,index=slot;
  const fields={generation:['generations',1],id:['ids',1],epoch:['epochs',1],imageTime:['imageTimes',1],
    count:['counts',1],enabled:['featureEnabled',350],descriptor:['descriptors',350*49],
    opticalPoint:['opticalPoints',350*3],pixels:['pixelCoordinates',350*2],
    rgbCalibration:['rgbCalibrations',4],depthCalibration:['depthCalibrations',4],
    disparityNoise:['disparityNoises',1],noiseReferenceFx:['noiseReferenceFocals',1],baseline:['baselines',1]};
  if(read(layout,memory,'occupied',side,index,1)[0]!==1||read(layout,memory,'ids',side,index,1)[0]!==id||read(layout,memory,'generations',side,index,1)[0]!==generation)
    throw Error('Reference is absent or catalog identity differs');
  const frame={};
  for(const [key,[name,stride]] of Object.entries(fields)){
    const run=layout.state_runs.find(row=>row.name==='estimator.localization.catalog.'+name);
    const lane=key==='enabled'?'u8':['generation','id','epoch','count','pixels'].includes(key)?'i64':'f64';
    if(!run||run.count!==capacity*stride||run.lane!==lane)throw Error('Catalog layout shape/lane differs for '+name);
    const values=read(layout,memory,name,side,index*stride,stride);frame[key]=stride===1?values[0]:values;
  }
  if(frame.epoch<0||frame.imageTime<0||!Number.isInteger(frame.count)||frame.count<0||frame.count>350)throw Error('Invalid retained frame metadata');
  return {boundary:'after-carry-before-entry',side,slot:slot+1,nextId,capacity,frame};
}

export function snapshotSparseImageOutputs(layout,memory){
  // AFTER the image-on eval_assignments returns status0, BEFORE another entry.
  const result={boundary:'after-image-entry-before-next-carry'};
  for(const [name,count] of [['features',350*3],['featureEnabled',350]]){
    const entry=layout.model_outputs.find(row=>row.name===name);
    if(!entry||entry.count!==count||!Number.isSafeInteger(entry.index)||entry.index<0||entry.index+count>layout.y_count)
      throw Error('Missing full sparse output '+name);
    result[name]=Array.from(new Float64Array(memory.buffer,entry.index*8,count));
  }
  return result;
}
