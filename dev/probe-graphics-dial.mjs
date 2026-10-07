import {chromium} from '@playwright/test';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

// Paused, identical-camera rendering probe. No physics, sensing, SLAM or
// whole-pipeline performance is measured. Timer queries measure GPU draws;
// submission timings measure the host separately.
const output=path.resolve(process.env.SLAM_GRAPHICS_OUT??'test-results/graphics-dial');
await mkdir(output,{recursive:true});
const bundle={};
for(const name of (await readdir('dist/assets')).filter(name=>/\.(js|css)$/.test(name))){
  const bytes=await readFile(path.join('dist/assets',name));
  bundle[name]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,
  args:['--no-sandbox','--enable-gpu','--use-gl=angle','--use-angle=gl']});
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(process.env.SLAM_GRAPHICS_URL??'http://127.0.0.1:4173');
  await page.waitForFunction(()=>window.__slamLab?.initialized===true,{},{timeout:90000});
  const report=await page.evaluate(async()=>{
    const lab=window.__slamLab,r=lab.runtime,w=r.world;
    r.pause();while(r.busy)await new Promise(resolve=>setTimeout(resolve,10));
    // Avoid a second overview competing for GPU time in this renderer probe.
    lab.viewer?.worker.postMessage({type:'visibility',visible:false});
    w.build('big-city','high');await w.ready;
    const gl=w.renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const rows=[],pictures=[],timeBefore=r.time,sequenceBefore=lab.latest?.frame.sequence;
    const measure=async()=>{
      const queries=[],submissions=[],batch=8;
      try{
        for(let i=0;i<5;i++){
          const query=ext?gl.createQuery():null;
          if(query){gl.beginQuery(ext.TIME_ELAPSED_EXT,query);queries.push(query);}
          const start=performance.now();for(let j=0;j<batch;j++)w.render();
          submissions.push((performance.now()-start)/batch);
          if(query)gl.endQuery(ext.TIME_ELAPSED_EXT);
        }
        gl.flush();
        const deadline=performance.now()+10000;
        while(queries.some(query=>!gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE))){
          if(performance.now()>deadline)throw new Error('GPU timer-query deadline exceeded');
          await new Promise(resolve=>setTimeout(resolve,10));
        }
        const disjoint=ext?!!gl.getParameter(ext.GPU_DISJOINT_EXT):null;
        return {draws:5*batch,submissionMsPerDraw:submissions,
          gpuMsPerDraw:ext&&!disjoint?queries.map(query=>gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6/batch):null,disjoint};
      }finally{for(const query of queries)gl.deleteQuery(query);}
    };
    // Repeat in reversed order to expose warmup/order effects.
    for(const mode of ['day','night'])for(const [round,details] of [['forward',['low','medium','high']],['reverse',['high','medium','low']]]){
      for(const detail of details){
        await w.setGraphicsQuality(detail);w.setLighting(mode);
        for(let i=0;i<20;i++)w.render();gl.finish();
        const camera=w.view.position.toArray(),quaternion=w.view.quaternion.toArray();
        const samples=await measure();
        const uniforms=w.lighting.sky.material.uniforms;
        rows.push({mode,detail,round,pixelRatio:w.renderer.getPixelRatio(),
          canvas:[w.renderer.domElement.width,w.renderer.domElement.height],
          camera,quaternion,cloudOctaves:uniforms.cloudOctaves.value,
          nightAmount:uniforms.nightAmount.value,cloudTime:uniforms.cloudTime.value,
          shadows:w.renderer.shadowMap.enabled,shadowSize:w.lighting.sun.shadow.mapSize.x,
          geometry:{...w.bigCity.stats},...samples});
        if(round==='forward'){
          w.render();pictures.push({name:`${mode}-${detail}.png`,data:w.renderer.domElement.toDataURL('image/png')});
        }
      }
    }
    if(r.time!==timeBefore||lab.latest?.frame.sequence!==sequenceBefore)throw new Error('Rendering changed simulation state');
    return {graphics:w.graphics,timerQueryAvailable:!!ext,dt:r.dt,timeBefore,timeAfter:r.time,
      sequenceBefore,sequenceAfter:lab.latest?.frame.sequence,rows,pictures};
  });
  const pictures=report.pictures;delete report.pictures;
  for(const picture of pictures)await writeFile(path.join(output,picture.name),Buffer.from(picture.data.split(',')[1],'base64'));
  const mean=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
  const summary=report.rows.map(row=>({mode:row.mode,detail:row.detail,round:row.round,
    gpuMsPerDraw:row.gpuMsPerDraw?mean(row.gpuMsPerDraw):null,
    submissionMsPerDraw:mean(row.submissionMsPerDraw),triangles:row.geometry.triangles}));
  await writeFile(path.join(output,'verification.json'),JSON.stringify({
    status:errors.length?'FAIL':'PASS',browser:browser.version(),
    scope:'Paused Big city renderer only; viewer worker suspended; no sensors or SLAM; warmup excluded',
    limitations:['One GPU and viewport; no laptop claim','Two orderings, five eight-draw queries per setting; not a sustained 30 FPS or 10x simulation gate'],
    bundle,screenshots:pictures.map(picture=>picture.name),...report,summary,errors,
  },null,2));
  console.log(JSON.stringify({output,graphics:report.graphics,timerQueryAvailable:report.timerQueryAvailable,summary,errors}));
  if(errors.length)throw new Error('Browser errors during graphics probe');
}finally{await browser.close();}
