import {ModelicaSlamSession} from '../src/modelica-slam-session';
import {SlamNativeProgram} from '../src/slam-native-program';
import {slamInitialFrameFromSensor,slamIntervalFrameFromSensor} from '../src/modelica-slam-frame';
import {nativeParametersFor} from '../src/model-parameters';
import {OFFICE_REPLAY,exact,exactCaptured,presented,firstExactDifference,capturedEncoding} from './office-replay-contract.mjs';
import {installReplayObserver} from './office-replay-observer.mjs';

// Saved observations only. The candidate changes canonical source, never the
// producer packet, host arithmetic, settings, feature slots or pose guards.
const target=globalThis as any;
const sha=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const bytes=async(url:string)=>{const r=await fetch(url);if(!r.ok)throw Error('Comparison input unavailable: '+url);return new Uint8Array(await r.arrayBuffer());};
const text=(b:Uint8Array)=>new TextDecoder().decode(b);
const b64=(b:Uint8Array)=>{let s='';for(let i=0;i<b.length;i+=16384)s+=String.fromCharCode(...b.subarray(i,i+16384));return btoa(s);};
// Phase A defaults; Phase B passes the plan's epochs and its boundary B as prefixEnd.
const context:any={epoch:-1,programs:new Map(),traceTarget:{},pending:[],wanted:new Set(OFFICE_REPLAY.snapshots),prefixEnd:1206};
installReplayObserver(SlamNativeProgram,context);
let manifest:any,project:any,session:ModelicaSlamSession,captureBase:string,assetsBase:string;
const assetRecords=new Map(),savedReferences=new Set();
async function asset(file:string,encoding:string){
 let value=await bytes(new URL(file,assetsBase).href);
 if(encoding==='gzip')value=new Uint8Array(await new Response(new Blob([value]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
 return value;
}
async function exactReference(pointer:any,actual:any){
 if(!pointer||!actual)throw Error('Retained catalog payload availability differs');
 const raw=await bytes(new URL(pointer.file,captureBase).href);
 exact(await sha(raw),pointer.sha256,'Original reference payload');
 exactCaptured(actual,JSON.parse(text(raw)),'Exact prefix reference payload');
 exact(await sha(new TextEncoder().encode(JSON.stringify(actual)+'\n')),pointer.sha256,'Exact prefix reference serialization');
}
async function saveReference(frame:any){
 const raw=new TextEncoder().encode(JSON.stringify(frame)+'\n'),digest=await sha(raw);
 const file=`native-frames/${frame.generation}-${frame.id}-${frame.epoch}-${digest.slice(0,16)}.json`;
 if(!savedReferences.has(digest)){
  await target.officeCompareReference({file,sha256:digest,base64:b64(raw)});savedReferences.add(digest);
 }
 return{file,sha256:digest,id:frame.id,epoch:frame.epoch,time:frame.imageTime,generation:frame.generation};
}
target.OfficeCompare={failure:null,
 async initialize(base:string,nativeBase:string,originalManifestHash:string,candidateManifestHash:string,phaseB?:{wanted:number[],prefixEnd:number}){
  captureBase=base;assetsBase=nativeBase;
  if(phaseB){context.wanted=new Set(phaseB.wanted);context.prefixEnd=phaseB.prefixEnd;}
  const old=await bytes(new URL('native-manifest.json',base).href);exact(await sha(old),originalManifestHash,'Original native manifest');
  const raw=await bytes(new URL('manifest.json',nativeBase).href);exact(await sha(raw),candidateManifestHash,'Pinned candidate manifest');
  const full=JSON.parse(text(raw));manifest={schemaVersion:1,...full.profiles['424x240']};
  project=JSON.parse(text(await bytes(new URL('project.json',base).href)));
  return{sourceSha256:manifest.sourceSha256};
 },
 async epoch(epoch:number,expectedFrameHash:string){
  try{
   if(epoch!==context.epoch+1)throw Error('Comparison epoch is not contiguous');context.epoch=epoch;
   const raw=await bytes(new URL('frames/'+String(epoch).padStart(4,'0')+'.json',captureBase).href);
   exact(await sha(raw),expectedFrameHash,'Original frame metadata');const sample=JSON.parse(text(raw));
   if(sample.index!==epoch||sample.sequence!==epoch||sample.time!==epoch/5)throw Error('Observation identity differs');
   const images:any={};for(const kind of ['rgb','depth']){
    const binding=sample.image[kind],rawImage=await bytes(new URL(binding.file,captureBase).href);
    exact(rawImage.length,binding.bytes,'Original image bytes');exact(await sha(rawImage),binding.sha256,'Original image hash');
    images[kind]=kind==='rgb'?rawImage:new Uint16Array(rawImage.buffer.slice(rawImage.byteOffset,rawImage.byteOffset+rawImage.byteLength));
   }
   context.expected=sample;context.frame={...sample.metadata,...images};context.pending=[];
   let estimate:any,program:any;
   if(epoch===0){session=await ModelicaSlamSession.create(manifest,asset as any,slamInitialFrameFromSensor(context.frame),()=>{},project.loopClosureSettings,nativeParametersFor(project));estimate=session.initialEstimate;program=context.programs.get(manifest.models.initialize.model);}
   else{const interval=slamIntervalFrameFromSensor(context.frame);for(const piece of interval.intervals.slice(0,-1))session.predict(interval.imageEpoch,piece);estimate=session.advance(interval).estimate;program=context.programs.get(manifest.models.step.model);}
   const trace=context.traceTarget.__officeNativeTrace;
   exact(trace.status,0,'Candidate native entry');exactCaptured(trace.inputs,sample.nativeTrace.inputs,'Original small native inputs');
   if(epoch<context.prefixEnd){
    exactCaptured(presented(estimate),presented(sample.native),'Exact prefix presented native estimate');
    exactCaptured(trace.derived,sample.nativeTrace.derived,'Exact prefix derived outputs');exactCaptured(trace.outputs,sample.nativeTrace.outputs,'Exact prefix sparse outputs');
    exactCaptured(trace.previousCatalog,sample.nativeTrace.previousCatalog,'Exact prefix catalog header');
    exact(trace.references.length,sample.nativeTrace.references.length,'Exact prefix reference count');
    for(let i=0;i<trace.references.length;i++)await exactReference(sample.nativeTrace.references[i],trace.references[i]);
    if(trace.retainedCurrent||sample.nativeTrace.retainedCurrent)await exactReference(sample.nativeTrace.retainedCurrent,trace.retainedCurrent);
   }
   for(const record of trace.source.assets)assetRecords.set(record.file,record);
   const snapshots=[];for(const snapshot of context.pending){
    const meta={epoch,side:snapshot.side,model:program.layout.model,stateHash:program.layout.state[snapshot.side+'_hash'],byteOrder:'little-endian',runs:snapshot.runs,
     rawBytes:snapshot.bytes.length,rawSha256:await sha(snapshot.bytes),candidateSourceSha256:manifest.sourceSha256,
     scope:'Candidate declared bytes. Prefix equality is separately checked; subsequent states are not baseline equivalence.'};
    snapshots.push(await target.officeCompareSnapshot({meta,base64:b64(snapshot.bytes)}));
   }
   const references=[];for(const frame of trace.references)references.push(await saveReference(frame));
   const retainedCurrent=trace.retainedCurrent?await saveReference(trace.retainedCurrent):null;
   const candidateNative=presented(estimate);
   // Presentation comparison deliberately excludes only the original timings.
   const firstDifference=firstExactDifference(capturedEncoding(candidateNative),presented(sample.native));
   const declaredOutputs:any={};
   for(const name of ['graphCostBefore','graphCostAfter','graphReason','graphCommitReason','graphFilterReason','covarianceStatus','graphCorrectionAccepted','roundoffCertified','loopCandidateInliers','loopCandidateRms']){
    let value:any=program.output(name),source='declared-output';
    const raw=value?b64(new Uint8Array(value.buffer,value.byteOffset,value.byteLength)):null;
    if(!value&&name==='loopCandidateInliers'){
     const values=Array.from({length:4},(_,rank)=>trace.derived[`${name}[${rank+1}]`]);
     if(values.every(v=>v!==undefined)){value=values;source='declared-typed-indexed';}
    }
    if(!value&&trace.derived[name]!==undefined){value=[trace.derived[name]];source='declared-typed-scalar';}
    const numbers=value?Array.from(value,Number):null;
    declaredOutputs[name]=numbers?{available:true,source,values:numbers,finite:numbers.every(Number.isFinite),rawBytesBase64:raw}:{available:false};
   }
   const nativeTrace={...trace,references,retainedCurrent,comparisonDeclaredOutputs:declaredOutputs};
   context.pending=[];
   return{epoch,native:candidateNative,nativeTrace,snapshots,assetRecords:[...assetRecords.values()],firstDifference};
  }catch(error:any){target.OfficeCompare.failure={epoch,error:String(error),difference:error.difference??null};throw error;}
 }
};
