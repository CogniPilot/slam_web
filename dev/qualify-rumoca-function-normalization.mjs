// Qualify normalization groundwork, assertion evaluation and production returns.
// This gate does not issue a localization or browser executable artifact.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

const home = process.env.HOME;
if (!home) throw new Error('HOME is required');
const app = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const compiler = path.resolve(app, '../rumoca-native-functions');
const output = process.env.RUMOCA_QUALIFICATION_DIRECTORY;
if (!output) throw new Error('Explicit owned qualification directory required');
const expected = process.env.RUMOCA_EXPECTED_SOURCE_MANIFEST_SHA256;
if (!/^[a-f0-9]{64}$/.test(expected ?? '')) throw new Error('Explicit source manifest pin required');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function snapshot() {
  const result = spawnSync('rg', ['--files', '--hidden', '-g', '*.rs', '-g', 'Cargo.toml',
    '-g', 'Cargo.lock', '-g', 'rust-toolchain*', '-g', '!target/**', '-g', '!.git/**'],
    {cwd: compiler, encoding: 'utf8'});
  if (result.error || result.status !== 0) throw result.error ?? new Error(result.stderr);
  return result.stdout.trim().split('\n').sort().map(file =>
    `${digest(fs.readFileSync(path.join(compiler, file)))}  ${file}`).join('\n') + '\n';
}
const before = snapshot();
if (digest(before) !== expected) throw new Error('Source manifest pin mismatch');
fs.mkdirSync(output, {recursive: true});
fs.writeFileSync(path.join(output, 'source-before.sha256'), before);
const environment = {...process.env, TMPDIR: output, CARGO_INCREMENTAL: '0',
  CARGO_TARGET_DIR: path.join(home, 'scratch/slam_web/build/rumoca-native-target')};
const common = ['--manifest-path', path.join(compiler, 'Cargo.toml'), '-j4', '--locked', '--offline',
  '-p', 'rumoca-core', '-p', 'rumoca-phase-dae', '-p', 'rumoca-eval-flat',
  '-p', 'rumoca-eval-dae'];
const stages = [
  ['library', ['test', ...common, '--lib', '--', '--nocapture']],
  ['production-return-wasm-tests', ['test', '--manifest-path', path.join(compiler, 'Cargo.toml'),
    '-j4', '--locked', '--offline', '-p', 'rumoca-bind-wasm', '--features',
    'native-assignments', '--lib', 'native_wasm_return_predicates', '--', '--nocapture']],
  ['production-return-tests', ['test', '--manifest-path', path.join(compiler, 'Cargo.toml'),
    '-j4', '--locked', '--offline', '-p', 'rumoca-sim', '--no-default-features',
    '--features', 'native-solvers', '--lib', 'function_returns', '--', '--nocapture']],
  ['strict', ['clippy', ...common, '--all-targets', '--all-features', '--', '-D', 'warnings']],
  ['production-return-strict', ['clippy', '--manifest-path', path.join(compiler, 'Cargo.toml'),
    '-j4', '--locked', '--offline', '-p', 'rumoca-sim', '--no-default-features',
    '--features', 'native-solvers', '--lib', '--tests', '--', '-D', 'warnings']],
  ['production-return-wasm-strict', ['clippy', '--manifest-path', path.join(compiler, 'Cargo.toml'),
    '-j4', '--locked', '--offline', '-p', 'rumoca-bind-wasm', '--features',
    'native-assignments', '--lib', '--tests', '--', '-D', 'warnings']],
  ['brand-docs', ['test', '--manifest-path', path.join(compiler, 'Cargo.toml'), '-j4',
    '--locked', '--offline', '-p', 'rumoca-core', '--doc', 'generated_function_locals', '--', '--nocapture']],
  ['fmt', ['fmt', '--manifest-path', path.join(compiler, 'Cargo.toml'), '--all', '--', '--check']],
];
let status = 0;
for (const [name, cargo] of stages) {
  const command = ['dev/rumoca-bounded-run.mjs', '--seconds', '600', '--rss-mib', '8192',
    '--available-mib', '16384', '--log', path.join(output, `${name}.log`), '--',
    'nice', '-n', '15', 'taskset', '-c', '6,7', 'nix', 'develop', 'path:.#ci', '--command',
    'env', 'CARGO_BUILD_JOBS=4', 'RUST_TEST_THREADS=4', 'RAYON_NUM_THREADS=4',
    `TMPDIR=${output}`, 'cargo', ...cargo];
  fs.writeFileSync(path.join(output, `${name}-command.json`), JSON.stringify(command, null, 2));
  const result = spawnSync(process.execPath, command,
    {cwd: app, env: environment, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8'});
  fs.writeFileSync(path.join(output, `${name}-resource.json`), result.stdout ?? '');
  console.log(JSON.stringify({stage: name, status: result.status, signal: result.signal}));
  if (result.error || result.status !== 0) { status = result.status ?? 1; break; }
  if (snapshot() !== before) { status = 1; console.error('SOURCE_BOOKEND_MISMATCH'); break; }
}
const after = snapshot();
fs.writeFileSync(path.join(output, 'source-after.sha256'), after);
if (after !== before) { status = 1; console.error('SOURCE_BOOKEND_MISMATCH'); }
else console.log('SOURCE_BOOKEND_PASS');
fs.writeFileSync(path.join(output, 'review.json'), JSON.stringify({schema: 1,
  sourceManifestSha256: expected, stages, status, bookendsEqual: after === before,
  normalizationProductionConsumersMigrated: false, localizationArtifactIssued: false,
  browserCompilerPromoted: false, fixed20CanaryRun: false}, null, 2));
process.exitCode = status;
