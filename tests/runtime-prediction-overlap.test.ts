import {expect,it,vi} from 'vitest';
import {Runtime} from '../src/runtime';
import {FrameClock} from '../src/frame-clock';

function fixture(predict:()=>Promise<unknown>,secondPhysics:()=>void){
  const imu={accel:[0,0,9.81],gyro:[0,0,0]};
  const truth=(time:number)=>({time,x:0,y:0,z:1,quaternion:[1,0,0,0],accel:imu.accel,gyro:imu.gyro});
  const estimate={x:0,y:0,z:0,quaternion:[1,0,0,0],confidence:1,points:[]};
  const frame={rgb:new Uint8Array(6),depth:new Uint16Array(2)};
  const r=Object.assign(Object.create(Runtime.prototype),{
    frameClock:new FrameClock(),stepping:false,fleetStepping:false,sequence:0,cameraSequence:1,time:0,dt:.2,startWall:0,startTime:0,
    overlapSlamPrediction:true,project:{graph:{edges:[{from:'physics',output:'truth',to:'sensor',input:'truth'},{from:'sensor',output:'frame',to:'slam',input:'frame'}]}},
    order:[{id:'physics',kind:'physics'},{id:'sensor',kind:'sensor'},{id:'slam',kind:'slam'}],
    command:{forward:0,left:0,up:0,yaw:0},sensorClock:{nextFrame:()=>[.1,.2].map(time=>({time,imu:true,camera:time===.2}))},heldImu:imu,
    flow:{record:vi.fn()},lastTimings:{},onFrame:vi.fn(),onVehicleFrame:vi.fn(),onSensor:vi.fn(),vehicleIndex:0,
    sampleSensors:vi.fn(async()=>({imu,gps:null})),
    physics:{lastTimings:{},call:vi.fn(async(_type:string,{time}:{time:number})=>{if(time===.2)secondPhysics();return truth(time);})},
    world:{setEnvironmentVisible:vi.fn(),update:vi.fn(),setActorMotion:vi.fn(),calibration:{},captureSensors:vi.fn(async()=>[frame,undefined])},
    modelicaMath:{call:vi.fn(async(type:string)=>type==='evaluation'?{reference:truth(.2)}:{})},
    slam:{predict:vi.fn(predict),lastTimings:{},step:vi.fn(async()=>({estimate,stepMs:[1,2]}))},
  });
  return r;
}

it('advances the next physical interval while prediction is pending and waits before image publication',async()=>{
  let finish!:()=>void,reached!:()=>void;
  const prediction=new Promise<void>(resolve=>{finish=resolve;}),second=new Promise<void>(resolve=>{reached=resolve;});
  const r=fixture(()=>prediction,reached),step=r.step();
  await second;
  expect(r.slam.predict).toHaveBeenCalledOnce();expect(r.slam.step).not.toHaveBeenCalled();expect(r.onFrame).not.toHaveBeenCalled();
  finish();await step;
  expect(r.slam.step).toHaveBeenCalledOnce();expect(r.onFrame).toHaveBeenCalledOnce();
  const frame=r.slam.step.mock.calls[0][0];
  expect(frame.imuIntervals.map((interval:{time:number})=>interval.time)).toEqual([.1,.2]);
  expect(frame.sequence).toBe(1);expect(frame.time).toBe(.2);expect(r.busy).toBe(false);
});

it('propagates prediction failure without publishing a partial frame or leaving runtime busy',async()=>{
  const error=new Error('Native prediction failed');
  const r=fixture(async()=>{throw error;},()=>{});
  await expect(r.step()).rejects.toBe(error);
  expect(r.onFrame).not.toHaveBeenCalled();expect(r.slam.step).not.toHaveBeenCalled();expect(r.busy).toBe(false);
});
