import {expect,it} from 'vitest';
import {NativeProgram,type NativeProgramArtifact} from '../src/modelica-native-program';
import {typedInputTransport as transport,typedInputOnlyTransport} from './helpers/native-typed-input-transport';

it.each([73,74])('uses schema%i typed input storage, preserving full-width integers and readonly inputs',async schema=>{
  const {source,artifact}=await transport();artifact.solve_schema_version=schema;
  const program=await NativeProgram.instantiate(artifact,source);
  const count=program.integerInput('state.count'),sample=program.integerInput('state.samples[1]'),enabled=program.booleanInput('enabled');
  expect(count.byteOffset).toBe(64);expect(sample.byteOffset).toBe(72);expect(enabled.byteOffset).toBe(80);
  expect(program.integerOutput('echo').byteOffset).toBe(88);
  expect(count[0]).toBe(7n);expect(sample[0]).toBe(-2n);expect(enabled[0]).toBe(1);
  for(const value of [9007199254740993n,-9007199254740993n,0x7fffffffffffffffn,-0x8000000000000000n]){
    count[0]=value;sample[0]=value;enabled[0]=Number(value>0n);
    const inputs=new Uint8Array(program.memory.buffer,8,32).slice(),lanes=new Uint8Array(program.memory.buffer,64,24).slice();
    program.evaluate(0.25);
    expect(program.integerOutput('echo')[0]).toBe(value);expect(program.integerOutput('sampleEcho')[0]).toBe(value);
    expect(program.booleanOutput('flag')[0]).toBe(enabled[0]);expect(program.output('result')[0]).toBe(2.75);
    expect(new Uint8Array(program.memory.buffer,8,32)).toEqual(inputs);
    expect(new Uint8Array(program.memory.buffer,64,24)).toEqual(lanes);
  }
  expect(program.integerInput('state.count')).toBe(count);expect(program.booleanInput('enabled')).toBe(enabled);
  expect(()=>program.input('state.count')).toThrow('Unknown');
  expect(()=>program.integerInput('enabled')).toThrow('representation');
  expect(()=>program.booleanInput('state.count')).toThrow('representation');
  expect(()=>program.integerInput('state.samples')).toThrow('Unknown');
  expect(()=>program.integerInput('missing')).toThrow('Unknown');
  artifact.input_lanes![0].byte_offset=8;artifact.parameters[1]=100;
  program.reset();expect(count[0]).toBe(7n);expect(sample[0]).toBe(-2n);expect(enabled[0]).toBe(1);
  expect(program.integerOutput('echo')[0]).toBe(0n);
});

it.each([73,74])('preserves schema%i typed memory through reload and refuses invalid Boolean bytes',async schema=>{
  const {source,artifact}=await transport();artifact.solve_schema_version=schema;
  const program=await NativeProgram.instantiate(artifact,source);
  program.integerInput('state.count')[0]=9007199254740993n;program.booleanInput('enabled')[0]=0;
  program.input('x')[0]=-0.0;program.evaluate(0);
  const snapshot=await program.snapshotMemory();
  const reload=await NativeProgram.instantiate(JSON.parse(JSON.stringify(artifact)),source);
  await reload.restoreMemory(structuredClone(snapshot));
  expect(reload.integerInput('state.count')[0]).toBe(9007199254740993n);
  expect(reload.integerOutput('echo')[0]).toBe(9007199254740993n);
  expect(reload.booleanInput('enabled')[0]).toBe(0);expect(Object.is(reload.input('x')[0],-0.0)).toBe(true);
  reload.booleanInput('enabled')[0]=2;
  const before=new Uint8Array(reload.memory.buffer).slice();
  expect(()=>reload.evaluate(1)).toThrow('InvalidInput');expect(new Uint8Array(reload.memory.buffer)).toEqual(before);
  const pending=reload.restoreMemory(snapshot);
  expect(()=>reload.integerInput('state.count')).toThrow('restore');
  expect(()=>reload.booleanInput('enabled')).toThrow('restore');
  await pending;reload.evaluate(1);expect(reload.output('result')[0]).toBe(1);
});

it('rejects ambiguous, overlapping, unaligned and inexact typed input contracts before execution',async()=>{
  const {source,artifact}=await transport();
  const changes:Array<(a:NativeProgramArtifact)=>void>=[
    a=>{a.solve_schema_version=72;},a=>{a.solve_schema_version=75;},a=>{a.input_lanes={} as never;},
    a=>{delete a.input_lanes;},a=>{delete a.abi.input_lanes_offset;},a=>{delete a.abi.input_lanes_bytes;},
    a=>{delete a.abi.typed_lanes_offset;},a=>{a.abi.input_lanes_offset=40;},a=>{a.abi.typed_lanes_offset=72;},
    a=>{a.abi.input_lanes_bytes=16;},a=>{a.abi.input_lanes_bytes=65536;},a=>{a.abi.input_lanes_offset=65;a.abi.typed_lanes_offset=65;},
    a=>{a.abi.output_lanes_offset=72;},a=>{a.abi.output_lanes_offset=81;},a=>{a.abi.arguments[4]='outputLanesPtr:i32';},
    a=>{a.input_lanes![0].byte_offset=1;},a=>{a.input_lanes![1].byte_offset=0;},a=>{a.input_lanes![0].p_index=4;},
    a=>{a.input_lanes![1].p_index=1;},a=>{a.input_lanes![0].name='enabled';},a=>{a.input_lanes![0].name='unknown';},
    a=>{a.input_lanes![0].representation='f64' as never;},a=>{a.derived_outputs![0].name='state.count';},
    a=>{a.parameters[1]=9007199254740992;},a=>{a.parameters[1]=1.5;},a=>{a.parameters[2]=2;},
    a=>{a.var_layout.bindings['state.count']={P:{index:1,byte_offset:8}};},
    a=>{a.var_layout.bindings.alias={P:{index:1,byte_offset:8}};},
    a=>{a.var_layout.shapes.x=[2];},
    a=>{a.input_names.push('unknown');},a=>{a.input_lanes!.push({...a.input_lanes![0]});},
  ];
  for(const change of changes){const copy=structuredClone(artifact);change(copy);await expect(NativeProgram.instantiate(copy,source)).rejects.toThrow();}
});

it('supports a typed input region without derived outputs and propagates a checked Real-view refusal',async()=>{
  const {source,artifact}=await typedInputOnlyTransport(),program=await NativeProgram.instantiate(artifact,source);
  expect(program.integerInput('state.count')[0]).toBe(7n);program.evaluate(0);
  expect(program.output('result')[0]).toBe(9.5);
  expect(()=>program.integerOutput('echo')).toThrow('Unknown');
  program.integerInput('state.count')[0]=9007199254740993n;
  const before=new Uint8Array(program.memory.buffer).slice();
  expect(()=>program.evaluate(0)).toThrow('InvalidInput');expect(new Uint8Array(program.memory.buffer)).toEqual(before);
  program.integerInput('state.count')[0]=-7n;program.evaluate(0);expect(program.output('result')[0]).toBe(-4.5);
});
