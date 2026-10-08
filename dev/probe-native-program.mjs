// Read-only, compiler-issued whole-model admission. Run under the bounded runner.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const [directory, sourceFile, model, reportFile] = process.argv.slice(2);
if (!reportFile) throw new Error('COMPILER_DIRECTORY SOURCE MODEL REPORT required');
const sha = value => createHash('sha256').update(value).digest('hex');
const source = fs.readFileSync(sourceFile, 'utf8');
const wasm = fs.readFileSync(path.join(directory, 'rumoca_bind_wasm_bg.wasm'));
const report = {status: 'RUNNING', recordedAt: new Date().toISOString(), model,
  sourceSha256: sha(source), compilerWasmSha256: sha(wasm),
  nativeAdmitted: false, numericallyVerified: false, runtimeIntegrated: false,
  productionPinChanged: false};
const save = () => fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
save();
const compiler = await import(pathToFileURL(path.resolve(directory, 'rumoca_bind_wasm.js')).href);
const instance = await compiler.default({module_or_path: wasm});
report.panicHookInitialized = typeof compiler.init === 'function';
if (report.panicHookInitialized) compiler.init();
report.compiler = {version: compiler.get_version(), revision: compiler.get_git_commit()};
report.compilerMemoryBeforeBytes = instance.memory?.buffer.byteLength;
save();
const start = performance.now();
report.prepareMonotonicStartSeconds = Number(process.hrtime.bigint()) / 1e9;
save();
try {
  if (typeof compiler.prepare_native_program !== 'function')
    throw new Error('Compiler lacks prepare_native_program');
  const raw = compiler.prepare_native_program(source, model);
  fs.writeFileSync(reportFile + '.artifact.json', raw);
  const result = JSON.parse(raw);
  if (result.error || result.errors) throw new Error(JSON.stringify(result.error ?? result.errors));
  if (!result.module_bytes?.length) throw new Error('Compiler returned no executable');
  report.status = 'NATIVE_PREPARED';
  report.nativeAdmitted = true;
  report.artifact = {profile: result.profile, sourceSha256: result.source_sha256,
    moduleSha256: result.module_sha256, moduleBytes: result.module_bytes.length,
    abi: result.abi, stages: result.issued_schedule.length};
} catch (error) {
  report.status = 'REFUSED';
  report.refusal = String(error);
  report.refusalStack = error instanceof Error ? error.stack : undefined;
} finally {
  report.prepareMonotonicEndSeconds = Number(process.hrtime.bigint()) / 1e9;
  report.compilerMemoryAfterBytes = instance.memory?.buffer.byteLength;
  report.elapsedMs = performance.now() - start;
  save();
  console.log(JSON.stringify(report));
}
