import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {NativeProgram,type NativeProgramArtifact} from '../../src/modelica-native-program';

// Actual retained compiler-issued modules. This checks SAME-ARTIFACT memory
// transport only, not session time/counters, record transfer or complete SLAM.
function edge(){
  const root='dev/artifacts/pr382-4b42587c-typed-program-admission';
  return {source:readFileSync(`${root}/Edge.mo`,'utf8'),
    artifact:JSON.parse(readFileSync(`${root}/final-artifact.json`,'utf8')) as NativeProgramArtifact};
}
function memory(program:NativeProgram){return new Uint8Array(program.memory.buffer);}
function expectBytes(actual:Uint8Array,expected:Uint8Array){
  expect(actual.length).toBe(expected.length);
  // Examine every byte while keeping a mismatch report bounded for full pages.
  const firstMismatch=actual.findIndex((byte,index)=>byte!==expected[index]);
  expect(firstMismatch,firstMismatch<0?'identical bytes':
    `byte ${firstMismatch}: actual ${actual[firstMismatch]}, expected ${expected[firstMismatch]}`).toBe(-1);
}
async function instance(){const {source,artifact}=edge();return {source,artifact,program:await NativeProgram.instantiate(artifact,source)};}

it('restores actual exact Integer/Boolean lanes and all signed-zero, NaN-payload and padding bits',async()=>{
  const {program,artifact}=await instance();
  program.input('x')[0]=11;program.evaluate(0);
  expect(program.integerOutput('reason')[0]).toBe(9007199254740993n);
  expect(program.booleanOutput('valid')[0]).toBe(0);
  const raw=new DataView(program.memory.buffer);
  // Deliberately opaque raw transport bytes; no numerical acceptance of NaNs
  // or malformed Boolean values is claimed by checkpointing their bit pattern.
  raw.setBigUint64(0,0x8000000000000000n,true);
  raw.setBigUint64(8,0x7ff8000000001234n,true);
  raw.setBigUint64(artifact.abi.scratch_offset!,0xfff800000000cafen,true);
  memory(program).set([0x5a,0xa5,0,0xff,0x7f],memory(program).length-5);
  const expected=memory(program).slice(),snapshot=await program.snapshotMemory();
  memory(program).fill(0xcc);await program.restoreMemory(structuredClone(snapshot));
  expectBytes(memory(program),expected);
  expect(Object.is(program.output('y')[0],-0)).toBe(true);
  expect(Number.isNaN(program.output('gated')[0])).toBe(true);
  expect(raw.getBigUint64(8,true)).toBe(0x7ff8000000001234n);
  expect(program.integerOutput('reason')[0]).toBe(9007199254740993n);
  expect(program.booleanOutput('valid')[0]).toBe(0);
});

it('captures bytes and private artifact identity before its asynchronous digest completes',async()=>{
  const {program,artifact}=await instance();program.input('x')[0]=-2;program.evaluate(0);
  const expected=memory(program).slice(),pending=program.snapshotMemory();
  memory(program).fill(0x55);artifact.parameters.fill(123);artifact.source_sha256='0'.repeat(64);
  const snapshot=await pending;
  expectBytes(snapshot.bytes,expected);
  await program.restoreMemory(snapshot);expectBytes(memory(program),expected);
  snapshot.bytes.fill(0x99);expectBytes(memory(program),expected);
});

it('owns caller bytes and digest identity before asynchronous restore validation',async()=>{
  const {program}=await instance();program.input('x')[0]=12;program.evaluate(0);
  const snapshot=await program.snapshotMemory(),expected=snapshot.bytes.slice();
  memory(program).fill(0x31);
  const pending=program.restoreMemory(snapshot);
  snapshot.bytes.fill(0x57);snapshot.layoutSha256='0'.repeat(64);snapshot.bytesSha256='f'.repeat(64);
  snapshot.sourceSha256='e'.repeat(64);snapshot.moduleSha256='d'.repeat(64);
  await pending;expectBytes(memory(program),expected);
});

it('owns a Uint8Array-compatible Buffer before await rather than retaining its aliasing slice',async()=>{
  const {program}=await instance();program.input('x')[0]=11;program.evaluate(0);
  const snapshot=await program.snapshotMemory(),expected=snapshot.bytes.slice();
  const submitted={...snapshot,bytes:Buffer.from(snapshot.bytes)};
  memory(program).fill(0x31);
  const pending=program.restoreMemory(submitted);
  submitted.bytes.fill(0x57);
  await pending;expectBytes(memory(program),expected);
});

it('restores a nonzero-offset owned view without copying unrelated surrounding bytes',async()=>{
  const {program}=await instance();program.input('x')[0]=4;program.evaluate(0);
  const snapshot=await program.snapshotMemory(),storage=new Uint8Array(snapshot.bytes.length+32).fill(0xa5);
  const view=storage.subarray(13,13+snapshot.bytes.length);view.set(snapshot.bytes);
  memory(program).fill(0);await program.restoreMemory({...snapshot,bytes:view});
  expectBytes(memory(program),snapshot.bytes);
  expect(storage.subarray(0,13)).toEqual(new Uint8Array(13).fill(0xa5));
  expect(storage.subarray(13+snapshot.bytes.length)).toEqual(new Uint8Array(19).fill(0xa5));
});

it('serializes restore against overlapping mutation APIs while preserving output reads',async()=>{
  const {program}=await instance();program.input('x')[0]=11;program.evaluate(0);
  const snapshot=await program.snapshotMemory();
  program.input('x')[0]=-2;program.evaluate(1/90);
  const before=memory(program).slice(),pending=program.restoreMemory(snapshot);
  expect(()=>program.evaluate(2/90)).toThrow();
  expect(()=>program.reset()).toThrow();
  expect(()=>program.input('x')).toThrow();
  // Reads remain available; they must expose the pre-commit state.
  expect(program.output('y')[0]).toBe(-4);
  expect(program.integerOutput('reason')[0]).toBe(2n);
  expect(program.booleanOutput('valid')[0]).toBe(0);
  const second=expect(program.restoreMemory(snapshot)).rejects.toThrow();
  const concurrentSnapshot=expect(program.snapshotMemory()).rejects.toThrow();
  expectBytes(memory(program),before);
  await Promise.all([second,concurrentSnapshot,pending]);
  expectBytes(memory(program),snapshot.bytes);
  // Every mutation API is usable again after the restore commits.
  program.reset();program.input('x')[0]=3;program.evaluate(3/90);
  expect(program.output('y')[0]).toBe(6);
  await program.snapshotMemory();
});

it('releases restore exclusion after asynchronous digest failure and immediate identity refusal',async()=>{
  const {program}=await instance();program.input('x')[0]=11;program.evaluate(0);
  const good=await program.snapshotMemory(),bad=structuredClone(good);bad.bytes[0]^=1;
  const before=memory(program).slice(),pending=program.restoreMemory(bad);
  expect(()=>program.reset()).toThrow();
  expect(()=>program.evaluate(1/90)).toThrow();
  await expect(pending).rejects.toThrow('digest');
  expectBytes(memory(program),before);
  program.input('x')[0]=2;program.evaluate(2/90);expect(program.output('y')[0]).toBe(4);
  await program.snapshotMemory();
  await expect(program.restoreMemory({...good,sourceSha256:'0'.repeat(64)})).rejects.toThrow('identity');
  program.reset();program.input('x')[0]=4;program.evaluate(3/90);expect(program.output('y')[0]).toBe(8);
  await program.restoreMemory(good);expectBytes(memory(program),good.bytes);
});

it.each(['format','version','sourceSha256','moduleSha256','layoutSha256','bytesSha256'] as const)
('refuses changed checkpoint %s without changing any target memory',async field=>{
  const {program}=await instance();program.input('x')[0]=11;program.evaluate(0);
  const snapshot=await program.snapshotMemory(),copy=structuredClone(snapshot);
  if(field==='format')Object.assign(copy,{format:'other'});
  else if(field==='version')Object.assign(copy,{version:2});
  else copy[field]='0'.repeat(64);
  memory(program).fill(0x93);const before=memory(program).slice();
  await expect(program.restoreMemory(copy)).rejects.toThrow('checkpoint');
  expectBytes(memory(program),before);
});

it.each(['damaged','truncated','oversized','wrong-type','shared-buffer'] as const)
('refuses %s checkpoint bytes without a partial write',async mutation=>{
  const {program}=await instance();program.input('x')[0]=11;program.evaluate(0);
  const copy=structuredClone(await program.snapshotMemory());
  if(mutation==='damaged')copy.bytes[copy.bytes.length-1]^=1;
  else if(mutation==='truncated')copy.bytes=copy.bytes.subarray(0,copy.bytes.length-1);
  else if(mutation==='oversized')copy.bytes=new Uint8Array(copy.bytes.length+1);
  else if(mutation==='wrong-type')Object.assign(copy,{bytes:Array.from(copy.bytes)});
  else Object.assign(copy,{bytes:new Uint8Array(new SharedArrayBuffer(copy.bytes.length))});
  memory(program).fill(0x93);const before=memory(program).slice();
  await expect(program.restoreMemory(copy)).rejects.toThrow('checkpoint');expectBytes(memory(program),before);
});

it.each(['layout','default'] as const)('refuses same-source/module metadata with a changed %s identity',async variant=>{
  const {program,source,artifact}=await instance();program.input('x')[0]=11;program.evaluate(0);
  const snapshot=await program.snapshotMemory(),modified=structuredClone(artifact);
  // Deliberate negative metadata mutations, never represented as newly issued
  // compiler artifacts. Both remain structurally loadable to exercise identity.
  if(variant==='default')modified.parameters[0]=7;
  else modified.var_layout.shapes.x=[1];
  const target=await NativeProgram.instantiate(modified,source);const before=memory(target).slice();
  await expect(target.restoreMemory(snapshot)).rejects.toThrow('layout or digest');
  expectBytes(memory(target),before);
});

it('reloads a fresh same-artifact instance and continues actual moving-input evaluation',async()=>{
  const {program,artifact,source}=await instance();program.input('x')[0]=11;program.evaluate(0);
  const snapshot=structuredClone(await program.snapshotMemory());
  const loaded=await NativeProgram.instantiate(JSON.parse(JSON.stringify(artifact)),source);
  expect(loaded.integerOutput('reason')[0]).toBe(0n);
  await loaded.restoreMemory(snapshot);expectBytes(memory(loaded),memory(program));
  expect(loaded.integerOutput('reason')[0]).toBe(9007199254740993n);
  for(const [step,x] of [-2,-0,0,0.25,10,11,3,-7,12,1].entries()){
    program.input('x')[0]=x;loaded.input('x')[0]=x;
    program.evaluate(step/90);loaded.evaluate(step/90);
    expectBytes(memory(loaded),memory(program));
    expect(Object.is(loaded.output('y')[0],2*x)).toBe(true);
    expect(loaded.booleanOutput('valid')[0]).toBe(x>=0&&x<=10?1:0);
    expect(loaded.integerOutput('reason')[0]).toBe(x>10?9007199254740993n:x<0?2n:0n);
    expect(Object.is(loaded.output('gated')[0],x>=0&&x<=10?2*x:-1)).toBe(true);
  }
});

it('restores the full valid checkpoint after an actual checked-gather fault and recovers',async()=>{
  const root='dev/artifacts/native-checked-gather/execution';
  const source=readFileSync(`${root}/unconditional.mo`,'utf8');
  const artifact=JSON.parse(readFileSync(`${root}/unconditional-artifact.json`,'utf8')) as NativeProgramArtifact;
  const program=await NativeProgram.instantiate(artifact,source);
  program.input('first')[0]=0;program.input('samples')[0]=5;program.input('k')[0]=1;program.evaluate(0);
  const valid=await program.snapshotMemory();program.input('k')[0]=2;
  const pBefore=new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8).slice();
  const yBefore=memory(program).slice(0,artifact.abi.y_count*8);
  expect(()=>program.evaluate(1/90)).toThrow('IndexBounds');
  expect(new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8)).toEqual(pBefore);
  expect(memory(program).subarray(0,artifact.abi.y_count*8)).toEqual(yBefore);
  await program.restoreMemory(valid);expectBytes(memory(program),valid.bytes);
  program.input('samples')[0]=-5;program.evaluate(2/90);expect(program.output('result')[0]).toBe(3);
});
