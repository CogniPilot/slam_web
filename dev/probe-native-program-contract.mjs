// Execute an actual compiler-issued native72/v3 artifact and strict loader controls.
// This probes the executable contract, not detector throughput or complete SLAM.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const [artifactFile, directory] = process.argv.slice(2);
if (!directory) throw Error('Expected ACTUAL_NATIVE_ARTIFACT OUTPUT_DIRECTORY');
fs.mkdirSync(directory, {recursive: true});
const sourceFile = 'tests/compiler-probes/fixtures/native-program-contract.mo';
const source = fs.readFileSync(sourceFile, 'utf8'), raw = fs.readFileSync(artifactFile);
const artifact = JSON.parse(raw), sha = bytes => createHash('sha256').update(bytes).digest('hex');
if (artifact.model_name !== 'NativeProgramContract' || artifact.solve_schema_version !== 72
  || artifact.profile !== 'native-direct-program-f64-v3' || artifact.source_sha256 !== sha(source)
  || artifact.module_sha256 !== sha(Buffer.from(artifact.module_bytes))) throw Error('Issued contract identity mismatch');
const bundle = await build({stdin: {contents: "export {NativeProgram} from './src/modelica-native-program';",
  resolveDir: process.cwd()}, bundle: true, format: 'esm', platform: 'neutral', write: false});
const consumer = path.join(directory, 'consumer.mjs'); fs.writeFileSync(consumer, bundle.outputFiles[0].contents);
const {NativeProgram} = await import(pathToFileURL(path.resolve(consumer)));

const verify = async (NativeProgram, artifact, source) => {
  const require = (ok, message) => { if (!ok) throw Error(message); };
  const p = await NativeProgram.instantiate(artifact, source), a = artifact.abi;
  const input = p.input('value'), output = p.output('result');
  require(input.length === 1 && output.length === 1, 'Complete source interface');
  let numeric = 0;
  // Independent exact results for the original Modelica expression.
  for (const [value, expected] of [[-4, -1.75], [0, .25], [-0, .25], [1, .75],
    [2, 1.25], [-2, -.75], [Infinity, Infinity], [-Infinity, -Infinity], [NaN, NaN]]) {
    input[0] = value;
    const before = new Uint8Array(input.buffer, input.byteOffset, input.byteLength).slice();
    p.evaluate(numeric / 90);
    require(Object.is(output[0], expected), `Source execution ${value}`);
    require(new Uint8Array(input.buffer, input.byteOffset, input.byteLength).every((v, i) => v === before[i]), 'Readonly P');
    numeric++;
  }
  new DataView(input.buffer).setBigUint64(input.byteOffset, 0xfff8000000001234n, true);
  const payload = new Uint8Array(input.buffer, input.byteOffset, input.byteLength).slice();
  p.evaluate(1); require(Number.isNaN(output[0]), 'IEEE NaN classification');
  require(new Uint8Array(input.buffer, input.byteOffset, input.byteLength).every((v, i) => v === payload[i]), 'Raw input payload retained');
  const before = new Uint8Array(p.memory.buffer).slice();
  const faults = [[a.y_offset, a.p_offset, 1, a.p_offset, 0, 1],
    [1, a.p_offset, 1, a.scratch_offset, 0, 1],
    [a.y_offset, a.p_offset, 1, a.scratch_offset, 1, 1]];
  for (const [y, parameters, time, scratch, reserved, status] of faults) {
    require(p.execute(y, parameters, time, scratch, reserved) === status, 'Declared ABI fault');
    require(new Uint8Array(p.memory.buffer).every((v, i) => v === before[i]), 'Whole-memory fault atomicity');
  }
  let refusedTime = false;
  // Finite simulation timestamps are a loader precondition. This source never
  // reads time, so an unused WASM time argument has no source-level NaN fault.
  try { p.evaluate(NaN); } catch (error) { refusedTime = String(error).includes('finite simulation timestamp'); }
  require(refusedTime && new Uint8Array(p.memory.buffer).every((v, i) => v === before[i]), 'Atomic host timestamp rejection');
  p.reset(); p.evaluate(0); require(output[0] === -1.75, 'Reset/recovery');
  const controls = [
    ...[0, 69, 71, 73].map(version => [a => { a.solve_schema_version = version; }, 'Unsupported native Modelica program']),
    ...['native-direct-program-f64-v1', 'native-direct-program-f64-v2'].map(profile => [a => { a.profile = profile; }, 'Unsupported native Modelica program']),
    [a => { a.abi.memory_shared = true; }, 'ABI'],
    [a => { a.abi.arguments[2] = 'time:f32'; }, 'ABI'],
    [a => { a.abi.scratch_offset = a.abi.p_offset; }, 'scratch ABI'],
    [a => { a.abi.transactional_y = false; }, 'scratch ABI'],
    [a => { a.var_layout.bindings.value.P.byte_offset = 4; }, 'binding'],
    [a => { a.var_layout.shapes.value = [-1]; }, 'shape'],
    [a => { a.parameters = []; }, 'layout'],
    [a => { a.faults[1].status = 1; }, 'fault inventory'],
    [a => { a.faults[2].provenance.end = a.faults[2].provenance.start - 1; }, 'fault provenance'],
    [a => { a.math_imports = ['pow']; }, 'declared inventory'],
    [a => { a.module_bytes[0] ^= 1; }, 'module digest mismatch'],
  ];
  for (const [edit, message] of controls) {
    const changed = structuredClone(artifact); edit(changed); let refused = false;
    try { await NativeProgram.instantiate(changed, source); } catch (error) { refused = String(error).includes(message); }
    require(refused, `Strict contract rejection: ${message}`);
  }
  let stale = false;
  try { await NativeProgram.instantiate(artifact, source + '\n// edited'); }
  catch (error) { stale = String(error).includes('does not match its source'); }
  require(stale, 'Source identity rejection');
  return {numericChecks: numeric, rawPayload: true, compilerFaults: faults.length,
    metadataRefusals: controls.length, staleSource: true, atomicity: true, reset: true};
};

let server, browser;
try {
  const node = await verify(NativeProgram, artifact, source);
  server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/consumer.mjs' ? 'text/javascript' : 'text/html');
    response.end(request.url === '/consumer.mjs' ? bundle.outputFiles[0].contents : '<!doctype html><title>Native Modelica ABI review</title>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH,
    args: ['--no-sandbox', '--disable-gpu']});
  const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}`);
  const chromiumResult = await page.evaluate(async ({body, source, artifact}) => {
    const workerSource = `const verify=${body};onmessage=async e=>{try{const {NativeProgram}=await import(e.data.base+'/consumer.mjs');postMessage({result:await verify(NativeProgram,e.data.artifact,e.data.source)})}catch(error){postMessage({error:String(error.stack||error)})}}`;
    const url = URL.createObjectURL(new Blob([workerSource], {type: 'text/javascript'})), worker = new Worker(url);
    try {
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Contract worker timeout')), 30000);
        worker.onmessage = ({data}) => { clearTimeout(timer); data.error ? reject(Error(data.error)) : resolve(data.result); };
        worker.onerror = error => { clearTimeout(timer); reject(Error(error.message)); };
        worker.postMessage({base: location.origin, source, artifact});
      });
    } finally { worker.terminate(); URL.revokeObjectURL(url); }
  }, {body: verify.toString(), source, artifact});
  const report = {status: 'ACTUAL_NATIVE72_V3_NODE_CHROMIUM_CONTRACT_PASS', sourceSha256: sha(source),
    artifactSha256: sha(raw), moduleSha256: artifact.module_sha256, moduleBytes: artifact.module_bytes.length,
    compiler: artifact.compiler, schema: artifact.solve_schema_version, profile: artifact.profile,
    consumerBundleSha256: sha(bundle.outputFiles[0].contents), probeSha256: sha(fs.readFileSync(import.meta.filename)),
    node: {version: process.version, results: node}, browser: {version: browser.version(), results: chromiumResult},
    scope: 'Actual compiler-issued source and unchanged native72/v3 ABI. Loader/math/fault checks; no Solve wire compatibility, compiler-WASM package, detector, fullSLAM or throughput claim.', productionPinChanged: false};
  fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} catch (error) {
  fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify({status: 'FAIL', error: String(error.stack || error)}, null, 2) + '\n');
  throw error;
} finally { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }
