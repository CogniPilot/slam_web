import {expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {NativeProgram, type NativeProgramArtifact} from '../../src/modelica-native-program';

// These are source-issued Rumoca modules, not host-generated WASM fixtures.
// Their producer, source and module hashes are retained in the execution review.
const directory='dev/artifacts/native-checked-gather/execution';
function fixture(variant:'unconditional'|'guarded') {
  return {
    source:readFileSync(`${directory}/${variant}.mo`,'utf8'),
    artifact:JSON.parse(readFileSync(`${directory}/${variant}-artifact.json`,'utf8')) as NativeProgramArtifact,
  };
}

it.each(['unconditional','guarded'] as const)('loads actual %s model gather and function faults with distinct identities',async variant=>{
  const {artifact,source}=fixture(variant);
  const program=await NativeProgram.instantiate(artifact,source);
  const inputs=new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8);
  const outputs=new Uint8Array(program.memory.buffer,0,artifact.abi.y_count*8);
  program.input('first')[0]=0;
  program.input('k')[0]=1;
  for(const [sample,expected] of [[5,2],[-5,3]]) {
    program.input('samples')[0]=sample;
    const before=inputs.slice();program.evaluate(0);
    expect(program.output('result')[0]).toBe(expected);expect(inputs).toEqual(before);
  }
  for(const index of [0,2,1.5,NaN,Infinity]) {
    program.input('k')[0]=index;program.output('result')[0]=-123;
    const beforeInput=inputs.slice(),beforeOutput=outputs.slice();
    const kind=Number.isInteger(index)?'IndexBounds':'IntegerConversion';
    expect(()=>program.evaluate(0)).toThrow(kind);
    expect(inputs).toEqual(beforeInput);expect(outputs).toEqual(beforeOutput);
  }
  program.input('first')[0]=1;program.input('k')[0]=2;
  if(variant==='guarded') {program.evaluate(0);expect(program.output('result')[0]).toBe(1);}
  else expect(()=>program.evaluate(0)).toThrow('IndexBounds');
  program.input('k')[0]=1;program.evaluate(0);expect(program.output('result')[0]).toBe(1);
});

it('refuses missing, mixed or malformed model and function fault identities',async()=>{
  const {artifact,source}=fixture('unconditional');
  const mutations=[
    (fault:Record<string,unknown>)=>{delete fault.kernel;},
    (fault:Record<string,unknown>)=>{delete fault.program;},
    (fault:Record<string,unknown>)=>{fault.owner=0;},
    (fault:Record<string,unknown>)=>{fault.kernel=-1;},
    (fault:Record<string,unknown>)=>{fault.kernel=artifact.issued_schedule.length;},
    (fault:Record<string,unknown>)=>{fault.operation=null;},
    (fault:Record<string,unknown>)=>{fault.opcode='project_element_dynamic';},
    (fault:Record<string,unknown>)=>{fault.kind='IntegerArithmetic';},
    (fault:Record<string,unknown>)=>{fault.region_path=[[0,-1]];},
  ];
  for(const mutate of mutations) {
    const copy=structuredClone(artifact);
    const fault=copy.faults!.find(f=>f.opcode==='LoadIndexedRegister')!;
    mutate(fault as unknown as Record<string,unknown>);
    await expect(NativeProgram.instantiate(copy,source)).rejects.toThrow('fault provenance');
  }
  for(const mutate of [(fault:Record<string,unknown>)=>{delete fault.owner;},
    (fault:Record<string,unknown>)=>{fault.program=0;fault.kernel=0;}]) {
    const copy=structuredClone(artifact);
    const fault=copy.faults!.find(f=>f.opcode==='convert')!;
    mutate(fault as unknown as Record<string,unknown>);
    await expect(NativeProgram.instantiate(copy,source)).rejects.toThrow('fault provenance');
  }
  for(const field of ['owner','kernel','program']) {
    const copy=structuredClone(artifact);
    Object.assign(copy.faults![0],{[field]:0});
    await expect(NativeProgram.instantiate(copy,source)).rejects.toThrow('fault provenance');
  }
});
