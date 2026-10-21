import {createHash} from 'node:crypto';
export async function researchNativeProgram(artifact,source){
// Research-only consumer of the pinned compiler's issued schema89 ABI.
// Does not change or bypass the application's production admission rules.
const sha=x=>createHash('sha256').update(x).digest('hex');
if(artifact.solve_schema_version!==89||artifact.profile!=='native-direct-program-f64-v3')throw Error('Unexpected research ABI');
if(sha(source)!==artifact.source_sha256||sha(new Uint8Array(artifact.module_bytes))!==artifact.module_sha256)throw Error('Artifact identity mismatch');
const a=artifact.abi;
if(a.export!=='eval_assignments'||a.memory_import!=='env.memory'||a.memory_shared!==false||a.result!=='status:i32'||a.success_status!==0||a.p_readonly!==true)throw Error('Unexpected ABI');
if(!Number.isSafeInteger(a.memory_pages)||a.memory_pages<1||a.memory_pages>4096||a.p_offset!==a.y_count*8||a.scratch_offset<(a.p_offset+a.p_count*8)||a.scratch_offset+a.scratch_bytes>a.memory_pages*65536)throw Error('Invalid memory layout');
const memory=new WebAssembly.Memory({initial:a.memory_pages,maximum:a.memory_pages}),bytes=new Uint8Array(artifact.module_bytes),module=await WebAssembly.compile(bytes),env={memory};
for(const dependency of WebAssembly.Module.imports(module)){
 if(dependency.module!=='env')throw Error('Unexpected import namespace');
 if(dependency.kind==='memory'&&dependency.name==='memory')continue;
 if(dependency.kind!=='function'||!artifact.math_imports.includes(dependency.name)||typeof Math[dependency.name]!=='function')throw Error('Unexpected import');
 env[dependency.name]=Math[dependency.name];
}
const {exports}=await WebAssembly.instantiate(module,{env});
const values=new Float64Array(memory.buffer);values.set(artifact.parameters,a.p_offset/8);
for(const lane of artifact.input_lanes){
 if(lane.representation!=='i64'||!Number.isSafeInteger(artifact.parameters[lane.p_index]))throw Error('Unexpected typed constant');
 const offset=a.input_lanes_offset+lane.byte_offset;
 if(offset%8||offset+8>memory.buffer.byteLength)throw Error('Invalid typed lane');
 new DataView(memory.buffer).setBigInt64(offset,BigInt(artifact.parameters[lane.p_index]),true);
}
const field=(name,kind)=>{
 const binding=artifact.var_layout.bindings[name]?.[kind],shape=artifact.var_layout.shapes[name]??[],count=shape.reduce((n,d)=>n*d,1),limit=kind==='P'?a.p_count:a.y_count;
 if(!binding||!Number.isSafeInteger(binding.index)||binding.index<0||binding.index+count>limit)throw Error('Field outside issued storage: '+name);
 return new Float64Array(memory.buffer,(kind==='P'?a.p_offset:0)+binding.index*8,count);
};
return {memory,input:name=>field(name,'P'),output:name=>field(name,'Y'),evaluate:time=>{
 const status=exports.eval_assignments(0,a.p_offset,time,a.scratch_offset,a.typed_lanes_offset);
 if(status!==0)throw Error('Compiler-issued kernel fault '+status);
}};
}
