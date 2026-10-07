import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {NativeProgram,type NativeProgramArtifact} from '../../src/modelica-native-program';

// Opt-in receipt from the actual published compiler in a browser worker.
// This is not a handcrafted transport fixture or an application SLAM gate.
const artifactPath=process.env.RUMOCA_TYPED_PROGRAM_ARTIFACT;
const sourcePath=process.env.RUMOCA_TYPED_PROGRAM_SOURCE;
it.skipIf(!artifactPath||!sourcePath)('reads actual compiler-issued Integer and Boolean lanes exactly across moving inputs',async()=>{
 const source=readFileSync(sourcePath!,'utf8');
 const artifact=JSON.parse(readFileSync(artifactPath!,'utf8')) as NativeProgramArtifact;
 const program=await NativeProgram.instantiate(artifact,source);
 const reason=program.integerOutput('reason'),valid=program.booleanOutput('valid');
 expect(reason).toBeInstanceOf(BigInt64Array);expect(valid).toBeInstanceOf(Uint8Array);
 const memory=program.memory.buffer;
 for(const [x,accepted,code] of [[1,1,0n],[20,0,9007199254740993n],[-3,0,2n],[4,1,0n]] as const){
  program.input('x')[0]=x;
  const inputBytes=new Uint8Array(memory,artifact.abi.p_offset,artifact.abi.p_count*8),before=inputBytes.slice();
  program.evaluate(0);
  expect(reason[0]).toBe(code);expect(valid[0]).toBe(accepted);
  expect(program.output('y')[0]).toBe(2*x);expect(program.output('gated')[0]).toBe(accepted?2*x:-1);
  expect(inputBytes).toEqual(before);expect(program.memory.buffer).toBe(memory);
 }
 expect(()=>program.output('reason')).toThrow('Unknown Modelica output');
 expect(()=>program.integerOutput('valid')).toThrow('representation');
 expect(()=>program.booleanOutput('reason')).toThrow('representation');
 expect(()=>program.realDerivedOutput('reason')).toThrow('representation');
 const changed=source+'\n// source edit';
 await expect(NativeProgram.instantiate(artifact,changed)).rejects.toThrow('source');
 program.reset();expect(reason[0]).toBe(0n);expect(valid[0]).toBe(0);
 program.evaluate(0);expect(reason[0]).toBe(0n);expect(valid[0]).toBe(1);
});

// Handcrafted transport-only fixture. Its tiny WASM stores constants; it is
// never represented as a compiler-issued algorithm or production acceptance.
import wabtFactory from 'wabt';
import {sourceDigest,bytesDigest} from '../../src/source-digest';
async function transport(){
 const source='handcrafted typed transport fixture';
 const wabt=await wabtFactory();
 const parsed=wabt.parseWat('transport.wat',`(module
 (import "env" "memory" (memory 1 1))
 (func (export "eval_assignments") (param i32 i32 f64 i32 i32) (result i32)
 local.get 0 f64.const 7 f64.store
 local.get 4 i64.const 9007199254740993 i64.store
 local.get 4 i32.const 8 i32.add f64.const 2.5 f64.store
 local.get 4 i32.const 16 i32.add i32.const 1 i32.store8
 i32.const 0))`);
 const bytes=new Uint8Array(parsed.toBinary({}).buffer);parsed.destroy();
 const artifact:NativeProgramArtifact={profile:'native-direct-program-f64-v3',model_name:'Transport',
  compiler:{version:'handcrafted',git_commit:'transport-only'},solve_schema_version:72,
  source_sha256:await sourceDigest(source),module_sha256:await bytesDigest(bytes),module_bytes:Array.from(bytes),
  abi:{export:'eval_assignments',arguments:['yPtr:i32','pPtr:i32','time:f64','scratchPtr:i32','outputLanesPtr:i32'],
   memory_import:'env.memory',memory_shared:false,memory_pages:1,y_offset:0,p_offset:8,y_count:1,p_count:1,
   reserved_pointer_value:0,result:'status:i32',success_status:0,scratch_offset:16,scratch_bytes:32,
   transactional_y:true,p_readonly:true,output_lanes_offset:48,output_lanes_bytes:17},
  var_layout:{y_scalars:1,p_scalars:1,bindings:{result:{Y:{index:0,byte_offset:0}},x:{P:{index:0,byte_offset:0}}},shapes:{}},
  input_names:['x'],parameters:[3],math_imports:[],faults:[{status:1,kind:'InvalidBuffer'},{status:2,kind:'InvalidInput'}],
  derived_outputs:[{name:'code',representation:'i64',byte_offset:0},{name:'real',representation:'f64',byte_offset:8},{name:'flag',representation:'u8',byte_offset:16}],
  issued_schedule:[{source:{continuous_node:0},target_start:0,target_count:1,target_stride:1,target_block_width:1},
   ...[0,1,2].map(row=>({source:{discrete_row:row},target_start:row+1,target_count:1,target_stride:1,target_block_width:1}))]};
 return {source,artifact};
}
it('reads handcrafted transport lanes at compiler-schema offsets with cached exact views',async()=>{
 const {source,artifact}=await transport(),program=await NativeProgram.instantiate(artifact,source);
 const integer=program.integerOutput('code'),boolean=program.booleanOutput('flag'),real=program.realDerivedOutput('real');
 expect(integer.byteOffset).toBe(48);expect(real.byteOffset).toBe(56);expect(boolean.byteOffset).toBe(64);
 program.evaluate(0);expect(integer[0]).toBe(9007199254740993n);expect(real[0]).toBe(2.5);expect(boolean[0]).toBe(1);
 expect(program.output('result')[0]).toBe(7);expect(program.input('x')[0]).toBe(3);
 expect(program.integerOutput('code')).toBe(integer);expect(program.booleanOutput('flag')).toBe(boolean);
 artifact.derived_outputs![0].byte_offset=8;program.evaluate(1);expect(integer[0]).toBe(9007199254740993n);
 expect(()=>program.integerOutput('missing')).toThrow('Unknown');
 program.reset();expect(integer[0]).toBe(0n);expect(real[0]).toBe(0);expect(boolean[0]).toBe(0);
});
it('rejects malformed handcrafted typed lane inventories and provenance before execution',async()=>{
 const {source,artifact}=await transport();
 const mutations:Array<(a:NativeProgramArtifact)=>void>=[
  a=>{a.abi.output_lanes_offset=40;},a=>{a.abi.output_lanes_offset=49;},
  a=>{a.abi.output_lanes_bytes=16;},a=>{a.abi.output_lanes_bytes=65536;},
  a=>{delete a.abi.output_lanes_offset;},a=>{delete a.derived_outputs;},
  a=>{a.derived_outputs![0].byte_offset=1;},a=>{a.derived_outputs![1].byte_offset=0;},
  a=>{a.derived_outputs![0].name='flag';},a=>{a.derived_outputs![0].name='x';},
  a=>{a.derived_outputs![0].representation='float' as 'i64';},
  a=>{a.issued_schedule[1].source={continuous_node:1};},
  a=>{a.issued_schedule[0].source={continuous_node:0,discrete_row:0} as never;},
  a=>{a.issued_schedule[1].target_start=0;},a=>{a.abi.arguments[4]='reservedZero:i32';},
 ];
 for(const mutate of mutations){const copy=structuredClone(artifact);mutate(copy);await expect(NativeProgram.instantiate(copy,source)).rejects.toThrow();}
});
