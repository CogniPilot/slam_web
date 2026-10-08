import {assembleRGBDSlamWorkspace,type RGBDSlamWorkspace} from './modelica-slam-workspace';

export interface SlamBuildProgress {phase:'loading'|'compiling'|'admitting';model?:string}
export interface SlamBuildReceipt {
  status:'pass'|'failed';
  sourceSha256:string;
  compiler?:{version:string;revision:string};
  programs:{model:string;moduleSha256:string;profile:string;compileMs:number}[];
  failedAt?:SlamBuildProgress;
  timedOut?:true;
  error?:string;
  elapsedMs:number;
}
export interface SlamBuildOptions {
  base:string;
  signal?:AbortSignal;
  /** Wall-clock deadline for each worker phase, including synchronous WASM. */
  timeoutMs?:number;
  onProgress?:(progress:SlamBuildProgress)=>void;
}

/** Compile the complete saved source in an owned worker. This is a build check,
 * not runtime activation: admission does not establish numerical correctness.
 * Cancellation terminates even a synchronous call inside compiler WASM. */
export async function checkRGBDSlamBuild(workspace:RGBDSlamWorkspace,options:SlamBuildOptions):Promise<SlamBuildReceipt>{
  options.signal?.throwIfAborted();
  const timeoutMs=options.timeoutMs??60_000;
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>300_000)
    throw new Error('SLAM build timeout must be 1..300000 ms');
  // Assembly snapshots all edits before its first await.
  const schemaVersion=workspace.schemaVersion;
  const source=await assembleRGBDSlamWorkspace(workspace);
  options.signal?.throwIfAborted();
  const begin=performance.now();
  const worker=new Worker(new URL('./modelica-slam-build.worker.ts',import.meta.url),{type:'module'});
  try{
    return await new Promise<SlamBuildReceipt>((resolve,reject)=>{
      let settled=false,timer:ReturnType<typeof setTimeout>;
      let progress:SlamBuildProgress={phase:'loading'};
      let partial:SlamBuildReceipt={status:'failed',sourceSha256:source.sourceSha256,programs:[],elapsedMs:0};
      const cleanup=()=>{
        settled=true;clearTimeout(timer);options.signal?.removeEventListener('abort',abort);
        worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;
      };
      const fail=(error:unknown)=>{if(!settled){cleanup();reject(error);}};
      const finish=(receipt:SlamBuildReceipt)=>{if(!settled){cleanup();resolve(receipt);}};
      const abort=()=>fail(options.signal?.reason??new DOMException('Build cancelled','AbortError'));
      const deadline=()=>{
        clearTimeout(timer);
        timer=setTimeout(()=>finish({...partial,status:'failed',timedOut:true,failedAt:progress,
          error:`Rumoca ${progress.phase}${progress.model?' '+progress.model:''} timed out after ${timeoutMs} ms; build worker stopped.`,
          elapsedMs:performance.now()-begin}),timeoutMs);
      };
      options.signal?.addEventListener('abort',abort,{once:true});
      worker.onmessage=({data})=>{
        if(data?.progress){
          if(data.receipt?.sourceSha256!==source.sourceSha256){fail(new Error('SLAM build source identity differs'));return;}
          partial=data.receipt;progress=data.progress;deadline();
          try{options.onProgress?.(progress);}catch(error){fail(error);}
        }else if(data?.receipt){
          if(data.receipt.sourceSha256!==source.sourceSha256)fail(new Error('SLAM build source identity differs'));
          else finish(data.receipt);
        }else fail(new Error('Unexpected SLAM build worker response'));
      };
      worker.onerror=event=>{event.preventDefault();fail(new Error(event.message||'SLAM build worker failed'));};
      worker.onmessageerror=()=>fail(new Error('Cannot decode SLAM build worker response'));
      deadline();
      try{worker.postMessage({base:options.base,source:source.source,sourceSha256:source.sourceSha256,schemaVersion});}
      catch(error){fail(error);}
      if(options.signal?.aborted)abort();
    });
  }finally{worker.terminate();}
}
