/// <reference lib="webworker" />
import {compilerAsset} from './compiler-assets';
import {ModelicaRuntimeMath,type ActorRouteConfiguration} from './modelica-runtime-math';
import {configuredModelicaSession} from './modelica-session-parameters';
let compiler:typeof import('@cognipilot/rumoca');
let math:ModelicaRuntimeMath|undefined;
let actorRoute:ActorRouteConfiguration|undefined;
async function execute(message:any){
  if(message.type==='init'){
    actorRoute=message.actorRoute;
    math?.free();math=undefined;
    compiler??=await import(/* @vite-ignore */ compilerAsset(message.base,'js'));
    await compiler.default({module_or_path:compilerAsset(message.base,'wasm')});
    math=new ModelicaRuntimeMath((source,model)=>configuredModelicaSession(compiler,source,model,1/90,'rk-like',1e-12,1e-12,'[]',message.parameters?.[model]),message.sensorSource,message.evaluationSource,message.origin,message.sensorSource);
    return {runtime:'Modelica IMU/GPS, evaluation and actor motion'};
  }
  if(!math)throw new Error('Initialize Modelica runtime math first');
  if(message.type==='origin'){math.setOrigin(message.origin);return {};}
  if(message.type==='actors')return math.actors(message.time,message.route??actorRoute);
  if(message.type==='availability')return math.gpsAvailable(message.truth,message.roof,message.enabled);
  if(message.type==='sensors')return math.observeSensors(message.truth,message.draws,message.roof,message.enabled,message.sampleGps??true);
  if(message.type==='evaluation')return math.evaluate(message.truth,message.estimate,message.sampleCount,message.accumulate??true);
  throw new Error(`Unsupported Modelica runtime math request: ${message.type}`);
}
let queue=Promise.resolve();
self.onmessage=({data})=>{const received=performance.now();queue=queue.then(async()=>{const start=performance.now();try{self.postMessage({id:data.id,result:await execute(data),timings:{queueMs:start-received,workerMs:performance.now()-start}});}catch(error){self.postMessage({id:data.id,error:String(error)});}});};
