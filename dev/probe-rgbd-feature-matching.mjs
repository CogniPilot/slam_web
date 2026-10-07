// Read-only source admission probe; run beneath rumoca-bounded-run.mjs.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const [directory,sourcePath,model,phase,reportPath]=process.argv.slice(2);
if(!reportPath||!['compile','native'].includes(phase))throw new Error('PACKAGE SOURCE MODEL compile|native REPORT required');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const source=fs.readFileSync(sourcePath,'utf8'),wasm=fs.readFileSync(path.join(directory,'rumoca_bind_wasm_bg.wasm'));
const report={model,phase,status:'RUNNING',sourceSha256:sha(source),compilerWasmSha256:sha(wasm),
  capacity:350,descriptorSize:49,fullSource:true,nativeAdmitted:false,numericallyVerified:false,runtimeIntegrated:false,productionPinChanged:false};
const save=()=>fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');save();
const compiler=await import(pathToFileURL(path.resolve(directory,'rumoca_bind_wasm.js')));
await compiler.default({module_or_path:wasm});
report.compiler={version:compiler.get_version(),revision:compiler.get_git_commit()};save();
const start=performance.now();
try{
  if(phase==='native'&&typeof compiler.prepare_native_program!=='function')throw new Error('Reviewed compiler lacks prepare_native_program');
  const raw=phase==='compile'?compiler.compile(source,model):compiler.prepare_native_program(source,model);
  fs.writeFileSync(reportPath+'.raw.json',raw);
  const result=JSON.parse(raw);
  if(result.error||result.errors)throw new Error(JSON.stringify(result.error??result.errors));
  if(phase==='compile'&&result.balance?.is_balanced!==true)throw new Error('Source is not balanced');
  report.status=phase==='compile'?'COMPILED':'NATIVE_PREPARED';
  report.balance=result.balance;report.nativeAdmitted=phase==='native';
  report.resultSha256=sha(raw);
}catch(error){report.status='REFUSED';report.refusal=String(error);}
finally{report.elapsedMs=performance.now()-start;save();console.log(JSON.stringify(report));}
