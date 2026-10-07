// Review gate for the complete source-issued 15+6 filter transaction.
// The browser carries actual returned state; only the offline fixtures do math.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const [artifactFile, fixtureFile, reportFile] = process.argv.slice(2);
if (!reportFile) throw new Error('Expected ARTIFACT INDEPENDENT_FIXTURES REPORT');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const names = ['RGBDRelativePose', 'SPD6Solve', 'ES15PoseCorrection', 'SchmidtRelativePoseCorrection',
  'ES15NominalPrediction', 'ES15Dynamics', 'ES15CovariancePrediction', 'SchmidtReferenceState'];
const source = names.map(name => fs.readFileSync(`models/${name}.mo`, 'utf8')).join('');
const artifactBytes = fs.readFileSync(artifactFile), fixtureBytes = fs.readFileSync(fixtureFile);
const artifact = JSON.parse(artifactBytes), fixtures = JSON.parse(fixtureBytes);
const cases = fixtures.groups?.ES15SchmidtReferenceStep;
if (fixtures.schemaVersion !== 1 || fixtures.augmentedDimension !== 21 || cases?.length !== 20
  || JSON.stringify(fixtures.sourceComponents) !== JSON.stringify(names)
  || fixtures.sourceSha256 !== sha(source) || artifact.source_sha256 !== sha(source)
  || artifact.model_name !== 'ES15SchmidtReferenceStep'
  || sha(new Uint8Array(artifact.module_bytes)) !== artifact.module_sha256)
  throw new Error('Full transaction fixture/source/module identity mismatch');
// These labels identify the fixture branches, rather than treating independent
// outlier/replacement trials as one physically continuous trajectory.
for (const [index, label] of [[2, 'initial creation snapshots predicted current covariance'],
  [14, 'persistent frozen-reference transaction11'],
  [15, 'replacement refreezes after prediction without zeroing common uncertainty'],
  [16, 'relative correction consumes images and refuses same-frame replacement'],
  [17, 'innovation rejection still consumes the disjoint image pair'],
  [18, 'malformed epoch blocks visual update and replacement but preserves valid IMU prediction'],
  [19, 'used reference cannot correct again; fresh frame14 may become next reference']])
  if (cases[index].label !== label) throw new Error(`Unexpected fixture branch ${index}`);
const bundle = await build({stdin: {contents: "export {NativeProgram} from './src/modelica-native-program';",
  resolveDir: process.cwd()}, bundle: true, format: 'esm', platform: 'browser', write: false});
const server = createServer((request, response) => {
  if (request.url === '/consumer.js') {
    response.setHeader('Content-Type', 'text/javascript'); response.end(bundle.outputFiles[0].contents);
  } else if (request.url === '/') {
    response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Modelica filter lifecycle review</title>');
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
    const fields = ['position', 'velocity', 'rotation', 'accelBias', 'gyroBias', 'covariance',
      'crossCovariance', 'referenceCovariance', 'referencePosition', 'referenceRotation',
      'referenceAvailable', 'referenceEpoch', 'referenceUsed', 'lastUsedEpoch'];
    const outputName = name => `next${name[0].toUpperCase()}${name.slice(1)}`;
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('modelica-schmidt-reference-review', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('projects');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const load = () => new Promise((resolve, reject) => {
      const request = db.transaction('projects').objectStore('projects').get('filter');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const save = value => new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite'); tx.objectStore('projects').put(value, 'filter');
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
    try {
      const saved = data.reload ? await load() : undefined;
      if (data.reload) require(saved, 'Missing persisted source/artifact/full filter state');
      const issued = saved ?? data;
      const program = await NativeProgram.instantiate(issued.artifact, issued.source), abi = issued.artifact.abi;
      for (const [name, count] of [['covariance', 225], ['crossCovariance', 90], ['referenceCovariance', 36]])
        require(program.input(name).length === count && program.output(outputName(name)).length === count,
          `Reduced ${name} capacity`);
      let checks = 0, maximumError = 0, carriedCells = 0, lastInputs, lastOutputs;
      const outputFields = [...new Set([...fields.map(outputName), ...data.cases.flatMap(c => Object.keys(c.expected))])];
      const snapshot = () => Object.fromEntries(outputFields.map(name => [name, [...program.output(name)]]));
      const state = () => Object.fromEntries(fields.map(name => [name, [...program.output(outputName(name))]]));
      const exact = expected => {
        for (const [name, values] of Object.entries(expected)) {
          const actual = program.output(name);
          require(actual.length === values.length && values.every((value, index) => Object.is(value, actual[index])),
            `${name}: replay differs`);
        }
      };
      const put = inputs => {
        program.reset();
        for (const [name, values] of Object.entries(inputs)) {
          const target = program.input(name); require(target.length === values.length, `${name}: input shape`);
          target.set(values.map(decode));
        }
      };
      const evaluate = (time, label) => {
        const before = new Uint8Array(program.memory.buffer, abi.p_offset, abi.p_count * 8).slice();
        program.evaluate(time);
        require(new Uint8Array(program.memory.buffer, abi.p_offset, abi.p_count * 8)
          .every((value, cell) => value === before[cell]), `${label}: inputs modified`);
      };
      if (saved) {
        put(saved.inputs); evaluate(saved.time, 'IndexedDB replay'); exact(saved.outputs);
        require(JSON.stringify(state()) === JSON.stringify(saved.state), 'Persisted state differs after replay');
        lastInputs = saved.inputs; lastOutputs = saved.outputs;
      }
      let carried = saved?.state, checkpoint, corrected, lastTime = saved?.time ?? 0;
      const reports = [];
      for (let index = data.start; index < data.end; index++) {
        const item = data.cases[index];
        const previous = index >= 3 && index <= 15 ? carried
          : index >= 16 && index <= 18 ? checkpoint : index === 19 ? corrected : undefined;
        if (index >= 3) require(previous, `Missing actual predecessor state at case ${index}`);
        const inputs = structuredClone(item.inputs);
        if (previous) for (const name of fields) {
          const expected = inputs[name], actual = previous[name];
          require(expected?.length === actual?.length, `${index}/${name}: predecessor shape`);
          expected.forEach((encoded, cell) => {
            const error = Math.abs(actual[cell] - decode(encoded));
            require(Number.isFinite(actual[cell]) && error <= 2e-7, `${index}/${name}/${cell}: fixture lineage differs`);
            carriedCells++;
          });
          inputs[name] = actual; // Use WASM output, never the oracle predecessor.
        }
        put(inputs);
        const time = index / 90; evaluate(time, item.label);
        for (const [name, expected] of Object.entries(item.expected)) {
          const actual = program.output(name);
          require(actual.length === expected.values.length && expected.tolerance >= 0, `${item.label}/${name}: output shape`);
          expected.values.forEach((encoded, cell) => {
            const wanted = decode(encoded), value = actual[cell]; checks++;
            if (!Number.isFinite(wanted)) require(Object.is(value, wanted), `${item.label}/${name}/${cell}: nonfinite mismatch`);
            else {
              const error = Math.abs(value - wanted); maximumError = Math.max(maximumError, error);
              require(Number.isFinite(value) && error <= expected.tolerance, `${item.label}/${name}/${cell}: ${value} != ${wanted}`);
            }
          });
        }
        carried = state();
        if (index === 14) checkpoint = structuredClone(carried);
        if (index === 16) corrected = structuredClone(carried);
        lastInputs = inputs; lastOutputs = snapshot(); lastTime = time;
        reports.push({index, label: item.label, carriedPredecessor: Boolean(previous),
          predictionAccepted: program.output('predictionAccepted')[0],
          observationAccepted: program.output('observationAccepted')[0],
          captureAccepted: program.output('captureAccepted')[0]});
      }
      require(lastInputs && lastOutputs && carried, 'No evaluated or persisted state');
      await save({source: issued.source, artifact: issued.artifact, inputs: lastInputs, outputs: lastOutputs,
        state: carried, time: lastTime});
      put(lastInputs); evaluate(lastTime, 'Reset replay'); exact(lastOutputs);
      let staleSourceRefused = false;
      try { await NativeProgram.instantiate(issued.artifact, issued.source + '\n// source edit'); }
      catch (error) { staleSourceRefused = String(error).includes('does not match its source'); }
      require(staleSourceRefused, 'Stale source/module pair accepted');
      return {cases: reports, checks, maximumError, carriedCells, indexedDbReload: Boolean(saved),
        resetReplay: true, inputsReadonly: true, staleSourceRefused};
    } finally { db.close(); }
  };
  const invoke = payload => page.evaluate(async ({body, payload}) => {
    const url = URL.createObjectURL(new Blob([`const run=${body};onmessage=async e=>{try{postMessage({result:await run(e.data)})}catch(error){postMessage({error:String(error.stack||error)})}}`], {type: 'text/javascript'}));
    const worker = new Worker(url);
    try {
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Full filter lifecycle worker timed out')), 45000);
        worker.onmessage = ({data}) => { clearTimeout(timer); data.error ? reject(new Error(data.error)) : resolve(data.result); };
        worker.onerror = error => { clearTimeout(timer); reject(new Error(error.message)); };
        worker.postMessage({...payload, base: location.origin});
      });
    } finally { worker.terminate(); URL.revokeObjectURL(url); }
  }, {body: run.toString(), payload});
  const first = await invoke({artifact, source, cases, start: 0, end: 9});
  await page.reload();
  const second = await invoke({cases, reload: true, start: 9, end: 20});
  await page.reload();
  const final = await invoke({cases, reload: true, start: 20, end: 20});
  const report = {status: 'FULL21_REFERENCE_TRANSACTION_CHROMIUM_WORKER_PASS', recordedAt: new Date().toISOString(),
    browser: browser.version(), sourceSha256: sha(source), artifactSha256: sha(artifactBytes),
    moduleSha256: artifact.module_sha256, moduleBytes: artifact.module_bytes.length,
    fixtureSha256: sha(fixtureBytes), probeSha256: sha(fs.readFileSync(import.meta.filename)),
    consumerBundleSha256: sha(bundle.outputFiles[0].contents), cases: [...first.cases, ...second.cases],
    checks: first.checks + second.checks, maximumError: Math.max(first.maximumError, second.maximumError),
    carriedCells: first.carriedCells + second.carriedCells,
    indexedDbReloads: [second.indexedDbReload, final.indexedDbReload],
    inputsReadonly: first.inputsReadonly && second.inputsReadonly,
    resetReplay: first.resetReplay && second.resetReplay && final.resetReplay,
    staleSourceRefused: first.staleSourceRefused && second.staleSourceRefused && final.staleSourceRefused,
    dimension: 21, covarianceCells: 225, crossCovarianceCells: 90, referenceCovarianceCells: 36,
    runtimeIntegrated: false, productionPinChanged: false, fullSlam: false,
    scope: 'Complete precompiled Modelica transaction with 20 independent expectations and actual returned state carried across the coherent prediction/capture chain, branched visual trials, and accepted-correction-to-fresh-reference chain. Two page/worker reloads restore source, artifact and complete state from IndexedDB. Stale-source digest mismatch is refused; edited-source compilation is a separate gate. No browser source compilation, live camera/IMU frontend, mapping, loop closure or performance claim.'};
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report));
} catch (error) {
  fs.writeFileSync(reportFile, JSON.stringify({status: 'FAIL', error: String(error.stack || error),
    sourceSha256: sha(source), artifactSha256: sha(artifactBytes), fixtureSha256: sha(fixtureBytes),
    probeSha256: sha(fs.readFileSync(import.meta.filename)), fullSlam: false}, null, 2) + '\n');
  throw error;
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
