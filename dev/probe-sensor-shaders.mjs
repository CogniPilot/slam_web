import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';

const output=path.resolve(process.env.SLAM_SENSOR_PROFILE_OUT??'test-results/sensor-shaders');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,
  args:['--no-sandbox','--enable-gpu','--use-gl=angle','--use-angle=gl']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto(process.env.SLAM_PROFILE_URL??'http://127.0.0.1:4173');
  await page.waitForFunction(()=>window.__slamLab?.initialized,{},{timeout:90000});
  const algorithm=await readFile(new URL('../models/Estimation/Inertial/ModelicaInertial.mo',import.meta.url),'utf8');
  await page.evaluate(async algorithm=>{
    const lab=window.__slamLab;Object.assign(lab.project,{algorithm,algorithmPreset:'Modelica inertial propagation',runtime:'modelica'});
    delete lab.project.algorithmArtifact;await lab.runtime.compile(lab.project);
  },algorithm);
  const result=await page.evaluate(async()=>{
    const r=window.__slamLab.runtime;r.pause();while(r.busy)await new Promise(resolve=>setTimeout(resolve,10));
    const w=r.world;w.setDepthCloudEnabled(true);
    w.update({time:3,x:2,y:-1,z:2.4,quaternion:[1,0,0,0]});
    w.setActorMotion(await r.modelicaMath.call('actors',{time:3}));
    const renderer=w.renderer,gl=renderer.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const render=renderer.render,rows=[];
    for(const enabled of [false,true]){
      w.sensorGeometryBatches.enabled=enabled;
      await w.captureSensorPair(true,'sync',false); // Warm both shader variants.
      const passes=[];
      renderer.render=function(scene,camera){
        const query=timer?gl.createQuery():undefined,start=performance.now();
        if(query)gl.beginQuery(timer.TIME_ELAPSED_EXT,query);
        try{return render.call(this,scene,camera);}finally{
          if(query)gl.endQuery(timer.TIME_ELAPSED_EXT);
          passes.push({query,override:!!scene.overrideMaterial,cubeCamera:camera.name||undefined,
            drawCalls:this.info.render.calls,triangles:this.info.render.triangles,submitMs:performance.now()-start});
        }
      };
      try{await w.captureSensorPair(true,'sync',false);}finally{renderer.render=render;}
      const deadline=performance.now()+2000;
      while(passes.some(p=>p.query&&!gl.getQueryParameter(p.query,gl.QUERY_RESULT_AVAILABLE))&&performance.now()<deadline)
        await new Promise(resolve=>setTimeout(resolve,1));
      const disjoint=timer?gl.getParameter(timer.GPU_DISJOINT_EXT):null;
      rows.push({enabled,passes:passes.map(({query,...pass})=>{
        const available=query&&gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE);
        const gpuMs=available&&!disjoint?gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6:null;
        if(query)gl.deleteQuery(query);return {...pass,gpuMs};
      }),disjoint});
    }
    const shaders=renderer.info.programs.map(program=>({
      vertex:gl.getShaderSource(program.vertexShader),fragment:gl.getShaderSource(program.fragmentShader)
    }));
    return {scope:'Isolated GPU sensor submission diagnostics at one fixed pose; not whole runtime throughput',
      graphics:w.graphics,timerSupported:!!timer,rows,shaders};
  });
  await writeFile(path.join(output,'gpu-pass-and-shaders.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({...result,shaders:result.shaders.length},null,2));
}finally{await browser.close();}
