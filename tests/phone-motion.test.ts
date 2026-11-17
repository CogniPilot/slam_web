import {expect,it} from 'vitest';
import {AccelSignDetector,MotionBatcher,eulerDegrees,expectedGravity,initialTilt,motionSample} from '../src/phone-motion';
import {imuIntervals} from '../src/imu-intervals';

it('reorders DeviceMotion rotation rates to body axes in rad/s and rejects missing channels',()=>{
  const sample=motionSample({accelerationIncludingGravity:{x:1,y:2,z:9},rotationRate:{alpha:30,beta:10,gamma:20}})!;
  expect(sample.accel).toEqual([1,2,9]);
  expect(sample.gyro.map(v=>v*180/Math.PI)).toEqual([10,20,30].map(v=>expect.closeTo(v,10)));
  expect(motionSample({accelerationIncludingGravity:{x:1,y:2,z:9},rotationRate:{alpha:30,beta:10,gamma:20}},-1)!.accel).toEqual([-1,-2,-9]);
  expect(motionSample({accelerationIncludingGravity:{x:null,y:0,z:9.8},rotationRate:{alpha:0,beta:0,gamma:0}})).toBeUndefined();
  expect(motionSample({accelerationIncludingGravity:null,rotationRate:null})).toBeUndefined();
});

it('predicts gravity from orientation angles and detects an inverted accelerometer',()=>{
  const near=(actual:number[],expected:number[])=>expected.forEach((value,i)=>expect(actual[i]).toBeCloseTo(value,12));
  near(expectedGravity(0,0),[0,0,1]);
  near(expectedGravity(90,0),[0,1,0]);// upright, portrait
  near(expectedGravity(0,90),[-1,0,0]);// rolled onto the right edge
  for(const sign of [1,-1]){
    const detector=new AccelSignDetector(5);
    for(let i=0;i<5;i++)detector.add([0,sign*9.81*Math.sin(.3),sign*9.81*Math.cos(.3)],.3*180/Math.PI,0);
    expect(detector.done).toBe(true);expect(detector.sign).toBe(sign);
  }
  const free=new AccelSignDetector(1);free.add([0,0,.2],0,0);// free fall says nothing about sign
  expect(free.done).toBe(false);expect(free.sign).toBe(1);
});

it('seeds roll and pitch that reproduce the measured gravity direction',()=>{
  const g=9.81,roll=.4,pitch=-.3;
  const tilt=initialTilt([-g*Math.sin(pitch),g*Math.cos(pitch)*Math.sin(roll),g*Math.cos(pitch)*Math.cos(roll)]);
  expect(tilt.initialRoll).toBeCloseTo(roll,12);expect(tilt.initialPitch).toBeCloseTo(pitch,12);
  const q=[Math.cos(pitch/2)*Math.cos(roll/2),Math.cos(pitch/2)*Math.sin(roll/2),Math.sin(pitch/2)*Math.cos(roll/2),-Math.sin(pitch/2)*Math.sin(roll/2)];
  const angles=eulerDegrees(q);
  expect(angles.roll).toBeCloseTo(roll*180/Math.PI,10);expect(angles.pitch).toBeCloseTo(pitch*180/Math.PI,10);expect(angles.yaw).toBeCloseTo(0,10);
});

it('batches jittered 60 Hz events into contiguous frames the Modelica session accepts',()=>{
  const batcher=new MotionBatcher(),sample={accel:[0,0,9.81] as [number,number,number],gyro:[0,0,0] as [number,number,number]};
  const frames=[];let time=5000;
  expect(batcher.add(sample,time)).toBe('ok');// the first sample only starts the clock
  for(let i=0;i<120;i++){
    time+=1000/60+(i%3-1)*2;
    expect(batcher.add(sample,time)).toBe('ok');
    const frame=batcher.take();if(frame)frames.push(frame);
  }
  expect(batcher.add(sample,time)).toBe('skip');// duplicate timestamp
  expect(frames.length).toBeGreaterThan(15);
  let previous=0;
  for(const frame of frames){
    expect(frame.time-frame.dt).toBeCloseTo(previous,9);
    expect(frame.dt).toBeLessThanOrEqual(.2);
    expect(()=>imuIntervals(frame)).not.toThrow();
    previous=frame.time;
  }
  expect(batcher.add(sample,time+500)).toBe('restart');// a 0.5 s pause cannot be one held interval
  expect(batcher.take()).toBeUndefined();
});

it('restarts instead of building a frame longer than the session accepts',()=>{
  const batcher=new MotionBatcher(),sample={accel:[0,0,9.81] as [number,number,number],gyro:[0,0,0] as [number,number,number]};
  batcher.add(sample,0);
  const results=Array.from({length:14},(_,i)=>batcher.add(sample,(i+1)*1000/60));// never taken
  // 12 intervals span 0.2 s; the 13th would exceed it, and the next sample starts a new clock.
  expect(results.slice(0,12).every(result=>result==='ok')).toBe(true);
  expect(results[12]).toBe('restart');
  expect(results[13]).toBe('ok');
});
