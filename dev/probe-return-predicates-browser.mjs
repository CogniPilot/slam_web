// Execute a Rust-issued SolveIR module in a browser worker without an HTTP server.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';

const [fixturePath, reportPath] = process.argv.slice(2);
if (!reportPath) throw new Error('FIXTURE REPORT required');
const bytes = fs.readFileSync(fixturePath);
const {source, artifact, gatherScope = 'callee', guarded = false} = JSON.parse(bytes);
if (!['callee', 'call-actual'].includes(gatherScope) || typeof guarded !== 'boolean') {
  throw new Error('Invalid gather fixture scope');
}
const sha = value => createHash('sha256').update(value).digest('hex');
if (sha(source) !== artifact.source_sha256) throw new Error('Source digest mismatch');
if (sha(Buffer.from(artifact.module_bytes)) !== artifact.module_sha256) {
  throw new Error('Module digest mismatch');
}
if (artifact.profile !== 'native-direct-program-f64-v3' ||
    artifact.abi.result !== 'status:i32' || artifact.abi.transactional_y !== true) {
  throw new Error('Checked transactional SolveIR WASM ABI required');
}

async function run({artifact, gatherScope, guarded}) {
  const require = (condition, message) => { if (!condition) throw new Error(message); };
  const memory = new WebAssembly.Memory({initial: artifact.abi.memory_pages});
  const {instance} = await WebAssembly.instantiate(Uint8Array.from(artifact.module_bytes), {
    env: {memory, pow: Math.pow, abs: Math.abs},
  });
  const parameters = new Float64Array(memory.buffer, artifact.abi.p_offset, artifact.abi.p_count);
  parameters.set(artifact.parameters);
  const outputs = new Float64Array(memory.buffer, 0, artifact.abi.y_count);
  const slot = (name, storage) => {
    const binding = artifact.var_layout.bindings[name]?.[storage];
    require(Number.isInteger(binding?.index), `Missing ${storage} binding: ${name}`);
    return binding.index;
  };
  const first = slot('first', 'P'), sample = slot('samples', 'P');
  const index = slot('k', 'P'), result = slot('result', 'Y');
  const inputBytes = () => new Uint8Array(memory.buffer, parameters.byteOffset, parameters.byteLength);
  const outputBytes = () => new Uint8Array(memory.buffer, 0, outputs.byteLength);
  const observations = [];
  const actual = gatherScope === 'call-actual';
  const earlyReturn = actual && !guarded ? null : 1;
  const cases = [
    [1, 5, 2, earlyReturn], [0, 5, 1, 2], [0, -5, 1, 3], [1, -5, 2, earlyReturn],
    [0, 5, 2, null], [1, 5, actual ? 1 : 2, 1],
  ];
  if (actual) cases.push([0, 5, 0, null], [0, 5, 3, null], [0, 5, 1.5, null],
    [0, 5, NaN, null], [0, 5, Infinity, null], [0, 5, 1, 2]);
  for (const [flag, value, k, expected] of cases) {
    parameters[first] = flag; parameters[sample] = value; parameters[index] = k;
    const beforeInput = inputBytes().slice(), beforeOutput = outputBytes().slice();
    const status = instance.exports.eval_assignments(0, artifact.abi.p_offset, 0,
      artifact.abi.scratch_offset ?? 0, 0);
    require(inputBytes().every((v, i) => v === beforeInput[i]), 'Input mutation');
    if (expected === null) {
      require(status !== 0, 'Active invalid gather must report failure');
      const fault = artifact.faults.find(fault => fault.status === status);
      const kind = !Number.isFinite(k) || !Number.isInteger(k) ? 'IntegerConversion' : 'IndexBounds';
      const opcode = actual ? 'LoadIndexedRegister' : 'project_element_dynamic';
      require(fault?.kind === kind && fault.opcode === opcode,
        'Selected failure must identify the checked gather');
      require(outputBytes().every((v, i) => v === beforeOutput[i]), 'Failed output commit');
    } else {
      require(status === 0, 'Valid or inactive-gather invocation failed');
      require(outputs[result] === expected, 'Wrong return value');
    }
    observations.push({flag, sample: value, index: Number.isFinite(k) ? k : String(k),
      status, result: outputs[result]});
  }
  return {observations, inputBytesImmutable: true, failedOutputCommitPrevented: true,
    inactiveGatherSkipped: !actual || guarded, selectedGatherFaultRetained: true,
    callActualFaultBeforeEarlyReturn: actual && !guarded, recoveryVerified: true};
}

const browser = await chromium.launch({headless: true,
  executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox']});
try {
  const page = await browser.newPage();
  const result = await page.evaluate(async ({body, fixture}) => {
    const blob = new Blob([`const run=${body};onmessage=async e=>{try{
      postMessage({result:await run(e.data)})}catch(error){postMessage({error:String(error.stack)})}}`],
    {type: 'text/javascript'});
    const url = URL.createObjectURL(blob), worker = new Worker(url);
    try {
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Return predicate worker timeout')), 10000);
        worker.onmessage = ({data}) => {
          clearTimeout(timer); data.error ? reject(new Error(data.error)) : resolve(data.result);
        };
        worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message)); };
        worker.postMessage(fixture);
      });
    } finally { worker.terminate(); URL.revokeObjectURL(url); }
  }, {body: run.toString(), fixture: {artifact, gatherScope, guarded}});
  const report = {status: 'SOLVEIR_RETURN_PREDICATES_BROWSER_PASS',
    recordedAt: new Date().toISOString(), browser: browser.version(),
    sourceSha256: sha(source), moduleSha256: artifact.module_sha256,
    fixtureSha256: sha(bytes), probeSha256: sha(fs.readFileSync(import.meta.filename)),
    moduleBytes: artifact.module_bytes.length, gatherScope, guarded, ...result,
    scope: `${result.observations.length} invocations of one source-issued module in an about:blank Blob worker; no HTTP server.`,
    browserCompilerPromoted: false, connectedLocalizationIssued: false, fullSlam: false};
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
