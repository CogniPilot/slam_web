import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {StartupDeadlineError,withDeadline} from '../src/startup-deadline';

describe('startup deadlines',()=>{
  beforeEach(()=>{vi.useFakeTimers();});
  afterEach(()=>{vi.useRealTimers();});
  it('resolves work that finishes in time and clears its timer',async()=>{
    const result=withDeadline(Promise.resolve(7),1000,'Compiler');
    await expect(result).resolves.toBe(7);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects a stalled phase with a readable message',async()=>{
    const result=withDeadline(new Promise<never>(()=>{}),20_000,'Rendering worker');
    const checked=expect(result).rejects.toThrow(new StartupDeadlineError('Rendering worker',20_000));
    await vi.advanceTimersByTimeAsync(20_000);
    await checked;
    await expect(result).rejects.toThrow('Rendering worker did not finish within 20 s');
  });
  it('adds advice to the message when given',async()=>{
    const result=withDeadline(new Promise<never>(()=>{}),180_000,'Compiling the Modelica model','reloading the page may help');
    const checked=expect(result).rejects.toThrow('Compiling the Modelica model did not finish within 180 s · reloading the page may help');
    await vi.advanceTimersByTimeAsync(180_000);
    await checked;
  });
  it('passes through failures from the work itself',async()=>{
    await expect(withDeadline(Promise.reject(new Error('out of memory')),1000,'Compiler')).rejects.toThrow('out of memory');
  });
});
