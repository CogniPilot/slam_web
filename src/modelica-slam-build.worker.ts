/// <reference lib="webworker" />
import {NativeProgram,type NativeProgramArtifact} from './modelica-native-program';
import {rgbdSlamManifest} from './modelica-slam-source-manifest.mjs';
import {sourceDigest} from './source-digest';
import type {SlamBuildReceipt,SlamBuildProgress} from './modelica-slam-build';

type Compiler=typeof import('@cognipilot/rumoca')&{prepare_native_program?:(source:string,model:string)=>string};
let started=false;
self.onmessage=async({data}:MessageEvent<{base:string;source:string;sourceSha256:string;schemaVersion:1|2}>)=>{
  if(started)return;started=true;
  const begin=performance.now();
  const receipt:SlamBuildReceipt={status:'failed',sourceSha256:data.sourceSha256,programs:[],elapsedMs:0};
  let progress:SlamBuildProgress={phase:'loading'};
  const announce=(next:SlamBuildProgress)=>{progress=next;self.postMessage({progress});};
  try{
    if(data.schemaVersion!==1&&data.schemaVersion!==2)throw new Error('Unsupported SLAM workspace version');
    const manifest=rgbdSlamManifest(data.schemaVersion===2?'d435-native':'legacy');
    if(await sourceDigest(data.source)!==data.sourceSha256)throw new Error('SLAM build source digest mismatch');
    const base=new URL(data.base,self.location.href);
    if(base.origin!==self.location.origin)throw new Error('SLAM compiler assets must be same origin');
    announce(progress);
    const compiler:Compiler=await import(/* @vite-ignore */new URL('vendor/rumoca/rumoca_bind_wasm.js',base).href);
    await compiler.default({module_or_path:new URL('vendor/rumoca/rumoca_bind_wasm_bg.wasm',base).href});
    receipt.compiler={version:compiler.get_version(),revision:compiler.get_git_commit()};
    if(typeof compiler.prepare_native_program!=='function')
      throw new Error('Installed Rumoca does not expose native WASM program compilation');
    for(const model of manifest.modelNames){
      announce({phase:'compiling',model});
      const start=performance.now();
      const artifact:NativeProgramArtifact=JSON.parse(compiler.prepare_native_program(data.source,model));
      const compileMs=performance.now()-start;
      if(artifact.model_name!==model)throw new Error('Rumoca returned a different SLAM model');
      announce({phase:'admitting',model});
      await NativeProgram.instantiate(artifact,data.source);
      receipt.programs.push({model,moduleSha256:artifact.module_sha256,profile:artifact.profile,compileMs});
    }
    receipt.status='pass';
  }catch(error){receipt.failedAt=progress;receipt.error=error instanceof Error?error.message:String(error);}
  receipt.elapsedMs=performance.now()-begin;
  self.postMessage({receipt});
};
