// Review-only numerical oracle for the actual compiler-issued complete filter.
// All P slots are supplied explicitly. Production executes only the WASM model.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';

const [directory, output] = process.argv.slice(2);
if (!directory || !output) throw new Error('ISSUED_DIRECTORY REPORT required');
const problem = JSON.parse(fs.readFileSync(`${directory}/problem.json`, 'utf8'));
const producer = JSON.parse(fs.readFileSync(`${directory}/report.json`, 'utf8'));
const bytes = fs.readFileSync(`${directory}/native-assignments.wasm`);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const sourceSha256 = sha(producer.source);
assert.equal(sourceSha256, '99ce45b42482b79211913840a57b63b91471ab3ef00d27fb85d289e153886d48');
assert.equal(producer.nativeRefusal, null);
assert.equal(producer.nativeEmitRefusal, null);
const layout = problem.layout;
const yCount = layout.y_scalars, pCount = layout.p_scalars;
const pages = Math.ceil(((yCount + pCount) * 8 + 64) / 65536);
const memory = new WebAssembly.Memory({initial: pages, maximum: pages});
const module = new WebAssembly.Module(bytes);
const env = {memory};
for (const item of WebAssembly.Module.imports(module)) {
  assert.equal(item.module, 'env');
  if (item.kind === 'function') {
    assert.equal(typeof Math[item.name], 'function');
    env[item.name] = Math[item.name].bind(Math);
  }
}
const instance = new WebAssembly.Instance(module, {env});
const y = new Float64Array(memory.buffer, 0, yCount);
const p = new Float64Array(memory.buffer, yCount * 8, pCount);
const guard = new Uint8Array(memory.buffer, (yCount + pCount) * 8, 64);
const slot = (name, kind) => {
  const binding = layout.bindings[name]?.[kind];
  assert(binding && Number.isSafeInteger(binding.index) && binding.byte_offset === binding.index * 8, `missing checked ${kind} binding ${name}`);
  return binding.index;
};
const put = (name, value) => { p[slot(name, 'P')] = value; };
const get = name => y[slot(name, 'Y')];
const matrix = (n, m, f) => Array.from({length: n}, (_, i) => Array.from({length: m}, (_, j) => f(i, j)));
const identity = n => matrix(n, n, (i, j) => +(i === j));
const multiply = (a, b) => matrix(a.length, b[0].length, (i, j) => a[i].reduce((s, v, k) => s + v * b[k][j], 0));
const transpose = a => matrix(a[0].length, a.length, (i, j) => a[j][i]);
const add = (a, b) => matrix(a.length, a[0].length, (i, j) => a[i][j] + b[i][j]);
const scale = (a, s) => a.map(row => row.map(v => v * s));
const entries = (name, a) => a.flatMap((row, i) => row.map((v, j) => [`${name}[${i + 1},${j + 1}]`, v]));
const vector = (name, a) => a.map((v, i) => [`${name}[${i + 1}]`, v]);
const close = (actual, expected, name, tolerance = 1e-10) => {
  assert(Number.isFinite(actual) && Math.abs(actual - expected) < tolerance, `${name}: ${actual} != ${expected}`);
};

// Independent pivoted Gaussian elimination; Modelica uses Cholesky.
function solve(a, b) {
  const n = a.length, m = b[0].length, rows = a.map((row, i) => [...row, ...b[i]]);
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(rows[i][k]) > Math.abs(rows[pivot][k])) pivot = i;
    [rows[k], rows[pivot]] = [rows[pivot], rows[k]];
    for (let i = k + 1; i < n; i++) {
      const ratio = rows[i][k] / rows[k][k];
      for (let j = k; j < n + m; j++) rows[i][j] -= ratio * rows[k][j];
    }
  }
  const result = matrix(n, m, () => 0);
  for (let i = n - 1; i >= 0; i--) for (let j = 0; j < m; j++) {
    result[i][j] = (rows[i][n + j] - rows[i].slice(i + 1, n).reduce((s, v, k) => s + v * result[i + 1 + k][j], 0)) / rows[i][i];
  }
  return result;
}

const P = scale(identity(15), .1), C = scale(identity(6), .04);
const F = matrix(15, 15, () => 0), G = matrix(15, 12, () => 0);
const density = [.06, .06, .06, .006, .006, .006, .002, .002, .002, .0002, .0002, .0002];
for (let i = 0; i < 3; i++) {
  F[i][i + 3] = 1; F[i + 3][i + 9] = -1; F[i + 6][i + 12] = -1;
  G[i + 3][i] = -1; G[i + 6][i + 3] = -1; G[i + 9][i + 6] = 1; G[i + 12][i + 9] = 1;
}
F[3][7] = 9.81; F[4][6] = -9.81;
const powers = [identity(15)];
for (let i = 1; i <= 4; i++) powers.push(multiply(powers.at(-1), F));
assert.deepEqual(powers[4].flat(), Array(225).fill(0));
function predicted(h) {
  const factorial = [1, 1, 2, 6], D = multiply(multiply(G, matrix(12, 12, (i, j) => i === j ? density[i] ** 2 : 0)), transpose(G));
  let transition = matrix(15, 15, () => 0), Q = matrix(15, 15, () => 0);
  for (let i = 0; i < 4; i++) transition = add(transition, scale(powers[i], h ** i / factorial[i]));
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    Q = add(Q, scale(multiply(multiply(powers[i], D), transpose(powers[j])), h ** (i + j + 1) / (factorial[i] * factorial[j] * (i + j + 1))));
  }
  return add(multiply(multiply(transition, P), transpose(transition)), Q);
}
const parameters = [['finiteLimit', Number.MAX_VALUE],
  ...vector('propagation.fraction', [.5 - Math.sqrt(15) / 10, .5, .5 + Math.sqrt(15) / 10]),
  ...vector('propagation.weight', [5 / 18, 4 / 9, 5 / 18]),
  ['spaceDimension', 3], ['errorDimension', 15], ['noiseDimension', 12], ['poseDimension', 6]];
for (const name of ['observationCheck', 'innovationSolve']) {
  parameters.push([`${name}.pivot_floor`, 1e-12], [`${name}.symmetry_absolute`, 1e-12], [`${name}.symmetry_relative`, 1e-8]);
}
const scenarios = [
  {name: 'prediction only', enabled: 0, h: 1 / 90, offset: .02, accepted: false, rejected: false, valid: true},
  {name: 'pose correction', enabled: 1, h: 1 / 90, offset: .02, accepted: true, rejected: false, valid: true},
  {name: 'NIS rejection', enabled: 1, h: 1 / 90, offset: 100, accepted: false, rejected: true, valid: true},
  {name: 'invalid covariance', enabled: 1, h: 1 / 90, offset: .02, accepted: false, rejected: true, valid: true, badCovariance: true},
  {name: 'invalid flag', enabled: 2, h: 1 / 90, offset: .02, accepted: false, rejected: true, valid: true},
  {name: 'zero substep', enabled: 1, h: 0, offset: .02, accepted: false, rejected: false, valid: false},
  {name: 'oversized substep', enabled: 1, h: .021, offset: .02, accepted: false, rejected: false, valid: false},
  {name: 'invalid density', enabled: 1, h: 1 / 90, offset: .02, accepted: false, rejected: false, valid: false, badDensity: true},
  {name: 'recovery', enabled: 1, h: 1 / 90, offset: .02, accepted: true, rejected: false, valid: true},
];
const frames = [], browserCases = [];
for (const scenario of scenarios) {
  p.fill(NaN);
  const measured = scenario.badCovariance ? matrix(6, 6, (i, j) => i === j ? (i === 5 ? -.04 : .04) : 0) : C;
  const inputs = [...parameters, ['h', scenario.h], ['observation_enabled', scenario.enabled], ['accepted_count', 3], ['rejected_count', 4], ['last_nis', .75],
    ...entries('rotation', identity(3)), ...entries('observed_rotation', identity(3)), ...entries('covariance', P), ...entries('observation_covariance', measured),
    ...vector('position', [1, -2, 3]), ...vector('velocity', [0, 0, 0]), ...vector('accel_bias', [0, 0, 0]), ...vector('gyro_bias', [0, 0, 0]),
    ...vector('accel', [0, 0, 9.81]), ...vector('gyro', [0, 0, 0]), ...vector('gravity', [0, 0, -9.81]), ...vector('observed_position', [1, -2, 3 + scenario.offset]),
    ...vector('density', scenario.badDensity ? density.map((v, i) => i === 0 ? -v : v) : density)];
  for (const [name, value] of inputs) put(name, value);
  assert(p.every(Number.isFinite), 'Every P slot must be explicitly supplied');
  const before = Buffer.from(new Uint8Array(p.buffer, p.byteOffset, p.byteLength));
  // Deliberately poison prior algebraic storage to expose missing dependencies.
  y.fill(NaN); guard.fill(0xa7);
  const started = performance.now();
  instance.exports.eval_assignments(0, p.byteOffset, 0, 0, 0);
  const executeMs = performance.now() - started;
  assert.deepEqual(Buffer.from(new Uint8Array(p.buffer, p.byteOffset, p.byteLength)), before);
  assert(guard.every(value => value === 0xa7));
  const prior = scenario.valid ? predicted(scenario.h) : P, selected = [0, 1, 2, 6, 7, 8];
  const H = matrix(6, 15, (i, j) => +(selected[i] === j)), S = matrix(6, 6, (i, j) => prior[selected[i]][selected[j]] + C[i][j]);
  const K = transpose(solve(S, transpose(multiply(prior, transpose(H)))));
  const innovation = [0, 0, scenario.offset, 0, 0, 0], delta = K.map(row => row.reduce((s, v, j) => s + v * innovation[j], 0));
  assert(Math.max(...delta.slice(6, 9).map(Math.abs)) < 1e-14);
  const residual = add(identity(15), scale(multiply(K, H), -1));
  const posterior = add(multiply(multiply(residual, prior), transpose(residual)), multiply(multiply(K, C), transpose(K)));
  const covariance = scenario.accepted ? posterior : prior;
  for (let i = 0; i < 15; i++) for (let j = 0; j < 15; j++) {
    close(get(`next_covariance[${i + 1},${j + 1}]`), covariance[i][j], `${scenario.name} covariance[${i},${j}]`);
    assert.equal(get(`next_covariance[${i + 1},${j + 1}]`), get(`next_covariance[${j + 1},${i + 1}]`));
  }
  for (const [name, base, begin] of [['next_position', [1, -2, 3], 0], ['next_velocity', [0, 0, 0], 3], ['next_accel_bias', [0, 0, 0], 9], ['next_gyro_bias', [0, 0, 0], 12]]) {
    for (let i = 0; i < 3; i++) close(get(`${name}[${i + 1}]`), base[i] + (scenario.accepted ? delta[begin + i] : 0), `${scenario.name} ${name}[${i + 1}]`);
  }
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) close(get(`next_rotation[${i + 1},${j + 1}]`), +(i === j), `${scenario.name} rotation`, 1e-12);
  for (const [name, expected] of [['prediction_valid', +scenario.valid], ['observation_accepted', +scenario.accepted], ['observation_rejected', +scenario.rejected], ['next_accepted_count', 3 + +scenario.accepted], ['next_rejected_count', 4 + +scenario.rejected]]) assert.equal(get(name), expected, `${scenario.name} ${name}`);
  close(get('next_last_nis'), scenario.enabled === 0 || scenario.enabled === 2 || !scenario.valid || scenario.badCovariance ? .75 : scenario.offset ** 2 / S[2][2], `${scenario.name} NIS`);
  frames.push({name: scenario.name, executeMs});
  const expected = [...entries('next_covariance', covariance), ...entries('next_rotation', identity(3)),
    ['prediction_valid', +scenario.valid], ['observation_accepted', +scenario.accepted], ['observation_rejected', +scenario.rejected],
    ['next_accepted_count', 3 + +scenario.accepted], ['next_rejected_count', 4 + +scenario.rejected],
    ['next_last_nis', scenario.enabled === 0 || scenario.enabled === 2 || !scenario.valid || scenario.badCovariance ? .75 : scenario.offset ** 2 / S[2][2]]];
  for (const [name, base, begin] of [['next_position', [1, -2, 3], 0], ['next_velocity', [0, 0, 0], 3], ['next_accel_bias', [0, 0, 0], 9], ['next_gyro_bias', [0, 0, 0], 12]]) {
    expected.push(...vector(name, base.map((v, i) => v + (scenario.accepted ? delta[begin + i] : 0))));
  }
  browserCases.push({name: scenario.name, inputs: Array.from(p), expected: expected.map(([name, value]) => ({index: slot(name, 'Y'), value, tolerance: name.startsWith('next_rotation[') ? 1e-12 : 1e-10}))});
}
for (let i = 0; i < 100; i++) instance.exports.eval_assignments(0, p.byteOffset, 0, 0, 0);
const started = performance.now();
for (let i = 0; i < 1000; i++) instance.exports.eval_assignments(0, p.byteOffset, 0, 0, 0);
const execute1000Ms = performance.now() - started;
const report = {status: 'COMPLETE_NATIVE_FILTER_NUMERICAL_PASS', sourceSha256, moduleSha256: sha(bytes), moduleBytes: bytes.length,
  runtime: `Node ${process.version}`, yCount, pCount, stages: producer.nativeStages, frames, benchmark: {warmup: 100, calls: 1000, execute1000Ms, executeMs: execute1000Ms / 1000},
  scope: 'Isolated unchanged complete filter core with explicit inputs/parameters, poisoned Y, all225 covariance values and independent Lyapunov/Gaussian/Joseph oracles. No visual frontend, whole-pipeline throughput, browser compatibility, source-edit/persistence or release claim.'};
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync(`${output}.fixtures.json`, JSON.stringify({sourceSha256, moduleSha256: sha(bytes), yCount, pCount, cases: browserCases}) + '\n');
console.log(JSON.stringify(report));
