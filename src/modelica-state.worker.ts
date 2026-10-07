/// <reference lib="webworker" />
import type {SensorFrame} from './types';
import {sourceDigest} from './source-digest';
import {ModelicaInertialSession,type InertialSessionMetadata} from './modelica-inertial-session';
let compiler:typeof import('@cognipilot/rumoca');
let session:ModelicaInertialSession|undefined;
async function execute(message:any) {
  if(message.type==='init') {
    const modelName=message.modelName??'ModelicaInertial';
    compiler??=await import(/* @vite-ignore */ `${message.base}vendor/rumoca/rumoca_bind_wasm.js`);
    await compiler.default({module_or_path:`${message.base}vendor/rumoca/rumoca_bind_wasm_bg.wasm`});
    const sources=JSON.stringify(message.workspaceSources??{});
    const loaded=JSON.parse(compiler.sync_workspace_sources(sources));
    if(loaded.error_count)throw new Error('Rumoca could not load Modelica library: '+loaded.skipped_files.join(', '));
    const candidate=new ModelicaInertialSession(compiler.WasmSimulationSession.withInteractiveOptions(
      message.source,modelName,.005,'rk-like',1e-10,1e-8,
      '[["accel[1]",0],["accel[2]",0],["accel[3]",9.81],["gyro[1]",0],["gyro[2]",0],["gyro[3]",0]]'));
    const artifact:InertialSessionMetadata={format:'rumoca-simulation-session',version:1,modelName,
      sourceSha256:await sourceDigest(message.workspaceSources?JSON.stringify({source:message.source,workspaceSources:message.workspaceSources}):message.source),compilerVersion:compiler.get_version(),compilerCommit:compiler.get_git_commit(),executionPolicy:'auto'};
    session?.free();session=candidate;
    return {runtime:'Modelica nominal INS · Rumoca Solve IR session',artifact};
  }
  if(!session)throw new Error('Initialize the Modelica state node before stepping');
  if(message.type==='reset') {
    return session.reset(message.time??0);
  }
  if(message.type!=='step')throw new Error(`Unknown Modelica state request: ${message.type}`);
  const frame=message.frame as SensorFrame;
  const features=message.features??(frame as any).features;
  return {...session.step(frame),...(features===undefined?{}:{features})};
}
let queue=Promise.resolve();
self.onmessage=({data})=>{queue=queue.then(async()=>{try{self.postMessage({id:data.id,result:await execute(data)});}catch(error){self.postMessage({id:data.id,error:String(error)});}});};
