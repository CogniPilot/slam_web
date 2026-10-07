import {test,expect} from '@playwright/test';
import {D435_IMAGE} from '../../src/camera-profile';

test('native D435 images preserve GPU readback and lockstep timing with vision explicitly pending',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button',{name:'▶ Run',exact:true}).click({timeout:90_000});
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.latest?.frame.sequence??-1),{timeout:90_000}).toBeGreaterThanOrEqual(2);
  await page.evaluate(()=>(window as any).__slamLab.runtime.pause());
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  const result=await page.evaluate(async()=>{
    const lab=(window as any).__slamLab,r=lab.runtime,w=r.world;
    const initial={calibration:lab.latest.frame.calibration,rgbBytes:lab.latest.frame.rgb.byteLength,
      depthCount:lab.latest.frame.depth.length,dt:lab.latest.frame.dt,truthTime:lab.latest.truth.time,
      frameTime:lab.latest.frame.time,pending:Array.from(r.pendingNodes),artifact:r.project.detectorArtifact,depthCloudEnabled:w.depthCloudEnabled};
    const sync=await w.captureAsync('sync'),asyncFrame=await w.captureAsync('async');
    const bytes=(v:any)=>new Uint8Array(v.buffer,v.byteOffset,v.byteLength);
    const equal=(a:any,b:any)=>{a=bytes(a);b=bytes(b);return a.length===b.length&&a.every((v:number,i:number)=>v===b[i]);};
    const chronology=[];
    for(const cameraHz of [15,30,60]){
      r.setSensorRates({cameraHz,lidarHz:10,imuHz:90,gpsHz:5});const start=r.time;
      await r.step();const frame=lab.latest.frame;
      chronology.push({cameraHz,start,time:frame.time,truthTime:lab.latest.truth.time,dt:frame.dt,
        width:frame.calibration.width,height:frame.calibration.height,rgbBytes:frame.rgb.byteLength,depthCount:frame.depth.length});
    }
    return {initial,
      chronology,rgbParity:equal(sync.rgb,asyncFrame.rgb),depthParity:equal(sync.depth,asyncFrame.depth),
      graphics:w.graphics,sensorGraphics:w.sensorGraphics,
      targets:{rgb:[w.rgbTarget.width,w.rgbTarget.height],depth:[w.depthTarget.width,w.depthTarget.height]},
      glError:w.renderer.getContext().getError()};
  });
  const pixels=D435_IMAGE.width*D435_IMAGE.height;
  expect(errors).toEqual([]);expect(result.glError).toBe(0);
  expect(result.initial.calibration.width).toBe(848);expect(result.initial.calibration.height).toBe(480);
  expect(result.initial.rgbBytes).toBe(pixels*3);expect(result.initial.depthCount).toBe(pixels);
  expect(result.initial.artifact).toBeUndefined();expect(result.initial.pending).toEqual([['detector','Rumoca native full-frame feature detection pending']]);
  expect(result.initial.dt).toBe(1/30);expect(result.initial.frameTime).toBe(result.initial.truthTime);
  expect(result.initial.depthCloudEnabled).toBe(false);
  expect(result.targets).toEqual({rgb:[848,480],depth:[848,480]});
  expect(result.rgbParity).toBe(true);expect(result.depthParity).toBe(true);
  for(const row of result.chronology){
    expect(row.time-row.start).toBeCloseTo(1/row.cameraHz,10);expect(row.dt).toBe(1/row.cameraHz);
    expect(row.time).toBe(row.truthTime);expect(row.width).toBe(848);expect(row.height).toBe(480);
    expect(row.rgbBytes).toBe(pixels*3);expect(row.depthCount).toBe(pixels);
  }
  await expect(page.locator('#rgb + .sensor-foot')).toContainText('848 × 480');
  await expect(page.locator('#depth + .sensor-foot')).toContainText('848 × 480');
  console.log('NATIVE D435 PROFILE',JSON.stringify(result));
});
