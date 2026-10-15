import {afterEach,expect,it,vi} from 'vitest';
import {captureNativeState} from '../scripts/native-state-profile.mjs';
afterEach(()=>vi.unstubAllGlobals());

it('hashes every state lane independent of addresses and ignores unrelated memory',async()=>{
  const memory=new WebAssembly.Memory({initial:1});vi.stubGlobal('__nativeStateMemory',memory);
  const view=new DataView(memory.buffer);
  view.setFloat64(16,1.25,true);view.setFloat64(24,2.5,true);view.setBigInt64(32,-2n,true);view.setUint8(48,1);
  const layout={state:{count:4,previous_hash:'names',next_hash:'names'},state_runs:[
    {name:'position',lane:'f64' as const,count:2,previous:16,next:16},
    {name:'epoch',lane:'i64' as const,count:1,previous:32,next:32},
    {name:'enabled',lane:'u8' as const,count:1,previous:48,next:48},
  ]};
  const original=await captureNativeState(layout);
  expect(original).toMatchObject({cells:4,runs:3,bytes:25});
  view.setFloat64(200,99,true);
  expect((await captureNativeState(layout)).sha256).toBe(original.sha256);
  const shifted={...layout,state_runs:layout.state_runs.map(run=>({...run,next:run.next+256})).reverse()};
  const bytes=new Uint8Array(memory.buffer);bytes.set(bytes.slice(16,49),272);
  expect((await captureNativeState(shifted)).sha256).toBe(original.sha256);
  view.setBigInt64(288,-3n,true);
  expect((await captureNativeState(shifted)).sha256).not.toBe(original.sha256);
  await expect(captureNativeState({...layout,state:{...layout.state,count:5}})).rejects.toThrow('every native state cell');
});
