import {assembleRGBDSlamWorkspace,type RGBDSlamWorkspace} from './modelica-slam-workspace';

export interface SlamBuildProgress {phase:'loading'|'compiling'|'admitting';model?:string}
export interface SlamBuildReceipt {
  status:'pass'|'failed';
  sourceSha256:string;
  compiler?:{version:string;revision:string};
  programs:{model:string;moduleSha256:string;profile:string;compileMs:number}[];
  failedAt?:SlamBuildProgress;
  error?:string;
  elapsedMs:number;
}
export interface SlamBuildOptions {
  base:string;
  signal?:AbortSignal;
  onProgress?:(progress:SlamBuildProgress)=>void;
}

/** Compile the complete saved source in an owned worker. This is a build check,
 * not runtime activation: admission does not establish numerical correctness.
 * Cancellation terminates even a synchronous call inside compiler WASM. */
export async function checkRGBDSlamBuild(workspace:RGBDSlamWorkspace,options:SlamBuildOptions):Promise<SlamBuildReceipt>{
  options.signal?.throwIfAborted();
  // Assembly snapshots all edits before its first await.
  const schemaVersion=workspace.schemaVersion;
  const source=await assembleRGBDSlamWorkspace(workspace);
  options.signal?.throwIfAborted();
  const worker=new Worker(new URL('./modelica-slam-build.worker.ts',import.meta.url),{type:'module'});
  try{
    return await new Promise<SlamBuildReceipt>((resolve,reject)=>{
      const abort=()=>reject(options.signal?.reason??new DOMException('Build cancelled','AbortError'));
      options.signal?.addEventListener('abort',abort,{once:true});
      const cleanup=()=>options.signal?.removeEventListener('abort',abort);
      worker.onmessage=({data})=>{
        if(data?.progress){
          try{options.onProgress?.(data.progress);}catch(error){cleanup();reject(error);}
        }else if(data?.receipt){
          cleanup();
          if(data.receipt.sourceSha256!==source.sourceSha256)reject(new Error('SLAM build source identity differs'));
          else resolve(data.receipt);
        }else{cleanup();reject(new Error('Unexpected SLAM build worker response'));}
      };
      worker.onerror=event=>{event.preventDefault();cleanup();reject(new Error(event.message||'SLAM build worker failed'));};
      worker.onmessageerror=()=>{cleanup();reject(new Error('Cannot decode SLAM build worker response'));};
      try{worker.postMessage({base:options.base,source:source.source,sourceSha256:source.sourceSha256,schemaVersion});}
      catch(error){cleanup();reject(error);}
      if(options.signal?.aborted){cleanup();abort();}
    });
  }finally{worker.terminate();}
}
