import {sourceDigest,bytesDigest} from './source-digest';
import type {NativeAssignmentsArtifact} from './modelica-native-artifact';

/** One compiler-issued executable. The schedule is provenance metadata;
 * the module owns its ordering and writes declared Y and typed output storage. */
export interface NativeProgramArtifact extends Omit<NativeAssignmentsArtifact,'profile'|'abi'|'stages'> {
  profile:'native-direct-program-f64-v1'|'native-direct-program-f64-v2'|'native-direct-program-f64-v3';
  module_bytes:number[];
  module_sha256:string;
  issued_schedule:{source_node?:number;source?:{continuous_node:number;discrete_row?:never}|{discrete_row:number;continuous_node?:never};target_start:number;target_count:number;target_stride?:number;target_block_width?:number}[];
  derived_outputs?:{name:string;representation:'i64'|'u8'|'f64';byte_offset:number}[];
  input_lanes?:{name:string;representation:'i64'|'u8';byte_offset:number;p_index:number}[];
  abi:{export:'eval_assignments';arguments:string[];memory_import:'env.memory';memory_shared:false;
    memory_pages:number;y_offset:0;p_offset:number;y_count:number;p_count:number;reserved_pointer_value:0;
    result?:'status:i32';success_status?:0;scratch_offset?:number;scratch_bytes?:number;
    transactional_y?:true;p_readonly?:true;output_lanes_offset?:number;output_lanes_bytes?:number;
    typed_lanes_offset?:number;input_lanes_offset?:number;input_lanes_bytes?:number};
  math_imports?:string[];
  faults?:NativeProgramFault[];
}
/** Same-artifact memory checkpoint, suitable for structured clone/IndexedDB.
 * Session time, counters and next-to-previous record transfer belong to the
 * session owner. This is not an interchange format between different models. */
export interface NativeProgramMemorySnapshot {
  format:'rumoca-native-memory';version:1;
  sourceSha256:string;moduleSha256:string;layoutSha256:string;bytesSha256:string;
  bytes:Uint8Array<ArrayBuffer>;
}
interface NativeProgramFaultSite {
  operation:number|null;region_path:number[][];opcode:string;
  provenance:{source:string;start:number;end:number};
}
type NativeProgramFaultKind='InvalidBuffer'|'InvalidInput'|'IntegerArithmetic'|'IntegerConversion'|'IndexBounds';
export type NativeProgramFault =
  | {status:1|2;kind:'InvalidBuffer'|'InvalidInput';owner?:never;kernel?:never;program?:never;
      operation?:never;region_path?:never;opcode?:never;provenance?:never}
  | NativeProgramFaultSite & {status:number;kind:NativeProgramFaultKind;owner:number;kernel?:never;program?:never}
  | NativeProgramFaultSite & {status:number;kind:'IntegerConversion'|'IndexBounds';owner?:never;
      kernel:number;program:number;operation:number;opcode:'LoadIndexedRegister'};
const argumentTypes=['yPtr:i32','pPtr:i32','time:f64','reservedSeedPtr:i32','reservedOutputPtr:i32'];
const typedArgumentTypes=['yPtr:i32','pPtr:i32','time:f64','scratchPtr:i32','reservedZero:i32'];
const integer=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>=0;
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
// The reviewed compiler emits env.abs for its canonical unary Abs operation.
// These are scalar target intrinsics; the issued module retains the algorithm.
const mathImports=['abs','sin','cos','tan','asin','acos','atan','atan2','sinh','cosh','tanh','asinh','acosh','atanh','exp','log','log2','log10','pow'];

function validFaultIdentity(fault:NativeProgramFault,kernelCount:number){
  // Function and model gather identities come from separate compiler owners.
  // A gather has no FunctionDefId; require its checked kernel/program location.
  if(Object.hasOwn(fault,'owner'))return integer(fault.owner)
    &&!Object.hasOwn(fault,'kernel')&&!Object.hasOwn(fault,'program')
    &&(fault.operation===null||integer(fault.operation));
  return integer(fault.kernel)&&fault.kernel<kernelCount&&integer(fault.program)&&integer(fault.operation)
    &&fault.opcode==='LoadIndexedRegister'
    &&(fault.kind==='IntegerConversion'||fault.kind==='IndexBounds');
}

function validate(value:NativeProgramArtifact){
  // This field records the producer's Solve schema; this loader consumes the
  // executable ABI and never decodes Solve IR. Schemas72/73 have the reviewed v3
  // ABI. Older v1/v2 artifacts remain restricted to the reviewed schema70.
  const reviewedSchema=value?.solve_schema_version===70
    ||[72,73].includes(value?.solve_schema_version)&&value?.profile==='native-direct-program-f64-v3';
  if(!value||!['native-direct-program-f64-v1','native-direct-program-f64-v2','native-direct-program-f64-v3'].includes(value.profile)||!reviewedSchema
    ||typeof value.model_name!=='string'||!value.model_name||!digest(value.source_sha256)
    ||!digest(value.module_sha256)||typeof value.compiler?.version!=='string'||!value.compiler.version
    ||typeof value.compiler?.git_commit!=='string'||!value.compiler.git_commit)
    throw new Error('Unsupported native Modelica program');
  const a=value.abi;
  const typed=value.profile==='native-direct-program-f64-v3';
  const derived=value.derived_outputs??[];
  if(!Array.isArray(derived)||derived.length>262144)throw new Error('Invalid native Modelica derived output inventory');
  const inputs=value.input_lanes??[];
  if(!Array.isArray(inputs)||inputs.length>262144)throw new Error('Invalid native Modelica typed input inventory');
  const hasInputs=inputs.length>0;
  const hasLanes=derived.length>0;
  const expectedArguments=typed?[...typedArgumentTypes]:argumentTypes;
  if(typed&&(hasInputs||hasLanes))expectedArguments[4]=hasInputs?'typedLanesPtr:i32':'outputLanesPtr:i32';
  if(!a||a.export!=='eval_assignments'||a.memory_import!=='env.memory'||a.memory_shared!==false
    ||JSON.stringify(a.arguments)!==JSON.stringify(expectedArguments)||a.reserved_pointer_value!==0
    ||![a.memory_pages,a.y_offset,a.p_offset,a.y_count,a.p_count].every(integer)
    ||a.memory_pages<1||a.memory_pages>1024||(!a.y_count&&!hasLanes)||a.y_offset!==0||a.p_offset!==a.y_count*8
    ||(a.y_count+a.p_count)*8>a.memory_pages*65536)
    throw new Error('Invalid native Modelica program ABI');
  if(typed){
    if(a.result!=='status:i32'||a.success_status!==0||a.transactional_y!==true||a.p_readonly!==true
      ||!integer(a.scratch_offset)||!integer(a.scratch_bytes)||!a.scratch_bytes
      ||a.scratch_offset%8!==0||(value.solve_schema_version!==73&&a.scratch_bytes%8!==0)
      ||a.scratch_offset<a.p_offset+a.p_count*8||a.scratch_offset+a.scratch_bytes>a.memory_pages*65536)
      throw new Error('Invalid native Modelica transactional scratch ABI');
    if(!Array.isArray(value.math_imports)||value.math_imports.some(name=>!mathImports.includes(name))
      ||new Set(value.math_imports).size!==value.math_imports.length)
      throw new Error('Invalid native Modelica declared math imports');
    const faults=value.faults;
    if(!Array.isArray(faults)||faults.length<2||faults.length>262144||faults[0]?.status!==1||faults[0]?.kind!=='InvalidBuffer'
      ||faults[1]?.status!==2||faults[1]?.kind!=='InvalidInput')throw new Error('Invalid native Modelica fault inventory');
    const statuses=new Set<number>();
    for(const fault of faults){
      if(!fault||!integer(fault.status)||fault.status<1||fault.status>0x7fffffff||statuses.has(fault.status)
        ||!['InvalidBuffer','InvalidInput','IntegerArithmetic','IntegerConversion','IndexBounds'].includes(fault.kind))
        throw new Error('Invalid native Modelica fault inventory');
      statuses.add(fault.status);
      if(fault.status<=2&&['owner','kernel','program','operation','region_path','opcode','provenance'].some(key=>Object.hasOwn(fault,key)))
        throw new Error('Invalid native Modelica fault provenance');
      if(fault.status>2&&(!validFaultIdentity(fault,Array.isArray(value.issued_schedule)?value.issued_schedule.length:0)
        ||!Array.isArray(fault.region_path)||fault.region_path.some(pair=>!Array.isArray(pair)||pair.length!==2||pair.some(v=>!integer(v)))
        ||typeof fault.opcode!=='string'||!fault.opcode||!fault.provenance
        ||typeof fault.provenance.source!=='string'||!/^(0|[1-9]\d{0,19})$/.test(fault.provenance.source)
        ||BigInt(fault.provenance.source)>0xffffffffffffffffn
        ||!integer(fault.provenance.start)||!integer(fault.provenance.end)||fault.provenance.end<fault.provenance.start))
        throw new Error('Invalid native Modelica fault provenance');
    }
  }else if(['result','success_status','scratch_offset','scratch_bytes','transactional_y','p_readonly'].some(key=>Object.hasOwn(a,key))){
    throw new Error('Unexpected native Modelica typed-call ABI');
  }
  if(hasInputs){
    if(!typed||value.solve_schema_version!==73||!integer(a.typed_lanes_offset)||!integer(a.input_lanes_offset)
      ||!integer(a.input_lanes_bytes)||!a.input_lanes_bytes||a.typed_lanes_offset!==a.input_lanes_offset
      ||a.input_lanes_offset%8!==0||a.input_lanes_offset<a.scratch_offset!+a.scratch_bytes!
      ||a.input_lanes_offset+a.input_lanes_bytes>a.memory_pages*65536)
      throw new Error('Invalid native Modelica typed input lane ABI');
    const occupied=new Uint8Array(a.input_lanes_bytes),names=new Set<string>(),indices=new Set<number>();
    for(const lane of inputs){
      const width=lane?.representation==='u8'?1:8;
      if(!lane||typeof lane.name!=='string'||!lane.name||names.has(lane.name)||indices.has(lane.p_index)
        ||!['i64','u8'].includes(lane.representation)||!integer(lane.byte_offset)
        ||!integer(lane.p_index)||lane.p_index>=a.p_count||lane.byte_offset%width!==0
        ||lane.byte_offset+width>a.input_lanes_bytes)
        throw new Error('Invalid native Modelica typed input lane');
      names.add(lane.name);indices.add(lane.p_index);
      for(let i=lane.byte_offset;i<lane.byte_offset+width;i++){
        if(occupied[i])throw new Error('Overlapping native Modelica input lanes');occupied[i]=1;
      }
    }
  }else if(Object.hasOwn(a,'input_lanes_offset')||Object.hasOwn(a,'input_lanes_bytes')){
    throw new Error('Unexpected native Modelica typed input lane ABI');
  }
  if(hasLanes){
    if(!typed||!integer(a.output_lanes_offset)||!integer(a.output_lanes_bytes)||!a.output_lanes_bytes
      ||a.output_lanes_offset%8!==0||a.output_lanes_offset<a.scratch_offset!+a.scratch_bytes!
      ||hasInputs&&a.output_lanes_offset<a.input_lanes_offset!+a.input_lanes_bytes!
      ||a.output_lanes_offset+a.output_lanes_bytes>a.memory_pages*65536)
      throw new Error('Invalid native Modelica output lane ABI');
    const occupied=new Uint8Array(a.output_lanes_bytes),names=new Set<string>();
    for(const lane of derived){
      const width=lane?.representation==='u8'?1:8;
      if(!lane||typeof lane.name!=='string'||!lane.name||names.has(lane.name)
        ||!['i64','u8','f64'].includes(lane.representation)||!integer(lane.byte_offset)
        ||lane.byte_offset%width!==0||lane.byte_offset+width>a.output_lanes_bytes)
        throw new Error('Invalid native Modelica derived output lane');
      names.add(lane.name);
      for(let i=lane.byte_offset;i<lane.byte_offset+width;i++){
        if(occupied[i])throw new Error('Overlapping native Modelica output lanes');occupied[i]=1;
      }
    }
  }else if(Object.hasOwn(a,'output_lanes_offset')||Object.hasOwn(a,'output_lanes_bytes')){
    throw new Error('Unexpected native Modelica output lane ABI');
  }
  if(Object.hasOwn(a,'typed_lanes_offset')&&(!typed||(!hasInputs&&!hasLanes)
    ||!integer(a.typed_lanes_offset)||a.typed_lanes_offset!==(hasInputs?a.input_lanes_offset:a.output_lanes_offset)))
    throw new Error('Invalid native Modelica typed lane base');
  const layout=value.var_layout;
  if(!layout||layout.y_scalars!==a.y_count||layout.p_scalars!==a.p_count
    ||!layout.bindings||!layout.shapes||!Array.isArray(value.parameters)
    ||value.parameters.length!==a.p_count||!value.parameters.every(Number.isFinite)
    ||!Array.isArray(value.input_names)||!value.input_names.every(name=>typeof name==='string')
    ||new Set(value.input_names).size!==value.input_names.length)
    throw new Error('Invalid native Modelica program layout');
  for(const binding of Object.values(layout.bindings)){
    if(!binding||Number(Boolean(binding.Y))+Number(Boolean(binding.P))!==1)
      throw new Error('Invalid native Modelica program storage binding');
    for(const kind of ['Y','P'] as const){
      const slot=binding[kind];
      if(slot&&(!integer(slot.index)||slot.index>=(kind==='Y'?a.y_count:a.p_count)||slot.byte_offset!==slot.index*8))
        throw new Error('Native Modelica program binding exceeds its storage');
    }
  }
  for(const shape of Object.values(layout.shapes)){
    if(!Array.isArray(shape)||shape.some(d=>!integer(d)||d<1)||!Number.isSafeInteger(shape.reduce((n,d)=>n*d,1)))
      throw new Error('Invalid native Modelica program shape');
  }
  const typedInputs=new Map(inputs.map(lane=>[lane.name,lane])),typedIndices=new Set(inputs.map(lane=>lane.p_index));
  for(const name of value.input_names){
    const ordinary=Object.hasOwn(layout.bindings,name)&&Boolean(layout.bindings[name].P);
    if(Number(ordinary)+Number(typedInputs.has(name))!==1)
      throw new Error('Native Modelica program input requires declared P storage or a typed input lane');
  }
  const inputNames=new Set(value.input_names);
  for(const lane of inputs){
    if(!inputNames.has(lane.name)||Object.hasOwn(layout.bindings,lane.name))
      throw new Error('Native Modelica typed input conflicts with ordinary storage or input inventory');
    const initial=value.parameters[lane.p_index];
    if(lane.representation==='i64'?!Number.isSafeInteger(initial):initial!==0&&initial!==1)
      throw new Error('Native Modelica typed input requires an exact default');
  }
  // A base array binding must not expose a typed input's former P cell through
  // an overlapping ordinary view. Build the occupied ordinary spans once,
  // avoiding a scan of every scalar name for every record field.
  if(hasInputs)for(const [name,binding] of Object.entries(layout.bindings))if(binding.P){
    const count=(Object.hasOwn(layout.shapes,name)?layout.shapes[name]:[]).reduce((n,d)=>n*d,1);
    if(binding.P.index+count>a.p_count)throw new Error('Native Modelica program field exceeds its storage');
    for(let i=binding.P.index;i<binding.P.index+count;i++)if(typedIndices.has(i))
      throw new Error('Native Modelica typed input conflicts with ordinary storage');
  }
  for(const lane of derived)if(Object.hasOwn(layout.bindings,lane.name))
    throw new Error('Native Modelica derived output conflicts with ordinary storage');
  for(const lane of derived)if(typedInputs.has(lane.name))
    throw new Error('Native Modelica derived output conflicts with typed input storage');
  const workCount=a.y_count+derived.length;
  if(!Array.isArray(value.issued_schedule)||!value.issued_schedule.length||value.issued_schedule.length>workCount)
    throw new Error('Missing native Modelica program provenance');
  const covered=new Uint8Array(workCount);
  for(const stage of value.issued_schedule){
    // V1 issued only dense spans. V2 explicitly owns periodic blocks;
    // its bounding gaps belong to other stages and must never be copied.
    const stride=value.profile==='native-direct-program-f64-v1'?1:stage?.target_stride;
    const width=value.profile==='native-direct-program-f64-v1'?1:stage?.target_block_width;
    const source=stage?.source;
    const legacy=stage&&Object.hasOwn(stage,'source_node');
    const continuous=source&&Object.keys(source).length===1&&integer(source.continuous_node);
    const discrete=source&&Object.keys(source).length===1&&integer(source.discrete_row);
    const validSource=legacy?integer(stage.source_node)&&source===undefined:Boolean(continuous||discrete);
    if(!stage||!validSource||!integer(stage.target_start)||!integer(stage.target_count)
      ||!integer(stride)||!integer(width)||!width||stride<width||!stage.target_count||stage.target_count%width!==0
      ||(value.profile==='native-direct-program-f64-v1'&&stage.target_stride!==undefined&&stage.target_stride!==1)
      ||(value.profile==='native-direct-program-f64-v1'&&stage.target_block_width!==undefined&&stage.target_block_width!==1)
      ||!Number.isSafeInteger(stage.target_start+(stage.target_count/width-1)*stride+width-1)
      ||stage.target_start+(stage.target_count/width-1)*stride+width-1>=workCount
      ||(discrete?(stage.target_start<a.y_count||stage.target_count!==1):stage.target_start+(stage.target_count/width-1)*stride+width-1>=a.y_count))
      throw new Error('Invalid native Modelica program provenance');
    for(let ordinal=0;ordinal<stage.target_count;ordinal++){
      const i=stage.target_start+Math.floor(ordinal/width)*stride+ordinal%width;
      if(covered[i])throw new Error('Overlapping native Modelica program targets');covered[i]=1;
    }
  }
  if(covered.some(v=>v!==1))throw new Error('Incomplete native Modelica program targets');
  if(!Array.isArray(value.module_bytes)||value.module_bytes.length<8||value.module_bytes.length>64*1024*1024
    ||value.module_bytes.some(b=>!integer(b)||b>255))throw new Error('Invalid native Modelica program module');
}

/** This consumer is staged for the upstream single-program profile. It is not
 * selected by the application until an actual compiler-issued artifact passes
 * numerical, source-edit, persistence and whole-program browser acceptance. */
export class NativeProgram {
  private readonly values:Float64Array;
  private readonly inputIndices:Set<number>;
  private readonly fieldViews={P:new Map<string,Float64Array>(),Y:new Map<string,Float64Array>()};
  private readonly laneViews=new Map<string,BigInt64Array|Uint8Array|Float64Array>();
  private readonly lanes:ReadonlyMap<string,NonNullable<NativeProgramArtifact['derived_outputs']>[number]>;
  private readonly inputLaneViews=new Map<string,BigInt64Array|Uint8Array>();
  private readonly inputLanes:ReadonlyMap<string,NonNullable<NativeProgramArtifact['input_lanes']>[number]>;
  private checkpointIdentity?:Promise<string>;
  private restoringMemory=false;
  private constructor(private readonly artifact:NativeProgramArtifact,readonly memory:WebAssembly.Memory,
    private readonly execute:(y:number,p:number,time:number,seed:number,output:number)=>void|number){
    this.values=new Float64Array(memory.buffer);
    this.inputIndices=new Set(artifact.input_names.flatMap(name=>{
      const slot=Object.hasOwn(artifact.var_layout.bindings,name)?artifact.var_layout.bindings[name].P:undefined;
      return slot?[slot.index]:[];
    }));
    this.lanes=new Map((artifact.derived_outputs??[]).map(lane=>[lane.name,lane]));
    this.inputLanes=new Map((artifact.input_lanes??[]).map(lane=>[lane.name,lane]));
    this.reset();
  }
  static async instantiate(value:NativeProgramArtifact,source:string){
    validate(value);const artifact=structuredClone(value);
    if(artifact.source_sha256!==await sourceDigest(source))throw new Error('Native Modelica program does not match its source');
    const bytes=new Uint8Array(artifact.module_bytes);
    if(artifact.module_sha256!==await bytesDigest(bytes))throw new Error('Native Modelica program module digest mismatch');
    const a=artifact.abi,memory=new WebAssembly.Memory({initial:a.memory_pages,maximum:a.memory_pages});
    const module=await WebAssembly.compile(bytes),env:Record<string,WebAssembly.ImportValue>={memory};
    let memories=0;const importedMath=new Set<string>();
    for(const dependency of WebAssembly.Module.imports(module)){
      if(dependency.module!=='env')throw new Error('Unsupported native Modelica program import namespace');
      if(dependency.kind==='memory'&&dependency.name==='memory'){memories++;continue;}
      const intrinsic=(Math as unknown as Record<string,unknown>)[dependency.name];
      if(dependency.kind==='function'&&mathImports.includes(dependency.name)&&typeof intrinsic==='function'){
        if(importedMath.has(dependency.name))throw new Error('Duplicate native Modelica math import');
        importedMath.add(dependency.name);
        env[dependency.name]=intrinsic;
      }
      else throw new Error(`Unsupported native Modelica program import: ${dependency.name}`);
    }
    if(memories!==1)throw new Error('Native Modelica program requires its declared imported memory');
    if(artifact.profile==='native-direct-program-f64-v3'
      &&(importedMath.size!==artifact.math_imports!.length||artifact.math_imports!.some(name=>!importedMath.has(name))))
      throw new Error('Native Modelica math imports differ from declared inventory');
    const instance=await WebAssembly.instantiate(module,{env}),execute=instance.exports.eval_assignments;
    if(typeof execute!=='function'||execute.length!==5)throw new Error('Native Modelica program export does not match its ABI');
    return new NativeProgram(artifact,memory,execute as (y:number,p:number,time:number,seed:number,output:number)=>void|number);
  }
  private field(name:string,kind:'P'|'Y'){
    this.checkMemory();
    const cached=this.fieldViews[kind].get(name);
    if(cached)return cached;
    const {bindings,shapes}=this.artifact.var_layout;
    if(!Object.hasOwn(bindings,name)||!bindings[name][kind])throw new Error(`Unknown Modelica ${kind==='P'?'input':'output'}: ${name}`);
    const index=bindings[name][kind]!.index,shape=Object.hasOwn(shapes,name)?shapes[name]:[];
    const count=shape.reduce((n,d)=>n*d,1),limit=kind==='P'?this.artifact.abi.p_count:this.artifact.abi.y_count;
    if(index+count>limit)throw new Error('Modelica program field exceeds its storage');
    if(kind==='P')for(let i=index;i<index+count;i++)if(!this.inputIndices.has(i))throw new Error(`Modelica program field is not a declared input: ${name}`);
    const offset=(kind==='P'?this.artifact.abi.p_offset:this.artifact.abi.y_offset)/8;
    const view=this.values.subarray(offset+index,offset+index+count);
    this.fieldViews[kind].set(name,view);
    return view;
  }
  input(name:string){this.checkIdle();return this.field(name,'P');}
  output(name:string){return this.field(name,'Y');}
  private inputLane(name:string,representation:'i64'|'u8'){
    this.checkIdle();
    const lane=this.inputLanes.get(name);
    if(!lane)throw new Error(`Unknown Modelica typed input: ${name}`);
    if(lane.representation!==representation)throw new Error(`Modelica typed input representation differs: ${name}`);
    let view=this.inputLaneViews.get(name);
    if(!view){
      const offset=this.artifact.abi.input_lanes_offset!+lane.byte_offset;
      view=representation==='i64'?new BigInt64Array(this.memory.buffer,offset,1):new Uint8Array(this.memory.buffer,offset,1);
      this.inputLaneViews.set(name,view);
    }
    return view;
  }
  /** Scalar typed lanes named by the compiler; no Number conversion or array
   * grouping inferred from flattened record field names. Views are live. */
  integerInput(name:string){return this.inputLane(name,'i64') as BigInt64Array;}
  booleanInput(name:string){return this.inputLane(name,'u8') as Uint8Array;}
  private lane(name:string,representation:'i64'|'u8'|'f64'){
    this.checkMemory();
    const lane=this.lanes.get(name);
    if(!lane)throw new Error(`Unknown Modelica derived output: ${name}`);
    if(lane.representation!==representation)throw new Error(`Modelica derived output representation differs: ${name}`);
    let view=this.laneViews.get(name);
    if(!view){
      const offset=this.artifact.abi.output_lanes_offset!+lane.byte_offset;
      view=representation==='i64'?new BigInt64Array(this.memory.buffer,offset,1)
        :representation==='u8'?new Uint8Array(this.memory.buffer,offset,1):new Float64Array(this.memory.buffer,offset,1);
      this.laneViews.set(name,view);
    }
    return view;
  }
  integerOutput(name:string){return this.lane(name,'i64') as BigInt64Array;}
  booleanOutput(name:string){return this.lane(name,'u8') as Uint8Array;}
  realDerivedOutput(name:string){return this.lane(name,'f64') as Float64Array;}
  private checkMemory(){
    if(this.values.buffer!==this.memory.buffer)throw new Error('Modelica program memory buffer changed; instantiate the model again');
  }
  private checkIdle(){
    this.checkMemory();
    if(this.restoringMemory)throw new Error('Wait for native Modelica memory restore to finish');
  }
  private memoryIdentity(){
    // Compute only when persistence is used. Module bytes already have their
    // own verified digest; include all remaining issued metadata, especially
    // layout and input defaults, without serializing the executable again.
    if(!this.checkpointIdentity){
      const {module_bytes:_bytes,...metadata}=this.artifact;
      this.checkpointIdentity=sourceDigest(JSON.stringify(metadata));
    }
    return this.checkpointIdentity;
  }
  async snapshotMemory():Promise<NativeProgramMemorySnapshot>{
    this.checkIdle();
    // Capture before the first await. No scalar conversion: preserve Integer
    // lanes, Boolean bytes, signed zeros, NaN payloads and opaque padding.
    const bytes=new Uint8Array(this.memory.buffer).slice();
    const [layoutSha256,bytesSha256]=await Promise.all([this.memoryIdentity(),bytesDigest(bytes)]);
    return {format:'rumoca-native-memory',version:1,sourceSha256:this.artifact.source_sha256,
      moduleSha256:this.artifact.module_sha256,layoutSha256,bytesSha256,bytes};
  }
  async restoreMemory(value:NativeProgramMemorySnapshot):Promise<void>{
    this.checkIdle();
    if(!value||value.format!=='rumoca-native-memory'||value.version!==1
      ||value.sourceSha256!==this.artifact.source_sha256||value.moduleSha256!==this.artifact.module_sha256
      ||!digest(value.layoutSha256)||!digest(value.bytesSha256)
      ||!(value.bytes instanceof Uint8Array)||!(value.bytes.buffer instanceof ArrayBuffer)
      ||value.bytes.byteLength!==this.memory.buffer.byteLength)
      throw new Error('Invalid native Modelica memory checkpoint identity or size');
    // Own the submitted bytes before awaiting hashes. Caller edits cannot
    // change what is validated or what is ultimately restored.
    const bytes=new Uint8Array(value.bytes),expectedLayout=value.layoutSha256,expectedBytes=value.bytesSha256;
    this.restoringMemory=true;
    try{
      const [layoutSha256,bytesSha256]=await Promise.all([this.memoryIdentity(),bytesDigest(bytes)]);
      if(expectedLayout!==layoutSha256||expectedBytes!==bytesSha256)
        throw new Error('Native Modelica memory checkpoint layout or digest mismatch');
      this.checkMemory();
      new Uint8Array(this.memory.buffer).set(bytes);
    }finally{this.restoringMemory=false;}
  }
  reset(){
    this.checkIdle();this.values.fill(0);this.values.set(this.artifact.parameters,this.artifact.abi.p_offset/8);
    for(const lane of this.inputLanes.values()){
      const value=this.artifact.parameters[lane.p_index];
      if(lane.representation==='i64')this.integerInput(lane.name)[0]=BigInt(value);
      else this.booleanInput(lane.name)[0]=value;
    }
  }
  evaluate(time:number){
    if(!Number.isFinite(time))throw new Error('Modelica program requires a finite simulation timestamp');
    this.checkIdle();
    const a=this.artifact.abi;
    const typed=this.artifact.profile==='native-direct-program-f64-v3';
    const status=this.execute(a.y_offset,a.p_offset,time,typed?a.scratch_offset!:a.reserved_pointer_value,
      a.typed_lanes_offset??a.output_lanes_offset??a.reserved_pointer_value);
    if(typed&&status!==0){
      const fault=this.artifact.faults!.find(fault=>fault.status===status);
      throw new Error(`Native Modelica program rejected (${String(status)}: ${fault?.kind??'unknown status'})`);
    }
  }
}
