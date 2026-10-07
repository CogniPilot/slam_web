// A static-file browser test: the worker fetches the issued artifact directly,
// avoiding large artifact copies through the browser automation protocol.
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const [artifactPath, sourcePath, reportPath] = process.argv.slice(2);
if (!artifactPath || !sourcePath || !reportPath) {
  throw Error('Usage: node dev/probe-native-descriptor-browser.mjs artifact.json source.mo report.json');
}
const sha = value => createHash('sha256').update(value).digest('hex');
const consumerPath = 'src/modelica-native-program.ts';
const consumerSource = fs.readFileSync(consumerPath);
const source = fs.readFileSync(sourcePath);
const bundles = await build({entryPoints: {consumer: consumerPath,
  fixtures: 'tests/compiler-probes/rgbd-descriptor-frame-fixtures.ts'},
  bundle: true, platform: 'browser', format: 'esm', outdir: 'unused', write: false});
const scripts = new Map(bundles.outputFiles.map(file => [`/${path.basename(file.path)}`, file.contents]));
const hash = createHash('sha256');
for await (const chunk of fs.createReadStream(artifactPath)) hash.update(chunk);
const artifactSha256 = hash.digest('hex');
let browser;
const server = createServer((request, response) => {
  if (request.url === '/artifact.json') {
    response.setHeader('Content-Type', 'application/json');
    fs.createReadStream(artifactPath).pipe(response);
  } else if (request.url === '/source.mo') {
    response.setHeader('Content-Type', 'text/plain');
    response.end(source);
  } else if (scripts.has(request.url)) {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(scripts.get(request.url));
  } else if (request.url === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><title>Compiler-issued descriptor WASM</title>');
  } else {
    response.writeHead(404).end();
  }
});
async function inWorker({base}) {
  const [{NativeProgram}, {rawDescriptorFixture, rawDescriptorOracle}, source, artifact] = await Promise.all([
    import(base + '/consumer.js'), import(base + '/fixtures.js'),
    fetch(base + '/source.mo').then(response => response.text()),
    fetch(base + '/artifact.json').then(response => response.json()),
  ]);
  const started = performance.now();
  const program = await NativeProgram.instantiate(artifact, source);
  const admissionMs = performance.now() - started;
  const [height, width, channels] = artifact.var_layout.shapes.rgb;
  if (height !== 480 || width !== 848 || channels !== 3) throw Error('D435 dimensions');
  const fixture = rawDescriptorFixture(height, width, channels);
  fixture.depthUnits = .001;
  fixture.depth.forEach(row => row.forEach((value, column) => { row[column] = Math.round(value * 1000); }));
  const memory = program.memory.buffer;
  const inputBytes = new Uint8Array(memory, artifact.abi.p_offset, artifact.abi.p_count * 8);
  const cases = [];
  for (let frame = 0; frame < 5; frame++) {
    fixture.activeCount = frame === 2 ? 0 : 350;
    fixture.imageEnabled = frame !== 3;
    fixture.rgb[5][5][0] = frame === 3 ? NaN : frame * 7;
    fixture.depth[0][0] = frame === 3 ? NaN : 2000 + frame;
    if (frame === 4) program.reset();
    program.booleanInput('imageEnabled')[0] = Number(fixture.imageEnabled);
    for (const [name, values] of [
      ['rgb', fixture.rgb.flat(2)], ['depth', fixture.depth.flat()], ['pixels', fixture.pixels.flat()],
      ['rgbCalibration', fixture.rgbCalibration], ['depthCalibration', fixture.depthCalibration],
      ['depthUnits', [fixture.depthUnits]], ['activeCount', [fixture.activeCount]],
      ['disparityNoise', [fixture.disparityNoise]], ['noiseReferenceFx', [fixture.noiseReferenceFx]], ['baseline', [fixture.baseline]],
    ]) program.input(name).set(values);
    const expected = rawDescriptorOracle(fixture), before = inputBytes.slice();
    const typedBefore = program.booleanInput('imageEnabled')[0];
    const start = performance.now();
    program.evaluate(frame / 90);
    const executeMs = performance.now() - start;
    let checked = 0;
    for (const [name, values] of [
      ['descriptor', expected.descriptor.flat()], ['point', expected.point.flat()],
      ['enabled', expected.enabled], ['invalidCount', [expected.invalidCount]],
    ]) {
      const actual = program.output(name);
      if (actual.length !== values.length) throw Error(name + ' shape');
      for (let i = 0; i < values.length; i++) {
        if (!Number.isFinite(actual[i]) || Math.abs(actual[i] - values[i]) > 2e-11) throw Error(name + '/' + i);
        checked++;
      }
    }
    if (checked !== 18551 || memory !== program.memory.buffer
        || inputBytes.some((value, i) => value !== before[i])
        || program.booleanInput('imageEnabled')[0] !== typedBefore) throw Error('Output/input memory contract');
    cases.push({frame, activeCount: fixture.activeCount, imageEnabled: fixture.imageEnabled, checked, executeMs});
  }
  return {cases, readonlyInputs: true, resetRecovery: true, admissionMs,
    compiler: artifact.compiler, moduleSha256: artifact.module_sha256, moduleBytes: artifact.module_bytes.length};
}
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH,
    args: ['--no-sandbox', '--disable-gpu']});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const result = await page.evaluate(async workerSource => {
    const code = `onmessage=async({data})=>{try{postMessage({result:await (${workerSource})(data)})}catch(error){postMessage({error:String(error.stack||error)})}}`;
    const url = URL.createObjectURL(new Blob([code], {type: 'text/javascript'}));
    const worker = new Worker(url);
    try {
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Owned descriptor worker timeout')), 90000);
        worker.onmessage = ({data}) => { clearTimeout(timer); data.error ? reject(Error(data.error)) : resolve(data.result); };
        worker.onerror = error => { clearTimeout(timer); reject(Error(error.message)); };
        worker.postMessage({base: location.origin});
      });
    } finally { worker.terminate(); URL.revokeObjectURL(url); }
  }, inWorker.toString());
  if (!fs.readFileSync(consumerPath).equals(consumerSource)
      || !fs.readFileSync(sourcePath).equals(source)) throw Error('Source changed during browser test');
  const report = {status: 'ACTUAL_D435_DESCRIPTOR_BROWSER_WORKER_PASS', browser: browser.version(), result,
    sourceSha256: sha(source), artifactSha256, consumerSha256: sha(consumerSource),
    harnessSha256: sha(fs.readFileSync(import.meta.filename)),
    staticBundleSha256: Object.fromEntries([...scripts].map(([name, bytes]) => [name, sha(bytes)])),
    scope: 'Static browser worker runs the actual 480x848 RGB3/350-feature descriptor WASM; independent numerical oracle and input immutability. No sensor/GPU ingress or full-SLAM qualification.',
    fullSlamAccepted: false, productionPinChanged: false};
  fs.mkdirSync(path.dirname(reportPath), {recursive: true});
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
