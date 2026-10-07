import {modelicaSourcePath} from '../src/modelica-source-locations.mjs';
// Execute the complete source-issued 15+6 correction in an actual browser worker.
// Independent numerical expectations are prepared offline, never in the worker.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const [artifactFile, fixtureFile, reportFile] = process.argv.slice(2);
if (!reportFile) throw new Error('Expected ARTIFACT INDEPENDENT_FIXTURES REPORT');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const source = ['RGBDRelativePose', 'SPD6Solve', 'ES15PoseCorrection', 'SchmidtRelativePoseCorrection']
  .map(name => fs.readFileSync(modelicaSourcePath(name), 'utf8')).join('');
const artifactBytes = fs.readFileSync(artifactFile), fixtureBytes = fs.readFileSync(fixtureFile);
const artifact = JSON.parse(artifactBytes), fixtures = JSON.parse(fixtureBytes);
if (fixtures.schemaVersion !== 1 || fixtures.cases?.length !== 35
  || fixtures.sourceSha256 !== sha(source) || artifact.source_sha256 !== sha(source)
  || fixtures.moduleSha256 !== artifact.module_sha256
  || sha(new Uint8Array(artifact.module_bytes)) !== artifact.module_sha256)
  throw new Error('Fixture/source/module identity or full case count mismatch');
const bundle = await build({stdin: {contents: "export {NativeProgram} from './src/modelica-native-program';",
  resolveDir: process.cwd()}, bundle: true, format: 'esm', platform: 'browser', write: false});
const server = createServer((request, response) => {
  if (request.url === '/consumer.js') {
    response.setHeader('Content-Type', 'text/javascript'); response.end(bundle.outputFiles[0].contents);
  } else if (request.url === '/') {
    response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Modelica correlated pose correction review</title>');
  } else { response.statusCode = 404; response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH,
    args: ['--no-sandbox', '--disable-gpu']});
  const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}`);
  const run = async data => {
    const {NativeProgram} = await import(`${data.base}/consumer.js`);
    const require = (ok, message) => { if (!ok) throw new Error(message); };
    const decode = value => {
      if (typeof value === 'number') return value;
      require(['NaN', 'Infinity', '-Infinity'].includes(value), 'Invalid nonfinite fixture encoding');
      return Number(value);
    };
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('modelica-schmidt-correction-review', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('projects');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const load = () => new Promise((resolve, reject) => {
      const request = db.transaction('projects').objectStore('projects').get('correction');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const save = value => new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite'); tx.objectStore('projects').put(value, 'correction');
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
    try {
      const saved = data.reload ? await load() : undefined;
      if (data.reload) require(saved, 'Missing persisted Modelica project');
      const issued = saved ?? data;
      const program = await NativeProgram.instantiate(issued.artifact, issued.source), abi = issued.artifact.abi;
      for (const [name, count] of [['covariance', 225], ['crossCovariance', 90], ['referenceCovariance', 36]])
        require(program.input(name).length === count, `Reduced ${name} capacity`);
      require(program.output('measurementJacobian').length === 126, 'Reduced 6x21 Jacobian');
      let checks = 0, maximumError = 0, lastInputs;
      const put = inputs => {
        for (const [name, values] of Object.entries(inputs)) {
          const target = program.input(name); require(target.length === values.length, `${name}: input shape`);
          target.set(values.map(decode));
        }
        lastInputs = inputs;
      };
      const evaluate = item => {
        put(item.inputs);
        const before = new Uint8Array(program.memory.buffer, abi.p_offset, abi.p_count * 8).slice();
        program.evaluate(0);
        require(new Uint8Array(program.memory.buffer, abi.p_offset, abi.p_count * 8)
          .every((value, index) => value === before[index]), `${item.label}: inputs modified`);
        for (const [name, expected] of Object.entries(item.expected)) {
          const actual = program.output(name);
          require(actual.length === expected.values.length && expected.tolerance >= 0, `${item.label}/${name}: output shape/tolerance`);
          expected.values.forEach((encoded, index) => {
            const wanted = decode(encoded), value = actual[index]; checks++;
            if (!Number.isFinite(wanted)) require(Object.is(value, wanted), `${item.label}/${name}/${index}: nonfinite mismatch`);
            else {
              const error = Math.abs(value - wanted); maximumError = Math.max(maximumError, error);
              require(Number.isFinite(value) && error <= expected.tolerance, `${item.label}/${name}/${index}: ${value} != ${wanted}`);
            }
          });
        }
      };
      const fields = Object.keys(data.fixtures.cases[data.fixtures.recoveryCase].expected);
      const snapshot = () => Object.fromEntries(fields.map(name => [name, [...program.output(name)]]));
      const exact = expected => {
        for (const [name, values] of Object.entries(expected)) {
          const actual = program.output(name);
          require(actual.length === values.length && values.every((value, index) => Object.is(value, actual[index])), `${name}: replay differs`);
        }
      };
      if (saved) { put(saved.inputs); program.evaluate(0); exact(saved.outputs); }
      const cases = [];
      for (let index = data.start; index < data.end; index++) {
        const item = data.fixtures.cases[index]; evaluate(item);
        cases.push({label: item.label, accepted: program.output('accepted')[0]});
        if (program.output('accepted')[0] === 0) evaluate(data.fixtures.cases[data.fixtures.recoveryCase]);
      }
      const outputs = snapshot();
      await save({source: issued.source, artifact: issued.artifact, inputs: lastInputs, outputs});
      program.reset(); put(lastInputs); program.evaluate(0); exact(outputs);
      let staleSourceRefused = false;
      try { await NativeProgram.instantiate(issued.artifact, issued.source + '\n// source edit'); }
      catch (error) { staleSourceRefused = String(error).includes('does not match its source'); }
      require(staleSourceRefused, 'Stale source/module pair accepted');
      return {cases, checks, maximumError, indexedDbReload: Boolean(saved), resetReplay: true,
        inputsReadonly: true, staleSourceRefused};
    } finally { db.close(); }
  };
  const invoke = payload => page.evaluate(async ({body, payload}) => {
    const url = URL.createObjectURL(new Blob([`const run=${body};onmessage=async e=>{try{postMessage({result:await run(e.data)})}catch(error){postMessage({error:String(error.stack||error)})}}`], {type: 'text/javascript'}));
    const worker = new Worker(url);
    try {
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Schmidt correction worker timed out')), 45000);
        worker.onmessage = ({data}) => { clearTimeout(timer); data.error ? reject(new Error(data.error)) : resolve(data.result); };
        worker.onerror = error => { clearTimeout(timer); reject(new Error(error.message)); };
        worker.postMessage({...payload, base: location.origin});
      });
    } finally { worker.terminate(); URL.revokeObjectURL(url); }
  }, {body: run.toString(), payload});
  const split = 18;
  const first = await invoke({artifact, source, fixtures, start: 0, end: split});
  await page.reload();
  const second = await invoke({fixtures, reload: true, start: split, end: fixtures.cases.length});
  const report = {status: 'FULL21_SOURCE_ISSUED_SCHMIDT_CHROMIUM_WORKER_PASS', recordedAt: new Date().toISOString(),
    browser: browser.version(), sourceSha256: sha(source), artifactSha256: sha(artifactBytes),
    moduleSha256: artifact.module_sha256, moduleBytes: artifact.module_bytes.length,
    fixtureSha256: sha(fixtureBytes), probeSha256: sha(fs.readFileSync(import.meta.filename)),
    consumerBundleSha256: sha(bundle.outputFiles[0].contents), cases: [...first.cases, ...second.cases],
    checks: first.checks + second.checks, maximumError: Math.max(first.maximumError, second.maximumError),
    indexedDbReload: second.indexedDbReload, inputsReadonly: first.inputsReadonly && second.inputsReadonly,
    resetReplay: first.resetReplay && second.resetReplay, staleSourceRefused: first.staleSourceRefused && second.staleSourceRefused,
    dimension: 21, covarianceCells: 225, crossCovarianceCells: 90, referenceCovarianceCells: 36,
    runtimeIntegrated: false, productionPinChanged: false, fullSlam: false,
    scope: 'Complete precompiled Modelica 15+6 Schmidt correction, 35 independent accepted/rejected cases in Chromium dedicated workers, with page/worker reload via IndexedDB. Scalar imported math remains target intrinsics. No browser compilation, sensor pipeline, persistent filter composition, feature matching, map, loop closure or performance claim.'};
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
