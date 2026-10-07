import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {NativeProgram,type NativeProgramArtifact} from '../../src/modelica-native-program';
import {bytesDigest} from '../../src/source-digest';

const directory=process.env.RUMOCA_BRANCH_PKG;
const source=`model ImportedAbs
 input Real value=-4.0;
 output Real result;
 equation result=abs(value);
 end ImportedAbs;`;

async function prepare(){
 const compiler=await import(/* @vite-ignore */ pathToFileURL(resolve(directory!,'rumoca_bind_wasm.js')).href);
 await compiler.default({module_or_path:readFileSync(resolve(directory!,'rumoca_bind_wasm_bg.wasm'))});
 expect(typeof compiler.prepare_native_program).toBe('function');
 return JSON.parse(compiler.prepare_native_program(source,'ImportedAbs')) as NativeProgramArtifact;
}

it.skipIf(!directory)('executes the actual issued Abs intrinsic with IEEE classifications and unchanged input bytes',async()=>{
 const artifact=await prepare();
 const module=await WebAssembly.compile(new Uint8Array(artifact.module_bytes));
 expect(WebAssembly.Module.imports(module)).toContainEqual({module:'env',name:'abs',kind:'function'});
 const program=await NativeProgram.instantiate(artifact,source);
 const input=program.input('value');
 const bytes=new Uint8Array(input.buffer,input.byteOffset,input.byteLength);
 for(const value of [-42,42,-0,0,-Infinity,Infinity,NaN]){
  input[0]=value;const before=bytes.slice();program.evaluate(0);
  expect(Object.is(program.output('result')[0],Math.abs(value))).toBe(true);
  expect(bytes).toEqual(before);
 }
 // A payload is opaque input data, not a portable promise about target NaN payload results.
 new DataView(input.buffer).setBigUint64(input.byteOffset,0xfff8000000001234n,true);
 const before=bytes.slice();program.evaluate(0);
 expect(Number.isNaN(program.output('result')[0])).toBe(true);expect(bytes).toEqual(before);
 program.reset();program.evaluate(0);expect(program.output('result')[0]).toBe(4);
},60_000);

it.skipIf(!directory)('refuses unknown intrinsic names and import namespaces after artifact digest validation',async()=>{
 const artifact=await prepare();
 const mutate=async(from:string,to:string)=>{
  const edited=structuredClone(artifact),bytes=new Uint8Array(edited.module_bytes);
  const text=new TextEncoder().encode(from),replacement=new TextEncoder().encode(to);
  expect(text.length).toBe(replacement.length);
  const start=bytes.findIndex((_,i)=>bytes[i-1]===text.length&&text.every((v,j)=>bytes[i+j]===v));
  expect(start).toBeGreaterThan(0);bytes.set(replacement,start);
  edited.module_bytes=Array.from(bytes);edited.module_sha256=await bytesDigest(bytes);return edited;
 };
 await expect(NativeProgram.instantiate(await mutate('abs','zzz'),source)).rejects.toThrow('Unsupported native Modelica program import: zzz');
 await expect(NativeProgram.instantiate(await mutate('env','bad'),source)).rejects.toThrow('Unsupported native Modelica program import namespace');
},60_000);
