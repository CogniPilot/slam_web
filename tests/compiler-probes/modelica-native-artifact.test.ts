import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type * as Rumoca from '@cognipilot/rumoca';
import {NativeAssignments,type NativeAssignmentsArtifact} from '../../src/modelica-native-artifact';

const directory=process.env.RUMOCA_BRANCH_PKG;
it.skipIf(!directory)('reloads compiler-issued Modelica array stages with exact frame values, source edits and reusable bounded memory',async()=>{
  const compiler:typeof Rumoca=await import(/* @vite-ignore */ pathToFileURL(resolve(directory!,'rumoca_bind_wasm.js')).href);
  await compiler.default({module_or_path:readFileSync(resolve(directory!,'rumoca_bind_wasm_bg.wasm'))});
  const source=`model NativeImage
    input Real rgb[2,3,3]=fill(5.0,2,3,3);
    parameter Real offset=2.0;
    Real gray[2,3]; output Real score[2,3];
    equation
    for y in 1:2 loop for x in 1:3 loop
      gray[y,x]=(rgb[y,x,1]+rgb[y,x,2]+rgb[y,x,3])/3;
    end for; end for;
    for y in 1:2 loop for x in 1:3 loop
      score[y,x]=gray[y,x]*gray[y,x]+offset;
    end for; end for;
    end NativeImage;`;
  const prepare=(text:string):NativeAssignmentsArtifact=>JSON.parse((compiler as any).prepare_native_assignments(text,'NativeImage'));
  const artifact=prepare(source),saved=JSON.stringify({source,artifact}),reloaded=JSON.parse(saved);
  const kernel=await NativeAssignments.instantiate(reloaded.artifact,reloaded.source);
  const memory=kernel.memory.buffer,input=kernel.input('rgb'),gray=kernel.output('gray'),score=kernel.output('score');
  kernel.evaluate(0);expect(Array.from(gray)).toEqual(Array(6).fill(5));expect(Array.from(score)).toEqual(Array(6).fill(27));
  for(let frame=0;frame<8;frame++){
    input.set(Array.from({length:18},(_,i)=>(i*13+frame*7)/17));
    kernel.evaluate(frame/90);
    for(let i=0;i<6;i++){
      const g=(input[i*3]+input[i*3+1]+input[i*3+2])/3;
      expect(Object.is(gray[i],g)).toBe(true);expect(Object.is(score[i],g*g+2)).toBe(true);
    }
    expect(kernel.memory.buffer).toBe(memory);
  }
  expect(kernel.input('rgb[2,3,3]')[0]).toBe(input[17]);
  expect(kernel.output('score[2,3]')[0]).toBe(score[5]);
  expect(()=>kernel.input('offset')).toThrow('not a declared input');
  expect(()=>kernel.input('score')).toThrow('Unknown Modelica input');
  expect(()=>kernel.output('rgb')).toThrow('Unknown Modelica output');
  expect(()=>kernel.evaluate(NaN)).toThrow('finite simulation timestamp');
  const editedSource=source.replace('offset=2.0','offset=3.0'),edited=prepare(editedSource);
  await expect(NativeAssignments.instantiate(artifact,editedSource)).rejects.toThrow('does not match its source');
  const changed=await NativeAssignments.instantiate(JSON.parse(JSON.stringify(edited)),editedSource);changed.input('rgb').set(input);changed.evaluate(1);
  score.forEach((value,i)=>expect(Math.abs(changed.output('score')[i]-value-1)).toBeLessThan(1e-12));
  kernel.reset();kernel.evaluate(0);expect(Array.from(score)).toEqual(Array(6).fill(27));
  // A project mutation must not change the private active stage schedule.
  reloaded.artifact.stages[0].target_start=4;
  kernel.input('rgb').fill(9);kernel.evaluate(2);expect(Array.from(score)).toEqual(Array(6).fill(83));
  const corrupt=structuredClone(artifact);corrupt.stages[0].module_bytes[0]^=1;
  await expect(NativeAssignments.instantiate(corrupt,source)).rejects.toThrow('digest mismatch');
  const overlapping=structuredClone(artifact);overlapping.stages[1].target_start=0;
  await expect(NativeAssignments.instantiate(overlapping,source)).rejects.toThrow('overlap');
  const oversized=structuredClone(artifact);oversized.abi.memory_pages=1025;
  await expect(NativeAssignments.instantiate(oversized,source)).rejects.toThrow('memory ABI');
  expect(()=>kernel.memory.grow(1)).toThrow();
},45_000);
