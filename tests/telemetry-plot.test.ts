import {describe, expect, it} from 'vitest';
import {TelemetryHistory} from '../src/telemetry-plot';
import type {Truth} from '../src/types';
const truth = (z:number):Truth => ({time:0, x:1, y:2, z, quaternion:[0,0,0,1], velocity:[3,4,5], accel:[6,7,8], gyro:[9,10,11]});
describe('telemetry history', () => {
  it('bounds storage by capacity and elapsed seconds', () => {
    const history = new TelemetryHistory(5, 2);
    for (let i=0;i<20;i++) history.sample(0,i/10,truth(i));
    expect(history.samples(0)).toHaveLength(5);
    history.sample(0,10,truth(20));
    expect(history.samples(0).map(s=>s.time)).toEqual([10]);
  });
  it('isolates vehicles and preserves unselected signals', () => {
    const history = new TelemetryHistory();
    history.sample(0,1,truth(10)); history.sample(1,1,truth(20),undefined,{accel:[30,31,32],gyro:[40,41,42]});
    expect(history.samples(0)[0].values).toMatchObject({z:10,az:8,gz:11,vx:3});
    expect(history.samples(1)[0].values).toMatchObject({z:20,az:32,gz:42});
  });
  it('handles duplicate times, backwards clocks, invalid values and reset', () => {
    const history = new TelemetryHistory();
    history.sample(0,2,truth(1)); history.sample(0,2,truth(2)); history.sample(0,NaN,truth(3));
    expect(history.samples(0)).toHaveLength(1);
    history.sample(1,2,truth(4)); history.sample(0,1,truth(NaN));
    expect(history.samples(0).map(s=>s.time)).toEqual([1]);
    expect(history.samples(0)[0].values.z).toBeUndefined();
    expect(history.samples(1)).toHaveLength(1);
    history.reset(); expect(history.samples(0)).toEqual([]); expect(history.samples(1)).toEqual([]);
  });
});
