import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
const {chromium}=createRequire(path.join(process.cwd(),'package.json'))('@playwright/test');
const directory=process.argv[2];if(!directory)throw Error('OUTPUT_DIRECTORY required');fs.mkdirSync(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,
  args:['--no-sandbox','--enable-gpu','--use-gl=angle','--use-angle=gl']});
const errors=[];let page;
const running=page=>page.waitForFunction(()=>window.__slamLab?.ready&&window.__slamLab.runtime.running&&window.__slamLab.latest?.frame.sequence>=5,null,{timeout:90000});
const pause=async()=>{await page.evaluate(()=>window.__slamLab.runtime.pause());await page.waitForFunction(()=>!window.__slamLab.runtime.busy);};
const inspect=()=>page.evaluate(()=>{
  const l=window.__slamLab;return {metadata:l.project.algorithmArtifact,algorithm:l.project.algorithm,
    backend:l.latest.estimate.diagnostics,sequence:l.latest.frame.sequence,time:l.latest.frame.time,
    sceneDetail:l.project.sceneDetail,graphics:l.runtime.world.graphics,depthCloud:l.runtime.world.depthCloudEnabled};
});
try{
  page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.SLAM_PROFILE_URL??'http://localhost:4182/');await running(page);await pause();
  const startup=await inspect();
  if(startup.metadata?.format!=='rumoca-simulation-session'||startup.backend?.backend!=='Rumoca Solve IR session')throw Error('App did not select compiler-owned INS');
  if('wasmBase64' in startup.metadata||startup.depthCloud||startup.sceneDetail!=='medium')throw Error('Unexpected cache/defaults');
  // Exercise lockstep camera events and the actual state worker, not a mocked session.
  const lockstep=await page.evaluate(async()=>{
    const l=window.__slamLab,r=l.runtime,rows=[];
    for(let i=0;i<30;i++){
      const before=r.time;await r.step();const f=l.latest.frame;
      if(Math.abs(f.time-before-f.dt)>1e-9)throw Error('Lockstep time drift');
      if(l.latest.estimate.diagnostics.backend!=='Rumoca Solve IR session')throw Error('INS backend switched');
      rows.push({sequence:f.sequence,time:f.time,dt:f.dt,insMs:r.lastTimings.slam});
    }return rows;
  });
  // Seed a retired cache into a saved project. Reload must compile its source
  // through Rumoca and replace the cache, never execute the injected bytes.
  await page.evaluate(async()=>{
    const l=window.__slamLab,project=structuredClone(l.project);
    project.algorithm=project.algorithm.replace('accel_tau = 0.03','accel_tau = 0.06');project.algorithmPreset='custom';
    project.algorithmArtifact={format:'rumoca-state-node',version:1,wasmBase64:'must never execute'};
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('slam-lab-projects',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    try{await new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(project,'slam-lab.project.v1');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}finally{db.close();}
  });
  await page.reload();await running(page);await pause();const edited=await inspect();
  if(!edited.algorithm.includes('accel_tau = 0.06')||edited.metadata.format!=='rumoca-simulation-session'
    ||edited.metadata.sourceSha256===startup.metadata.sourceSha256||'wasmBase64' in edited.metadata)throw Error('Source edit or retired-cache migration failed');
  await page.reload();await running(page);await pause();const reloaded=await inspect();
  if(reloaded.metadata.sourceSha256!==edited.metadata.sourceSha256||reloaded.backend.backend!=='Rumoca Solve IR session')throw Error('Compiler-session persistence failed');
  if(errors.length)throw Error(JSON.stringify(errors));
  const report={status:'COMPILER_OWNED_INS_APP_SOURCE_EDIT_CACHE_MIGRATION_RELOAD_PASS',browser:browser.version(),startup,edited,reloaded,lockstep,errors,
    manualApplyClicks:0,scope:'Actual app state worker delegates to Rumoca Solve IR simulation. Automatic execution is not a native-RHS guarantee. Vision still uses its legacy app emitter; nonzero-start replay requires compiler reset_at. Full SLAM and Float32 CV are not integrated.'};
  fs.writeFileSync(path.join(directory,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,lockstepFrames:lockstep.length,insMeanMs:lockstep.reduce((s,r)=>s+r.insMs,0)/lockstep.length,errors}));
}catch(error){fs.writeFileSync(path.join(directory,'browser-failure.json'),JSON.stringify({error:String(error.stack||error),errors,status:page?await page.locator('#status').textContent().catch(()=>null):null},null,2)+'\n');throw error;}
finally{await browser.close();}
