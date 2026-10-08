import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {checkRGBDSlamBuild,type SlamBuildReceipt} from '../src/modelica-slam-build';
import type {RGBDSlamWorkspace} from '../src/modelica-slam-workspace';

vi.mock('../src/modelica-slam-workspace',()=>({
  assembleRGBDSlamWorkspace:vi.fn(async()=>({source:'saved source',sourceSha256:'saved digest'})),
}));

// Transport controls only; these messages do not represent executed WASM.
class BuildWorker {
  static instances:BuildWorker[]=[];
  onmessage:((event:{data:unknown})=>void)|null=null;
  onerror:((event:unknown)=>void)|null=null;
  onmessageerror:(()=>void)|null=null;
  postMessage=vi.fn();terminate=vi.fn();
  constructor(){BuildWorker.instances.push(this);}
  emit(data:unknown){this.onmessage?.({data});}
}
const workspace:RGBDSlamWorkspace={schemaVersion:2,sources:{}};
const partial:SlamBuildReceipt={status:'failed',sourceSha256:'saved digest',programs:[],elapsedMs:0};
const latest=()=>BuildWorker.instances.at(-1)!;

beforeEach(()=>{vi.useFakeTimers();BuildWorker.instances=[];vi.stubGlobal('Worker',BuildWorker);});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

it('times out a synchronous compiler phase, preserves completed metadata and terminates its worker',async()=>{
  const pending=checkRGBDSlamBuild(workspace,{base:'/',timeoutMs:100});
  await Promise.resolve();const worker=latest();
  const receipt={...partial,compiler:{version:'control',revision:'control'},
    programs:[{model:'Reset',moduleSha256:'control',profile:'control',compileMs:12}]};
  worker.emit({progress:{phase:'compiling',model:'Step'},receipt});
  await vi.advanceTimersByTimeAsync(100);
  await expect(pending).resolves.toMatchObject({...receipt,elapsedMs:100,timedOut:true,failedAt:{phase:'compiling',model:'Step'}});
  expect((await pending).error).toContain('Step timed out after 100 ms');
  expect(worker.terminate).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
  expect(worker.onmessage).toBeNull();
  // Retry owns a fresh worker and has no timer left over from the failed build.
  const retry=checkRGBDSlamBuild(workspace,{base:'/',timeoutMs:100});
  await Promise.resolve();expect(latest()).not.toBe(worker);
  latest().emit({receipt:{...partial,status:'pass'}});
  await expect(retry).resolves.toMatchObject({status:'pass'});
  expect(latest().terminate).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});

it('gives each phase its own deadline and clears it on a terminal response',async()=>{
  const pending=checkRGBDSlamBuild(workspace,{base:'/',timeoutMs:100});
  await Promise.resolve();const worker=latest();
  await vi.advanceTimersByTimeAsync(90);
  worker.emit({progress:{phase:'compiling',model:'Reset'},receipt:partial});
  await vi.advanceTimersByTimeAsync(90);expect(worker.terminate).not.toHaveBeenCalled();
  worker.emit({progress:{phase:'admitting',model:'Reset'},receipt:partial});
  await vi.advanceTimersByTimeAsync(90);expect(worker.terminate).not.toHaveBeenCalled();
  worker.emit({receipt:partial});await expect(pending).resolves.toEqual(partial);
  expect(vi.getTimerCount()).toBe(0);
});

it('aborts during a progress callback without leaving a new deadline or worker',async()=>{
  const abort=new AbortController();
  const pending=checkRGBDSlamBuild(workspace,{base:'/',signal:abort.signal,onProgress:()=>abort.abort()});
  const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});
  await Promise.resolve();const worker=latest();
  worker.emit({progress:{phase:'compiling',model:'Reset'},receipt:partial});
  await rejected;expect(worker.terminate).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});

it('cleans up a throwing callback and refuses mismatched progress source identity',async()=>{
  const pending=checkRGBDSlamBuild(workspace,{base:'/',onProgress:()=>{throw Error('callback failed');}});
  const rejected=expect(pending).rejects.toThrow('callback failed');
  await Promise.resolve();const worker=latest();
  worker.emit({progress:{phase:'loading'},receipt:partial});await rejected;
  expect(worker.terminate).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
  const mismatch=checkRGBDSlamBuild(workspace,{base:'/'});
  const wrongSource=expect(mismatch).rejects.toThrow('source identity differs');
  await Promise.resolve();latest().emit({progress:{phase:'loading'},receipt:{...partial,sourceSha256:'different'}});
  await wrongSource;expect(latest().terminate).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});

it('rejects invalid deadlines and already aborted requests before creating a worker',async()=>{
  for(const timeoutMs of [0,-1,0.5,NaN,Infinity,300001])
    await expect(checkRGBDSlamBuild(workspace,{base:'/',timeoutMs})).rejects.toThrow('timeout');
  await expect(checkRGBDSlamBuild(workspace,{base:'/',signal:AbortSignal.abort()})).rejects.toMatchObject({name:'AbortError'});
  expect(BuildWorker.instances).toHaveLength(0);expect(vi.getTimerCount()).toBe(0);
});
