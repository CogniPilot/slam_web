// Paired measurements of the same full detector in Node and a Chromium worker.
// Numerical qualification remains a separate required gate.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const [beforeFile, afterFile, fixtureFile, directory] = process.argv.slice(2);
if (!directory) throw Error('Expected BEFORE AFTER FIXTURES OUTPUT_DIRECTORY');
fs.mkdirSync(directory, {recursive:true});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const source = fs.readFileSync('models/FastNativeFrame.mo', 'utf8');
const artifactFiles = [beforeFile, afterFile];
const artifactBytes = artifactFiles.map(file => fs.readFileSync(file));
const artifacts = artifactBytes.map(bytes => JSON.parse(bytes));
const fixtureBytes = fs.readFileSync(fixtureFile);
const fixture = JSON.parse(fixtureBytes);
if (fixture.sourceSha256 !== sha(source) || fixture.frames.length !== 4
    || fixture.height !== 90 || fixture.width !== 160) throw Error('Full-frame fixture mismatch');
for (const artifact of artifacts) {
  if (artifact.model_name !== 'FastNativeFrame' || artifact.source_sha256 !== sha(source)
      || artifact.module_sha256 !== sha(Buffer.from(artifact.module_bytes))) {
    throw Error('Original source/module identity mismatch');
  }
}
const pins = artifacts.map(artifact => ({source: artifact.source_sha256,
  module: artifact.module_sha256, payload: sha(JSON.stringify(artifact))}));
const data = {source, artifacts, frames: fixture.frames.map(frame => frame.rgb)};
const bundle = await build({stdin:{contents:"export {NativeProgram} from './src/modelica-native-program';",
  resolveDir:process.cwd()}, bundle:true, format:'esm', platform:'neutral', write:false});
const consumerFile = path.resolve(directory, 'consumer.mjs');
fs.writeFileSync(consumerFile, bundle.outputFiles[0].contents);
const {NativeProgram} = await import(pathToFileURL(consumerFile));

const measure = async (NativeProgram, data, pins) => {
  const hash = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(text))), byte => byte.toString(16).padStart(2, '0')).join('');
  const programs = [];
  for (let index = 0; index < data.artifacts.length; index++) {
    const artifact = data.artifacts[index];
    if (await hash(data.source) !== pins[index].source
        || artifact.module_sha256 !== pins[index].module
        || await hash(JSON.stringify(artifact)) !== pins[index].payload) throw Error('Pinned identity mismatch');
    const program = await NativeProgram.instantiate(artifact, data.source);
    if (program.input('rgb').length !== 90*160*4 || program.output('scores').length !== 90*160) {
      throw Error('Full-frame dimensions required');
    }
    programs.push(program);
  }
  const frames = data.frames.map(frame => Float64Array.from(frame));
  const stats = samples => {
    const sorted = [...samples].sort((a,b) => a-b);
    return {count:samples.length, meanMs:samples.reduce((a,b)=>a+b,0)/samples.length,
      medianMs:sorted[Math.floor(sorted.length/2)], p95Ms:sorted[Math.floor(sorted.length*.95)],
      maximumMs:sorted.at(-1)};
  };
  for (let index = 0; index < programs.length; index++) {
    const program = programs[index], input = program.input('rgb');
    for (let frame = 0; frame < 64; frame++) {
      input.set(frames[frame%4]); program.evaluate(frame/90);
    }
  }
  const rounds = [];
  for (let round = 0; round < 3; round++) {
    const order = round%2 ? [1,0] : [0,1], measurements = [];
    for (const index of order) {
      const program = programs[index], input = program.input('rgb');
      const compute = [], copyAndCompute = [];
      for (let frame = 0; frame < 120; frame++) {
        let start = performance.now();
        program.evaluate((100+round*300+frame)/90); compute.push(performance.now()-start);
        start = performance.now(); input.set(frames[frame%4]);
        program.evaluate((250+round*300+frame)/90); copyAndCompute.push(performance.now()-start);
      }
      measurements.push({index, compute:stats(compute), copyAndCompute:stats(copyAndCompute)});
    }
    rounds.push({round, order, measurements});
    // Give the host an event-loop turn between independent batches.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return {warmupsPerArtifact:64, samplesPerBatch:120, rounds};
};

let browser, server;
try {
  const node = await measure(NativeProgram, data, pins);
  const payload = JSON.stringify(data);
  server = createServer((request,response) => {
    if (request.url === '/consumer.mjs') {
      response.setHeader('Content-Type','text/javascript'); response.end(bundle.outputFiles[0].contents);
    } else if (request.url === '/data.json') {
      response.setHeader('Content-Type','application/json'); response.end(payload);
    } else {
      response.setHeader('Content-Type','text/html'); response.end('<!doctype html><title>Paired FAST measurement</title>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH,
    args:['--no-sandbox','--disable-gpu']});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const chromiumResult = await page.evaluate(async ({body,pins}) => {
    const code = `const measure=${body};onmessage=async event=>{try{const {NativeProgram}=await import(event.data.base+'/consumer.mjs');const response=await fetch(event.data.base+'/data.json');if(!response.ok)throw Error('Artifact transport failure');const data=await response.json();postMessage(await measure(NativeProgram,data,event.data.pins));}catch(error){postMessage({error:String(error.stack||error)});}}`;
    const url = URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
    const worker = new Worker(url);
    try {
      return await new Promise((resolve,reject) => {
        const timer = setTimeout(()=>reject(Error('Paired FAST worker timeout')),240000);
        worker.onmessage = event => {clearTimeout(timer);event.data.error ? reject(Error(event.data.error)) : resolve(event.data);};
        worker.onerror = event => {clearTimeout(timer);reject(Error(event.message));};
        worker.postMessage({base:location.origin,pins});
      });
    } finally {worker.terminate();URL.revokeObjectURL(url);}
  }, {body:measure.toString(), pins});
  const report = {status:'PAIRED_NODE_CHROMIUM_MEASUREMENTS',
    sourceSha256:sha(source), fixtureSha256:sha(fixtureBytes),
    artifacts:artifacts.map((artifact,index)=>({artifactSha256:sha(artifactBytes[index]),
      moduleSha256:artifact.module_sha256,moduleBytes:artifact.module_bytes.length})),
    node:{version:`${process.version} / V8 ${process.versions.v8}`,...node},
    chromium:{version:browser.version(),...chromiumResult},
    scope:'Same full 160x90 Modelica FAST source, four finite frames, alternating artifact order over three rounds. Each sample calls compiled SolveIR WASM; copy samples also set the F64 input. Numerical acceptance is separate. No GPU readback, sensor rendering, selection, localization, mapping or loop closure; headless math-only Chromium. This is not end-to-end realtime throughput.'};
  fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,node:report.node.version,chromium:report.chromium.version,
    artifacts:report.artifacts}));
} catch(error) {
  fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify({status:'FAIL',error:String(error.stack||error)},null,2)+'\n');
  throw error;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve=>server.close(resolve));
}
