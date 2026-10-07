/// <reference lib="webworker" />
import {ModelicaLocalizationSession,type LocalizationFrame,type LocalizationInitial,type LocalizationModel,type LocalizationSnapshot} from './modelica-localization-session';
import type {NativeProgramArtifact} from './modelica-native-program';

type Compiler=typeof import('@cognipilot/rumoca')&{prepare_native_program?:(source:string,model:string)=>string};
export type LocalizationRequest={id:number}&({type:'init';base:string;source:string;model:LocalizationModel;initial:LocalizationInitial|LocalizationSnapshot;artifact?:NativeProgramArtifact}
  |{type:'step';frame:LocalizationFrame}|{type:'snapshot'|'reset'}|{type:'restore';snapshot:LocalizationSnapshot});
let compiler:Compiler|undefined,session:ModelicaLocalizationSession|undefined;
let busy=false,pending:LocalizationRequest|undefined;
async function execute(message:LocalizationRequest){
  if(message.type==='init'){
    const base=new URL(message.base,self.location.href);
    if(base.origin!==self.location.origin)throw new Error('Modelica localization compiler must be same origin');
    let artifact=message.artifact;
    if(!artifact){
      if(!compiler){
        const loaded:Compiler=await import(/* @vite-ignore */new URL('vendor/rumoca/rumoca_bind_wasm.js',base).href);
        await loaded.default({module_or_path:new URL('vendor/rumoca/rumoca_bind_wasm_bg.wasm',base).href});compiler=loaded;
      }
      if(!compiler.prepare_native_program)throw new Error('Installed Rumoca lacks prepare_native_program; localization remains unavailable');
      artifact=JSON.parse(compiler.prepare_native_program(message.source,message.model)) as NativeProgramArtifact;
    }
    if(artifact.model_name!==message.model)throw new Error('Localization artifact model mismatch');
    const next=await ModelicaLocalizationSession.create(artifact,message.source,message.initial);
    session=next;return {snapshot:next.snapshot(),artifact,width:next.width,height:next.height,capacity:next.capacity};
  }
  if(!session)throw new Error('Initialize native Modelica localization first');
  if(message.type==='step')return session.advance(message.frame);
  if(message.type==='snapshot')return session.snapshot();
  if(message.type==='reset')return session.reset();
  if(message.type==='restore')return session.restore(message.snapshot);
  throw new Error('Unsupported localization request');
}
async function run(message:LocalizationRequest){
  busy=true;const started=performance.now();
  try{self.postMessage({id:message.id,result:await execute(message),workerMs:performance.now()-started});}
  catch(error){self.postMessage({id:message.id,error:error instanceof Error?error.message:String(error),workerMs:performance.now()-started});}
  finally{busy=false;const next=pending;pending=undefined;if(next)void run(next);}
}
self.onmessage=({data}:MessageEvent<LocalizationRequest>)=>{
  if(!data||!Number.isSafeInteger(data.id)||data.id<0){self.postMessage({id:data?.id,error:'Invalid localization request ID'});return;}
  if(busy){
    if(pending){self.postMessage({id:data.id,error:'Localization queue is full (one pending request)'});return;}
    pending=data;return;
  }
  void run(data);
};
