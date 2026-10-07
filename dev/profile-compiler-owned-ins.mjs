// Matched historical app emitter vs compiler-owned session. The old backend
// is loaded from a frozen built preview solely as a migration comparator.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
const directory=process.argv[2];if(!directory)throw Error('OUTPUT_DIRECTORY required');fs.mkdirSync(directory,{recursive:true});
const historical=fs.realpathSync('dist'),candidate=process.env.SLAM_INS_BUILD;if(!candidate)throw Error('SLAM_INS_BUILD required');
const worker=directory=>{const names=fs.readdirSync(path.join(directory,'assets')).filter(n=>/^modelica-state\.worker-.*\.js$/.test(n));if(names.length!==1)throw Error('Expected one INS worker');return names[0];};
const oldWorker=worker(historical),newWorker=worker(candidate),source=fs.readFileSync('models/ModelicaInertial.mo','utf8');
const sha=s=>createHash('sha256').update(s).digest('hex');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--enable-gpu','--use-gl=angle','--use-angle=gl']});
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  const url=process.env.SLAM_PROFILE_URL??'http://localhost:4182/';await page.goto(url);
  await page.waitForFunction(()=>window.__slamLab?.latest?.frame.sequence>=2,null,{timeout:90000});
  await page.evaluate(async()=>{const r=window.__slamLab.runtime;r.pause();while(r.busy)await new Promise(resolve=>setTimeout(resolve,10));});
  const result=await page.evaluate(async({source,oldWorker,newWorker})=>{
    const response=await fetch(`http://localhost:4173/assets/${oldWorker}`);if(!response.ok)throw Error('Cannot read frozen baseline worker');
    const code=await response.text(),blob=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
    const workers=[new Worker(blob,{type:'module'}),new Worker(`/assets/${newWorker}`,{type:'module'})];
    const queues=workers.map(()=>new Map());let id=0;
    workers.forEach((w,i)=>{w.onmessage=({data})=>{const waiter=queues[i].get(data.id);if(!waiter)throw Error('Unexpected worker reply');queues[i].delete(data.id);data.error?waiter.reject(Error(data.error)):waiter.resolve(data.result);};});
    const rpc=(i,type,args={})=>new Promise((resolve,reject)=>{const key=++id;queues[i].set(key,{resolve,reject});workers[i].postMessage({id:key,type,...args});});
    const frame=i=>{const t=i/90;return {time:t,dt:1/90,imu:{accel:[.4*Math.sin(t*.7),.2*Math.cos(t*.5),9.81+.05*Math.sin(t)],gyro:[.01*Math.sin(t*.2),.02*Math.cos(t*.3),.08]}};};
    let maximumError=0;const windows=[];
    try{
      const initial=[];for(let i=0;i<2;i++)initial.push(await rpc(i,'init',{source,base:new URL('/','http://localhost:4173/').href}));
      if(initial[0].artifact?.format!=='rumoca-state-node'||initial[1].artifact?.format!=='rumoca-simulation-session')throw Error('Wrong baseline/candidate ownership');
      // Compare actual independently integrated trajectories; algorithms use
      // different integrators, so this deliberately uses a stated tolerance.
      for(let i=1;i<=180;i++){
        const estimates=[];for(let j=0;j<2;j++)estimates.push(await rpc(j,'step',{frame:frame(i)}));
        for(const name of ['x','y','z'])maximumError=Math.max(maximumError,Math.abs(estimates[0][name]-estimates[1][name]));
        for(let k=0;k<4;k++)maximumError=Math.max(maximumError,Math.abs(estimates[0].quaternion[k]-estimates[1].quaternion[k]));
      }
      if(maximumError>2e-5)throw Error(`Pose parity error ${maximumError}`);
      for(const repetition of [0,1])for(const index of repetition===0?[0,1,1,0]:[1,0,0,1]){
        await rpc(index,'reset',{time:0});
        for(let i=1;i<=100;i++)await rpc(index,'step',{frame:frame(i)});
        const start=performance.now();for(let i=101;i<=500;i++)await rpc(index,'step',{frame:frame(i)});
        windows.push({repetition,index,frames:400,wallMs:performance.now()-start});
      }
      return {maximumPoseError:maximumError,poseComparisons:1260,windows,baseline:initial[0].artifact.format,candidate:initial[1].artifact,graphics:window.__slamLab.runtime.world.graphics};
    }finally{workers.forEach(w=>w.terminate());URL.revokeObjectURL(blob);}
  },{source,oldWorker,newWorker});
  const mean=i=>result.windows.filter(w=>w.index===i).reduce((s,w)=>s+w.wallMs,0)/1600;
  const report={status:'COMPILER_OWNED_INS_MATCHED_WORKER_MIGRATION_PROFILE_PASS',browser:browser.version(),sourceSha256:sha(source),
    baselineWorker:{file:oldWorker,sha256:sha(fs.readFileSync(path.join(historical,'assets',oldWorker)))},
    candidateWorker:{file:newWorker,sha256:sha(fs.readFileSync(path.join(candidate,'assets',newWorker)))},
    meanBaselineRpcMs:mean(0),meanCandidateRpcMs:mean(1),...result,errors,
    scope:'Frozen previous app-owned Solve IR WAT/RK4 INS vs Rumoca-owned simulation session, same public compiler/source/inputs, ABBA then BAAB, 100 warm/400 timed each window, actual worker RPC. Pose parity180frames/1260comparisons tolerance2e-5. Integrators differ; this is ownership migration cost, not an optimization or full-SLAM/10x claim. GPU imagery/rendering and sensor acquisition are excluded; paused app viewer remains visible.'};
  fs.writeFileSync(path.join(directory,'ins-profile-report.json'),JSON.stringify(report,null,2)+'\n');
  if(errors.length)throw Error(JSON.stringify(errors));console.log(JSON.stringify({status:report.status,oldMs:mean(0),newMs:mean(1),maximumPoseError:result.maximumPoseError}));
}catch(error){fs.writeFileSync(path.join(directory,'ins-profile-failure.json'),JSON.stringify({error:String(error.stack||error),errors},null,2)+'\n');throw error;}
finally{await browser.close();}
