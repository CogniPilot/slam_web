import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {NativeAssignments,type NativeAssignmentsArtifact} from '../../src/modelica-native-artifact';
import {NativeProgram,type NativeProgramArtifact} from '../../src/modelica-native-program';

const directory=process.env.RUMOCA_BRANCH_PKG;
it.skipIf(!directory)('executes an actual compiler-issued full-frame mixed program with one module, unchanged values and persistent project sources',async()=>{
 const compiler=await import(/* @vite-ignore */ pathToFileURL(resolve(directory!,'rumoca_bind_wasm.js')).href);
 await compiler.default({module_or_path:readFileSync(resolve(directory!,'rumoca_bind_wasm_bg.wasm'))});
 // This is a strict upstream capability gate. Older reviewed packages must
 // refuse here; host code never substitutes its own executable or schedule.
 expect(typeof compiler.prepare_native_program).toBe('function');
 const source=`model ConnectedFrame
 input Real rgb[90,160,3]=fill(5.0,90,160,3);
 input Real gain=2.0;
 Real gray[90,160]; output Real score[90,160];
 output Real first; output Real last; output Real stamp;
 equation
 for y in 1:90 loop for x in 1:160 loop
 gray[y,x]=(rgb[y,x,1]+rgb[y,x,2]+rgb[y,x,3])/3;
 end for; end for;
 for y in 1:90 loop for x in 1:160 loop
 score[y,x]=gray[y,x]*gray[y,x]+gain;
 end for; end for;
 first=score[1,1]; last=score[90,160]; stamp=time+gain;
 end ConnectedFrame;`;
 const prepare=(text:string):NativeProgramArtifact=>JSON.parse(compiler.prepare_native_program(text,'ConnectedFrame'));
 const artifact=prepare(source),saved=JSON.parse(JSON.stringify({source,artifact}));
 const program=await NativeProgram.instantiate(saved.artifact,saved.source);
 const splitArtifact:NativeAssignmentsArtifact=JSON.parse(compiler.prepare_native_assignments(source,'ConnectedFrame'));
 const split=await NativeAssignments.instantiate(splitArtifact,source);
 expect(artifact.issued_schedule.map(stage=>stage.target_count).sort((a,b)=>a-b)).toEqual([1,1,1,14400,14400]);
 expect(artifact.abi.y_count).toBe(28803);
 expect(artifact.abi.p_offset).toBe(artifact.abi.y_count*8);
 const memory=program.memory.buffer,input=program.input('rgb'),gray=program.output('gray'),score=program.output('score');
 const allBytes=()=>new Uint8Array(memory,0,artifact.abi.y_count*8);
 program.evaluate(0);split.evaluate(0);
 expect(Array.from(gray)).toEqual(Array(14400).fill(5));expect(Array.from(score)).toEqual(Array(14400).fill(27));
 for(let frame=0;frame<8;frame++){
  for(let i=0;i<input.length;i++)input[i]=((i*13+frame*7)%251)/17;
  split.input('rgb').set(input);program.input('gain')[0]=split.input('gain')[0]=frame+.25;
  program.evaluate(frame/90);split.evaluate(frame/90);
  // Compare every Y bit to the unfused compiler-issued modules, including
  // all intermediates and scalar consumers of those array values.
  expect(allBytes()).toEqual(new Uint8Array(split.memory.buffer,0,artifact.abi.y_count*8));
  for(let i=0;i<gray.length;i++){
   const g=(input[3*i]+input[3*i+1]+input[3*i+2])/3;
   if(!Object.is(gray[i],g)||!Object.is(score[i],g*g+(frame+.25)))throw new Error(`Independent full-frame oracle mismatch at ${frame}/${i}`);
  }
  expect(program.output('first')[0]).toBe(score[0]);expect(program.output('last')[0]).toBe(score[14399]);
  expect(program.output('stamp')[0]).toBe(frame/90+(frame+.25));expect(program.memory.buffer).toBe(memory);
 }
 const editedSource=source.replace('gray[y,x]*gray[y,x]+gain','gray[y,x]*gray[y,x]+gain+1.0');
 const edited=prepare(editedSource);
 await expect(NativeProgram.instantiate(artifact,editedSource)).rejects.toThrow('does not match its source');
 const changed=await NativeProgram.instantiate(JSON.parse(JSON.stringify(edited)),editedSource);
 changed.input('rgb').fill(5);changed.evaluate(0);expect(Array.from(changed.output('score'))).toEqual(Array(14400).fill(28));
 // Mutation of project metadata cannot change the active execution context.
 saved.artifact.abi.p_offset=0;saved.artifact.parameters.fill(-1000);saved.artifact.issued_schedule.reverse();
 program.reset();program.evaluate(0);expect(Array.from(score)).toEqual(Array(14400).fill(27));
 expect(()=>program.input('score')).toThrow('Unknown Modelica input');
 expect(()=>program.output('rgb')).toThrow('Unknown Modelica output');
 expect(()=>program.evaluate(NaN)).toThrow('finite simulation timestamp');
 expect(()=>program.memory.grow(1)).toThrow();
 const corrupt=structuredClone(artifact);corrupt.module_bytes[0]^=1;
 await expect(NativeProgram.instantiate(corrupt,source)).rejects.toThrow('digest mismatch');
 // Duplicate a complete in-bounds span. Different stage sizes can make a
 // start-only mutation exceed Y before the overlap validator is reached.
 const overlap=structuredClone(artifact);overlap.issued_schedule[1]={...overlap.issued_schedule[0]};
 await expect(NativeProgram.instantiate(overlap,source)).rejects.toThrow('Overlapping');
 const reserved=structuredClone(artifact);reserved.abi.reserved_pointer_value=8 as 0;
 await expect(NativeProgram.instantiate(reserved,source)).rejects.toThrow('ABI');
 const oversized=structuredClone(artifact);oversized.abi.memory_pages=1025;
 await expect(NativeProgram.instantiate(oversized,source)).rejects.toThrow('ABI');
},90_000);
