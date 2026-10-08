// Run each phase in a separate bounded Node24 process under an external timeout.
// Arguments: PACKAGE_DIRECTORY SOURCE_FILE MODEL PHASE [OUTPUT_FILE]
// Optional RUMOCA_CPU_PROFILE records the first15s via an inspector worker while
// the main thread is inside synchronous WASM. PHASE is check/compile/lower/program/native/gpu/session.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {Worker} from 'node:worker_threads';

const [packageDirectory, sourceFile, model, phase, output] = process.argv.slice(2);
if (!packageDirectory || !sourceFile || !model || !phase) {
  throw new Error('Usage: node rumoca-phase-probe.mjs PACKAGE_DIRECTORY SOURCE_FILE MODEL PHASE [OUTPUT_FILE]');
}
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const source = fs.readFileSync(sourceFile, 'utf8');
const bytes = fs.readFileSync(path.join(packageDirectory, 'rumoca_bind_wasm_bg.wasm'));
const compiler = await import(pathToFileURL(path.resolve(packageDirectory, 'rumoca_bind_wasm.js')));
const wasm = await compiler.default({module_or_path: bytes});
const provenance = {phase, model, pid:process.pid, sourceSha256: sha(source), compilerSha256: sha(bytes), compilerRevision: compiler.get_git_commit()};
const report = (event, extra = {}) => console.log(JSON.stringify({event, ...provenance,
  monotonicSeconds:Number(process.hrtime.bigint())/1e9,
  rssBytes: process.memoryUsage().rss, wasmMemoryBytes: wasm.memory?.buffer.byteLength, ...extra}));
let profilingWorker;
let profileFinished;
if (process.env.RUMOCA_CPU_PROFILE) {
  profilingWorker = new Worker(new URL('./rumoca-profile-worker.mjs', import.meta.url), {
    workerData: {output: process.env.RUMOCA_CPU_PROFILE},
  });
  profileFinished = new Promise((resolve, reject) => {
    profilingWorker.once('exit', code => code ? reject(new Error(`Profiler exited${code}`)) : resolve());
    profilingWorker.once('error', reject);
  });
  await new Promise(resolve => profilingWorker.once('message', resolve));
}
report('start');
const start = performance.now();
try {
  let result;
  if (phase === 'check') result = compiler.compile_check_with_source_roots(source, model, '{}');
  else if (phase === 'compile') result = compiler.compile(source, model);
  else if (phase === 'lower') result = compiler.lower_model_to_solve_json(source, model, .1, .1, '{}');
  else if (phase === 'program') result = compiler.prepare_native_program(source, model);
  else if (phase === 'native') result = compiler.prepare_native_assignments(source, model);
  else if (phase === 'gpu') result = compiler.prepare_gpu_simulation(source, model);
  else if (phase === 'session') {
    const session = compiler.WasmSimulationSession.withInteractiveOptions(source, model, .1, 'rk-like', 1e-12, 1e-12, '[]');
    try {
      report('session_created', {elapsedMs: performance.now() - start});
      result = session.state_json();
    } finally { session.free(); }
  } else throw new Error(`Unknown phase${phase}`);
  if (output) fs.writeFileSync(output, typeof result === 'string' ? result : JSON.stringify(result));
  report('success', {elapsedMs: performance.now() - start, resultBytes: typeof result === 'string' ? Buffer.byteLength(result) : 0});
} catch (error) {
  report('error', {elapsedMs: performance.now() - start, error: String(error),
    errorStack:error instanceof Error ? error.stack : undefined});
  process.exitCode = 1;
} finally {
  if (profilingWorker) { profilingWorker.postMessage('stop'); await profileFinished; }
}
