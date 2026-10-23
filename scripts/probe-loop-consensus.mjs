// Exact shipped consensus vs a private observation-only copy, on matched pairs.
// Input contains optical XYZ pairs/covariances, never truth or estimator poses.
import * as compiler from '@cognipilot/rumoca';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {loopConsensusSource,instantiateConsensusProbe,resultNames,consensusFailure,sha256} from './loop-consensus-probe.mjs';
import {isDeepStrictEqual} from 'node:util';

const [inputPath,outputPath]=process.argv.slice(2);
if(!inputPath||!outputPath)throw Error('Usage: probe-loop-consensus.mjs MATCHED_PAIRS.json NEW_OUTPUT');
const bytes=await readFile(inputPath),input=JSON.parse(bytes);
if(input.schemaVersion!==1||!Array.isArray(input.cases)||input.cases.length<1)throw Error('Expected schemaVersion:1 and nonempty cases');
const capacity=input.capacity;
const directory=resolve(outputPath);await mkdir(directory);
const receipt={schemaVersion:1,status:'running',inputSha256:sha256(bytes),capacity,results:[],
  scope:'CPU component diagnostic on supplied optical matched pairs. No camera rendering, descriptor matching, pose screen, graph admission or office loop-closure acceptance.',
  instrumentation:'Four observation outputs only in a private consensus source string; original result fields must be exactly equal before diagnostics are reported.'};
try{
  const wasm=await readFile(new URL('../node_modules/@cognipilot/rumoca/rumoca_bind_wasm_bg.wasm',import.meta.url));
  const pin=JSON.parse(await readFile(new URL('../rumoca-package.json',import.meta.url)));
  if(sha256(wasm)!==pin.files['rumoca_bind_wasm_bg.wasm'])throw Error('Compiler does not match the repository pin');
  await compiler.default({module_or_path:wasm});
  if(compiler.get_git_commit()!==pin.revision.slice(0,12))throw Error('Compiler revision mismatch');
  receipt.compiler={revision:compiler.get_git_commit(),wasmSha256:sha256(wasm)};
  const programs=[];
  for(const diagnostics of [false,true]){
    const prepared=await loopConsensusSource(capacity,{diagnostics});
    const start=performance.now();
    const artifact=JSON.parse(compiler.prepare_native_program(prepared.source,'LoopConsensusProbe'));
    const label=diagnostics?'observed':'original';
    await writeFile(join(directory,label+'.mo'),prepared.source);
    await writeFile(join(directory,label+'.artifact.json'),JSON.stringify(artifact));
    programs.push(await instantiateConsensusProbe(artifact,prepared.source));
    receipt[label]={sourceSha256:sha256(prepared.source),moduleSha256:artifact.module_sha256,
      compilationMs:performance.now()-start,originalSourceSha256:prepared.originalSourceSha256,sources:prepared.sources};
  }
  for(const entry of input.cases){
    const original=programs[0].run(entry.inputs),observed=programs[1].run(entry.inputs);
    const project=result=>Object.fromEntries(resultNames.map(key=>[key,result[key]]));
    if(!isDeepStrictEqual(project(original),project(observed)))throw Error('Instrumentation changed results for '+entry.name);
    receipt.results.push({name:entry.name,identity:true,result:observed,failure:consensusFailure(observed)});
  }
  receipt.status='pass';
}catch(error){receipt.status='failed';receipt.error=String(error);process.exitCode=1;}
finally{
  await writeFile(join(directory,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({status:receipt.status,cases:receipt.results.length,output:directory,error:receipt.error??null}));
}
