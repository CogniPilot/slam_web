// Run under an external timeout: Modelica compilation is synchronous WASM.
// This probe never changes the application pin or constructs equations itself.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
const options=new Map();
for(let i=2;i<process.argv.length;i+=2){
  const name=process.argv[i],value=process.argv[i+1];
  if(!['--package','--source','--report','--artifact'].includes(name)||!value||options.has(name))throw new Error('Expected unique --package/--source/--report/--artifact values');
  options.set(name,value);
}
if(!options.has('--package'))throw new Error('Pass --package with the review-only full-web compiler output directory');
const directory=resolve(options.get('--package'));
const source=await readFile(options.has('--source')?resolve(options.get('--source')):new URL('../models/Vision/Features/HarrisNativeFrame.mo',import.meta.url),'utf8');
const bytes=await readFile(resolve(directory,'rumoca_bind_wasm_bg.wasm'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const compiler=await import(pathToFileURL(resolve(directory,'rumoca_bind_wasm.js')).href);
await compiler.default({module_or_path:bytes});
const provenance={compiler:{version:compiler.get_version(),revision:compiler.get_git_commit(),wasmSha256:sha(bytes)},sourceSha256:sha(source)};
console.log(JSON.stringify({phase:'native-Harris-preparation',...provenance}));
const start=performance.now();let report;
try{
  const artifact=JSON.parse(compiler.prepare_native_assignments(source,'HarrisNativeFrame'));
  if(artifact.source_sha256!==provenance.sourceSha256)throw new Error('Compiler source digest mismatch');
  for(const stage of artifact.stages)if(sha(new Uint8Array(stage.module_bytes))!==stage.module_sha256)throw new Error('Compiler stage digest mismatch');
  report={...provenance,accepted:true,coldMs:performance.now()-start,profile:artifact.profile,
    stages:artifact.stages.length,moduleBytes:artifact.stages.reduce((sum,stage)=>sum+stage.module_bytes.length,0),
    memoryBytes:artifact.abi.memory_pages*65536,peakRssKiB:process.resourceUsage().maxRSS,
    limits:['Source admission only; numerical pixel/feature parity and runtime throughput are not verified.','CPU WASM; no GPU/render/transport measurements.']};
  if(options.has('--artifact'))await writeFile(resolve(options.get('--artifact')),JSON.stringify(artifact));
}catch(error){
  report={...provenance,accepted:false,coldMs:performance.now()-start,error:String(error),peakRssKiB:process.resourceUsage().maxRSS};process.exitCode=1;
}
if(options.has('--report'))await writeFile(resolve(options.get('--report')),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
