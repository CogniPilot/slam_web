// Run each source in its own bounded process: a compiler panic can leave the
// WASM package's busy guard set. Never interpret later busy errors as new bugs.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const [file,model,mode='lower',compilerDirectory]=process.argv.slice(2);
if(!file||!model||!['lower','session'].includes(mode))throw Error('Expected source file, model and lower/session');
const compilerJs=resolve(compilerDirectory??'node_modules/@cognipilot/rumoca','rumoca_bind_wasm.js');
const compilerWasm=compilerDirectory?resolve(compilerDirectory,'rumoca_bind_wasm_bg.wasm'):'public/vendor/rumoca/rumoca_bind_wasm_bg.wasm';
const compiler=await import(pathToFileURL(compilerJs));
const wasm=readFileSync(compilerWasm);
await compiler.default({module_or_path:wasm});
const source=readFileSync(file,'utf8'),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={file,model,mode,sourceSha256:sha(source),wasmSha256:sha(wasm),compilerJsSha256:sha(readFileSync(compilerJs)),compilerVersion:compiler.get_version(),compilerCommit:compiler.get_git_commit()};
try{
  if(mode==='lower')report.solveJsonBytes=compiler.lower_model_to_solve_json(source,model,1,.1,'{}').length;
  else{
    const session=compiler.WasmSimulationSession.withInteractiveOptions(source,model,.1,'rk-like',1e-8,1e-8,'[]');
    try{report.stateJsonBytes=session.state_json().length;}finally{session.free();}
  }
  report.accepted=true;
}catch(error){report.accepted=false;report.error=String(error);process.exitCode=1;}
console.log(JSON.stringify(report,null,2));
