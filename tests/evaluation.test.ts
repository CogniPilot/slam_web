import {describe,it,expect} from 'vitest';
import {relativeTruth} from '../src/evaluation';
import {ComparisonTracker} from '../src/comparison';
import {encodeOdometry,decodeTimedOdometry} from '../src/synapse';
const pose=(x=0,y=0,z=0,quaternion=[1,0,0,0])=>({x,y,z,quaternion});
describe('evaluation frames and independent comparisons',()=>{
  it('uses the edited initial position and heading while retaining gravity vertical',()=>{
    const q=[Math.SQRT1_2,0,0,Math.SQRT1_2],origin=pose(8,-4,7,q);
    const initial=relativeTruth(origin,origin);
    expect([initial.x,initial.y,initial.z]).toEqual([0,0,0]);
    expect(initial.quaternion[0]).toBeCloseTo(1,12);
    const moved=relativeTruth(pose(8,-1,9,q),origin);
    expect(moved.x).toBeCloseTo(3,12);expect(moved.y).toBeCloseTo(0,12);expect(moved.z).toBe(2);
  });
  it('aligns separate map frames only on shared sensor times in either arrival order',()=>{
    const tracker=new ComparisonTracker();
    tracker.addExternal('ros', {...pose(10,20),time:1});
    expect(tracker.path(tracker.streams.get('ros')!)).toEqual([]);
    tracker.addLocal(1,pose());
    tracker.addLocal(2,pose(2));
    tracker.addExternal('ros',{...pose(12,20),time:2});
    tracker.addExternal('native',{...pose(-2,7),time:1});
    tracker.addExternal('native',{...pose(1,7),time:2});
    const ros=tracker.streams.get('ros')!,native=tracker.streams.get('native')!;
    expect(ros.pairs).toBe(2);expect(ros.squaredDifference).toBe(0);
    expect(native.pairs).toBe(2);expect(native.latestDifference).toBe(1);
    tracker.addExternal('ros',{...pose(99),time:2});expect(ros.samples).toBe(2);
    expect(()=>tracker.addExternal('ros',{...pose(),time:.5})).toThrow('clock');
  });
  it('never pairs untimestamped poses or unequal clocks and rejects invalid attitudes',()=>{
    const tracker=new ComparisonTracker();tracker.addLocal(1,pose());
    tracker.addExternal('legacy',pose());tracker.addExternal('other',{...pose(),time:99});
    expect(tracker.streams.get('legacy')!.pairs).toBe(0);expect(tracker.streams.get('other')!.pairs).toBe(0);
    expect(()=>tracker.addExternal('bad',pose(0,0,0,[0,0,0,0]))).toThrow('unit');
  });
  it('retains the canonical Synapse timestamp for comparison pairing',()=>{
    expect(decodeTimedOdometry(encodeOdometry(pose(1,2,3),1234.125))).toEqual({...pose(1,2,3),time:1234.125});
  });
});
