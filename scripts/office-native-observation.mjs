// Research-only, readonly snapshots of declared ABI views. No scratch decoding.
const CAPACITY=350,SLOTS=64;
const FIELDS={generation:['generations',1],id:['ids',1],epoch:['epochs',1],imageTime:['imageTimes',1],count:['counts',1],
 enabled:['featureEnabled',CAPACITY],descriptor:['descriptors',CAPACITY*49],opticalPoint:['opticalPoints',CAPACITY*3],pixels:['pixelCoordinates',CAPACITY*2],
 rgbSize:['rgbSizes',2],depthSize:['depthSizes',2],rgbCalibration:['rgbCalibrations',4],depthCalibration:['depthCalibrations',4],
 opticalToBody:['opticalToBodyRotations',9],cameraOriginBody:['cameraOriginsBody',3],disparityNoise:['disparityNoises',1],noiseReferenceFx:['noiseReferenceFocals',1],baseline:['baselines',1],vocabularyVersion:['vocabularyVersions',1]};
export function declaredView(program,slot,offset=slot.offset){
 const Type=slot.lane==='f64'?Float64Array:slot.lane==='i64'?BigInt64Array:slot.lane==='u8'?Uint8Array:null;
 if(!Type||!Number.isSafeInteger(slot.count)||slot.count<1||!Number.isSafeInteger(offset)||offset<0||offset%Type.BYTES_PER_ELEMENT||offset+slot.count*Type.BYTES_PER_ELEMENT>program.memory.buffer.byteLength)throw Error('Invalid declared office snapshot ABI slot');
 return new Type(program.memory.buffer,offset,slot.count);
}
export function copyCatalog(program,side){
 if(!['previous','next'].includes(side))throw Error('Unknown catalog snapshot side');
 const runs=new Map(program.layout.state_runs.map(run=>[run.name,run]));
 const read=name=>{
  const run=runs.get('estimator.localization.catalog.'+name);
  if(!run)throw Error('Missing declared catalog run: '+name);
  return Array.from(declaredView(program,run,run[side]),Number);
 };
 const occupied=read('occupied');if(occupied.length!==SLOTS)throw Error('Unexpected office catalog capacity');
 const arrays=Object.fromEntries(Object.entries(FIELDS).map(([key,[name,count]])=>{
  const value=read(name);if(value.length!==SLOTS*count)throw Error('Unexpected office catalog field shape: '+name);return[key,value];
 }));
 const frames=[];
 for(let slot=0;slot<SLOTS;slot++)if(occupied[slot]){
  const frame={};for(const [key,[,count]]of Object.entries(FIELDS))frame[key]=count===1?arrays[key][slot]:arrays[key].slice(slot*count,(slot+1)*count);
  if(!Number.isSafeInteger(frame.id)||frame.id<1||!Number.isSafeInteger(frame.epoch)||frame.epoch<0||frame.count<0||frame.count>CAPACITY)throw Error('Invalid occupied office catalog identity');
  frames.push(frame);
 }
 return {nextId:read('nextId')[0],nextSlot:read('nextSlot')[0],lastEpoch:read('lastEpoch')[0],lastTime:read('lastTime')[0],frames};
}
export function copyInputs(program){
 return Object.fromEntries(Object.entries(program.layout.inputs).filter(([,slot])=>slot.count<=64).map(([name,slot])=>[name,Array.from(declaredView(program,slot),Number)]));
}
export function installOfficeNativeTrace(Program,target=globalThis){
 const originalLoad=Program.load;
 Program.load=async function(...args){
  const assets=[];
  if(args[0]?.files&&typeof args[1]==='function'){
   const [layout,fetchFile]=args;
   args[1]=async(file,encoding)=>{
    const bytes=await fetchFile(file,encoding),declared=Object.values(layout.files).find(entry=>entry.file===file);
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
    if(!declared||declared.sha256!==digest||declared.bytes!==bytes.length)throw Error('Diagnostic native asset identity failure: '+file);
    assets.push({file,bytes:bytes.length,sha256:digest});return bytes;
   };
  }
  const program=await originalLoad.apply(this,args),entry=program.entry;
  if(typeof entry!=='function')throw Error('Native host entry boundary changed');
  program.entry=function(...callArgs){
   const inputs=copyInputs(program),imageOn=inputs.imageRequested===undefined||inputs.imageRequested[0]===1;
   if(!imageOn)return entry(...callArgs);
   const initialize=/Initialize$/.test(program.layout.model);
   // step() has performed carry already. Copy PREVIOUS offsets before entry:
   // an in-place export may overwrite them during this very call.
   const previous=initialize?null:copyCatalog(program,'previous');
   const status=entry(...callArgs);
   if(status!==0){target.__officeNativeTrace={status,inputs,failure:'Native entry refused'};return status;}
   const outputs={};
   for(const name of ['features','featureEnabled','loopCandidateReferenceId','loopCandidateReason','loopCandidateMatchedCount','loopCandidateVerified']){
    const values=program.output(name);if(values)outputs[name]=Array.from(values,Number);
   }
   if(outputs.features?.length!==CAPACITY*3||outputs.featureEnabled?.length!==CAPACITY)throw Error('Native sparse feature output ABI changed');
   const derived=program.derived(),next=copyCatalog(program,'next');
   const count=Number(derived.loopCandidateCount??program.output('loopCandidateCount')?.[0]);
   if(!Number.isSafeInteger(count)||count<0||count>4)throw Error('Invalid declared loop candidate count');
   // Integer/Boolean arrays may be exported only as indexed typed lanes.
   const ids=new Set();
   for(let rank=0;rank<count;rank++){
    const id=Number(outputs.loopCandidateReferenceId?.[rank]??derived[`loopCandidateReferenceId[${rank+1}]`]);
    if(Number.isSafeInteger(id)&&id>0)ids.add(id);
   }
   if(previous&&previous.nextId>1)ids.add(previous.nextId-1);
   const references=(previous?.frames??[]).filter(frame=>ids.has(frame.id));
   const current=next.frames.find(frame=>frame.epoch===inputs.imageEpoch?.[0]);
   target.__officeNativeTrace={schemaVersion:1,status,inputs,outputs,derived,references,retainedCurrent:current??null,
    previousCatalog:previous?{nextId:previous.nextId,nextSlot:previous.nextSlot,lastEpoch:previous.lastEpoch,lastTime:previous.lastTime}:null,
    source:{model:program.layout.model,module:program.layout.files.module,assets},
    scope:'Declared previous state after carry, before entry; declared outputs/next state after return. Sparse350slots retained. Sequential Verify matchedCount is not exported; localization matchCount is not a substitute.'};
   return status;
  };
  return program;
 };
}
