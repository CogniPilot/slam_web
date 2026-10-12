/// <reference lib="webworker" />
import {ModelicaSlamSession} from './modelica-slam-session';
import {fetchNativeAsset,fetchNativeManifest} from './slam-native-program';
import type {SlamInitialFrame,SlamIntervalFrame} from './modelica-slam-frame';

export type SlamRequest={id:number}&({type:'init';base:string;frame:SlamInitialFrame}|{type:'step';frame:SlamIntervalFrame});
let session:ModelicaSlamSession|undefined;
async function execute(message:SlamRequest){
  if(message.type==='init'){
    const base=new URL(message.base,self.location.href);
    if(base.origin!==self.location.origin)throw new Error('Native SLAM assets must be same origin');
    const manifest=await fetchNativeManifest(base);
    session=await ModelicaSlamSession.create(manifest,(file,encoding)=>fetchNativeAsset(base,file,encoding),message.frame,
      progress=>self.postMessage({progress}));
    return {estimate:session.initialEstimate,sourceSha256:manifest.sourceSha256,models:Object.fromEntries(Object.entries(manifest.models).map(([key,layout])=>[key,{model:layout.model,pages:layout.pages}]))};
  }
  if(!session)throw new Error('Initialize native SLAM first');
  return session.advance(message.frame);
}
self.onmessage=async({data}:MessageEvent<SlamRequest>)=>{
  const started=performance.now();
  try{self.postMessage({id:data.id,result:await execute(data),timings:{workerMs:performance.now()-started}});}
  catch(error){self.postMessage({id:data.id,error:error instanceof Error?error.message:String(error),timings:{workerMs:performance.now()-started}});}
};
