import {expect,it} from 'vitest';
import {SensorClock,SENSOR_RATE_OPTIONS,QUALITY_SENSOR_RATES,sensorRates,validateSensorRates,type SensorRates} from '../src/sensor-clock';
import {defaultProject,parseProject} from '../src/project';

it('delivers every independent sensor timestamp once across all supported rate combinations',()=>{
  for(const cameraHz of SENSOR_RATE_OPTIONS.cameraHz)for(const lidarHz of SENSOR_RATE_OPTIONS.lidarHz)
    for(const imuHz of SENSOR_RATE_OPTIONS.imuHz)for(const gpsHz of SENSOR_RATE_OPTIONS.gpsHz){
      const rates={cameraHz,lidarHz,imuHz,gpsHz},clock=new SensorClock(rates,7.25);
      const events=Array.from({length:cameraHz},()=>clock.nextFrame(true)).flat();
      for(const [kind,rate] of [['camera',cameraHz],['lidar',lidarHz],['imu',imuHz],['gps',gpsHz]] as const){
        const selected=events.filter(event=>event[kind]);expect(selected).toHaveLength(rate);
        selected.forEach((event,index)=>expect(event.time).toBeCloseTo(7.25+(index+1)/rate,12));
      }
      events.forEach((event,index)=>{if(index)expect(event.time).toBeGreaterThan(events[index-1].time);});
      expect(events.at(-1)!.time).toBe(8.25);
    }
});

it('reanchors cadence without relabeling past time, keeps disabled lidar absent and persists custom rates',()=>{
  for(const detail of ['low','medium','high'] as const){
    const clock=new SensorClock(QUALITY_SENSOR_RATES[detail],.123);
    const events=clock.nextFrame(false);expect(events.every(event=>!event.lidar)).toBe(true);
    expect(events.at(-1)!.time).toBeCloseTo(.123+1/QUALITY_SENSOR_RATES[detail].cameraHz,12);
  }
  const rates:SensorRates={cameraHz:60,lidarHz:5,imuHz:180,gpsHz:1};
  const project={...defaultProject(),sceneDetail:'low' as const,sensorRates:rates};
  expect(sensorRates(parseProject(JSON.stringify(project)))).toEqual(rates);
  const {sensorRates:omitted,...inferred}=project;expect(sensorRates(inferred)).toEqual(QUALITY_SENSOR_RATES.low);
  expect(()=>validateSensorRates({...rates,lidarHz:90})).toThrow('lidarHz');
  expect(()=>parseProject(JSON.stringify({...project,sensorRates:{...rates,imuHz:0}}))).toThrow('imuHz');
  expect(()=>validateSensorRates({...rates,cameraHz:90})).toThrow('cameraHz');
  expect(parseProject(JSON.stringify({...project,sensorRates:{...rates,cameraHz:90}})).sensorRates).toEqual(rates);
  expect(QUALITY_SENSOR_RATES.medium.cameraHz).toBe(30);
  expect(QUALITY_SENSOR_RATES.high.cameraHz).toBe(60);
});
