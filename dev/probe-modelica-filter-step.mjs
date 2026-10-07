import {modelicaSourcePath} from '../src/modelica-source-locations.mjs';
// Review-only compiler probe; run under dev/rumoca-bounded-run.mjs.
// No numerical algorithm is implemented here and no production pin is changed.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import {performance} from 'node:perf_hooks';

const directory=process.env.RUMOCA_BRANCH_PKG;
const output=process.env.RUMOCA_FILTER_STEP_OUT;
if(!directory||!output)throw new Error('Set RUMOCA_BRANCH_PKG and RUMOCA_FILTER_STEP_OUT');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const files=['ES15NominalPrediction','ES15Dynamics','ES15CovariancePrediction',
  'SPD6Solve','ES15PoseCorrection'].map(name=>modelicaSourcePath(name)).concat('tests/compiler-probes/fixtures/components/ES15FilterStep.mo');
const parts=await Promise.all(files.map(file=>fs.readFile(file,'utf8')));
const source=parts.join('\n');
await fs.mkdir(output,{recursive:true});
await fs.writeFile(path.join(output,'source.mo'),source);
const wasm=await fs.readFile(path.join(directory,'rumoca_bind_wasm_bg.wasm'));
const compiler=await import(pathToFileURL(path.resolve(directory,'rumoca_bind_wasm.js')).href);
await compiler.default({module_or_path:wasm});
const provenance={sourceSha256:sha(source),sources:Object.fromEntries(files.map((file,i)=>[file,sha(parts[i])])),
  compiler:{version:compiler.get_version(),revision:compiler.get_git_commit(),wasmSha256:sha(wasm)}};
console.log(JSON.stringify({phase:'prepare-native-filter-step',...provenance}));
const started=performance.now();let record;
try{
  if(typeof compiler.prepare_native_program!=='function')throw new Error('Compiler has no source-owned native-program exporter');
  const artifact=JSON.parse(compiler.prepare_native_program(source,'ES15FilterStep'));
  if(artifact.source_sha256!==provenance.sourceSha256||sha(new Uint8Array(artifact.module_bytes))!==artifact.module_sha256)throw new Error('Issued artifact digest mismatch');
  await fs.writeFile(path.join(output,'artifact.json'),JSON.stringify(artifact));
  record={...provenance,status:'SOURCE_ADMISSION_PASS_NUMERICAL_EXECUTION_PENDING',elapsedMs:performance.now()-started,
    profile:artifact.profile,abi:artifact.abi,moduleBytes:artifact.module_bytes.length,issuedStages:artifact.issued_schedule.length};
}catch(error){
  record={...provenance,status:'NATIVE_SOURCE_REFUSED',elapsedMs:performance.now()-started,error:String(error)};
  process.exitCode=1;
}
await fs.writeFile(path.join(output,'report.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify(record));
