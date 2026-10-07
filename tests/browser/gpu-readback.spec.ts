import {D435_IMAGE} from "../../src/camera-profile";
import {openModelicaPropagation} from './reference-project';
import {test,expect} from '@playwright/test';

test('all GPU sensors share a capture wait with exact outputs and recover after submission or copy failure',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await openModelicaPropagation(page);
  await page.evaluate(()=>{(window as any).__slamLab.runtime.pause();});
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  const report=await page.evaluate(async()=>{
    const runtime=(window as any).__slamLab.runtime,world=runtime.world,renderer=world.renderer,gl=renderer.getContext();
    world.configureActors(false,false);world.setDepthCloudEnabled(true);
    world.setActorMotion(await runtime.modelicaMath.call('actors',{time:5}));
    world.update({x:1,y:2,z:3,quaternion:[Math.SQRT1_2,0,0,Math.SQRT1_2],time:5});
    const reference=await world.captureAsync('sync'),lidar=await world.captureLidar(5,false,'sync');
    const same=(a:any,b:any)=>a.length===b.length&&a.every((value:number,index:number)=>value===b[index]);
    const read=gl.readPixels,copy=gl.getBufferSubData,fence=gl.fenceSync,render=renderer.render,update=world.scene.updateMatrixWorld;
    const background=world.scene.background,target=renderer.getRenderTarget(),packing=gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
    const modes=[];
    try{
      for(const mode of ['sync','async']){
        let reads=0,fences=0,firstCopyReads=0,traversals=0;
        world.scene.updateMatrixWorld=function(...args:any[]){traversals++;return update.apply(this,args);};
        gl.readPixels=function(...args:any[]){reads++;return read.apply(this,args);};
        gl.fenceSync=function(...args:any[]){fences++;return fence.apply(this,args);};
        gl.getBufferSubData=function(...args:any[]){if(!firstCopyReads)firstCopyReads=reads;return copy.apply(this,args);};
        const pending=world.captureSensorPair(true,mode,false),automaticRestored=world.scene.matrixWorldAutoUpdate;
        const [camera,scan]=await pending;
        modes.push({mode,reads,fences,firstCopyReads,traversals,automaticRestored,rgb:same(reference.rgb,camera.rgb),depth:same(reference.depth,camera.depth),
          cloud:same(reference.depthCloud.samples,camera.depthCloud.samples),lidarSamples:same(lidar.samples,scan.samples),
          time:scan.time,cloudTime:camera.depthCloud.time});
      }
      gl.readPixels=read;gl.fenceSync=fence;gl.getBufferSubData=copy;
      const failures=[];
      for(const stage of ['lidar submission','buffer copy']){
        let calls=0;
        if(stage==='lidar submission')renderer.render=function(...args:any[]){if(++calls===4)throw new Error('injected shared submission');return render.apply(this,args);};
        else gl.getBufferSubData=function(){throw new Error('injected shared copy');};
        let rejected=false;
        try{await world.captureSensorPair(true,'sync',false);}catch(error){rejected=String(error).includes('injected shared');}
        renderer.render=render;gl.getBufferSubData=copy;
        const restored=world.scene.background===background&&world.scene.overrideMaterial===null&&renderer.getRenderTarget()===target
          &&gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING)===packing&&world.robot.visible&&world.scene.matrixWorldAutoUpdate;
        const [camera,scan]=await world.captureSensorPair(true,'sync',false);
        failures.push({stage,rejected,restored,recovery:same(reference.rgb,camera.rgb)&&same(reference.depth,camera.depth)&&same(lidar.samples,scan.samples)});
      }
      return {modes,failures,dt:runtime.dt};
    }finally{gl.readPixels=read;gl.getBufferSubData=copy;gl.fenceSync=fence;renderer.render=render;world.scene.updateMatrixWorld=update;}
  });
  expect(errors).toEqual([]);expect(report.dt).toBe(1/30);
  for(const mode of report.modes){
    expect(mode.reads).toBe(4);expect(mode.firstCopyReads).toBe(4);expect(mode.fences).toBe(mode.mode==='async'?1:0);
    expect(mode.traversals).toBe(1);expect(mode.automaticRestored).toBe(true);
    for(const key of ['rgb','depth','cloud','lidarSamples'] as const)expect(mode[key]).toBe(true);
    expect(mode.time).toBe(5);expect(mode.cloudTime).toBe(5);
  }
  for(const failure of report.failures){expect(failure.rejected).toBe(true);expect(failure.restored).toBe(true);expect(failure.recovery).toBe(true);}
  console.log('SHARED SENSOR READBACK',JSON.stringify(report));
});

test('GPU raw depth cloud retains calibration, exact-pose timestamp, invalid pixels and sync/async parity',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto('/');await openModelicaPropagation(page);
  await page.evaluate(()=>{(window as any).__slamLab.runtime.pause();});
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  const result=await page.evaluate(async()=>{
    const runtime=(window as any).__slamLab.runtime,world=runtime.world;
    world.setActorMotion(await runtime.modelicaMath.call('actors',{time:3}));
    world.update({x:1,y:2,z:3,quaternion:[Math.SQRT1_2,0,0,Math.SQRT1_2],time:3});world.configureActors(false,false);world.setDepthCloudEnabled(true);
    const sync=await world.captureAsync('sync'),asyncCapture=await world.captureAsync('async'),cloud=sync.depthCloud;
    const same=(a:Float32Array,b:Float32Array)=>{
      const left=new Uint32Array(a.buffer,a.byteOffset,a.length),right=new Uint32Array(b.buffer,b.byteOffset,b.length);
      return left.length===right.length&&left.every((value,i)=>value===right[i]);
    };
    let maximumError=0,valid=0,invalid=0,transformError=0;
    world.depthCloudView.updateMatrixWorld(true);
    const point=new world.robot.position.constructor();
    const {width,height}=cloud;
    for(let row=0;row<height;row++)for(let column=0;column<width;column++){
      const z=sync.depth[row*width+column],offset=((height-1-row)*width+column)*4;
      const samples=cloud.samples,range=samples[offset+3];
      if(!z){invalid++;if(range!==0||samples[offset]!==0||samples[offset+1]!==0||samples[offset+2]!==0)throw new Error('Invalid cloud return is not masked');continue;}
      valid++;
      const expected=[z,-(column-(width-1)/2)*z/(width/(2*Math.tan(87*Math.PI/360))),-(row-(height-1)/2)*z/(height/(2*Math.tan(58*Math.PI/360)))];
      for(let axis=0;axis<3;axis++)maximumError=Math.max(maximumError,Math.abs(samples[offset+axis]-expected[axis]));
      maximumError=Math.max(maximumError,Math.abs(range-z));
      point.set(samples[offset],samples[offset+1],samples[offset+2]).applyMatrix4(world.depthCloudView.matrixWorld);
      const expectedWorld=[1-samples[offset+1],3+samples[offset+2]-.04,-2-samples[offset]-.18];
      transformError=Math.max(transformError,Math.abs(point.x-expectedWorld[0]),Math.abs(point.y-expectedWorld[1]),Math.abs(point.z-expectedWorld[2]));
    }
    // This component test compares GPU-projected dense XYZ. The live viewer
    // defaults to uploading the original Z16 raster and projecting on the GPU.
    world.denseCloudReadback=true;
    await world.setSensorReadback('sync');const pair=await world.captureSensors(true);
    const workerCloud=world.latestDepthCloud;
    world.setDepthCloudEnabled(false);
    return {time:cloud.time,pose:cloud.pose,shape:cloud.samples.length,valid,invalid,maximumError,transformError,
      parity:same(cloud.samples,asyncCapture.depthCloud.samples),workerParity:same(cloud.samples,workerCloud.samples),workerTime:workerCloud.time,lidarTime:pair[1].time,hidden:!world.depthCloudView.visible};
  });
  expect(errors).toEqual([]);expect(result.time).toBe(3);expect(result.workerTime).toBe(3);expect(result.lidarTime).toBe(3);
  expect(result.shape).toBe(D435_IMAGE.width*D435_IMAGE.height*4);expect(result.valid).toBeGreaterThan(0);
  expect(result.maximumError).toBeLessThan(.00001);expect(result.transformError).toBeLessThan(1e-10);
  expect(result.parity).toBe(true);expect(result.workerParity).toBe(true);expect(result.hidden).toBe(true);
  console.log('GPU DEPTH CLOUD',result);
});
test('pooled RGB-D readback exactly matches synchronous pixels and restores render state',async({page})=>{
  await page.goto('/');await openModelicaPropagation(page);
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.latest?.frame.sequence??-1),{timeout:90000}).toBeGreaterThan(1);
  await page.getByRole('button',{name:'Ⅱ Pause'}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  const result=await page.evaluate(async()=>{
    const runtime=(window as any).__slamLab.runtime,world=runtime.world;
    world.setActorMotion(await runtime.modelicaMath.call('actors',{time:3}));
    world.update({x:0,y:0,z:1.5,quaternion:[1,0,0,0],time:3});world.configureActors(false,false);
    world.render();const expected=world.capture(),target=world.renderer.getRenderTarget(),background=world.scene.background;
    const gl=world.renderer.getContext(),fenceSync=gl.fenceSync;let fences=0;
    gl.fenceSync=function(...args:any[]){fences++;return fenceSync.apply(this,args);};
    let actual:any,repeat:any,restored=false;
    try {
      const pending=world.captureAsync();restored=world.renderer.getRenderTarget()===target&&world.scene.background===background&&world.scene.overrideMaterial===null&&world.robot.visible;
      actual=await pending;repeat=await world.captureAsync();
    } finally {gl.fenceSync=fenceSync;}
    const same=(a:any,b:any)=>a.length===b.length&&a.every((value:number,i:number)=>value===b[i]);
    return {restored,fences,rgb:same(expected.rgb,actual.rgb),depth:same(expected.depth,actual.depth),repeatRgb:same(actual.rgb,repeat.rgb),repeatDepth:same(actual.depth,repeat.depth),timings:world.captureTimings};
  });
  expect(result.restored).toBe(true);expect(result.rgb).toBe(true);expect(result.depth).toBe(true);
  expect(result.repeatRgb).toBe(true);expect(result.repeatDepth).toBe(true);expect(result.timings.method).toContain('pooled');
  expect(result.fences).toBe(2); // One fence per synchronized pair.
  console.log('POOLED READBACK PARITY',result);
});

test('dedicated sensor worker readback modes preserve synchronized RGB-D and LiDAR',async({page})=>{
  await page.goto('/');await openModelicaPropagation(page);
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.latest?.frame.sequence??-1),{timeout:90_000}).toBeGreaterThan(1);
  await page.evaluate(()=>{(window as any).__slamLab.runtime.pause();});
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  const result=await page.evaluate(async()=>{
    const runtime=(window as any).__slamLab.runtime,world=runtime.world;
    world.setActorMotion(await runtime.modelicaMath.call('actors',{time:3}));
    world.update({x:0,y:0,z:1.5,quaternion:[1,0,0,0],time:3});world.configureActors(false,false);
    await world.setSensorReadback('async');const asyncResult=await world.captureSensors(true);
    await world.setSensorReadback('sync');const syncResult=await world.captureSensors(true);
    const syncTiming={...world.captureTimings};
    await world.setSensorReadback('async');const repeat=await world.captureSensors(true);
    const same=(a:any,b:any)=>a.length===b.length&&a.every((value:number,i:number)=>value===b[i]);
    return {rgb:same(asyncResult[0].rgb,syncResult[0].rgb),depth:same(asyncResult[0].depth,syncResult[0].depth),
      lidar:same(asyncResult[1].samples,syncResult[1].samples),lidarTime:[asyncResult[1].time,syncResult[1].time],
      repeatRgb:same(repeat[0].rgb,syncResult[0].rgb),repeatDepth:same(repeat[0].depth,syncResult[0].depth),syncTiming};
  });
  expect(result.rgb).toBe(true);expect(result.depth).toBe(true);expect(result.lidar).toBe(true);
  expect(result.lidarTime).toEqual([3,3]);expect(result.repeatRgb).toBe(true);expect(result.repeatDepth).toBe(true);
  expect(result.syncTiming.method).toContain('synchronous');expect(result.syncTiming.readback).toBeGreaterThanOrEqual(0);
});

test('committed RGB-D and LiDAR reuse transforms without changing moving-actor measurements',async({page})=>{
  await page.goto('/');await openModelicaPropagation(page);
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.latest?.frame.sequence??-1),{timeout:90_000}).toBeGreaterThan(1);
  await page.evaluate(()=>{(window as any).__slamLab.runtime.pause();});
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  const result=await page.evaluate(async()=>{
    const runtime=(window as any).__slamLab.runtime,world=runtime.world,scene=world.scene,renderer=world.renderer;
    world.configureActors(true,true);await world.ready;
    const update=scene.updateMatrixWorld,render=renderer.render;
    const same=(a:any,b:any)=>a.length===b.length&&a.every((v:number,i:number)=>v===b[i]);
    const captures=[],traversals=[];let count=0;
    scene.updateMatrixWorld=function(...args:any[]){count++;return update.apply(this,args);};
    try{
      for(const [i,time] of [1.2,4.7,8.1].entries()){
        world.setActorMotion(await runtime.modelicaMath.call('actors',{time}));
        world.update({x:i*2,y:.3*i,z:1.5,quaternion:[Math.cos(i*.07),0,0,Math.sin(i*.07)],time});
        count=0;
        const [actual,scan]=await world.captureSensorPair(true,'async',false);
        traversals.push(count);
        // Independent reference: force Three's original automatic traversal on
        // every render pass, including all six cube faces, at the same actor time.
        renderer.render=function(renderScene:any,camera:any){
          const automatic=renderScene.matrixWorldAutoUpdate;renderScene.matrixWorldAutoUpdate=true;
          try{return render.call(this,renderScene,camera);}finally{renderScene.matrixWorldAutoUpdate=automatic;}
        };
        const reference=await world.captureAsync(),referenceScan=await world.captureLidar(time,false);
        renderer.render=render;
        captures.push({rgb:same(actual.rgb,reference.rgb),depth:same(actual.depth,reference.depth),lidar:same(scan.samples,referenceScan.samples),restored:scene.matrixWorldAutoUpdate===true});
      }
      let calls=0,failed=false;
      renderer.render=function(...args:any[]){if(++calls===2)throw new Error('injected depth submission failure');return render.apply(this,args);};
      try{await world.captureAsync();}catch(error){failed=String(error).includes('injected depth submission failure');}
      renderer.render=render;
      const restoredAfterFailure=scene.matrixWorldAutoUpdate===true&&scene.overrideMaterial===null;
      const recovered=await world.captureAsync();
      return {traversals,captures,failed,restoredAfterFailure,recovered:recovered.rgb.length===recovered.depth.length*4};
    }finally{scene.updateMatrixWorld=update;renderer.render=render;}
  });
  expect(result.traversals).toEqual([1,1,1]); // All committed sensor views share one traversal.
  expect(result.captures).toEqual(Array(3).fill({rgb:true,depth:true,lidar:true,restored:true}));
  expect(result.failed).toBe(true);expect(result.restoredAfterFailure).toBe(true);expect(result.recovered).toBe(true);
  console.log('COMMITTED TRANSFORM PARITY',result);
});
