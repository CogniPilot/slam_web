// Actual integration gates for reviewed vision compiler source fixes.
// Run only in a context authorized to write the sibling compiler and owned cache.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const home = process.env.HOME;
if (!home) throw new Error('HOME is required');
const app = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const compiler = path.resolve(app, '../rumoca-native-functions');
const output = process.env.RUMOCA_QUALIFICATION_DIRECTORY
  ?? path.join(home, 'scratch/slam_web/tmp/modelica-vision-source-fixes-final');
const expected = process.env.RUMOCA_EXPECTED_SOURCE_MANIFEST_SHA256;
if (!/^[a-f0-9]{64}$/.test(expected ?? '')) throw new Error('Explicit expected source manifest required');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function snapshot() {
  const result = spawnSync('rg', [
    '--files', '--hidden', '-g', '*.rs', '-g', 'Cargo.toml', '-g', 'Cargo.lock',
    '-g', 'rust-toolchain*', '-g', '!target/**', '-g', '!.git/**',
  ], { cwd: compiler, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw result.error ?? new Error(result.stderr);
  }
  return result.stdout.trim().split('\n').sort().map(file =>
    `${digest(fs.readFileSync(path.join(compiler, file)))}  ${file}`,
  ).join('\n') + '\n';
}

const before = snapshot();
if (digest(before) !== expected) throw new Error('Expected source manifest mismatch');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'source-before.sha256'), before);
const environment = {
  ...process.env,
  CARGO_TARGET_DIR: path.join(home, 'scratch/slam_web/build/rumoca-native-target'),
  TMPDIR: output,
  CARGO_INCREMENTAL: '0',
  CARGO_BUILD_JOBS: '4',
  RUST_TEST_THREADS: '4',
  RAYON_NUM_THREADS: '4',
};
const packages = [
  'rumoca-phase-flatten', 'rumoca-exec-wasm', 'rumoca-ir-solve', 'rumoca-bind-wasm',
  'rumoca-eval-dae', 'rumoca-phase-dae', 'rumoca-core', 'rumoca-ir-dae',
  'rumoca-eval-solve', 'rumoca-phase-solve', 'rumoca-eval-flat',
].flatMap(name => ['-p', name]);
const basic = [
  '--manifest-path', path.join(compiler, 'Cargo.toml'), '-j4', '--locked', '--offline', '--config',
  'profile.dev.package.rumoca-eval-dae.opt-level=3',
];
const common = [...basic, ...packages, '--features', 'rumoca-bind-wasm/full-web'];
const stages = [
  ['strict', ['clippy', ...common, '--all-targets', '--all-features', '--', '-D', 'warnings']],
  ['broad', ['test', ...common, '--tests', '--no-fail-fast', '--message-format=json',
    '--', '--nocapture']],
  ['fmt', ['fmt', '--manifest-path', path.join(compiler, 'Cargo.toml'), '--all', '--', '--check']],
  ['link', ['test', ...basic, '-p', 'rumoca-bind-wasm', '--features', 'full-web',
    '--lib', '--no-run', '--message-format=json']],
];

let status = 0;
for (const [name, arguments_] of stages) {
  const command = [
    'dev/rumoca-bounded-run.mjs', '--seconds', '600', '--rss-mib', '8192',
    '--available-mib', '16384', '--log', path.join(output, `${name}.log`), '--',
    'nice', '-n', '15', 'taskset', '-c', '6,7', 'nix', 'develop', 'path:.#ci',
    '--command', 'env', 'CARGO_BUILD_JOBS=4', 'RUST_TEST_THREADS=4', 'RAYON_NUM_THREADS=4',
    `TMPDIR=${output}`, 'cargo', ...arguments_,
  ];
  fs.writeFileSync(path.join(output, `${name}-command.json`), JSON.stringify(command, null, 2));
  const result = spawnSync(process.execPath, command, {
    cwd: app, env: environment, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8',
  });
  fs.writeFileSync(path.join(output, `${name}-resource.json`), result.stdout ?? '');
  console.log(result.stdout ?? '');
  console.log(JSON.stringify({ stage: name, status: result.status, signal: result.signal,
    error: result.error?.message }));
  if (result.error || result.status !== 0) {
    status = result.status ?? 1;
    break;
  }
  if (snapshot() !== before) {
    console.error('SOURCE_BOOKEND_MISMATCH');
    status = 1;
    break;
  }
}
const after = snapshot();
fs.writeFileSync(path.join(output, 'source-after.sha256'), after);
if (after !== before) {
  console.error('SOURCE_BOOKEND_MISMATCH');
  status = 1;
} else {
  console.log('SOURCE_BOOKEND_PASS');
}

if (status === 0) {
  const artifacts = fs.readFileSync(path.join(output, 'link.log'), 'utf8').split('\n')
    .flatMap(line => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
  const selected = artifacts.findLast(item => item.reason === 'compiler-artifact'
    && item.target?.name === 'rumoca_bind_wasm' && item.profile?.test && item.executable);
  if (!selected) throw new Error('No exact Cargo JSON test executable');
  const frozen = path.join(output, 'final-producer');
  fs.copyFileSync(selected.executable, frozen);
  fs.chmodSync(frozen, 0o555);
  fs.writeFileSync(path.join(output, 'producer-artifact.json'), JSON.stringify(selected, null, 2));
  fs.writeFileSync(path.join(output, 'producer-freeze.json'), JSON.stringify({
    executable: frozen,
    binarySha256: digest(fs.readFileSync(frozen)),
    bytes: fs.statSync(frozen).size,
    sourceManifestSha256: digest(after),
    features: selected.features,
    profile: selected.profile,
    reviewedChanges: ['lazy Jacobian column view', 'borrowed flat subscript', 'direct tensor division',
      'generic native BroadcastBinary', 'bounded native assignment functions',
      'raw eight-byte Map result copy', 'one-cell native call transfers'],
  }, null, 2));
}
process.exit(status);
