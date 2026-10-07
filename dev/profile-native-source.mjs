// Profile one owned source-compilation process, retaining a normally finalized trace.
// Run through the Nix environment: node dev/profile-native-source.mjs source.mo Model producer output-directory
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const [sourceArgument, model, producerArgument, directoryArgument] = process.argv.slice(2);
if (![sourceArgument, model, producerArgument, directoryArgument].every(Boolean)) {
  throw new Error('Expected source, model name, immutable native producer and output directory');
}
const source = fs.realpathSync(sourceArgument);
const producer = fs.realpathSync(producerArgument);
const directory = path.resolve(directoryArgument);
const cpuAffinity = process.env.RUMOCA_PROFILE_CPUS ?? '12,13';
if (!/^\d+(?:[-,]\d+)*$/.test(cpuAffinity)) throw new Error('Invalid profiler CPU affinity');
const seconds = Number(process.env.RUMOCA_PROFILE_SECONDS ?? 30);
const delayMs = Number(process.env.RUMOCA_PROFILE_DELAY_MS ?? 0);
const windowMs = Number(process.env.RUMOCA_PROFILE_WINDOW_MS ?? 10000);
if (!Number.isInteger(seconds) || seconds < 1 || seconds > 600
  || !Number.isInteger(delayMs) || delayMs < 0 || delayMs >= seconds * 1000
  || !Number.isInteger(windowMs) || windowMs < 1 || windowMs > seconds * 1000) {
  throw new Error('Invalid bounded preparation time or profiler window');
}
fs.mkdirSync(directory, { recursive: true });
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const guard = fileURLToPath(new URL('./rumoca-bounded-run.mjs', import.meta.url));
const output = path.join(directory, 'perf.data');
if (fs.existsSync(output)) throw new Error('Choose a fresh output directory; trace already exists');
const profileErrors = fs.openSync(path.join(directory, 'perf.log'), 'wx');
const command = spawn(process.execPath, [guard,
  '--seconds', String(seconds), '--rss-mib', '8192', '--log', path.join(directory, 'prepare.log'), '--',
  'taskset', '-c', cpuAffinity, 'nice', '-n', '10', producer,
  'native_registration_whole_program_source_inventory', '--nocapture',
], {
  env: {
    ...process.env,
    RUMOCA_NATIVE_REGISTRATION_SOURCE_FIXTURE: source,
    RUMOCA_NATIVE_SOURCE_MODEL: model,
    RUMOCA_NATIVE_PROGRAM_ARTIFACT: path.join(directory, 'native.json'),
    RUMOCA_NATIVE_SOURCE_SOLVE_ARTIFACT: path.join(directory, 'solve.json'),
    RUMOCA_NATIVE_SOURCE_PROFILE: '1',
  },
  stdio: ['ignore', 'pipe', 'inherit'],
});
let resourceText = '';
command.stdout.on('data', bytes => { resourceText += bytes; });
let commandDone = false;
const compilation = new Promise((resolve, reject) => {
  command.once('error', reject);
  command.once('close', (exitCode, signal) => {
    commandDone = true;
    resolve({ exitCode, signal });
  });
});

function ownedProducer() {
  const parents = new Map();
  for (const name of fs.readdirSync('/proc').filter(name => /^\d+$/.test(name))) {
    try {
      const stat = fs.readFileSync(`/proc/${name}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      parents.set(Number(name), { parent: Number(fields[1]), birth: fields[19] });
    } catch (error) {
      if (!['ENOENT', 'ESRCH', 'EACCES'].includes(error.code)) throw error;
    }
  }
  for (const [pid, identity] of parents) {
    let parent = identity.parent;
    const visited = new Set([pid]);
    while (parent && !visited.has(parent)) {
      if (parent === command.pid) {
        try {
          if (fs.realpathSync(`/proc/${pid}/exe`) === producer) return { pid, birth: identity.birth };
        } catch (error) {
          if (!['ENOENT', 'ESRCH', 'EACCES'].includes(error.code)) throw error;
        }
        break;
      }
      visited.add(parent);
      parent = parents.get(parent)?.parent;
    }
  }
}

// A late window samples the same owned preparation, after earlier phases.
// Completion cancels the delay; never launch another preparation to sample it.
if (delayMs > 0) {
  await new Promise(resolve => {
    const timer = setTimeout(resolve, delayMs);
    compilation.then(() => { clearTimeout(timer); resolve(); },
      () => { clearTimeout(timer); resolve(); });
  });
}
let identity;
const deadline = Date.now() + 5000;
while (!(identity = ownedProducer()) && !commandDone && Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, 50));
}
let recording;
if (identity) {
  const args = ['record', '-e', 'cpu-clock:u', '-F', '99', '--call-graph', 'dwarf,8192',
    '-p', String(identity.pid), '-o', output];
  const profiler = spawn('perf', args, { stdio: ['ignore', profileErrors, profileErrors] });
  const stop = () => { if (profiler.exitCode === null && profiler.signalCode === null) profiler.kill('SIGINT'); };
  const timer = setTimeout(stop, windowMs);
  const stoppedWithCompilation = compilation.then(stop);
  recording = await new Promise((resolve, reject) => {
    profiler.once('error', reject);
    profiler.once('close', (exitCode, signal) => resolve({ args, target: identity, exitCode, signal }));
  });
  clearTimeout(timer);
  await stoppedWithCompilation;
}
const result = await compilation;
fs.closeSync(profileErrors);
fs.writeFileSync(path.join(directory, 'prepare-resource.json'), `${resourceText.trim()}\n`);
const report = {
  source, sourceSha256: hash(source), model, producer, producerSha256: hash(producer), cpuAffinity,
  preparationSecondsLimit: seconds, requestedSampleDelayMs: delayMs, requestedSampleWindowMs: windowMs,
  result, resource: resourceText.trim() ? JSON.parse(resourceText) : null,
  recording, traceSha256: fs.existsSync(output) ? hash(output) : null,
  nativeArtifactProduced: fs.existsSync(path.join(directory, 'native.json')),
  solveArtifactProduced: fs.existsSync(path.join(directory, 'solve.json')),
};
fs.writeFileSync(path.join(directory, 'profile.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
// SIGINT is the requested normal perf finalization, not a compiler success.
const normallyFinalized = recording?.exitCode === 0
  || (recording?.exitCode === null && recording?.signal === 'SIGINT');
if (!identity || !normallyFinalized || !report.traceSha256) process.exitCode = 1;
