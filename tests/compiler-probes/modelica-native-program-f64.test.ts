import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {NativeProgram,type NativeProgramArtifact} from '../../src/modelica-native-program';

const sourcePath=process.env.RUMOCA_F64_PROGRAM_SOURCE;
const artifactPath=process.env.RUMOCA_F64_PROGRAM_ARTIFACT;
it.skipIf(!sourcePath||!artifactPath)('executes a schema73 compiler-issued direct f64 program across moving frames and reload',async()=>{
  const source=readFileSync(sourcePath!,'utf8');
  const artifact=JSON.parse(readFileSync(artifactPath!,'utf8')) as NativeProgramArtifact;
  expect(artifact.model_name).toBe('ConnectedFrame');
  expect(artifact.profile).toBe('native-direct-program-f64-v2');
  expect(artifact.solve_schema_version).toBe(73);
  const program=await NativeProgram.instantiate(artifact,source);
  const input=program.input('rgb'),gray=program.output('gray'),score=program.output('score');
  expect(input.length).toBe(90*160*3);
  expect(gray.length).toBe(90*160);
  expect(score.length).toBe(gray.length);
  const memory=program.memory.buffer;
  for(let frame=0;frame<8;frame++){
    for(let i=0;i<input.length;i++)input[i]=((i*13+frame*7)%251)/17;
    const gain=frame-.25,time=frame/90;
    program.input('gain')[0]=gain;
    const before=new Uint8Array(memory,artifact.abi.p_offset,artifact.abi.p_count*8).slice();
    program.evaluate(time);
    for(let i=0;i<gray.length;i++){
      const g=(input[3*i]+input[3*i+1]+input[3*i+2])/3;
      if(!Object.is(gray[i],g)||!Object.is(score[i],g*g+gain))throw Error(`Frame ${frame}, pixel ${i}`);
    }
    expect(program.output('first')[0]).toBe(score[0]);
    expect(program.output('last')[0]).toBe(score.at(-1));
    expect(program.output('stamp')[0]).toBe(time+gain);
    expect(program.memory.buffer).toBe(memory);
    expect(Buffer.from(memory,artifact.abi.p_offset,before.length).equals(before)).toBe(true);
  }
  const snapshot=await program.snapshotMemory();
  const reload=await NativeProgram.instantiate(JSON.parse(JSON.stringify(artifact)),source);
  await reload.restoreMemory(structuredClone(snapshot));
  expect(Buffer.from(reload.memory.buffer).equals(Buffer.from(memory))).toBe(true);
  reload.reset();reload.evaluate(0);
  expect([...reload.output('gray')].every(value=>value===5)).toBe(true);
  expect([...reload.output('score')].every(value=>value===27)).toBe(true);
  await expect(NativeProgram.instantiate(artifact,source+'\n// edited')).rejects.toThrow('source');
  for(const schema of [71,72,74]){
    await expect(NativeProgram.instantiate({...artifact,solve_schema_version:schema},source)).rejects.toThrow('Unsupported');
  }
},30_000);
