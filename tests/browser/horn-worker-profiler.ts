import type {Browser} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

// Optional diagnostic sampling of the actual standalone source-issued worker.
// The worker is created before attachment and receives inputs after start().
export async function startHornWorkerProfile(browser:Browser,directory:string){
  const root=await browser.newBrowserCDPSession();
  const pending=new Map<string,{resolve:(value:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  let sequence=0;
  root.on('Target.receivedMessageFromTarget',event=>{
    const message=JSON.parse(event.message),key=`${event.sessionId}/${message.id}`,request=pending.get(key);
    if(!request)return;
    clearTimeout(request.timer);pending.delete(key);
    message.error?request.reject(new Error(message.error.message)):request.resolve(message.result);
  });
  const targets=(await root.send('Target.getTargets')).targetInfos.filter(target=>target.type==='worker');
  if(targets.length!==1)throw new Error('Expected exactly one source-owned Horn worker');
  const {sessionId}=await root.send('Target.attachToTarget',{targetId:targets[0].targetId,flatten:false});
  const call=(method:string,params:Record<string,unknown>={})=>new Promise<any>((resolve,reject)=>{
    const id=++sequence,key=`${sessionId}/${id}`;
    const timer=setTimeout(()=>{pending.delete(key);reject(new Error(`Horn worker profiler timeout: ${method}`));},10000);
    pending.set(key,{resolve,reject,timer});
    root.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(error=>{clearTimeout(timer);pending.delete(key);reject(error);});
  });
  await call('Profiler.enable');await call('Profiler.setSamplingInterval',{interval:1000});await call('Profiler.start');
  return async()=>{
    const {profile}=await call('Profiler.stop');
    await mkdir(directory,{recursive:true});
    const file=path.join(directory,'horn-worker.cpuprofile');
    await writeFile(file,JSON.stringify(profile));
    console.log('HORN_WORKER_CPU_PROFILE',JSON.stringify({file,samples:profile.samples?.length??0,target:targets[0].url}));
    await root.detach();
  };
}
