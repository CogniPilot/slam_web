// Verify package selection and failure behavior without touching public assets.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = path.join(process.env.HOME, 'scratch/slam_web/tmp/rumoca-assets-review');
const source = path.resolve('node_modules/@cognipilot/rumoca');
const names = ['rumoca_bind_wasm.js', 'rumoca_bind_wasm_bg.wasm'];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
fs.mkdirSync(root, { recursive: true });
function execute(label, args, environment = {}) {
  const destination = path.join(root, label);
  const result = spawnSync(process.execPath, ['scripts/assets.mjs', '--destination', destination, ...args], {
    encoding: 'utf8', timeout: 30000,
    env: { ...process.env, RUMOCA_WASM_PACKAGE: '', TMPDIR: root, ...environment },
  });
  fs.writeFileSync(path.join(root, label + '.log'), JSON.stringify({
    args, status: result.status, error: result.error?.message,
    stdout: result.stdout, stderr: result.stderr,
  }, null, 2) + '\n');
  return { destination, result };
}

const outputs = [];
for (const [label, args, environment] of [
  ['default', [], {}],
  ['cli', ['--rumoca-dir', source], {}],
  ['env', [], { RUMOCA_WASM_PACKAGE: source }],
]) {
  const { destination, result } = execute(label, args, environment);
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(fs.readFileSync(path.join(destination, 'compiler-manifest.json')));
  assert.equal(manifest.source, label === 'default' ? 'npm-lockfile-package' : 'explicit-local-package');
  assert.equal(manifest.files.length, 2);
  for (const record of manifest.files) {
    assert.equal(hash(fs.readFileSync(path.join(destination, record.file))), record.sha256);
    assert.equal(hash(fs.readFileSync(path.join(source, record.file))), record.sha256);
  }
  assert(!JSON.stringify(manifest).includes(process.env.HOME));
  outputs.push({ label, manifest });
}

const missing = path.join(root, 'missing-package'), invalid = path.join(root, 'invalid-package');
for (const directory of [missing, invalid]) fs.mkdirSync(directory, { recursive: true });
fs.copyFileSync(path.join(source, names[0]), path.join(missing, names[0]));
fs.copyFileSync(path.join(source, names[0]), path.join(invalid, names[0]));
fs.writeFileSync(path.join(invalid, names[1]), Buffer.from('not wasm'));
const failures = [];
for (const [label, directory] of [['missing', missing], ['invalid', invalid]]) {
  const destination = path.join(root, label);
  fs.mkdirSync(destination, { recursive: true });
  for (const name of [...names, 'compiler-manifest.json']) fs.writeFileSync(path.join(destination, name), 'preserved ' + name);
  const before = Object.fromEntries([...names, 'compiler-manifest.json'].map(name => [
    name, hash(fs.readFileSync(path.join(destination, name))),
  ]));
  const { result } = execute(label, ['--rumoca-dir', directory]);
  assert.notEqual(result.status, 0);
  for (const [name, digest] of Object.entries(before)) assert.equal(hash(fs.readFileSync(path.join(destination, name))), digest);
  failures.push({ label, status: result.status, allPriorFilesPreserved: true });
}

const archive = 'dev/artifacts/rumoca-assets-review';
fs.mkdirSync(archive, { recursive: true });
const artifacts = [];
for (const [from, name] of [
  ...['default', 'cli', 'env', 'missing', 'invalid'].map(label => [path.join(root, label + '.log'), label + '.log']),
  ['scripts/assets.mjs', 'assets.mjs'],
  [import.meta.filename, 'probe-rumoca-assets.mjs'],
]) {
  const destination = path.join(archive, name);
  fs.copyFileSync(from, destination);
  artifacts.push({ path: destination, sha256: hash(fs.readFileSync(destination)) });
}
const initialFailure = path.join(root, 'initial-empty-env-failure.log');
if (fs.existsSync(initialFailure)) {
  const destination = path.join(archive, path.basename(initialFailure));
  fs.copyFileSync(initialFailure, destination);
  artifacts.push({ path: destination, sha256: hash(fs.readFileSync(destination)) });
}
const report = {
  schemaVersion: 1, status: 'STATIC_COMPILER_PACKAGE_SELECTION_AND_FAILURE_PRESERVATION_PASS',
  recordedAt: new Date().toISOString(), scriptSha256: hash(fs.readFileSync('scripts/assets.mjs')),
  probeSha256: hash(fs.readFileSync(import.meta.filename)), engine: process.version,
  outputs, failures, artifacts,
  scope: 'Actual complete npm0.10 compiler pair staged in scratch via default, explicit CLI and environment override. Missing second file and invalid WASM reject before altering three prior output files. No compiler branch build, browser compatibility, production assets change or fullSLAM claim.',
  productionAssetsChanged: false, fullSlam: false,
};
fs.writeFileSync('dev/rumoca-assets-verification.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, outputs: outputs.map(value => value.label), failures, files: artifacts.length }));
