import {D435_IMAGE} from "../../src/camera-profile";
import {test,expect} from '@playwright/test';
import {openModelicaPropagation} from './reference-project';
import {openConfiguration} from './configuration-pane';
import {QUALITY_SENSOR_RATES} from '../../src/sensor-clock';

test('Configuration persists custom sensor rates without resetting a compiled experiment',async({page})=>{
  await page.goto('/');await openModelicaPropagation(page);
  await page.evaluate(()=>{(window as any).__slamLab.runtime.pause();});
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  const before=await page.evaluate(()=>{
    const lab=(window as any).__slamLab,r=lab.runtime;
    (window as any).__rateWorkers=[r.physics,r.modelicaMath,r.modelicaVision,r.modelicaState];
    return {time:r.time,sequence:lab.latest.frame.sequence};
  });
  await openConfiguration(page);
  await expect(page.getByLabel('Node source code')).toBeHidden();
  for(const [label,value] of [['RGB + depth rate','60'],['LiDAR rate','5'],['Airframe IMU rate','180'],['GPS rate','1']]){
    await page.getByLabel(label,{exact:true}).selectOption(value);
    await expect(page.locator('#status')).toHaveText('Sensor rates updated · run preserved · press Run to continue');
    await expect(page.getByLabel(label,{exact:true})).toBeEnabled();
  }
  await page.getByLabel('Graphics quality',{exact:true}).selectOption('low');
  await expect(page.locator('#status')).toHaveText('Graphics quality updated · run preserved · press Run to continue');
  const custom={cameraHz:60,lidarHz:5,imuHz:180,gpsHz:1};
  const after=await page.evaluate(()=>{
    const lab=(window as any).__slamLab,r=lab.runtime;
    return {time:r.time,sequence:lab.latest.frame.sequence,dt:r.dt,rates:lab.project.sensorRates,runtimeRates:r.project.sensorRates,
      sameWorkers:[r.physics,r.modelicaMath,r.modelicaVision,r.modelicaState].every((worker,i)=>worker===(window as any).__rateWorkers[i])};
  });
  expect(after).toEqual({...before,dt:1/60,rates:custom,runtimeRates:custom,sameWorkers:true});
  await page.getByRole('button',{name:'Save project',exact:true}).click();
  await expect(page.locator('#status')).toHaveText('Project saved in this browser');
  await page.reload();await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.ready),{timeout:90000}).toBe(true);
  await page.evaluate(()=>{(window as any).__slamLab.runtime.pause();});
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  await openConfiguration(page);
  await expect(page.getByLabel('RGB + depth rate',{exact:true})).toHaveValue('60');
  await expect(page.getByLabel('Airframe IMU rate',{exact:true})).toHaveValue('180');
  expect(await page.evaluate(()=>(window as any).__slamLab.project.sensorRates)).toEqual(custom);
  await page.getByRole('button',{name:'Use quality defaults',exact:true}).click();
  await expect(page.locator('#status')).toHaveText('Sensor rates updated · run preserved · press Run to continue');
  await expect(page.getByLabel('RGB + depth rate',{exact:true})).toHaveValue('15');
  expect(await page.evaluate(()=>({rates:(window as any).__slamLab.project.sensorRates,dt:(window as any).__slamLab.runtime.dt}))).toEqual({rates:undefined,dt:1/15});
});

test('quality changes bound photographic texture sizes and release disabled GPU resources',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.initialized),{timeout:90000}).toBe(true);
  const result=await page.evaluate(async()=>{
    const world=(window as any).__slamLab.runtime.world,materials=world.materials;
    const sources=['brick','plaster','asphalt','paving','wood','grass'].map(kind=>materials.surface(kind,0xffffff));
    const original=sources.map(m=>({color:m.map,normal:m.normalMap,arm:m.roughnessMap,
      images:[m.map.image,m.normalMap.image,m.roughnessMap.image],repeat:m.map.repeat.toArray()}));
    let normalDisposals=0;
    for(const m of original)m.normal.addEventListener('dispose',()=>normalDisposals++);
    await world.setGraphicsQuality('medium');world.render();
    const shadow=world.lighting.sun.shadow.map;let shadowDisposals=0;
    shadow?.addEventListener('dispose',()=>shadowDisposals++);
    const inspect=(detail:string)=>({detail,dimensions:sources.map(m=>[m.map.image.width,m.map.image.height]),
      cloudOctaves:world.lighting.sky.material.uniforms.cloudOctaves.value,
      normals:sources.map(m=>m.normalMap!==null),
      boundTexels:sources.reduce((n,m)=>n+[m.map,m.normalMap,m.roughnessMap].filter(Boolean).reduce((t,tex)=>t+tex.image.width*tex.image.height,0),0),
      shadowAllocated:world.lighting.sun.shadow.map!==null});
    const medium=inspect('medium');
    await world.setGraphicsQuality('low');world.render();const low=inspect('low');
    const lowReleased={normalDisposals,shadowDisposals};
    await world.setGraphicsQuality('high');world.render();const high=inspect('high');
    const restored=sources.every((m,i)=>m.map===original[i].color&&m.normalMap===original[i].normal&&m.roughnessMap===original[i].arm
      &&[m.map.image,m.normalMap.image,m.roughnessMap.image].every((image,j)=>image===original[i].images[j])
      &&m.map.repeat.toArray().every((v:number,j:number)=>v===original[i].repeat[j]));
    return {medium,low,high,lowReleased,restored,shadowWasAllocated:shadow!==null};
  });
  expect(result.medium.dimensions).toEqual(Array(6).fill([512,512]));
  expect(result.low.dimensions).toEqual(Array(6).fill([256,256]));
  expect(result.high.dimensions).toEqual(Array(6).fill([512,512]));
  expect(result.low.normals).toEqual(Array(6).fill(false));expect(result.high.normals).toEqual(Array(6).fill(true));
  expect([result.low.cloudOctaves,result.medium.cloudOctaves,result.high.cloudOctaves]).toEqual([1,2,3]);
  expect(result.low.shadowAllocated).toBe(false);expect(result.shadowWasAllocated).toBe(true);
  expect(result.lowReleased.normalDisposals).toBeGreaterThanOrEqual(6);expect(result.lowReleased.shadowDisposals).toBe(1);
  expect(result.low.boundTexels).toBe(result.high.boundTexels/6);expect(result.restored).toBe(true);
  expect(errors).toEqual([]);console.log('GRAPHICS TEXTURE BUDGET',JSON.stringify(result));
});

test('graphics dial works before algorithm integration and preserves a compiled lockstep run',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.initialized),{timeout:90000}).toBe(true);
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.ready),{timeout:90000}).toBe(true);
  // Exercise an explicitly unsupported estimator, rather than depending on
  // the startup compilation race to observe an unready application.
  await page.evaluate(()=>(window as any).__slamLab.sourceEditor.editor.setValue('model PendingSLAM\n output Real x;\nequation\n x=0;\nend PendingSLAM;'));
  await page.getByRole('button',{name:'Apply & reset',exact:true}).click();
  await expect(page.locator('#status')).toHaveClass(/error/);
  await openConfiguration(page);
  const dial=page.getByLabel('Graphics quality',{exact:true});
  await expect(dial).toBeEnabled({timeout:90000});
  expect(await page.evaluate(()=>(window as any).__slamLab.ready)).toBe(false);
  await dial.selectOption('low');
  await expect(page.locator('#status')).toHaveText('Graphics quality updated · select an available experiment to run');
  expect(await page.evaluate(()=>{
    const lab=(window as any).__slamLab;return {ready:lab.ready,detail:lab.runtime.world.currentDetail,shadows:lab.runtime.world.renderer.shadowMap.enabled};
  })).toEqual({ready:false,detail:'low',shadows:false});
  await openModelicaPropagation(page);
  await page.evaluate(()=>{(window as any).__slamLab.runtime.pause();});
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  await page.evaluate(()=>{
    const r=(window as any).__slamLab.runtime;
    (window as any).__qualityWorkers=[r.physics,r.modelicaMath,r.modelicaVision,r.modelicaState];
    r.world.view.position.set(-7,9,4);r.world.controls.target.set(3,2,0);r.world.controls.update();
  });
  const observations=[];
  for(const detail of ['high','medium','low'] as const){
    const before=await page.evaluate(()=>{
      const lab=(window as any).__slamLab,w=lab.runtime.world;
      return {time:lab.runtime.time,sequence:lab.latest.frame.sequence,truth:JSON.stringify(w.committedTruth),
        camera:w.view.position.toArray(),target:w.controls.target.toArray(),paths:w.trajectories.children.length};
    });
    await dial.selectOption(detail);
    await expect(page.locator('#status')).toHaveText('Graphics quality updated · run preserved · press Run to continue');
    await expect(dial).toBeEnabled();
    await expect(page.locator('#graphics-budget')).toContainText(detail==='low'?'simple clouds':detail==='medium'?'layered clouds':'detailed clouds');
    const after=await page.evaluate(async()=>{
      const lab=(window as any).__slamLab,r=lab.runtime,w=r.world;
      const [camera,lidar]=await w.captureSensors(true);
      return {time:r.time,sequence:lab.latest.frame.sequence,truth:JSON.stringify(w.committedTruth),
        camera:w.view.position.toArray(),target:w.controls.target.toArray(),paths:w.trajectories.children.length,
        sameWorkers:[r.physics,r.modelicaMath,r.modelicaVision,r.modelicaState].every((worker,i)=>worker===(window as any).__qualityWorkers[i]),
        ready:lab.ready,detail:w.currentDetail,savedDetail:lab.project.sceneDetail,runtimeDetail:r.project.sceneDetail,
        dt:r.dt,rgbBytes:camera.rgb.byteLength,depthSamples:camera.depth.length,lidarTime:lidar.time,
        pixelRatio:w.renderer.getPixelRatio(),shadows:w.renderer.shadowMap.enabled};
    });
    for(const field of ['time','sequence','truth','camera','target','paths'] as const)expect(after[field]).toEqual(before[field]);
    expect(after.paths).toBeGreaterThan(0);expect(after.sameWorkers).toBe(true);expect(after.ready).toBe(true);
    expect([after.detail,after.savedDetail,after.runtimeDetail]).toEqual([detail,detail,detail]);
    expect(after.dt).toBe(1/QUALITY_SENSOR_RATES[detail].cameraHz);expect(after.rgbBytes).toBe(D435_IMAGE.width*D435_IMAGE.height*3);expect(after.depthSamples).toBe(D435_IMAGE.width*D435_IMAGE.height);expect(after.lidarTime).toBe(after.time);
    observations.push(after);
    await page.getByRole('button',{name:'Step',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.latest.frame.sequence)).toBe(before.sequence+1);
    expect(await page.evaluate(()=>(window as any).__slamLab.runtime.time)).toBeCloseTo(before.time+1/QUALITY_SENSOR_RATES[detail].cameraHz,8);
  }
  expect(observations[0].pixelRatio).toBeGreaterThan(observations[2].pixelRatio);
  expect(observations.map(o=>o.shadows)).toEqual([true,true,false]);expect(errors).toEqual([]);
  console.log('LIVE GRAPHICS DIAL',JSON.stringify(observations));
});
