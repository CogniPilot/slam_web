import {afterEach,expect,it,vi} from 'vitest';
import {Runtime} from '../src/runtime';
const flush=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
const runtime=()=>Object.assign(Object.create(Runtime.prototype),{
  playbackEpoch:0,running:false,stepping:false,fleetStepping:false,time:0,dt:.01,speed:Infinity,onError:vi.fn(),
});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});

it('batches fast completed frames within a bounded wall-time budget',async()=>{
  vi.useFakeTimers();let clock=0;vi.spyOn(performance,'now').mockImplementation(()=>clock);
  const r=runtime();r.step=vi.fn(async()=>{r.time+=r.dt;clock+=1;});
  r.play();await flush();
  expect(r.step).toHaveBeenCalledTimes(8);expect(r.time).toBeCloseTo(.08);
  expect(vi.getTimerCount()).toBe(1);
  r.pause();await vi.runOnlyPendingTimersAsync();expect(r.step).toHaveBeenCalledTimes(8);
});

it('paces finite speed and invalidates timers from an earlier playback',async()=>{
  vi.useFakeTimers();let clock=0;vi.spyOn(performance,'now').mockImplementation(()=>clock);
  const r=runtime();r.speed=10;
  r.step=vi.fn(async()=>{clock+=.25;r.time+=r.dt;});
  r.play();await flush();expect(r.step).toHaveBeenCalledTimes(1);
  r.pause();r.play();await flush();expect(r.step).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(.75);
  expect(r.step).toHaveBeenCalledTimes(3);
  r.pause();
});

it('waits for an in-flight frame after resume and propagates current errors once',async()=>{
  vi.useFakeTimers();const r=runtime();r.stepping=true;
  const error=new Error('Estimator failed');r.step=vi.fn(async()=>{throw error;});
  r.play();await flush();expect(r.step).not.toHaveBeenCalled();
  r.stepping=false;await vi.runOnlyPendingTimersAsync();
  expect(r.step).toHaveBeenCalledTimes(1);expect(r.onError).toHaveBeenCalledExactlyOnceWith(error);
  expect(r.running).toBe(false);expect(vi.getTimerCount()).toBe(0);
});

it('stops a resumed run and reports a failure from its earlier in-flight frame',async()=>{
  vi.useFakeTimers();const r=runtime(),error=new Error('Earlier solver failed');
  let fail!:(error:Error)=>void;
  const pending=new Promise<void>((_resolve,reject)=>{fail=reject;});
  r.step=vi.fn(async()=>{r.stepping=true;try{await pending;}finally{r.stepping=false;}});
  r.play();r.pause();r.play();
  fail(error);await flush();await vi.runOnlyPendingTimersAsync();
  expect(r.step).toHaveBeenCalledTimes(1);expect(r.onError).toHaveBeenCalledExactlyOnceWith(error);
  expect(r.running).toBe(false);expect(vi.getTimerCount()).toBe(0);
});
