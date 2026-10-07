// Static hosting only. Executes the production PGRun module, not the complete
// optimizer's still-blocked validation/publication wrapper.
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const [artifactPath, sourcePath, reportPath] = process.argv.slice(2);
if (!reportPath) throw Error('ARTIFACT SOURCE REPORT required');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const consumerPath = 'src/modelica-native-program.ts';
const fixturePath = 'tests/compiler-probes/pose-graph-run-fixtures.ts';
const algebraPath = 'tests/compiler-probes/pose-graph-fixtures.ts';
const inputs = new Map([['/artifact.json',fs.readFileSync(artifactPath)],['/source.mo',fs.readFileSync(sourcePath)]]);
const proofSources = [consumerPath,fixturePath,algebraPath,import.meta.filename];
const digests = Object.fromEntries(proofSources.map(file => [file,sha(fs.readFileSync(file))]));
const bundle = await build({entryPoints:{consumer:consumerPath,fixtures:fixturePath},
  bundle:true,platform:'browser',format:'esm',outdir:'unused',write:false});
const files = new Map(inputs);
for (const file of bundle.outputFiles) files.set('/'+path.basename(file.path),file.contents);
const server = createServer((request,response) => {
  if (files.has(request.url)) {
    response.setHeader('Content-Type',request.url.endsWith('.js') ? 'text/javascript'
      : request.url.endsWith('.json') ? 'application/json' : 'text/plain');
    response.end(files.get(request.url));
  } else if (request.url === '/') response.end('<!doctype html><title>Modelica pose graph WASM</title>');
  else response.writeHead(404).end();
});

async function inWorker({base}) {
  const [{NativeProgram},{runCases,loadRun,certifyRun},source,artifact] = await Promise.all([
    import(base+'/consumer.js'),import(base+'/fixtures.js'),
    fetch(base+'/source.mo').then(r => r.text()),fetch(base+'/artifact.json').then(r => r.json()),
  ]);
  if (artifact.model_name !== 'PoseGraphRunStorage') throw Error('Wrong Modelica root');
  const start = performance.now(), program = await NativeProgram.instantiate(artifact,source);
  const admissionMs = performance.now()-start, cases = runCases(), results = [];
  const equal = (a,b) => a.length === b.length && a.every((v,i) => v === b[i]);
  function run(target,test) {
    loadRun(target,test);
    const abi = artifact.abi;
    const real = new Uint8Array(target.memory.buffer,abi.p_offset,abi.p_count*8);
    const typed = new Uint8Array(target.memory.buffer,abi.input_lanes_offset,abi.input_lanes_bytes);
    const before = [real.slice(),typed.slice()];
    new Float64Array(target.memory.buffer,abi.y_offset,abi.y_count).fill(NaN);
    const start = performance.now(); target.evaluate(results.length/90);
    const elapsedMs = performance.now()-start;
    const result = certifyRun(test,name => target.output(name));
    if (!equal(real,before[0]) || !equal(typed,before[1])) throw Error('Input mutation');
    results.push({name:test.name,elapsedMs,...result});
    return new Uint8Array(target.memory.buffer,abi.y_offset,abi.y_count*8).slice();
  }
  const baseline = run(program,cases[0]);
  for (const test of cases.slice(1)) run(program,test);
  if (!equal(run(program,{...cases[0],name:'recovery after sparse NaN padding'}),baseline)) throw Error('Recovery mismatch');
  program.reset();
  if (!equal(run(program,{...cases[0],name:'reset replay'}),baseline)) throw Error('Reset mismatch');
  const restored = await NativeProgram.instantiate(JSON.parse(JSON.stringify(artifact)),source);
  if (!equal(run(restored,{...cases[0],name:'JSON reload'}),baseline)) throw Error('Reload mismatch');
  let refused = false;
  try {await NativeProgram.instantiate(artifact,source+'\n// stale source');}
  catch (error) {refused = String(error).includes('does not match its source');}
  if (!refused) throw Error('Stale source accepted');
  return {admissionMs,results,readonlyRealAndTypedInputs:true,resetRecovery:true,jsonReload:true,
    staleSourceRefused:true,compiler:artifact.compiler,moduleSha256:artifact.module_sha256};
}

let browser;
try {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,
    args:['--no-sandbox','--disable-gpu']});
  const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const result = await page.evaluate(async text => {
    const script = `onmessage=async({data})=>{try{postMessage({result:await (${text})(data)})}catch(e){postMessage({error:String(e.stack||e)})}}`;
    const url = URL.createObjectURL(new Blob([script],{type:'text/javascript'})), worker = new Worker(url);
    try {
      return await new Promise((resolve,reject) => {
        const timer = setTimeout(() => reject(Error('Pose-graph worker timeout')),90000);
        worker.onmessage = ({data}) => {clearTimeout(timer); data.error ? reject(Error(data.error)) : resolve(data.result);};
        worker.onerror = error => {clearTimeout(timer); reject(Error(error.message));};
        worker.postMessage({base:location.origin});
      });
    } finally {worker.terminate(); URL.revokeObjectURL(url);}
  },inWorker.toString());
  for (const [url,file] of [['/artifact.json',artifactPath],['/source.mo',sourcePath]])
    if (!fs.readFileSync(file).equals(inputs.get(url))) throw Error('Input changed');
  for (const file of proofSources) if (sha(fs.readFileSync(file)) !== digests[file]) throw Error('Probe source changed');
  const report = {status:'ACTUAL_FULL128_256_PGRUN_STATIC_BROWSER_WORKER_PASS',recordedAt:new Date().toISOString(),
    browser:browser.version(),result,sourceDigests:digests,
    staticFileSha256:Object.fromEntries([...files].map(([name,bytes]) => [name,sha(bytes)])),
    productionPinChanged:false,runtimeIntegrated:false,fullSlamAccepted:false,
    scope:'Production PGRun iteration kernel in a static browser worker. Complete optimizer validation/publication remains blocked by scratch planning.'};
  fs.mkdirSync(path.dirname(reportPath),{recursive:true}); fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
} finally {await browser?.close(); await new Promise(resolve => server.close(resolve));}
