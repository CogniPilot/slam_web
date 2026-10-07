// Root-executable private experiment. Authoring this file does not run a build.
// Never run concurrently with another owner of the selected Cargo target.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [mode, ...arguments_] = process.argv.slice(2);
const options = new Map();
for (let i = 0; i < arguments_.length; i += 2) {
  if (!['--source', '--directory', '--target', '--source-manifest', '--variant', '--cores', '--pid'].includes(arguments_[i]) || !arguments_[i + 1]) throw Error('Invalid option');
  options.set(arguments_[i], arguments_[i + 1]);
}
if (!['prepare', 'build', 'run', 'apply-lazy', 'lazy-controls', 'profile', 'summarize'].includes(mode)) throw Error('Expected prepare | build | run | apply-lazy | lazy-controls | profile | summarize');
const directory = path.resolve(options.get('--directory') ?? path.join(os.homedir(), 'scratch/slam_web/tmp/fast-retained-allocation-experiment'));
const target = path.resolve(options.get('--target') ?? path.join(directory, 'target'));
const main = path.resolve(options.get('--source') ?? path.join(app, '../rumoca-native-functions'));
const compiler = path.join(directory, 'compiler');
const within = (child, parent) => {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};
if (within(target, main) || within(target, compiler)) throw Error('Cargo target must be outside both source trees');
if (within(directory, main)) throw Error('Private experiment must be outside main source');
const variant = options.get('--variant') ?? 'baseline';
if (!['baseline', 'lazy'].includes(variant)) throw Error('Variant must be baseline or lazy');
const cores = options.get('--cores') ?? '6,7';
if (!/^\d+,\d+$/.test(cores)) throw Error('Exactly two CPU cores required');
const audit = path.join(app, 'dev/artifacts/fast-retained-artifacts-audit');
const lazy = path.join(app, 'dev/artifacts/lazy-jacobian-column-cache-proposal');
const sourceSha = 'd42da6959fee8a629c6a9850fef31559ba692f5bafd3001ba69106200f34ea11';
const modelFile = 'crates/rumoca-ir-solve/src/model.rs';
const testFile = 'crates/rumoca-ir-solve/src/model/jacobian_column_cache_tests.rs';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const json = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function command(executable, args, cwd = app) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw Error(`${executable}: ${result.stderr || result.stdout || result.error}`);
  return result.stdout;
}
function sourceManifest(root) {
  const names = command('rg', ['--files', '--hidden', '--no-require-git', '-g', '*.rs', '-g', 'Cargo.toml', '-g', 'Cargo.lock', '-g', 'rust-toolchain*', '-g', '!target/**', '-g', '!.git/**'], root).trim().split('\n').sort();
  return names.map(file => `${sha(fs.readFileSync(path.join(root, file)))}  ${file}`).join('\n') + '\n';
}
const excluded = new Set(['.git', 'target', 'node_modules', '.venv']);
function copiedFileManifest(root) {
  const entries = [];
  function visit(folder) {
    for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
      if (excluded.has(item.name)) continue;
      const file = path.join(folder, item.name);
      const relative = path.relative(root, file).split(path.sep).join('/');
      if (relative.includes('\n')) throw Error('Manifest cannot encode newline filenames');
      if (item.isDirectory()) visit(file);
      else if (item.isSymbolicLink()) entries.push(`${sha(`symlink:${fs.readlinkSync(file)}`)}  ${relative}`);
      else if (item.isFile()) entries.push(`${sha(fs.readFileSync(file))}  ${relative}`);
      else throw Error(`Non-source special file: ${relative}`);
    }
  }
  visit(root); return entries.sort().join('\n') + '\n';
}
function verifyManifest(root, manifest) {
  for (const line of manifest.trim().split('\n')) {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/);
    if (!match || path.isAbsolute(match[2]) || match[2].split('/').includes('..')) throw Error('Unsafe or invalid source manifest');
    if (sha(fs.readFileSync(path.join(root, match[2]))) !== match[1]) throw Error(`Source bookend mismatch: ${match[2]}`);
  }
}
function bounded(label, args, env) {
  const out = path.join(directory, variant); fs.mkdirSync(out, { recursive: true });
  const log = path.join(out, `${label}.log`);
  const guard = ['dev/rumoca-bounded-run.mjs', '--seconds', '600', '--rss-mib', '8192', '--available-mib', '16384', '--log', log, '--', ...args];
  json(path.join(out, `${label}-command.json`), { argv: [process.execPath, ...guard], cwd: app, env, targetOwnership: 'Caller must confirm exclusive ownership before invoking.' });
  const result = spawnSync(process.execPath, guard, { cwd: app, env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1024 * 1024 });
  fs.writeFileSync(path.join(out, `${label}-resource.stdout`), result.stdout ?? '');
  if (result.error) throw result.error;
  const lines = result.stdout.trim().split('\n');
  const resource = JSON.parse(lines.at(-1));
  json(path.join(out, `${label}-resource.json`), { ...resource, guardianExitCode: result.status, guardianSignal: result.signal });
  console.log(JSON.stringify({ variant, label, ...resource }));
  return resource.exitCode;
}
const buildEnvironment = {
  CARGO_TARGET_DIR: target, TMPDIR: path.join(directory, 'tmp'), CARGO_INCREMENTAL: '0',
  CARGO_BUILD_JOBS: '4', RUST_TEST_THREADS: '4', RAYON_NUM_THREADS: '4',
};
function cargoArgs(args) {
  return ['nice', '-n', '15', 'taskset', '-c', cores, 'nix', 'develop', `path:${app}#ci`, '--command', 'cargo', ...args,
    '--manifest-path', path.join(compiler, 'Cargo.toml'), '-j4', '--locked', '--offline', '--config', 'profile.dev.package.rumoca-eval-dae.opt-level=3'];
}
function currentVariant() {
  const current = readJson(path.join(directory, 'state.json')).variant;
  if (current !== variant) throw Error(`Private source is ${current}, requested ${variant}`);
}
function verifyFrozenProducer() {
  const freeze = readJson(path.join(directory, variant, 'producer-freeze.json'));
  if (sha(fs.readFileSync(freeze.binary)) !== freeze.binarySha256) throw Error('Producer bytes changed');
  if (sourceManifest(compiler) !== fs.readFileSync(path.join(directory, variant, 'source-before.sha256'), 'utf8')) throw Error('Private compiler changed since producer build');
  return freeze;
}

if (mode === 'prepare') {
  if (fs.existsSync(directory)) throw Error('Experiment destination already exists; choose a fresh owned directory, do not overwrite evidence');
  const manifestFile = path.resolve(options.get('--source-manifest') ?? path.join(app, 'dev/artifacts/native-coverage-index-v2-partial/observed-source.sha256'));
  const expected = fs.readFileSync(manifestFile, 'utf8');
  verifyManifest(main, expected);
  const fresh = sourceManifest(main);
  if (fresh !== expected) throw Error('Qualified main inventory differs from requested source manifest');
  const preimages = readJson(path.join(audit, 'preimages.json'));
  for (const item of preimages.files) if (sha(fs.readFileSync(path.join(main, item.path))) !== item.before_sha256) throw Error(`Diagnostic preimage mismatch: ${item.path}`);
  const original = fs.readFileSync(path.join(app, 'models/FastNativeFrame.mo'));
  if (sha(original) !== sourceSha) throw Error('Original full FAST source changed');
  const copiedFilesBefore = copiedFileManifest(main);
  fs.mkdirSync(directory, { recursive: true }); fs.mkdirSync(buildEnvironment.TMPDIR, { recursive: true });
  fs.writeFileSync(path.join(directory, 'main-source-before.sha256'), fresh);
  fs.writeFileSync(path.join(directory, 'main-full-copy-before.sha256'), copiedFilesBefore);
  // Root performs this copy only after its authoritative main/Cargo gate is terminal.
  fs.cpSync(main, compiler, { recursive: true, dereference: false, verbatimSymlinks: true, filter: source => !['.git', 'target', 'node_modules', '.venv'].some(part => path.relative(main, source).split(path.sep).includes(part)) });
  if (sourceManifest(compiler) !== fresh) throw Error('Copied compiler source inventory differs from qualified main source');
  const copiedFiles = copiedFileManifest(compiler);
  fs.writeFileSync(path.join(directory, 'private-full-copy-before-overlay.sha256'), copiedFiles);
  if (copiedFiles !== copiedFilesBefore) throw Error('Copied assets/fixtures/templates/symlinks differ from main source');
  command('git', ['apply', '--check', path.join(audit, 'retained-allocation-counters.patch')], compiler);
  command('git', ['apply', path.join(audit, 'retained-allocation-counters.patch')], compiler);
  const afterMain = sourceManifest(main); fs.writeFileSync(path.join(directory, 'main-source-after-copy.sha256'), afterMain);
  if (afterMain !== fresh) throw Error('Main source changed during copy');
  const copiedFilesAfter = copiedFileManifest(main);
  fs.writeFileSync(path.join(directory, 'main-full-copy-after.sha256'), copiedFilesAfter);
  if (copiedFilesAfter !== copiedFilesBefore) throw Error('Main assets changed during copy');
  fs.writeFileSync(path.join(directory, 'source.mo'), original);
  json(path.join(directory, 'state.json'), { variant: 'baseline', sourceSha256: sourceSha });
  json(path.join(directory, 'experiment.json'), { status: 'PREPARED_UNBUILT', main, compiler, target, sourceManifest: manifestFile, mainSourceSha256: sha(fresh), sourceSha256: sourceSha, sourceHead: command('git', ['rev-parse', 'HEAD'], main).trim(), copiedCompilerGitMetadata: 'No .git copied; embedded revision may be unknown. Exact compiler manifests are authoritative.', diagnosticPatchSha256: sha(fs.readFileSync(path.join(audit, 'retained-allocation-counters.patch'))), baselineLimits: { seconds: 600, rssMiB: 8192, availableFloorMiB: 16384, cores, jobs: 4 } });
  console.log(JSON.stringify({ status: 'PREPARED', compiler, sourceSha256: sourceSha, mainSourceSha256: sha(fresh) }));
} else if (mode === 'build') {
  currentVariant();
  const out = path.join(directory, variant); fs.mkdirSync(out, { recursive: true });
  const before = sourceManifest(compiler); fs.writeFileSync(path.join(out, 'source-before.sha256'), before);
  const status = bounded('build', cargoArgs(['test', '-p', 'rumoca-bind-wasm', '--features', 'full-web', '--lib', '--no-run', '--message-format=json']), buildEnvironment);
  const after = sourceManifest(compiler); fs.writeFileSync(path.join(out, 'source-after-build.sha256'), after);
  if (before !== after) throw Error('Private source changed during build');
  if (status !== 0) process.exit(status);
  let selected;
  for (const line of fs.readFileSync(path.join(out, 'build.log'), 'utf8').split('\n')) {
    try { const value = JSON.parse(line); if (value.reason === 'compiler-artifact' && value.target?.name === 'rumoca_bind_wasm' && value.profile?.test && value.executable) selected = value; } catch {}
  }
  if (!selected) throw Error('No exact CargoJSON test producer artifact');
  const binary = path.join(out, 'producer'); fs.copyFileSync(selected.executable, binary); fs.chmodSync(binary, 0o755);
  json(path.join(out, 'producer-artifact.json'), selected);
  json(path.join(out, 'producer-freeze.json'), { binary, binarySha256: sha(fs.readFileSync(binary)), sourceManifestSha256: sha(before), sourceSha256: sourceSha, features: selected.features, profile: selected.profile, diagnosticOnly: true });
} else if (mode === 'run') {
  currentVariant(); const producer = verifyFrozenProducer(); const out = path.join(directory, variant);
  const input = path.join(directory, 'source.mo'); if (sha(fs.readFileSync(input)) !== sourceSha) throw Error('Full source changed');
  const status = bounded('preparation', ['nice', '-n', '15', 'taskset', '-c', cores, producer.binary,
    '--exact', 'tests::native_mixed_assignment_tests::calls::native_registration_whole_program_source_inventory', '--nocapture'], {
    RUMOCA_PRIVATE_RETAINED_ALLOCATION_DIAGNOSTIC: '1', RUST_TEST_THREADS: '4', RAYON_NUM_THREADS: '4',
    RUMOCA_NATIVE_REGISTRATION_SOURCE_FIXTURE: input, RUMOCA_NATIVE_SOURCE_MODEL: 'FastNativeFrame',
    RUMOCA_NATIVE_SOURCE_SOLVE_ARTIFACT: path.join(out, 'canonical-solve.json'),
    RUMOCA_NATIVE_PROGRAM_ARTIFACT: path.join(out, 'native-program.json'),
  });
  verifyFrozenProducer(); fs.writeFileSync(path.join(out, 'source-after-run.sha256'), sourceManifest(compiler));
  process.exitCode = status;
} else if (mode === 'apply-lazy') {
  if (readJson(path.join(directory, 'state.json')).variant !== 'baseline') throw Error('Lazy proposal already applied');
  if (!fs.existsSync(path.join(directory, 'baseline/preparation-resource.json'))) throw Error('Capture baseline terminal preparation first');
  const baseline = verifyFrozenProducer();
  const source = fs.readFileSync(path.join(compiler, modelFile), 'utf8');
  const expected = fs.readFileSync(path.join(audit, 'after', modelFile), 'utf8');
  if (source !== expected) throw Error('Reconcile only against exact diagnostic model.rs postimage');
  let result = source;
  function replace(before, after) { if (result.split(before).length !== 2) throw Error('Lazy diagnostic reconciliation mismatch'); result = result.replace(before, after); }
  replace('mod jacobian_outputs;', 'mod jacobian_outputs;\n\n#[cfg(test)]\nmod jacobian_column_cache_tests;');
  replace('    column_rows: Vec<Vec<usize>>,', '    column_rows: std::sync::OnceLock<Vec<Vec<usize>>>,');
  const begin = result.indexOf('        let column_rows = pattern.column_rows();');
  const end = result.indexOf('        Self {', begin);
  if (begin < 0 || end < 0) throw Error('Missing eager column allocation boundary');
  result = result.slice(0, begin) + '        if diagnostic { eprintln!("retained_alloc jacobian_cache_deferred rows={} columns={}", pattern.rows(), pattern.columns()); }\n' + result.slice(end);
  replace('            column_rows,', '            column_rows: std::sync::OnceLock::new(),');
  replace('        &self.column_rows\n', `        self.column_rows.get_or_init(|| {
            let diagnostic = std::env::var_os("RUMOCA_PRIVATE_RETAINED_ALLOCATION_DIAGNOSTIC").is_some();
            if diagnostic { eprintln!("retained_alloc jacobian_column_rows_demand_begin rows={} columns={}", self.pattern.rows(), self.pattern.columns()); }
            let rows = self.pattern.column_rows();
            if diagnostic {
                let entries: usize = rows.iter().map(Vec::len).sum();
                let capacity: usize = rows.iter().map(Vec::capacity).sum();
                eprintln!("retained_alloc jacobian_column_rows_demand_retained rows={} columns={} entries={} cell_capacity={} shallow_cell_bytes={}", self.pattern.rows(), self.pattern.columns(), entries, capacity, capacity.saturating_mul(std::mem::size_of::<usize>()));
            }
            rows
        }).as_slice()
`);
  fs.writeFileSync(path.join(compiler, modelFile), result);
  fs.copyFileSync(path.join(lazy, 'after', testFile), path.join(compiler, testFile));
  json(path.join(directory, 'lazy-reconciliation.json'), { baselineProducerSha256: baseline.binarySha256, baselineModelSha256: sha(source), lazyModelSha256: sha(result), changedFiles: [modelFile, testFile], explanation: 'Same source/diagnostic pipeline; eager cache counter becomes deferred and first-demand counters. No observer forces lazy cache initialization.', reviewedLazyPatchSha256: sha(fs.readFileSync(path.join(lazy, 'lazy-column-cache.patch'))) });
  json(path.join(directory, 'state.json'), { variant: 'lazy', sourceSha256: sourceSha });
} else if (mode === 'lazy-controls') {
  if (variant !== 'lazy') throw Error('Lazy controls require --variant lazy'); currentVariant();
  const before = sourceManifest(compiler);
  const args = cargoArgs(['test', '-p', 'rumoca-ir-solve', '--lib']); args.push('model::jacobian_column_cache_tests', '--', '--nocapture');
  const status = bounded('lazy-controls', args, buildEnvironment);
  if (before !== sourceManifest(compiler)) throw Error('Private source changed during controls');
  process.exitCode = status;
} else if (mode === 'profile') {
  currentVariant(); const producer = verifyFrozenProducer();
  const pidText = options.get('--pid');
  if (!/^\d+$/.test(pidText ?? '') || Number(pidText) < 2) throw Error('Positive live producer PID required');
  const pid = Number(pidText);
  if (fs.realpathSync(`/proc/${pid}/exe`) !== fs.realpathSync(producer.binary)) throw Error('PID is not the selected immutable diagnostic producer');
  const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  const birth = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
  const out = path.join(directory, variant);
  const data = path.join(out, 'allocation.perf.data');
  const status = bounded('profile-8s', ['nice', '-n', '15', 'taskset', '-c', cores, 'perf', 'record', '-F', '99', '--call-graph', 'dwarf', '-o', data, '-p', pidText, '--', 'sleep', '8'], {});
  json(path.join(out, 'profile-binding.json'), { producerSha256: producer.binarySha256, compilerSourceSha256: producer.sourceManifestSha256, sourceSha256: sourceSha, pid, birth, durationSeconds: 8, status, producerWasNotRestarted: true });
  if (status !== 0) process.exit(status);
  fs.writeFileSync(path.join(out, 'allocation-perf-self.txt'), command('perf', ['report', '--stdio', '--no-children', '-i', data]));
  fs.writeFileSync(path.join(out, 'allocation-perf-inclusive.txt'), command('perf', ['report', '--stdio', '--children', '-i', data]));
} else {
  const summaries = [];
  for (const name of ['baseline', 'lazy']) {
    const out = path.join(directory, name); if (!fs.existsSync(out)) continue;
    const resourceFile = path.join(out, 'preparation-resource.json');
    const lines = fs.existsSync(path.join(out, 'preparation.log')) ? fs.readFileSync(path.join(out, 'preparation.log'), 'utf8').split('\n') : [];
    const counters = lines.filter(line => line.startsWith('retained_alloc '));
    fs.writeFileSync(path.join(out, 'allocation-counters.log'), counters.join('\n') + '\n');
    summaries.push({ variant: name, preparationResource: fs.existsSync(resourceFile) ? readJson(resourceFile) : null, counters: counters.length, finalCounter: counters.at(-1), canonicalSolveIssued: fs.existsSync(path.join(out, 'canonical-solve.json')), nativeProgramIssued: fs.existsSync(path.join(out, 'native-program.json')), numericalCases: 0 });
  }
  json(path.join(directory, 'comparison-summary.json'), { status: 'DIAGNOSTIC_EVIDENCE_ONLY', sourceSha256: sourceSha, variants: summaries, caveats: ['Counters are shallow storage estimates; shared and temporary owners cannot simply be summed.', 'Preparation/source inventory is not numerical execution or full FAST acceptance.', 'Different generated build metadata is not compiler math; exact source manifests and binary digests identify each diagnostic producer.'] });
  console.log(JSON.stringify(summaries, null, 2));
}
