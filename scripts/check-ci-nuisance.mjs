import * as compiler from '@cognipilot/rumoca';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {researchNativeProgram} from './research-native-program.mjs';
const [exportPath,output]=process.argv.slice(2);
if(!output)throw Error('Usage: check-ci-nuisance.mjs ORIGINAL_EXPORTED_SOURCE NEW_OUTPUT');
const original=await readFile(exportPath),sha=x=>createHash('sha256').update(x).digest('hex');
if(sha(original)!=='843d316165385fdcb5c64784d822fd669e9b2311ec5df0a22b74ddf097d4e868')throw Error('Unexpected source for this reproduction');
await mkdir(output);
const source=original.toString()+'\n'+await readFile(new URL('../models/Benchmarks/CINuisanceProfile.mo',import.meta.url),'utf8');
await writeFile(join(output,'source.mo'),source);
await compiler.default({module_or_path:await readFile(new URL('../node_modules/@cognipilot/rumoca/rumoca_bind_wasm_bg.wasm',import.meta.url))});
const artifact=JSON.parse(compiler.prepare_native_program(source,'CINuisanceProfile'));
await writeFile(join(output,'program.json'),JSON.stringify(artifact));
const program=await researchNativeProgram(artifact,source),cases=[];
for(const weight of [.25,.5,.8]){
 program.input('weight')[0]=weight;program.evaluate(0);
 const result={weight,accepted:program.output('accepted')[0],reason:program.output('reason')[0],varianceRatio:Array.from(program.output('varianceRatio')),nuisanceMeanDelta:Array.from(program.output('nuisanceMeanDelta'))};
 if(result.accepted!==1||result.reason!==0||result.varianceRatio.some(value=>Math.abs(value-1/weight)>1e-10)||result.nuisanceMeanDelta.some(value=>Math.abs(value)>1e-12))throw Error('Component reproduction failed: '+JSON.stringify(result));
 cases.push(result);
}
const receipt={status:'pass',originalSourceSha256:sha(original),sourceSha256:artifact.source_sha256,moduleSha256:artifact.module_sha256,compiler:artifact.compiler,cases,
 scope:'Existing exported Modelica correction source, synthetic valid binding and diagonal SPD inputs, executed after lowering by the current pinned Rumoca compiler. Constrained nuisance means unchanged while variance scales1/weight. Not an internal covariance capture from the archived flight module or a repair.'};
await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
