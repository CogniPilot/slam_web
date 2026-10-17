import {expect,it} from 'vitest';
import {FrameClock} from '../src/frame-clock';
it('frame clock reports the step, the interval and the trailing sim/wall rate',()=>{
  const clock=new FrameClock(10000);
  expect(clock.recentRate).toBeUndefined();
  clock.record(0,100,0.2);
  expect(clock.recentRate).toBeUndefined();
  expect([clock.stepMs,clock.intervalMs]).toEqual([100,100]);
  clock.record(150,250,0.4);
  expect([clock.stepMs,clock.intervalMs]).toEqual([100,150]);
  expect(clock.recentRate).toBeCloseTo(0.2/0.15);
});
it('a hidden-page gap leaves the trailing window once newer frames span it',()=>{
  const clock=new FrameClock(10000);
  for(let i=0;i<=50;i++)clock.record(i*200-50,i*200,i*0.2);
  expect(clock.recentRate).toBeCloseTo(1);
  // 60 s with no frames, then frames at the original pace again.
  const resumed=10000+60000;
  clock.record(resumed-50,resumed,10.2);
  expect(clock.intervalMs).toBe(60000);
  expect(clock.recentRate!).toBeLessThan(0.2);
  for(let i=1;i<=60;i++)clock.record(resumed+i*200-50,resumed+i*200,10.2+i*0.2);
  expect(clock.recentRate).toBeCloseTo(1);
});
it('reset forgets earlier frames',()=>{
  const clock=new FrameClock();
  clock.record(0,100,0.2);clock.record(100,200,0.4);clock.reset();
  expect(clock.recentRate).toBeUndefined();
  expect([clock.stepMs,clock.intervalMs]).toEqual([0,0]);
});
it('a paced frame reports its wait and no other time',()=>{
  const clock=new FrameClock();
  // 5 Hz at real time: 100 ms of node work, then the loop sleeps 100 ms.
  clock.record(0,100,0.2);clock.record(200,300,0.4,100);
  expect([clock.intervalMs,clock.pacedMs]).toEqual([200,100]);
  expect(clock.otherMs(100)).toBe(0);
});
it('a frame behind real time reports other time and never a negative one',()=>{
  const clock=new FrameClock();
  // No pacing wait: the 250 ms frame ran 150 ms of nodes and 100 ms elsewhere.
  clock.record(0,250,0.2);clock.record(250,500,0.4,0);
  expect(clock.pacedMs).toBe(0);
  expect(clock.otherMs(150)).toBe(100);
  expect(clock.otherMs(260)).toBe(0);
});
