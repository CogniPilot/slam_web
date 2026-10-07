import {D435_IMAGE} from "../../src/camera-profile";
import {expect,test} from '@playwright/test';
import {openEconomicalPropagation} from './reference-project';

test('independent sensor rates capture exact poses and hold physics behind each GPU barrier',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await openEconomicalPropagation(page);
  await page.evaluate(()=>(window as any).__slamLab.runtime.pause());
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  const results=await page.evaluate(async()=>{
    const lab=(window as any).__slamLab,r=lab.runtime,w=r.world,rows=[];
    r.project.lidarEnabled=true;r.project.depthCloudEnabled=true;w.setDepthCloudEnabled(true);
    const sensors=w.sensorRpc,original=sensors.call.bind(sensors),records:any[]=[];
    sensors.call=async(type:string,args:any,timeout:any)=>{
      if(type==='capture'||type==='capture-lidar'){
        const held=w.committedTruth.time;
        await new Promise(resolve=>setTimeout(resolve,4));
        if(w.committedTruth.time!==held)throw new Error('Physics advanced before GPU capture completed');
        const result=await original(type,args,timeout);
        if(w.committedTruth.time!==held)throw new Error('Physics advanced during GPU capture');
        records.push({kind:type,time:args.truth.time,actorTime:args.actorMotion.time,
          scanTime:result.scan?.time,cloudTime:(result.depthRaster??result.depthCloud)?.time,rgb:result.rgb?.length});return result;
      }
      return original(type,args,timeout);
    };
    try{for(const rates of [{cameraHz:15,lidarHz:10,imuHz:90,gpsHz:5},{cameraHz:30,lidarHz:10,imuHz:180,gpsHz:1},{cameraHz:60,lidarHz:20,imuHz:60,gpsHz:10}]){
      r.setSensorRates(rates);const epoch=r.time,start=records.length;
      const imuBefore=r.flow.stats.get('lab/sensors/imu/0')?.count??0,gpsBefore=r.flow.stats.get('lab/navigation/gps')?.count??0;
      for(let i=0;i<rates.cameraHz;i++){
        await r.step();const frame=lab.latest.frame;
        if(Math.abs(frame.time-(epoch+(i+1)/rates.cameraHz))>1e-9)throw new Error('Camera cadence changed');
        if(Math.abs(frame.dt-1/rates.cameraHz)>1e-12)throw new Error('Camera period changed');
        if(frame.time!==lab.latest.truth.time)throw new Error('Camera and physics disagree');
        let cursor=frame.time-frame.dt;
        for(const sample of frame.imuIntervals){if(Math.abs(sample.time-cursor-sample.dt)>1e-9)throw new Error('Lost held IMU interval');cursor=sample.time;}
        if(Math.abs(cursor-frame.time)>1e-9)throw new Error('IMU batch does not reach camera');
      }
      const captures=records.slice(start),camera=captures.filter(value=>value.kind==='capture'),lidar=captures.filter(value=>value.scanTime!==undefined);
      rows.push({rates,epoch,time:r.time,camera,lidar,
        imuCount:(r.flow.stats.get('lab/sensors/imu/0')?.count??0)-imuBefore,
        gpsCount:(r.flow.stats.get('lab/navigation/gps')?.count??0)-gpsBefore});
    }}finally{sensors.call=original;}
    return rows;
  });
  for(const row of results){
    expect(row.time-row.epoch).toBeCloseTo(1,10);expect(row.camera).toHaveLength(row.rates.cameraHz);expect(row.lidar).toHaveLength(row.rates.lidarHz);
    expect(row.imuCount).toBe(row.rates.imuHz);expect(row.gpsCount).toBe(row.rates.gpsHz);
    row.camera.forEach((capture:any,i:number)=>{
      expect(capture.time-row.epoch).toBeCloseTo((i+1)/row.rates.cameraHz,10);expect(capture.actorTime).toBe(capture.time);
      expect(capture.cloudTime).toBe(capture.time);expect(capture.rgb).toBe(D435_IMAGE.width*D435_IMAGE.height*3);
    });
    row.lidar.forEach((capture:any,i:number)=>{expect(capture.scanTime-row.epoch).toBeCloseTo((i+1)/row.rates.lidarHz,10);expect(capture.actorTime).toBe(capture.scanTime);});
  }
  expect(errors).toEqual([]);console.log('MULTIRATE GPU LOCKSTEP',JSON.stringify(results));
});
