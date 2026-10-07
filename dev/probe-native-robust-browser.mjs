// Static hosting only; the worker runs the real compiler-issued executable.
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
const fixturePath = 'tests/compiler-probes/rgbd-robust-registration-fixtures.ts';
const files = new Map([['/artifact.json', fs.readFileSync(artifactPath)], ['/source.mo', fs.readFileSync(sourcePath)]]);
const consumer = fs.readFileSync(consumerPath), fixture = fs.readFileSync(fixturePath);
const algebraPath = 'tests/compiler-probes/rgbd-registration-uncertainty-fixtures.ts', algebra = fs.readFileSync(algebraPath);
const bundle = await build({entryPoints:{consumer:consumerPath, fixtures:fixturePath},
  bundle:true, platform:'browser', format:'esm', outdir:'unused', write:false});
for (const file of bundle.outputFiles) files.set('/'+path.basename(file.path), file.contents);
const server = createServer((request, response) => {
  if (files.has(request.url)) {
    response.setHeader('Content-Type', request.url.endsWith('.js') ? 'text/javascript'
      : request.url.endsWith('.json') ? 'application/json' : 'text/plain');
    response.end(files.get(request.url));
  } else if (request.url === '/') response.end('<!doctype html><title>Modelica robust registration WASM</title>');
  else response.writeHead(404).end();
});

async function inWorker({base}) {
  const [{NativeProgram}, {capacity, realFields, robustCases, certifyRobustResult}, source, artifact] = await Promise.all([
    import(base+'/consumer.js'), import(base+'/fixtures.js'),
    fetch(base+'/source.mo').then(r => r.text()), fetch(base+'/artifact.json').then(r => r.json()),
  ]);
  const start = performance.now(), program = await NativeProgram.instantiate(artifact, source);
  const admissionMs = performance.now()-start, results = [], cases = robustCases();
  if (artifact.abi.y_count !== 377 || program.input('sourcePoint').length !== capacity*3
      || program.input('sourceCovariance').length !== capacity*9) throw Error('Full350 domain required');
  function run(target, {name, fixture}) {
    for (const field of realFields) target.input(field).set([fixture[field]].flat(3));
    target.integerInput('maximumHypotheses')[0] = BigInt(fixture.maximumHypotheses);
    target.booleanInput('useCovariance')[0] = +fixture.useCovariance;
    const real = new Uint8Array(target.memory.buffer, artifact.abi.p_offset, artifact.abi.p_count*8);
    const typed = new Uint8Array(target.memory.buffer, artifact.abi.input_lanes_offset, artifact.abi.input_lanes_bytes);
    const before = [real.slice(), typed.slice()];
    new Float64Array(target.memory.buffer, artifact.abi.y_offset, artifact.abi.y_count).fill(NaN);
    const start = performance.now(); target.evaluate(results.length/90);
    const executionMs = performance.now()-start;
    certifyRobustResult(fixture, field => target.output(field));
    if (real.some((v,i) => v !== before[0][i]) || typed.some((v,i) => v !== before[1][i])) throw Error('Input mutation');
    results.push({name, executionMs, accepted:target.output('accepted')[0], reason:target.output('rejectionReason')[0],
      count:target.output('validCount')[0], rms:target.output('rms')[0]});
  }
  for (const test of cases) run(program, test);
  program.reset(); run(program, {...cases[0], name:'reset replay'});
  const reloaded = await NativeProgram.instantiate(JSON.parse(JSON.stringify(artifact)), source);
  run(reloaded, {...cases[3], name:'full350 consensus after JSON reload'});
  let refused = false;
  try {await NativeProgram.instantiate(artifact, source+'\n// stale source');}
  catch (error) {refused = String(error).includes('does not match its source');}
  if (!refused) throw Error('Stale source admitted');
  return {admissionMs, results, readonlyRealAndTypedInputs:true, resetRecovery:true,
    jsonReload:true, staleSourceRefused:true, compiler:artifact.compiler, moduleSha256:artifact.module_sha256};
}

let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH,
    args:['--no-sandbox', '--disable-gpu']});
  const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const result = await page.evaluate(async text => {
    const script = `onmessage=async({data})=>{try{postMessage({result:await (${text})(data)})}catch(e){postMessage({error:String(e.stack||e)})}}`;
    const url = URL.createObjectURL(new Blob([script], {type:'text/javascript'})), worker = new Worker(url);
    try {
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Registration worker timeout')), 60000);
        worker.onmessage = ({data}) => {clearTimeout(timer); data.error ? reject(Error(data.error)) : resolve(data.result);};
        worker.onerror = error => {clearTimeout(timer); reject(Error(error.message));};
        worker.postMessage({base:location.origin});
      });
    } finally {worker.terminate(); URL.revokeObjectURL(url);}
  }, inWorker.toString());
  for (const [url, file] of [['/artifact.json',artifactPath], ['/source.mo',sourcePath]])
    if (!fs.readFileSync(file).equals(files.get(url))) throw Error('Input changed');
  for (const [file, bytes] of [[consumerPath,consumer], [fixturePath,fixture], [algebraPath,algebra]])
    if (!fs.readFileSync(file).equals(bytes)) throw Error('Consumer/oracle changed');
  const report = {status:'ACTUAL_FULL350_ROBUST_STATIC_BROWSER_WORKER_PASS', recordedAt:new Date().toISOString(),
    browser:browser.version(), result, staticFileSha256:Object.fromEntries([...files].map(([name,bytes]) => [name,sha(bytes)])),
    consumerSha256:sha(consumer), fixtureSha256:sha(fixture), algebraSha256:sha(algebra),
    harnessSha256:sha(fs.readFileSync(import.meta.filename)), productionPinChanged:false, fullSlamAccepted:false,
    scope:'Actual production robust fit WASM in a static browser worker, covariance and metric controls; no sensors, GPU ingress or complete SLAM.'};
  fs.mkdirSync(path.dirname(reportPath), {recursive:true}); fs.writeFileSync(reportPath, JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
} finally {await browser?.close(); await new Promise(resolve => server.close(resolve));}
