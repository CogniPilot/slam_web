// Attribute existing physics CPU samples to their enclosing refresh stage.
// Usage: node dev/analyze-physics-refresh-phases.mjs PROFILE REPORT OUTPUT
import fs from 'node:fs';
import crypto from 'node:crypto';
import {analyzePhysicsCpuProfile} from './analyze-physics-cpu-profile.mjs';

export function analyzeRefreshPhases(profile) {
  const validated = analyzePhysicsCpuProfile(profile);
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  const parents = new Map();
  for (const node of profile.nodes)
    for (const child of node.children ?? []) parents.set(child, node.id);
  const groups = {advance: 0, pureCallSeed: 0, pureCallProjection: 0,
    pureCallOther: 0, projection: 0, privateStatusBridge: 0};
  for (let index = 0; index < profile.samples.length; index++) {
    let node = nodes.get(profile.samples[index]);
    let advance = false, pureCall = false, seed = false, projection = false, bridge = false;
    while (node) {
      const {functionName: name, url} = node.callFrame;
      advance ||= name === 'advance_to' && url.endsWith('/compiler.js');
      if (url.endsWith('/compiler.wasm')) {
        pureCall ||= name.includes('::typed_program::eval_pure_call');
        seed ||= name.includes('::refresh_causal_seed_rows');
        projection ||= name.includes('::projection::project_algebraic_singleton_assignment');
        bridge ||= name.includes('WasmKernelRuntime>::call_status');
      }
      node = nodes.get(parents.get(node.id));
    }
    if (!advance) continue;
    const delta = profile.timeDeltas[index];
    groups.advance += delta;
    if (pureCall) {
      if (seed && projection) throw new Error('Ambiguous nested seed/projection attribution');
      groups[seed ? 'pureCallSeed' : projection ? 'pureCallProjection' : 'pureCallOther'] += delta;
    }
    if (projection) groups.projection += delta;
    if (bridge) groups.privateStatusBridge += delta;
  }
  const pureTotal = groups.pureCallSeed + groups.pureCallProjection + groups.pureCallOther;
  if (groups.advance !== validated.attribution.advanceUs
    || pureTotal !== validated.advanceGroups.typedPureCallInclusiveUs)
    throw new Error('Refresh attribution disagrees with validated whole-profile accounting');
  return groups;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  const [profilePath, reportPath, outputPath] = process.argv.slice(2);
  if (!profilePath || !reportPath || !outputPath) throw new Error('Expected PROFILE REPORT OUTPUT');
  const bytes = fs.readFileSync(profilePath);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  if (!/^[a-f0-9]{64}$/.test(report.compilerWasmSha256)) throw new Error('Missing compiler identity');
  const result = {compilerWasmSha256: report.compilerWasmSha256,
    sourceProfileSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    groups: analyzeRefreshPhases(JSON.parse(bytes)),
    scope: 'Weighted inclusive CDP samples. Pure-call stages are disjoint; projection and bridge groups overlap. Separate profile times do not establish isolated patch causation or unprofiled timing.'};
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result.groups)}\n`);
}
