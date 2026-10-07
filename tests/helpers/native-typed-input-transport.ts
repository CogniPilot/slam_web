import wabtFactory from 'wabt';
import type {NativeProgramArtifact} from '../../src/modelica-native-program';
import {sourceDigest,bytesDigest} from '../../src/source-digest';

// Handcrafted byte-transport fixture only. This module copies scalars and
// checks a Boolean byte; it is not a compiler-issued algorithm/SLAM proof.
export async function typedInputTransport(){
  const source='handcrafted mixed input transport, not Modelica compilation';
  const wabt=await wabtFactory();
  const parsed=wabt.parseWat('typed-input-transport.wat',`(module
    (import "env" "memory" (memory 1 1))
    (func (export "eval_assignments") (param i32 i32 f64 i32 i32) (result i32)
      local.get 4 i32.const 16 i32.add i32.load8_u i32.const 1 i32.gt_u
      if i32.const 2 return end
      local.get 0 local.get 1 f64.load local.get 2 f64.add f64.store
      local.get 4 i32.const 24 i32.add local.get 4 i64.load i64.store
      local.get 4 i32.const 32 i32.add local.get 4 i32.const 16 i32.add i32.load8_u i32.store8
      local.get 4 i32.const 40 i32.add local.get 4 i32.const 8 i32.add i64.load i64.store
      i32.const 0))`);
  const bytes=new Uint8Array(parsed.toBinary({}).buffer);parsed.destroy();
  const artifact:NativeProgramArtifact={profile:'native-direct-program-f64-v3',model_name:'Transport',
    compiler:{version:'handcrafted',git_commit:'transport-only'},solve_schema_version:73,
    source_sha256:await sourceDigest(source),module_sha256:await bytesDigest(bytes),module_bytes:Array.from(bytes),
    abi:{export:'eval_assignments',arguments:['yPtr:i32','pPtr:i32','time:f64','scratchPtr:i32','typedLanesPtr:i32'],
      memory_import:'env.memory',memory_shared:false,memory_pages:1,y_offset:0,p_offset:8,y_count:1,p_count:4,
      reserved_pointer_value:0,result:'status:i32',success_status:0,scratch_offset:40,scratch_bytes:24,
      transactional_y:true,p_readonly:true,typed_lanes_offset:64,input_lanes_offset:64,input_lanes_bytes:24,
      output_lanes_offset:88,output_lanes_bytes:24},
    var_layout:{y_scalars:1,p_scalars:4,bindings:{result:{Y:{index:0,byte_offset:0}},x:{P:{index:0,byte_offset:0}}},shapes:{}},
    input_names:['x','state.count','enabled','state.samples[1]'],parameters:[2.5,7,1,-2],math_imports:[],
    faults:[{status:1,kind:'InvalidBuffer'},{status:2,kind:'InvalidInput'}],
    input_lanes:[{name:'state.count',representation:'i64',byte_offset:0,p_index:1},
      {name:'state.samples[1]',representation:'i64',byte_offset:8,p_index:3},
      {name:'enabled',representation:'u8',byte_offset:16,p_index:2}],
    derived_outputs:[{name:'echo',representation:'i64',byte_offset:0},{name:'flag',representation:'u8',byte_offset:8},
      {name:'sampleEcho',representation:'i64',byte_offset:16}],
    issued_schedule:[{source:{continuous_node:0},target_start:0,target_count:1,target_stride:1,target_block_width:1},
      ...[0,1,2].map(row=>({source:{discrete_row:row},target_start:row+1,target_count:1,target_stride:1,target_block_width:1}))]};
  return {source,artifact};
}

// Input-only typed region: the checked Real-view case has ordinary Y output
// and no derived output buffer. This remains handcrafted transport evidence.
export async function typedInputOnlyTransport(){
  const {artifact}=await typedInputTransport();
  const source='handcrafted typed input without derived lanes';
  const wabt=await wabtFactory();
  const parsed=wabt.parseWat('typed-input-only.wat',`(module
    (import "env" "memory" (memory 1 1))
    (func (export "eval_assignments") (param i32 i32 f64 i32 i32) (result i32)
      local.get 4 i64.load i64.const 9007199254740992 i64.gt_s
      local.get 4 i64.load i64.const -9007199254740992 i64.lt_s i32.or
      if i32.const 2 return end
      local.get 0 local.get 1 f64.load local.get 4 i64.load f64.convert_i64_s f64.add f64.store
      i32.const 0))`);
  const bytes=new Uint8Array(parsed.toBinary({}).buffer);parsed.destroy();
  artifact.source_sha256=await sourceDigest(source);artifact.module_sha256=await bytesDigest(bytes);artifact.module_bytes=Array.from(bytes);
  artifact.input_names=['x','state.count'];artifact.input_lanes=artifact.input_lanes!.slice(0,1);artifact.abi.input_lanes_bytes=8;
  artifact.derived_outputs=[];delete artifact.abi.output_lanes_offset;delete artifact.abi.output_lanes_bytes;
  artifact.issued_schedule=artifact.issued_schedule.slice(0,1);
  return {source,artifact};
}
