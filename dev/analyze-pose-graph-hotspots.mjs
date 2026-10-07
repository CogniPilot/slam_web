// Bind perf PCs and retained call/copy counters to compiler-issued source spans.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import wabtFactory from 'wabt';

const [artifactPath,sourcePath,copiesPath,comparisonPath,profileDirectory,outputPath] = process.argv.slice(2);
if (!outputPath) throw Error('ARTIFACT SOURCE COPIES COMPARISON PROFILE_DIRECTORY OUTPUT required');
const sha = data => createHash('sha256').update(data).digest('hex');
const read = name => fs.readFileSync(path.join(profileDirectory,name));
const artifact = JSON.parse(fs.readFileSync(artifactPath)), sourceBytes = fs.readFileSync(sourcePath);
const copies = JSON.parse(fs.readFileSync(copiesPath)), comparison = JSON.parse(fs.readFileSync(comparisonPath));
const profile = JSON.parse(read('runtime-profile.json'));
assert.equal(sha(sourceBytes),artifact.source_sha256);
for (const receipt of [copies,comparison,profile]) {
  assert.equal(receipt.moduleSha256,artifact.module_sha256);
  assert.equal(receipt.sourceSha256,artifact.source_sha256);
}
assert.equal(profile.status,'PERF_EVALUATION_WINDOW_AND_ALL_PERIODS_VERIFIED');
assert.equal(comparison.status,'MATCHED_PGRUN_RUNTIME_PASS');
const fixture = 'tests/compiler-probes/pose-graph-run-fixtures.ts';
assert.equal(copies.sourceDigests[fixture],comparison.proofSources[fixture]);
assert.ok(copies.results.every(r => r.outputBitsEqual && r.readonlyRealAndTypedInputs));
const watPath = path.join(path.dirname(copiesPath),'module.wat');
const wat = fs.readFileSync(watPath,'utf8'), blocks = wat.split(/(?=^  \(func )/m);
const wabt = await wabtFactory(), original = wabt.readWasm(Uint8Array.from(artifact.module_bytes),{multi_memory:true});
original.generateNames(); original.applyNames();
assert.equal(wat,original.toText({foldExprs:false,inlineExport:false}),'WAT differs from issued module');
original.destroy();
const imported = WebAssembly.Module.imports(await WebAssembly.compile(Uint8Array.from(artifact.module_bytes)))
  .filter(item => item.kind === 'function').length;
function owner(index,expected) {
  const body = blocks.find(b => b.startsWith(`  (func $f${index} `)); assert.ok(body);
  const status = Number(body.match(/i32\.const (\d+)\n      return/)[1]);
  const fault = artifact.faults.find(f => f.status === status);
  assert.equal(fault.kind,'InvalidBuffer'); assert.equal(fault.opcode,'abi');
  assert.equal(fault.owner,index-imported);
  const span = fault.provenance;
  const expression = sourceBytes.subarray(span.start,span.end).toString('utf8');
  assert.ok(expression === expected || expression.startsWith(expected+'('),`Wrong source owner: ${expression}`);
  return {index,status,owner:fault.owner,provenance:span,expression,
    sourceLine:sourceBytes.subarray(0,span.start).toString('utf8').split('\n').length,
    spans:[...body.matchAll(/local\.get \$p[012]\n    i64\.extend_i32_u\n    i64\.const (\d+)/g)]
      .slice(0,3).map(m => Number(m[1]))};
}
const owners = {normalProduct:owner(28,'PGNormalProduct'),pcg:owner(33,'PGPCG'),
  precondition:owner(24,'PGPrecondition'),linearize:owner(35,'PGLinearize'),
  blockSolve:owner(23,'PGSolveBlock')};
const pcgBody = blocks.find(b => b.startsWith('  (func $f33 '));
const staticProductCallSites = [...pcgBody.matchAll(/call \$f28\b/g)].length;
const authoredPCG = sourceBytes.toString('utf8').split('function PGPCG\n')[1].split('end PGPCG;')[0];
assert.equal([...authoredPCG.matchAll(/PGNormalProduct\(/g)].length,1);
const cases = copies.results.map(test => {
  const baseline = comparison.results.find(r => r.name === test.name); assert.ok(baseline);
  const counters = baseline.assertions.map(r => r.pcg); assert.ok(counters.every(v => v === counters[0]));
  const expected = counters[0], actual = test.functionEntries['28'] ?? 0;
  const groups = new Map();
  for (const site of test.sites) {
    const row = groups.get(site.originalFunctionIndex) ?? {function:site.originalFunctionIndex,calls:0,bytes:0};
    row.calls += site.calls; row.bytes += site.logicalCopiedBytes; groups.set(site.originalFunctionIndex,row);
  }
  const inactiveCarry = test.sites.find(s => s.id === 168);
  assert.equal(inactiveCarry.originalFunctionIndex,28); assert.equal(inactiveCarry.originalWatLine,45492);
  assert.equal(inactiveCarry.immediateBytes,6144);
  return {name:test.name,expectedNormalProductCalls:expected,actualNormalProductCalls:actual,
    amplification:expected ? actual/expected : null,pcgFrames:test.functionEntries['33'],
    preconditionWithinIterations:test.functionEntries['24'] ?? 0,
    authoredPreconditionWithinIterationsUpperBound:expected,
    copyGroups:[...groups.values()].sort((a,b) => b.bytes-a.bytes),inactiveCarry,
    topCopySites:[...test.sites].sort((a,b) => b.logicalCopiedBytes-a.logicalCopiedBytes).slice(0,10)};
});

const machine = read('machine-code-and-runtime.log').toString().split('--- WebAssembly code ---')
  .find(b => /^\nname: wasm-function\[28\]\n/.test(b) && b.includes('compiler: TurboFan'));
assert.ok(machine,'Missing optimized machine code');
const instructions = machine.split('\n').flatMap(line => {
  const m = line.match(/^0x([0-9a-f]+)\s+([0-9a-f]+)\s+([0-9a-f]+)\s+(.+)$/);
  return m ? [{address:parseInt(m[1],16),offset:parseInt(m[2],16),bytes:m[3],text:m[4]}] : [];
});
const hot = new Map(), categories = new Map(); let allPeriods = 0, mappedPeriods = 0;
for (const block of read('runtime.perf.txt').toString().trim().split(/\n\s*\n/)) {
  const lines = block.split('\n'), header = lines[0].match(/:\s+(\d+)\s+cycles:u:/); assert.ok(header);
  const period = Number(header[1]); allPeriods += period;
  if (!lines[1].includes('wasm-function[28]-28-turbofan')) continue;
  const pc = parseInt(lines[1].trim().split(/\s+/)[0],16);
  let at = -1;
  for (let i=0; i<instructions.length; i++) {if (instructions[i].address <= pc) at=i; else break;}
  assert.ok(at >= 0 && pc < instructions[at].address+instructions[at].bytes.length/2,'PC missing from emitted instructions');
  mappedPeriods += period;
  const row = hot.get(at) ?? {...instructions[at],period:0,samples:0};
  row.period += period; row.samples++; hot.set(at,row);
  const text = row.text.replace(/^(?:REX\.W |VEX\.\w+ )+/,''), mnemonic = text.split(' ')[0];
  let category = 'other';
  if (/^(v?(?:add|sub|mul|div|sqrt|min|max)(?:s[sd]|p[sd])|v?fm)/.test(mnemonic)) category='floating arithmetic';
  else if (/^(v?mov|push|pop)/.test(mnemonic)) category=text.includes('[') ? 'memory move/load/store' : 'register/stack move';
  else if (/^(cmp|test|ucom|v?ucom|j|set)/.test(mnemonic)) category='compare/branch';
  else if (/^(lea|i?mul|add|sub|and|or|xor|shr|shl|sar|inc|dec)/.test(mnemonic)) category='integer/address arithmetic';
  else if (/^call/.test(mnemonic)) category='call';
  else if (/cvt/.test(mnemonic)) category='conversion';
  const group = categories.get(category) ?? {category,period:0,samples:0};
  group.period += period; group.samples++; categories.set(category,group);
}
assert.equal(allPeriods,profile.totalPeriod);
assert.equal(mappedPeriods,profile.leaves.find(l => l.leaf.includes('wasm-function[28]-28-turbofan')).period);
const report = {status:'SOURCE_BOUND_PGRUN_CALL_COPY_AND_MACHINE_HOTSPOTS_VERIFIED',recordedAt:new Date().toISOString(),
  moduleSha256:artifact.module_sha256,sourceSha256:artifact.source_sha256,owners,staticProductCallSites,cases,
  perf:{samples:profile.samples,unknownLeaves:profile.unknownLeaves,lostRecords:profile.lostRecords,
    throttleEvents:profile.throttleEvents,unthrottleEvents:profile.unthrottleEvents,
    totalPeriod:allPeriods,normalProductPercent:100*mappedPeriods/allPeriods,
    memmovePercent:profile.memmoveLeafPercent,copyWrapperPercent:profile.copyWrapperLeafPercent},
  machine:{instructions:instructions.length,
    categories:[...categories.values()].sort((a,b) => b.period-a.period)
      .map(g => ({...g,overallPercent:100*g.period/allPeriods,functionPercent:100*g.period/mappedPeriods})),
    top:[...hot.values()].sort((a,b) => b.period-a.period).slice(0,25)
      .map(g => ({...g,overallPercent:100*g.period/allPeriods}))},
  files:Object.fromEntries([artifactPath,sourcePath,copiesPath,comparisonPath,watPath,import.meta.filename,
    ...['runtime-profile.json','machine-code-and-runtime.log','runtime.perf.txt'].map(n => path.join(profileDirectory,n))]
    .map(p => [p,sha(fs.readFileSync(p))])),
  scope:'Compiler ABI fault status binds exact original function indices to source byte spans. Call/copy instrumentation retains original operations and checks output/input bits. Separate original-module perf PCs map to printed optimized instructions; categories include sampling skid, not exact instruction costs. No compiler fix, target speedup or full SLAM qualification is claimed.'};
fs.writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({owners,staticProductCallSites,cases:cases.map(c => ({name:c.name,expected:c.expectedNormalProductCalls,actual:c.actualNormalProductCalls,amplification:c.amplification})),perf:report.perf}));
