import {afterEach,expect,it,vi} from 'vitest';
import {BrowserPerformanceMonitor,PerformanceCounters,RenderDeadline} from '../src/performance-monitor';
afterEach(()=>vi.useRealTimers());

it('counts actual rendering separately from lockstep capture and vision using wall time',()=>{
  const counters=new PerformanceCounters(30,0,true);
  for(let i=0;i<30;i++)counters.rendered(i*1000/30,2);
  for(let i=0;i<10;i++)counters.captured();
  for(let i=0;i<5;i++)counters.visionProcessed();
  counters.lidarCaptured();counters.longTask(100,75);
  const sample=counters.take(1000);
  expect(sample.fps).toBe(30);expect(sample.captureHz).toBe(10);expect(sample.visionHz).toBe(5);expect(sample.lidarHz).toBe(1);
  expect(sample.meanFrameIntervalMs).toBeCloseTo(1000/30);expect(sample.p95FrameIntervalMs).toBeCloseTo(1000/30);expect(sample.meanRenderSubmitMs).toBe(2);
  expect(sample.longTasks).toEqual({count:1,blockedMs:75});
  for(let i=0;i<30;i++)counters.rendered(1000+i*50,1);
  const delayed=counters.take(2500);expect(delayed.fps).toBe(20);expect(delayed.captureHz).toBe(0);expect(delayed.visionHz).toBe(0);
});

it('retains a 30fps phase through RAF jitter and skips missed deadlines without catchup draws',()=>{
  const deadline=new RenderDeadline(30),draws:number[]=[];
  for(let i=0;i<60;i++){const time=i*1000/60;if(deadline.due(time))draws.push(time);}
  expect(draws).toHaveLength(30);
  expect(deadline.due(2000)).toBe(true);expect(deadline.due(2000)).toBe(false);expect(deadline.due(2010)).toBe(false);expect(deadline.due(2034)).toBe(true);
  deadline.reset();expect(deadline.due(3000)).toBe(true);expect(()=>new RenderDeadline(0)).toThrow();
});

it('updates at most once per second and stops timers/counters while the page is hidden',()=>{
  vi.useFakeTimers();let now=0;
  class Visibility extends EventTarget {visibilityState='visible';}
  const source=new Visibility(),updates:any[]=[];
  const monitor=new BrowserPerformanceMonitor({intervalMs:10,document:source,now:()=>now,observeLongTasks:false,onUpdate:value=>updates.push(value)});
  expect(monitor.shouldRender(0)).toBe(true);monitor.rendered(2);monitor.captured();monitor.visionProcessed();
  now=999;vi.advanceTimersByTime(999);expect(updates).toHaveLength(0);
  now=1000;vi.advanceTimersByTime(1);expect(updates).toHaveLength(1);expect(updates[0].fps).toBe(1);expect(updates[0].longTasks).toBe(null);
  source.visibilityState='hidden';source.dispatchEvent(new Event('visibilitychange'));
  expect(vi.getTimerCount()).toBe(0);expect(monitor.shouldRender(1100)).toBe(false);monitor.rendered();monitor.captured();
  now=10000;vi.advanceTimersByTime(9000);expect(updates).toHaveLength(1);
  source.visibilityState='visible';source.dispatchEvent(new Event('visibilitychange'));
  expect(monitor.shouldRender(now)).toBe(true);monitor.rendered(1);monitor.visionProcessed();
  now=11000;vi.advanceTimersByTime(1000);expect(updates).toHaveLength(2);expect(updates[1].fps).toBe(1);expect(updates[1].captureHz).toBe(0);expect(updates[1].meanFrameIntervalMs).toBe(null);
  expect(monitor.latest).toBe(updates[1]);monitor.dispose();expect(vi.getTimerCount()).toBe(0);expect(monitor.shouldRender(12000)).toBe(false);
});
