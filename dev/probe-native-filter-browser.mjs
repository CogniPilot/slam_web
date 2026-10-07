// Actual complete filter module in a dedicated Chromium worker; isolated gate.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {chromium} from '@playwright/test';

const [moduleFile, fixtureFile, reportFile] = process.argv.slice(2);
if (!reportFile) throw new Error('MODULE FIXTURES REPORT required');
const bytes = fs.readFileSync(moduleFile);
const fixture = JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
if (sha(bytes) !== fixture.moduleSha256) throw new Error('Issued module digest mismatch');
const browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox']});
try {
  const page = await browser.newPage();
  const result = await page.evaluate(async ({raw, fixture}) => {
    const run = async ({raw, fixture}) => {
      const require = (condition, message) => { if (!condition) throw new Error(message); };
      const module = await WebAssembly.compile(new Uint8Array(raw));
      const exports = WebAssembly.Module.exports(module);
      require(JSON.stringify(exports.map(e => [e.name, e.kind])) === JSON.stringify([['memory', 'memory'], ['eval_assignments', 'function']]), 'Unexpected public/private memory exports');
      const {yCount, pCount} = fixture, tail = (yCount + pCount) * 8;
      const memory = new WebAssembly.Memory({initial: Math.ceil((tail + 64) / 65536)});
      const env = {memory};
      for (const item of WebAssembly.Module.imports(module)) {
        require(item.module === 'env', 'Unexpected module import');
        if (item.kind === 'function') {
          require(typeof Math[item.name] === 'function', 'Unexpected non-math function import');
          env[item.name] = Math[item.name].bind(Math);
        }
      }
      const instance = await WebAssembly.instantiate(module, {env});
      const y = new Float64Array(memory.buffer, 0, yCount), p = new Float64Array(memory.buffer, yCount * 8, pCount);
      const guard = new Uint8Array(memory.buffer, tail, 64), frames = [];
      const pBytes = new Uint8Array(memory.buffer, p.byteOffset, p.byteLength);
      let recovery;
      for (const item of fixture.cases) {
        y.fill(NaN); p.set(item.inputs); guard.fill(0xa7);
        const before = pBytes.slice(), start = performance.now();
        instance.exports.eval_assignments(0, p.byteOffset, 0, 0, 0);
        const executeMs = performance.now() - start;
        require(pBytes.every((v, i) => v === before[i]), `${item.name} changed inputs`);
        require(guard.every(v => v === 0xa7), `${item.name} changed guard`);
        for (const expected of item.expected) require(Number.isFinite(y[expected.index]) && Math.abs(y[expected.index] - expected.value) < expected.tolerance, `${item.name} output${expected.index}: ${y[expected.index]} != ${expected.value}`);
        const output = item.expected.map(value => y[value.index]);
        if (item.name === 'pose correction') recovery = output;
        if (item.name === 'recovery') require(output.every((v, i) => Object.is(v, recovery[i])), 'Recovery differs from original valid frame');
        frames.push({name: item.name, outputsChecked: item.expected.length, executeMs});
      }
      for (const [yPtr, pPtr] of [[1, p.byteOffset], [0, 0], [memory.buffer.byteLength - 8, p.byteOffset]]) {
        const before = new Uint8Array(memory.buffer).slice();
        let trapped = false;
        try { instance.exports.eval_assignments(yPtr, pPtr, 0, 0, 0); } catch { trapped = true; }
        require(trapped, 'Invalid ABI did not trap');
        require(new Uint8Array(memory.buffer).every((v, i) => v === before[i]), 'Invalid ABI published output');
      }
      for (let i = 0; i < 100; i++) instance.exports.eval_assignments(0, p.byteOffset, 0, 0, 0);
      const outputIndices = fixture.cases.at(-1).expected.map(value => value.index);
      const input = new Float64Array(fixture.cases.at(-1).inputs), output = new Float64Array(outputIndices.length);
      let inputMs = 0, executeMs = 0, outputMs = 0;
      for (let i = 0; i < 1000; i++) {
        let start = performance.now(); p.set(input); inputMs += performance.now() - start;
        start = performance.now(); instance.exports.eval_assignments(0, p.byteOffset, i / 90, 0, 0); executeMs += performance.now() - start;
        start = performance.now(); for (let j = 0; j < output.length; j++) output[j] = y[outputIndices[j]]; outputMs += performance.now() - start;
      }
      return {status: 'COMPLETE_NATIVE_FILTER_WORKER_PASS', frames, abiRefusals: 3, inputGuardUnchanged: true,
        benchmark: {warmup: 100, calls: 1000, inputMs, executeMs, outputMs, executeMsPerCall: executeMs / 1000, totalMsPerCall: (inputMs + executeMs + outputMs) / 1000}};
    };
    const source = `const run=${run.toString()};onmessage=async e=>{try{postMessage({result:await run(e.data)})}catch(error){postMessage({error:String(error.stack||error)})}}`;
    const url = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}));
    const worker = new Worker(url);
    try {
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Filter worker gate timed out')), 30000);
        worker.onmessage = event => { clearTimeout(timer); event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.result); };
        worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message)); };
        worker.postMessage({raw, fixture});
      });
    } finally { worker.terminate(); URL.revokeObjectURL(url); }
  }, {raw: Array.from(bytes), fixture});
  const report = {recordedAt: new Date().toISOString(), browser: await browser.version(), sourceSha256: fixture.sourceSha256,
    moduleSha256: sha(bytes), moduleBytes: bytes.length, ...result,
    scope: 'Exact actual-source complete filter module in a dedicated browser worker; independent stationary-prior numerical cases. Isolated kernel/transfer timings, not viewer/sensors/registration/full SLAM or 10x whole-pipeline evidence. Production pin unchanged.'};
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
