// Diagnostic process owner: bound time and aggregate RSS for one command group.
// Usage: node dev/rumoca-bounded-run.mjs --seconds 600 --rss-mib 8192
//   --log /tmp/owned-gate.log -- nice -n 10 taskset -c 6,7 cargo test ...
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const args = process.argv.slice(2);
const split = args.indexOf('--');
if (split < 0 || split === args.length - 1) {
  throw new Error('Expected options followed by -- and a command');
}
const options = new Map();
for (let index = 0; index < split; index += 2) {
  if (!['--seconds', '--rss-mib', '--log', '--cache-dir', '--cache-mib', '--available-mib'].includes(args[index]) || index + 1 >= split) {
    throw new Error(`Invalid option ${args[index]}`);
  }
  options.set(args[index], args[index + 1]);
}
const seconds = Number(options.get('--seconds') ?? 600);
const rssMiB = Number(options.get('--rss-mib') ?? 8192);
const cacheMiB = Number(options.get('--cache-mib') ?? 7680);
// Heavy compiler probes retain a 16 GiB host reserve by default. Small CI
// subprocess checks can explicitly select a reserve suited to their runner.
const availableMiB = Number(options.get('--available-mib') ?? 16384);
const cacheDirectory = options.get('--cache-dir');
if (!(seconds > 0 && seconds <= 600 && rssMiB > 0 && rssMiB <= 8192 && cacheMiB > 0 && cacheMiB <= 8192
  && availableMiB > 0 && availableMiB <= 16384)) {
  throw new Error('Time must be 1..600 seconds; RSS/cache must be positive and at most 8192 MiB');
}
const log = options.get('--log');
const fd = log ? fs.openSync(log, 'w') : undefined;
const start = performance.now();
const command = args.slice(split + 1);
const child = spawn(command[0], command.slice(1), {
  detached: true,
  stdio: ['ignore', fd ?? 'inherit', fd ?? 'inherit'],
});
let peakRssKiB = null;
let minimumAvailableKiB = null;
let peakCacheBytes = null;
let lastCacheSample = -Infinity;
let stopped;
// Browser drivers can create new process groups. Retain verified descendant
// identities as well as the initial group, including after reparenting.
const ownedProcesses = new Map();
function processes() {
  const result = new Map();
  for (const entry of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const stat = fs.readFileSync(`/proc/${entry}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      result.set(Number(entry), { parent: Number(fields[1]), group: Number(fields[2]), birth: fields[19] });
    } catch (error) {
      if (!['ENOENT', 'ESRCH', 'EACCES'].includes(error.code)) throw error;
    }
  }
  let changed;
  do {
    changed = false;
    for (const [pid, info] of result) {
      if (ownedProcesses.get(pid) === info.birth) continue;
      const parent = result.get(info.parent);
      if (info.group === child.pid || (parent && ownedProcesses.get(info.parent) === parent.birth)) {
        ownedProcesses.set(pid, info.birth); changed = true;
      }
    }
  } while (changed);
  return result;
}

function stop(reason) {
  if (stopped) return;
  stopped = reason;
  // Only this freshly detached command owns the named process group.
  try { process.kill(-child.pid, 'SIGKILL'); } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
  for (const [pid, info] of processes()) {
    if (ownedProcesses.get(pid) !== info.birth) continue;
    try { process.kill(pid, 'SIGKILL'); } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
}

function sample() {
  let rssKiB = 0;
  for (const [pid, info] of processes()) {
    if (ownedProcesses.get(pid) !== info.birth) continue;
    try {
      const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
      rssKiB += Number(status.match(/^VmRSS:\s+(\d+)\s+kB$/m)?.[1] ?? 0);
    } catch (error) {
      if (!['ENOENT', 'ESRCH', 'EACCES'].includes(error.code)) throw error;
    }
  }
  peakRssKiB = Math.max(peakRssKiB ?? 0, rssKiB);
  const memory = fs.readFileSync('/proc/meminfo', 'utf8');
  const availableKiB = Number(memory.match(/^MemAvailable:\s+(\d+)\s+kB$/m)?.[1]);
  minimumAvailableKiB = Math.min(minimumAvailableKiB ?? Infinity, availableKiB);
  if (rssKiB > rssMiB * 1024) stop('rss-limit');
  if (!(availableKiB >= availableMiB * 1024)) stop('available-memory-floor');
  if (cacheDirectory && performance.now() - lastCacheSample >= 5000) {
    const bytes = cacheBytes(cacheDirectory, new Set());
    peakCacheBytes = Math.max(peakCacheBytes ?? 0, bytes);
    lastCacheSample = performance.now();
    if (bytes > cacheMiB * 1024 * 1024) stop('cache-limit');
  }
  if (performance.now() - start >= seconds * 1000) stop('timeout');
}

function cacheBytes(directory, seen) {
  let bytes = 0;
  let entries;
  try { entries = fs.readdirSync(directory, { withFileTypes: true }); }
  catch (error) {
    // Cargo creates a fresh target lazily; entries may also disappear during
    // cache cleanup. Absence is zero retained bytes, not monitor failure.
    if (['ENOENT', 'ESRCH'].includes(error.code)) return 0;
    throw error;
  }
  for (const entry of entries) {
    const path = `${directory}/${entry.name}`;
    try {
      const stat = fs.lstatSync(path);
      const identity = `${stat.dev}:${stat.ino}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      bytes += stat.blocks * 512;
      if (entry.isDirectory()) bytes += cacheBytes(path, seen);
    } catch (error) {
      if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error;
    }
  }
  return bytes;
}

const monitor = setInterval(() => {
  if (stopped) return;
  try { sample(); }
  catch (error) {
    console.error(`Resource monitor failed: ${error.message}`);
    stop('monitor-error');
  }
}, 250);
let logClosed = false;
function closeLog() {
  if (fd !== undefined && !logClosed) { fs.closeSync(fd); logClosed = true; }
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stop(signal));
}
child.once('error', error => {
  clearInterval(monitor);
  closeLog();
  console.error(error.message);
  process.exitCode = 127;
});
child.once('close', (code, signal) => {
  clearInterval(monitor);
  closeLog();
  const exitCode = stopped === 'timeout' ? 124 : stopped ? 137 : process.exitCode ?? code ?? 128;
  console.log(JSON.stringify({
    command, log, elapsedMs: performance.now() - start, peakRssKiB, minimumAvailableKiB,
    cacheDirectory, peakCacheBytes, cacheLimitMiB: cacheDirectory ? cacheMiB : undefined,
    rssLimitMiB: rssMiB, availableFloorMiB: availableMiB, rssScope: 'owned process group and identified descendants, including detached browser groups', secondsLimit: seconds, stopped, signal, exitCode,
  }));
  process.exitCode = exitCode;
});
