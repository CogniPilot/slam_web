import {ModelicaSlamSession} from '../src/modelica-slam-session';
import {SlamNativeProgram} from '../src/slam-native-program';
import {slamInitialFrameFromSensor,slamIntervalFrameFromSensor} from '../src/modelica-slam-frame';
import {nativeParametersFor} from '../src/model-parameters';
import {OFFICE_REPLAY,exact,exactCaptured,presented} from './office-replay-contract.mjs';
import {installReplayObserver} from './office-replay-observer.mjs';

// Blank-page replay of saved packets; no World, renderer or alternate model.
const target=globalThis as any;
const sha=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const bytes=async(url:string)=>{const r=await fetch(url);if(!r.ok)throw Error('Replay input unavailable: '+url);return new Uint8Array(await r.arrayBuffer());};
const text=(b:Uint8Array)=>new TextDecoder().decode(b);
const b64=(b:Uint8Array)=>{let s='';for(let i=0;i<b.length;i+=16384)s+=String.fromCharCode(...b.subarray(i,i+16384));return btoa(s);};
const context:any={epoch:-1,programs:new Map(),traceTarget:{},pending:[],wanted:new Set(OFFICE_REPLAY.snapshots)};
installReplayObserver(SlamNativeProgram,context);
let manifest:any,project:any,session:ModelicaSlamSession,captureBase:string,assetsBase:string;
const assetRecords=new Map();
async function asset(file:string,encoding:string){
 let value=await bytes(new URL(file,assetsBase).href);
 if(encoding==='gzip')value=new Uint8Array(await new Response(new Blob([value]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
 return value;
}
async function catalog(pointer:any,actual:any){
 if(!pointer||!actual)throw Error('Retained catalog payload availability differs');
 const raw=await bytes(new URL(pointer.file,captureBase).href);
 exact(await sha(raw),pointer.sha256,'Original catalog payload hash');
 exactCaptured(actual,JSON.parse(text(raw)),'Readonly retained catalog payload in captured JSON encoding');
 exact(await sha(new TextEncoder().encode(JSON.stringify(actual)+'\n')),pointer.sha256,'Replayed catalog serialization hash');
}
target.OfficeReplay={failure:null,
 async initialize(base:string,nativeBase:string,manifestHash:string){
  captureBase=base;assetsBase=nativeBase;
  const raw=await bytes(new URL('native-manifest.json',base).href);exact(await sha(raw),manifestHash,'Capture manifest');
  const full=JSON.parse(text(raw));manifest={schemaVersion:1,...full.profiles['424x240']};
  project=JSON.parse(text(await bytes(new URL('project.json',base).href)));
  return{sourceSha256:manifest.sourceSha256};
 },
 async epoch(epoch:number,expectedFrameHash:string){
  try{
   if(epoch!==context.epoch+1)throw Error('Replay epoch is not contiguous');context.epoch=epoch;
   const raw=await bytes(new URL('frames/'+String(epoch).padStart(4,'0')+'.json',captureBase).href);
   exact(await sha(raw),expectedFrameHash,'Captured frame metadata');const sample=JSON.parse(text(raw));
   if(sample.index!==epoch||sample.sequence!==epoch||sample.time!==epoch/5)throw Error('Replay observation clock differs');
   const images:any={};for(const kind of ['rgb','depth']){
    const binding=sample.image[kind],rawImage=await bytes(new URL(binding.file,captureBase).href);
    exact(rawImage.length,binding.bytes,'Raw image bytes');exact(await sha(rawImage),binding.sha256,'Raw image hash');
    images[kind]=kind==='rgb'?rawImage:new Uint16Array(rawImage.buffer.slice(rawImage.byteOffset,rawImage.byteOffset+rawImage.byteLength));
   }
   context.expected=sample;context.frame={...sample.metadata,...images};context.pending=[];
   let estimate:any,program:any;
   if(epoch===0){session=await ModelicaSlamSession.create(manifest,asset as any,slamInitialFrameFromSensor(context.frame),()=>{},project.loopClosureSettings,nativeParametersFor(project));estimate=session.initialEstimate;program=context.programs.get(manifest.models.initialize.model);}
   else{const interval=slamIntervalFrameFromSensor(context.frame);for(const piece of interval.intervals.slice(0,-1))session.predict(interval.imageEpoch,piece);estimate=session.advance(interval).estimate;program=context.programs.get(manifest.models.step.model);}
   exactCaptured(presented(estimate),presented(sample.native),'Presented native estimate in captured JSON encoding');
   const trace=context.traceTarget.__officeNativeTrace;
   exact(trace.status,sample.nativeTrace.status,'Native status');exactCaptured(trace.inputs,sample.nativeTrace.inputs,'Raw native inputs in captured JSON encoding');
   exactCaptured(trace.derived,sample.nativeTrace.derived,'Raw native derived outputs in captured JSON encoding');exactCaptured(trace.outputs,sample.nativeTrace.outputs,'Full sparse native outputs in captured JSON encoding');
   exactCaptured(trace.previousCatalog,sample.nativeTrace.previousCatalog,'Previous catalog header in captured JSON encoding');
   exact(trace.source.model,sample.nativeTrace.source.model,'Native model');exact(trace.source.module,sample.nativeTrace.source.module,'Native module');
   for(const record of trace.source.assets)assetRecords.set(record.file,record);
   const expectedAssets=[...sample.nativeTrace.source.assets].sort((a,b)=>a.file.localeCompare(b.file));
   exact([...trace.source.assets].sort((a,b)=>a.file.localeCompare(b.file)),expectedAssets,'Decoded native assets');
   exact(trace.references.length,sample.nativeTrace.references.length,'Retained reference count');
   for(let i=0;i<trace.references.length;i++)await catalog(sample.nativeTrace.references[i],trace.references[i]);
   if(trace.retainedCurrent||sample.nativeTrace.retainedCurrent)await catalog(sample.nativeTrace.retainedCurrent,trace.retainedCurrent);
   const saved=[];for(const snapshot of context.pending){
    const meta={epoch,side:snapshot.side,model:program.layout.model,stateHash:program.layout.state[snapshot.side+'_hash'],byteOrder:'little-endian',runs:snapshot.runs,
     rawBytes:snapshot.bytes.length,rawSha256:await sha(snapshot.bytes),boundary:snapshot.side==='previous'?'after original carry, before original image entry':'after original image entry returns',qualified:false};
    saved.push(await target.officeReplaySave({meta,base64:b64(snapshot.bytes)}));
   }
   context.pending=[];return{epoch,snapshots:saved,assetRecords:[...assetRecords.values()]};
  }catch(error:any){target.OfficeReplay.failure={epoch,error:String(error),difference:error.difference??null};throw error;}
 }
};
