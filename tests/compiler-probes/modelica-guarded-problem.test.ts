import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {NativeProgram,type NativeProgramArtifact} from '../../src/modelica-native-program';

const directory=process.env.RUMOCA_BRANCH_PKG;
it.skipIf(!directory)('executes a prepared record only on paths where its owner was defined',async()=>{
  const compiler=await import(/* @vite-ignore */pathToFileURL(resolve(directory!,'rumoca_bind_wasm.js')).href);
  await compiler.default({module_or_path:readFileSync(resolve(directory!,'rumoca_bind_wasm_bg.wasm'))});
  const source=readFileSync('tests/compiler-probes/fixtures/GuardedProblem.mo','utf8');
  const artifact:NativeProgramArtifact=JSON.parse(compiler.prepare_native_program(source,'GuardedProblemProbe'));
  const program=await NativeProgram.instantiate(artifact,source);
  for(const requested of [0,1])for(const count of [-1n,0n,1n,2n,3n,4n,9007199254740993n]){
    program.integerInput('count')[0]=count;
    program.booleanInput('requested')[0]=requested;
    program.evaluate(0);
    const expected=requested&&count>=0n&&count<=3n?Number(count*(count+1n)):0;
    expect(program.output('result')[0],`requested=${requested}, count=${count}`).toBe(expected);
  }
},30_000);
