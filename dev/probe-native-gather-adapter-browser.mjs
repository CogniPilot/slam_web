// Exercise the actual TypeScript artifact loader in Chromium Blob workers.
// Request interception supplies a secure static origin without a server.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const [directory, reportPath] = process.argv.slice(2);
if (!directory || !reportPath) throw new Error('FIXTURE_DIRECTORY REPORT required');
const sha = value => createHash('sha256').update(value).digest('hex');
const fixtures = ['unconditional', 'guarded'].map(variant => ({
  variant,
  source: fs.readFileSync(`${directory}/${variant}.mo`, 'utf8'),
  artifact: JSON.parse(fs.readFileSync(`${directory}/${variant}-artifact.json`, 'utf8')),
}));
const bundled = await build({entryPoints: ['src/modelica-native-program.ts'], bundle: true,
  platform: 'browser', format: 'iife', globalName: 'NativeProgramProbe', write: false});
const bundle = bundled.outputFiles[0].text;

async function run({variant, source, artifact}) {
  const require = (condition, message) => { if (!condition) throw new Error(message); };
  require(isSecureContext && !!crypto.subtle, 'Secure worker WebCrypto required');
  const program = await NativeProgramProbe.NativeProgram.instantiate(artifact, source);
  const inputs = new Uint8Array(program.memory.buffer, artifact.abi.p_offset, artifact.abi.p_count * 8);
  const outputs = new Uint8Array(program.memory.buffer, 0, artifact.abi.y_count * 8);
  const observations = [];
  const cases = [[0,5,1,2], [0,-5,1,3], [0,5,0,null], [0,5,2,null],
    [0,5,1.5,null], [0,5,NaN,null], [0,5,Infinity,null],
    [1,5,2,variant === 'guarded' ? 1 : null], [1,5,1,1]];
  for (const [first, sample, index, expected] of cases) {
    program.input('first')[0] = first;
    program.input('samples')[0] = sample;
    program.input('k')[0] = index;
    program.output('result')[0] = -123;
    const beforeInput = inputs.slice(), beforeOutput = outputs.slice();
    let error;
    try { program.evaluate(0); } catch (failure) { error = String(failure); }
    require(inputs.every((v, i) => v === beforeInput[i]), 'Input bytes changed');
    if (expected === null) {
      const kind = Number.isInteger(index) ? 'IndexBounds' : 'IntegerConversion';
      require(error?.includes(kind), `Missing selected ${kind} fault: ${error}`);
      require(outputs.every((v, i) => v === beforeOutput[i]), 'Failed Y transaction published');
    } else {
      require(error === undefined, `Valid invocation failed: ${error}`);
      require(program.output('result')[0] === expected, 'Incorrect compiled result');
    }
    observations.push({first, sample, index: Number.isFinite(index) ? index : String(index),
      result: program.output('result')[0], error: error ?? null});
  }
  return {variant, observations, secureContext: true, inputBytesImmutable: true,
    failedYPublicationPrevented: true, recoveryVerified: true};
}

const browser = await chromium.launch({headless: true,
  executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox']});
try {
  const context = await browser.newContext();
  await context.route('https://rumoca-native-probe.invalid/**', route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<!doctype html><title>Native Modelica adapter probe</title>',
  }));
  const page = await context.newPage();
  await page.goto('https://rumoca-native-probe.invalid/');
  const results = [];
  for (const fixture of fixtures) results.push(await page.evaluate(async ({bundle, body, fixture}) => {
    const blob = new Blob([bundle, `\nconst run=${body};onmessage=async e=>{try{
      postMessage({result:await run(e.data)})}catch(error){postMessage({error:String(error.stack)})}}`],
    {type: 'text/javascript'});
    const url = URL.createObjectURL(blob), worker = new Worker(url);
    try {
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Native adapter worker timeout')), 10000);
        worker.onmessage = ({data}) => {
          clearTimeout(timer); data.error ? reject(new Error(data.error)) : resolve(data.result);
        };
        worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message)); };
        worker.postMessage(fixture);
      });
    } finally { worker.terminate(); URL.revokeObjectURL(url); }
  }, {bundle, body: run.toString(), fixture}));
  fs.writeFileSync(reportPath, JSON.stringify({status: 'ACTUAL_NATIVE_GATHER_ADAPTER_BROWSER_PASS',
    recordedAt: new Date().toISOString(), browser: browser.version(), serverRequired: false,
    staticOriginIntercepted: true, models: 2, invocations: results.reduce((n, r) => n + r.observations.length, 0),
    consumerSha256: sha(fs.readFileSync('src/modelica-native-program.ts')),
    sourceDigestHelperSha256: sha(fs.readFileSync('src/source-digest.ts')),
    probeSha256: sha(fs.readFileSync(import.meta.filename)), bundleSha256: sha(bundle),
    fixtures: fixtures.map(f => ({variant: f.variant, sourceSha256: sha(f.source),
      moduleSha256: f.artifact.module_sha256})), results,
    scope: 'Actual NativeProgram artifact validation, digests and compiled execution in secure Chromium Blob workers. No browser compiler rebuild, connected localization, full SLAM, sensor/rendering or throughput qualification.',
  }, null, 2) + '\n');
} finally { await browser.close(); }
