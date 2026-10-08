import {expect,it} from 'vitest';
import {imuIntervals} from '../src/imu-intervals';
const imu={accel:[0,0,9.80665],gyro:[0,0,0]};
it('keeps every held measurement interval and refuses gaps, malformed channels and incomplete camera coverage',()=>{
  const first={...imu,accel:[1,0,9.80665]},second={...imu,accel:[2,0,9.80665]};
  const batch=[{time:.01,dt:.01,imu:first},{time:.015,dt:.005,imu:second}];
  const frame={time:.015,dt:.015,imu,imuIntervals:batch};
  expect(imuIntervals(frame)).toBe(batch);
  expect(imuIntervals({time:.015,dt:.015,imu})).toEqual([{time:.015,dt:.015,imu}]);
  for(const bad of [[],Array(37).fill(batch[0]),[{...batch[0],dt:0}],
    [batch[0],{...batch[1],dt:.003}],batch.slice(0,1),
    [batch[0],{...batch[1],imu:{...imu,gyro:[0,NaN,0]}}]])expect(()=>imuIntervals({...frame,imuIntervals:bad})).toThrow();
  expect(imuIntervals(frame)).toBe(batch);expect(first.accel).toEqual([1,0,9.80665]);
});
it('rejects nonfinite frame clocks even when supplied interval endpoints are valid',()=>{
  const frame={time:.01,dt:.01,imu,imuIntervals:[{time:.01,dt:.01,imu}]};
  for(const bad of [{time:NaN},{time:Infinity},{time:-1},{dt:NaN},{dt:Infinity},{dt:0},{dt:-1},{dt:.02}])
    expect(()=>imuIntervals({...frame,...bad})).toThrow();
  for(const maxDt of [NaN,Infinity,0,-1])expect(()=>imuIntervals(frame,maxDt)).toThrow();
});
it('rejects missing IMU axes in sparse measurement arrays',()=>{
  const frame={time:.01,dt:.01,imu};
  for(const name of ['accel','gyro'] as const)
    expect(()=>imuIntervals({...frame,imu:{...imu,[name]:Array(3)}})).toThrow('three finite');
});
