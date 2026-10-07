import {expect,test} from '@playwright/test';
import {openModelicaPropagation} from './reference-project';

test('unlit static batching preserves exact RGB, axial depth, cloud and moving-actor LiDAR',async({page})=>{
  await page.goto('/');await openModelicaPropagation(page);
  const report=await page.evaluate(async()=>{
    const runtime=(window as any).__slamLab.runtime,world=runtime.world;
    runtime.pause();while(runtime.busy)await new Promise(resolve=>setTimeout(resolve,10));
    world.setDepthCloudEnabled(true);const owner=world.sensorGeometryBatches;
    const same=(a:Uint8Array|Float32Array,b:Uint8Array|Float32Array)=>a.byteLength===b.byteLength&&new Uint8Array(a.buffer,a.byteOffset,a.byteLength).every((value,index)=>value===new Uint8Array(b.buffer,b.byteOffset,b.byteLength)[index]);
    const rows=[];
    for(const time of [0,3,11]){
      const actor=await runtime.modelicaMath.call('actors',{time});world.setActorMotion(actor);
      world.update({time,x:2,y:-1,z:2.4,quaternion:[1,0,0,0]});
      owner.enabled=false;const [reference,oldScan]=await world.captureSensorPair(true,'sync',false),before={...world.lidar.timings};
      owner.enabled=true;const [actual,scan]=await world.captureSensorPair(true,'sync',false),after={...world.lidar.timings};
      rows.push({time,rgb:same(reference.rgb,actual.rgb),depth:same(reference.depth,actual.depth),cloud:same(reference.depthCloud.samples,actual.depthCloud.samples),lidar:same(oldScan.samples,scan.samples),before,after,restored:!owner.group.visible&&world.scene.matrixWorldAutoUpdate});
    }
    return rows;
  });
  for(const row of report){expect(row).toMatchObject({rgb:true,depth:true,cloud:true,lidar:true,restored:true});expect(row.after.drawCalls).toBeLessThan(row.before.drawCalls);}
  console.log('SENSOR GEOMETRY BATCH PARITY',JSON.stringify(report));
});
