// Issue one unchanged Modelica source from the actual browser compiler worker.
// Compilation/ABI admission only; numerical acceptance is a separate gate.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {startWorkerProfiler} from './browser-worker-profiler.mjs';

const [directory, sourceFile, model, artifactFile, reportFile] = process.argv.slice(2);
if (!reportFile) throw new Error('COMPILER_DIRECTORY SOURCE MODEL RAW_ARTIFACT REPORT required');
const timeoutMs=Number(process.env.RUMOCA_BROWSER_TIMEOUT_MS??60000);
if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>300000)throw new Error('RUMOCA_BROWSER_TIMEOUT_MS must be1000..300000');
if (fs.existsSync(artifactFile) || fs.existsSync(reportFile)) throw new Error('Choose fresh artifact/report paths');
if (process.env.RUMOCA_BROWSER_PROFILE && fs.existsSync(process.env.RUMOCA_BROWSER_PROFILE)) throw new Error('Choose a fresh profile path');
const hash = value => createHash('sha256').update(value).digest('hex');
const source = fs.readFileSync(sourceFile, 'utf8');
const js = fs.readFileSync(path.join(directory, 'rumoca_bind_wasm.js'));
const wasm = fs.readFileSync(path.join(directory, 'rumoca_bind_wasm_bg.wasm'));
const consumer = await build({entryPoints:['src/modelica-native-program.ts'],bundle:true,format:'esm',platform:'browser',write:false});
const files = new Map([
  ['/compiler.js', ['text/javascript', js]],
  ['/compiler.wasm', ['application/wasm', wasm]],
  ['/consumer.js', ['text/javascript', consumer.outputFiles[0].contents]],
]);
const server = createServer((request, response) => {
  const file = files.get(request.url);
  if (file) { response.setHeader('Content-Type', file[0]); response.end(file[1]); return; }
  if (request.url === '/') { response.end('<!doctype html><title>Browser Modelica issuance</title>'); return; }
  response.statusCode = 404; response.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser, compilerIdentity, compilerElapsedMs, issuedArtifact, issuedRaw, profiler;
try {
  browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  if (process.env.RUMOCA_BROWSER_PROFILE) profiler = await startWorkerProfiler(page);
  const result = await page.evaluate(async payload => {
    const body = `onmessage=async({data})=>{let identity,started,raw,compileMs;try{
      const compiler=await import(data.base+'/compiler.js');
      await compiler.default({module_or_path:data.base+'/compiler.wasm'});
      identity={version:compiler.get_version(),revision:compiler.get_git_commit()};
      postMessage({phase:'compiler-ready',compiler:identity});
      if(typeof compiler.prepare_native_program!=='function')throw new Error('Native program producer unavailable');
      started=performance.now();
      raw=compiler.prepare_native_program(data.source,data.model);
      compileMs=performance.now()-started;
      const artifact=JSON.parse(raw);
      const {NativeProgram}=await import(data.base+'/consumer.js');
      await NativeProgram.instantiate(artifact,data.source);
      postMessage({raw,compileMs,compiler:identity});
    }catch(error){postMessage({error:String(error.stack||error),compiler:identity,raw,compileMs,
      elapsedMs:started===undefined?undefined:performance.now()-started})}}`;
    const url = URL.createObjectURL(new Blob([body], {type:'text/javascript'}));
    const worker = new Worker(url);
    try {
      return await new Promise((resolve, reject) => {
        let identity;
        const started=performance.now();
        const timer = setTimeout(() => resolve({error:'Browser native issuance timed out',compiler:identity,
          elapsedMs:performance.now()-started}), payload.timeoutMs);
        worker.onmessage = ({data}) => {
          if (data.phase === 'compiler-ready') { identity = data.compiler; return; }
          clearTimeout(timer); resolve(data);
        };
        worker.onerror = error => { clearTimeout(timer); reject(new Error(error.message)); };
        worker.postMessage({...payload,base:location.origin});
      });
    } finally {
      // A diagnostic profiler must stop before its target is destroyed. This
      // page/browser is owned by the probe and is closed in the outer finally.
      if (!payload.profileRequested) worker.terminate();
      URL.revokeObjectURL(url);
    }
  }, {source,model,timeoutMs,profileRequested:Boolean(process.env.RUMOCA_BROWSER_PROFILE)});
  compilerIdentity = result.compiler;
  compilerElapsedMs = result.compileMs ?? result.elapsedMs;
  if (result.raw !== undefined) {
    const candidate = JSON.parse(result.raw);
    if (candidate.source_sha256 !== hash(source)) throw new Error('Browser compiler source binding differs');
    // Preserve exact compiler output even when the consumer cannot yet admit it.
    fs.mkdirSync(path.dirname(artifactFile), {recursive:true});
    fs.writeFileSync(artifactFile, result.raw);
    issuedArtifact = candidate;
    issuedRaw = result.raw;
  }
  if (result.error) throw new Error(result.error);
  if (!issuedArtifact) throw new Error('Browser compiler returned no artifact');
  const artifact = issuedArtifact;
  fs.mkdirSync(path.dirname(reportFile), {recursive:true});
  const report = {
    status:'ACTUAL_BROWSER_COMPILER_NATIVE_PROGRAM_ISSUANCE_AND_ABI_ADMISSION_PASS',recordedAt:new Date().toISOString(),
    model,browser:browser.version(),compiler:result.compiler,sourceSha256:hash(source),compilerModuleSha256:hash(wasm),compilerJsSha256:hash(js),
    consumerBundleSha256:hash(consumer.outputFiles[0].contents),probeSha256:hash(fs.readFileSync(import.meta.filename)),
    artifactSha256:hash(result.raw),moduleSha256:artifact.module_sha256,moduleBytes:artifact.module_bytes.length,profile:artifact.profile,
    compileMs:result.compileMs,timeoutMs,abi:artifact.abi,issuedStages:artifact.issued_schedule.length,
    scope:'Source text compiled in an actual dedicated browser worker and artifact admitted by NativeProgram. No native producer or numerical fallback. This gate does not execute independent numerical fixtures.',
    diagnosticProfiling:Boolean(profiler),numericalAcceptance:false,runtimeIntegrated:false,productionPinChanged:false,fullSlam:false,
  };
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
} catch (error) {
  fs.mkdirSync(path.dirname(reportFile), {recursive:true});
  fs.writeFileSync(reportFile, `${JSON.stringify({status:issuedArtifact ? 'ACTUAL_BROWSER_COMPILER_ISSUANCE_PASS_CONSUMER_ABI_ADMISSION_FAILED' : 'ACTUAL_BROWSER_COMPILER_ISSUANCE_FAILED',recordedAt:new Date().toISOString(),model,
    compiler:compilerIdentity,compilerElapsedMs,timeoutMs,sourceSha256:hash(source),compilerModuleSha256:hash(wasm),
    compilerJsSha256:hash(js),consumerBundleSha256:hash(consumer.outputFiles[0].contents),probeSha256:hash(fs.readFileSync(import.meta.filename)),
    artifactSha256:issuedRaw === undefined ? undefined : hash(issuedRaw),moduleSha256:issuedArtifact?.module_sha256,
    profile:issuedArtifact?.profile,compilerIssuedSourceBoundArtifact:Boolean(issuedArtifact),
    error:String(error.stack||error),diagnosticProfiling:Boolean(profiler),numericalAcceptance:false,runtimeIntegrated:false,productionPinChanged:false,fullSlam:false}, null, 2)}\n`);
  throw error;
} finally {
  if (profiler) {
    const result = await profiler.stop();
    fs.mkdirSync(path.dirname(process.env.RUMOCA_BROWSER_PROFILE), {recursive:true});
    fs.writeFileSync(process.env.RUMOCA_BROWSER_PROFILE, `${JSON.stringify({
      ...result,sourceSha256:hash(source),compilerModuleSha256:hash(wasm),compiler:compilerIdentity,
      scope:'Diagnostic compilation worker sampling, including compiler initialization. Not SLAM runtime throughput.',
    })}\n`);
  }
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
