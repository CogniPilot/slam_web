import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {openModelicaPropagation} from './reference-project';

test('zero-start dataset export/reload preserves raw Z16 and accepts historical float-depth recordings',async({page},testInfo)=>{
 await page.goto('/');await openModelicaPropagation(page);
 await page.evaluate(()=>(window as any).__slamLab.runtime.pause());
 await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
 const original=await page.evaluate(async()=>{
  const lab=(window as any).__slamLab,r=lab.runtime;
  // Published Rumoca lacks reset_at. Mid-flight replay refusal has a separate
  // retained failing receipt; this fixture qualifies image/file round trips.
  await r.compile(lab.project);r.recording=true;await r.step();r.recording=false;
  const frame=lab.latest.frame;
  const digest=async(view:any)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',view)),v=>v.toString(16).padStart(2,'0')).join('');
  return {rgb:await digest(frame.rgb),depth:await digest(frame.depth),time:frame.time,sequence:frame.sequence,layout:frame.imageLayout,calibration:frame.calibration};
 });
 const event=page.waitForEvent('download');await page.getByRole('button',{name:'Export dataset',exact:true}).click();
 const download=await event,file=await download.path();if(!file)throw Error('Dataset download missing');
 const bytes=await readFile(file),dataset=JSON.parse(bytes.toString('utf8'));
 expect(dataset.version).toBe(2);expect(dataset.records).toHaveLength(1);expect(dataset.records[0].frame.imageLayout).toEqual(original.layout);
 await page.locator('#replay').setInputFiles({name:'raw-dataset.json',mimeType:'application/json',buffer:bytes});
 await expect.poll(()=>page.evaluate(()=>{const lab=(window as any).__slamLab;return lab.runtime.replay?.length===1&&lab.runtime.sequence===1&&!lab.runtime.busy;}),{timeout:90000}).toBe(true);
 const replay=await page.evaluate(async()=>{
  const f=(window as any).__slamLab.latest.frame;
  const digest=async(view:any)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',view)),v=>v.toString(16).padStart(2,'0')).join('');
  return {rgb:await digest(f.rgb),depth:await digest(f.depth),raw:f.depth instanceof Uint16Array,time:f.time,sequence:f.sequence,layout:f.imageLayout};
 });
 expect(replay).toEqual({rgb:original.rgb,depth:original.depth,raw:true,time:original.time,sequence:original.sequence,layout:original.layout});
 const legacy={format:'slam-lab-dataset',version:1,records:[{frame:{sequence:0,time:1/30,dt:1/30,
  calibration:{...original.calibration,width:2,height:2,cx:.5,cy:.5,depthEncoding:'axial-f32-le-rgba8'},
  rgb:[255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255],depth:[1,2,0,4],imu:{accel:[0,0,9.80665],gyro:[0,0,0]}}}]};
 await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.running)).toBe(false);
 await page.locator('#replay').setInputFiles({name:'historical-dataset.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
 await expect.poll(()=>page.evaluate(()=>{const lab=(window as any).__slamLab;return lab.latest.frame.rgb.length===16&&!lab.runtime.busy;}),{timeout:90000}).toBe(true);
 expect(await page.evaluate(()=>(window as any).__slamLab.latest.frame.depth instanceof Float32Array)).toBe(true);
 await expect(page.locator('#rgb + .sensor-foot')).toContainText('RGBA8 dataset');
 await testInfo.attach('raw-camera-recording.json',{body:JSON.stringify({original,replay,legacyFloat32:true},null,2),contentType:'application/json'});
});
