import type {SceneDetail} from './types';

export interface SensorRates {cameraHz:15|30|60;lidarHz:5|10|20;imuHz:30|60|90|180;gpsHz:1|5|10}
export const SENSOR_RATE_OPTIONS={cameraHz:[15,30,60],lidarHz:[5,10,20],imuHz:[30,60,90,180],gpsHz:[1,5,10]} as const;
export const QUALITY_SENSOR_RATES:Record<SceneDetail,SensorRates>={
  low:{cameraHz:15,lidarHz:10,imuHz:90,gpsHz:5},
  medium:{cameraHz:30,lidarHz:10,imuHz:90,gpsHz:5},
  high:{cameraHz:60,lidarHz:20,imuHz:90,gpsHz:10},
};
export function validateSensorRates(value:unknown):asserts value is SensorRates {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid sensor rates');
  for(const key of Object.keys(SENSOR_RATE_OPTIONS) as (keyof SensorRates)[])
    if(!(SENSOR_RATE_OPTIONS[key] as readonly unknown[]).includes((value as SensorRates)[key]))throw new Error(`Unsupported ${key} sensor rate`);
}
export function sensorRates(project:{sceneDetail?:SceneDetail;sensorRates?:SensorRates}):SensorRates {
  const rates=project.sensorRates??QUALITY_SENSOR_RATES[project.sceneDetail??'high'];validateSensorRates(rates);return {...rates};
}
export interface SensorEvent {time:number;camera:boolean;lidar:boolean;imu:boolean;gps:boolean}
/** Exact integer clock grid, independent of wall time or rendering. No sensor
 * ticks are skipped. The caller awaits each event before advancing physics. */
export class SensorClock {
  private camera=0;private lidar=0;private imu=0;private gps=0;
  constructor(readonly rates:SensorRates,private readonly epoch=0){validateSensorRates(rates);if(!Number.isFinite(epoch)||epoch<0)throw new Error('Invalid sensor epoch');}
  nextFrame(lidarEnabled:boolean):SensorEvent[]{
    const end=this.camera+180/this.rates.cameraHz,events:SensorEvent[]=[];
    while(true){
      const l=this.lidar+180/this.rates.lidarHz,i=this.imu+180/this.rates.imuHz,g=this.gps+180/this.rates.gpsHz;
      const tick=Math.min(end,lidarEnabled?l:Infinity,i,g);
      const event={time:this.epoch+tick/180,camera:tick===end,lidar:lidarEnabled&&tick===l,imu:tick===i,gps:tick===g};
      if(event.lidar)this.lidar=tick;else if(!lidarEnabled)this.lidar=Math.floor(tick/(180/this.rates.lidarHz))*(180/this.rates.lidarHz);
      if(event.imu)this.imu=tick;if(event.gps)this.gps=tick;
      events.push(event);if(event.camera){this.camera=tick;return events;}
    }
  }
}
