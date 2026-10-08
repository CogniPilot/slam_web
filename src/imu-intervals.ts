import type {SensorFrame} from './types';

/** Checked transport boundary; integration is performed by compiled Modelica. */
export function imuIntervals(frame:Pick<SensorFrame,'time'|'dt'|'imu'|'imuIntervals'>,maxDt=.2){
  if(!Number.isFinite(frame.time)||!Number.isFinite(frame.dt)||frame.time<0||frame.dt<=0||frame.time-frame.dt < -1e-6
    ||!Number.isFinite(maxDt)||maxDt<=0)throw new Error('Invalid Modelica IMU frame clock');
  const intervals=frame.imuIntervals??[{time:frame.time,dt:frame.dt,imu:frame.imu}];
  if(!Array.isArray(intervals)||!intervals.length||intervals.length>36)throw new Error('Invalid Modelica IMU interval batch');
  let previous=frame.time-frame.dt;
  for(const interval of intervals){
    if(!interval||!Number.isFinite(interval.time)||!Number.isFinite(interval.dt)||interval.dt<=0||interval.dt>maxDt||Math.abs(interval.time-previous-interval.dt)>1e-6)throw new Error('Discontinuous Modelica IMU interval batch');
    for(const name of ['accel','gyro'] as const){
      const input=interval.imu?.[name];if(!Array.isArray(input)||input.length!==3||![...input].every(Number.isFinite))throw new Error('Modelica INS requires three finite FLU acceleration and gyro channels');
    }
    previous=interval.time;
  }
  if(Math.abs(previous-frame.time)>1e-6)throw new Error('Modelica IMU batch does not end at camera time');
  return intervals;
}
