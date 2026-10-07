import {sourceDigest,bytesDigest} from './source-digest';

/** Compiler-issued stateless assignment stages. The host preserves their order
 * and exact storage ranges; it does not isolate or solve Modelica equations. */
export interface NativeAssignmentsArtifact {
  profile:'native-direct-assignments-f64-v1';
  model_name:string;
  source_sha256:string;
  compiler:{version:string;git_commit:string};
  solve_schema_version:number;
  abi:{export:string;arguments:string[];memory_import:string;memory_shared:boolean;
    memory_pages:number;y_offset:number;p_offset:number;seed_offset:number;output_offset:number;
    output_capacity:number;y_count:number;p_count:number;seed_count:number};
  var_layout:{y_scalars:number;p_scalars:number;
    bindings:Record<string,{Y?:{index:number;byte_offset:number};P?:{index:number;byte_offset:number}}>;
    shapes:Record<string,number[]>};
  input_names:string[];
  parameters:number[];
  stages:{source_node:number;target_start:number;target_count:number;module_sha256:string;module_bytes:number[]}[];
}
const argumentTypes=['yPtr:i32','pPtr:i32','time:f64','seedPtr:i32','outPtr:i32'];
const integer=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>=0;
const sha=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const mathImports=['sin','cos','tan','asin','acos','atan','atan2','sinh','cosh','tanh',
  'asinh','acosh','atanh','exp','log','log2','log10','pow'];

function validate(value:NativeAssignmentsArtifact){
  if(!value||value.profile!=='native-direct-assignments-f64-v1'||value.solve_schema_version!==70
    ||typeof value.model_name!=='string'||!value.model_name||!sha(value.source_sha256)
    ||typeof value.compiler?.version!=='string'||typeof value.compiler?.git_commit!=='string')
    throw new Error('Unsupported native Modelica artifact');
  const a=value.abi;
  if(!a||a.export!=='eval_residual'||a.memory_import!=='env.memory'||a.memory_shared!==false
    ||!Array.isArray(a.arguments)||JSON.stringify(a.arguments)!==JSON.stringify(argumentTypes)
    ||![a.memory_pages,a.y_count,a.p_count,a.seed_count,a.output_capacity,a.y_offset,a.p_offset,a.seed_offset,a.output_offset].every(integer)
    ||a.memory_pages<1||a.memory_pages>1024||a.y_count<1||a.output_capacity<1
    ||a.y_offset!==0||a.p_offset!==a.y_count*8||a.seed_count!==a.y_count+a.p_count
    ||a.seed_offset!==a.seed_count*8||a.output_offset!==a.seed_count*16
    ||a.output_offset+a.output_capacity*8>a.memory_pages*65536)
    throw new Error('Invalid native Modelica memory ABI');
  if(!value.var_layout||value.var_layout.y_scalars!==a.y_count||value.var_layout.p_scalars!==a.p_count
    ||!value.var_layout.bindings||!value.var_layout.shapes
    ||!Array.isArray(value.parameters)||value.parameters.length!==a.p_count||!value.parameters.every(Number.isFinite)
    ||!Array.isArray(value.input_names)||!value.input_names.every(name=>typeof name==='string')
    ||new Set(value.input_names).size!==value.input_names.length)
    throw new Error('Invalid native Modelica variable layout');
  for(const binding of Object.values(value.var_layout.bindings)){
    if(!binding||Number(Boolean(binding.Y))+Number(Boolean(binding.P))!==1)throw new Error('Invalid native Modelica storage binding');
    for(const kind of ['Y','P'] as const){
      const slot=binding[kind];
      if(slot&&(!integer(slot.index)||slot.index>=(kind==='Y'?a.y_count:a.p_count)||slot.byte_offset!==slot.index*8))
        throw new Error('Native Modelica binding exceeds its storage');
    }
  }
  for(const shape of Object.values(value.var_layout.shapes)){
    if(!Array.isArray(shape)||shape.some(d=>!integer(d)||d<1)||!Number.isSafeInteger(shape.reduce((n,d)=>n*d,1)))
      throw new Error('Invalid native Modelica array shape');
  }
  if(!Array.isArray(value.stages)||!value.stages.length||value.stages.length>a.y_count)
    throw new Error('Missing native Modelica assignment stages');
  const covered=new Uint8Array(a.y_count);let bytes=0;
  for(const stage of value.stages){
    if(!stage||!integer(stage.source_node)||!integer(stage.target_start)||!integer(stage.target_count)
      ||!stage.target_count||stage.target_count>a.output_capacity||stage.target_start+stage.target_count>a.y_count
      ||!sha(stage.module_sha256)||!Array.isArray(stage.module_bytes)||stage.module_bytes.length<8
      ||stage.module_bytes.some(b=>!integer(b)||b>255))throw new Error('Invalid native Modelica assignment stage');
    bytes+=stage.module_bytes.length;if(bytes>64*1024*1024)throw new Error('Native Modelica modules exceed the artifact budget');
    for(let i=stage.target_start;i<stage.target_start+stage.target_count;i++){
      if(covered[i])throw new Error('Native Modelica stages overlap their target storage');covered[i]=1;
    }
  }
  if(covered.some(v=>v!==1))throw new Error('Native Modelica stages do not cover the complete model');
}

/** Portable execution context with reusable unshared memory. Views are live;
 * copy outputs when retaining a frame beyond the next synchronous evaluation. */
export class NativeAssignments {
  private readonly values:Float64Array;
  private readonly inputIndices:Set<number>;
  private constructor(private readonly artifact:NativeAssignmentsArtifact,
    readonly memory:WebAssembly.Memory,
    private readonly stages:{evaluate:(y:number,p:number,time:number,seed:number,output:number)=>void;start:number;count:number}[]){
    this.values=new Float64Array(memory.buffer);
    this.inputIndices=new Set(artifact.input_names.map(name=>{
      if(!Object.hasOwn(artifact.var_layout.bindings,name)||!artifact.var_layout.bindings[name].P)
        throw new Error('Native Modelica input must have compiler-issued P storage');
      return artifact.var_layout.bindings[name].P!.index;
    }));
    this.reset();
  }
  static async instantiate(value:NativeAssignmentsArtifact,source:string){
    validate(value);
    // Freeze the execution metadata against later project edits. Stored JSON is
    // kept by the project; this private copy owns the active execution context.
    const artifact=structuredClone(value);
    if(artifact.source_sha256!==await sourceDigest(source))throw new Error('Native Modelica artifact does not match its source');
    const a=artifact.abi,memory=new WebAssembly.Memory({initial:a.memory_pages,maximum:a.memory_pages});
    const stages=[];
    for(const stage of artifact.stages){
      const bytes=new Uint8Array(stage.module_bytes);
      const digest=await bytesDigest(bytes);
      if(digest!==stage.module_sha256)throw new Error('Native Modelica module digest mismatch');
      const module=await WebAssembly.compile(bytes),env:Record<string,WebAssembly.ImportValue>={memory};
      for(const dependency of WebAssembly.Module.imports(module)){
        if(dependency.module!=='env')throw new Error('Unsupported native Modelica import namespace');
        if(dependency.kind==='memory'&&dependency.name==='memory')continue;
        if(dependency.kind==='function'&&mathImports.includes(dependency.name))
          env[dependency.name]=(Math as unknown as Record<string,Function>)[dependency.name];
        else throw new Error(`Unsupported native Modelica import: ${dependency.name}`);
      }
      const instance=await WebAssembly.instantiate(module,{env}),evaluate=instance.exports.eval_residual;
      if(typeof evaluate!=='function'||evaluate.length!==5)throw new Error('Native Modelica stage has no matching value export');
      stages.push({evaluate:evaluate as (y:number,p:number,time:number,seed:number,output:number)=>void,start:stage.target_start,count:stage.target_count});
    }
    return new NativeAssignments(artifact,memory,stages);
  }
  private field(name:string,kind:'P'|'Y'){
    const {bindings,shapes}=this.artifact.var_layout;
    if(!Object.hasOwn(bindings,name)||!bindings[name][kind])throw new Error(`Unknown Modelica ${kind==='P'?'input':'output'}: ${name}`);
    const index=bindings[name][kind]!.index,shape=Object.hasOwn(shapes,name)?shapes[name]:[];
    const count=shape.reduce((n,d)=>n*d,1),limit=kind==='P'?this.artifact.abi.p_count:this.artifact.abi.y_count;
    if(index+count>limit)throw new Error('Modelica field exceeds its storage');
    if(kind==='P')for(let i=index;i<index+count;i++)if(!this.inputIndices.has(i))throw new Error(`Modelica field is not a declared input: ${name}`);
    const offset=(kind==='P'?this.artifact.abi.p_offset:this.artifact.abi.y_offset)/8;
    return this.values.subarray(offset+index,offset+index+count);
  }
  input(name:string){return this.field(name,'P');}
  output(name:string){return this.field(name,'Y');}
  reset(){
    this.values.fill(0);this.values.set(this.artifact.parameters,this.artifact.abi.p_offset/8);
  }
  evaluate(time:number){
    if(!Number.isFinite(time))throw new Error('Modelica evaluation requires a finite simulation timestamp');
    const a=this.artifact.abi;
    for(const stage of this.stages){
      stage.evaluate(a.y_offset,a.p_offset,time,a.seed_offset,a.output_offset);
      this.values.copyWithin(a.y_offset/8+stage.start,a.output_offset/8,a.output_offset/8+stage.count);
    }
  }
}
