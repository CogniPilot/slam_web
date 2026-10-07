import {it, expect} from 'vitest';
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NativeProgram, type NativeProgramArtifact} from '../../src/modelica-native-program';
import {appearanceFixture, bowOracle, copyBoWState, emptyBoWState, type BoWFixture, type BoWResult} from './rgbd-bag-of-words-fixtures';

const sha = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
const artifactPath = process.env.RUMOCA_BOW_ARTIFACT, editedPath = process.env.RUMOCA_BOW_EDITED_ARTIFACT;
const source = readFileSync('models/LoopClosure/RGBDBagOfWords.mo', 'utf8');
function revisitFixture(): BoWFixture {
  const initial = appearanceFixture();
  const historical = bowOracle(initial);
  const query = appearanceFixture(copyBoWState(historical));
  query.queryKeyframeId = 2; query.timeNow = 4; query.storeKeyframe = 0;
  query.descriptor.reverse();
  return query;
}
const distance = (a: number[], b: number[]) => Math.hypot(...a.map((x, i) => x-b[i]));
function relativeDistanceMismatch(a: number[][], b: number[][]) {
  return Math.max(...a.slice(1).map((point, i) => Math.abs(distance(point, a[0])-distance(b[i+1], b[0]))));
}

it('independent full350 retrieval fixture distinguishes revisits from geometric acceptance', () => {
  const query = revisitFixture(), retrieved = bowOracle(query);
  expect(retrieved.assignmentCount).toBe(350); expect(retrieved.vocabularyCount).toBe(256);
  expect(retrieved.candidateId).toEqual([1, 0, 0, 0]); expect(retrieved.candidateScore[0]).toBeCloseTo(1, 12);
  expect(retrieved.wordIndex.every(word => word >= 1 && word <= 4)).toBe(true);
  const allWords = bowOracle(appearanceFixture(emptyBoWState(), Array.from({length: 256}, (_, i) => i)));
  expect(allWords.assignmentCount).toBe(350); expect(allWords.wordIndex[255]).toBe(256);
  expect(allWords.wordIndex.slice(0, 256)).toEqual(Array.from({length: 256}, (_, i) => i+1));
  // A bag discards feature layout: the same visual words can occur on unrelated geometry.
  const reference = [[0, 0, 4], [1, 0, 4], [0, 1, 4], [1, 1, 5]];
  const revisit = reference.map(([x, y, z]) => [-y+0.4, x-0.2, z+0.1]);
  const alias = reference.map(([x, y, z]) => [2*x, 2*y, z]);
  expect(relativeDistanceMismatch(reference, revisit)).toBeLessThan(1e-12);
  expect(relativeDistanceMismatch(reference, alias)).toBeGreaterThan(1);
  // No proper rigid registration can reconcile the alias's changed pair distances.
  // Retrieval has no point/pose inputs and emits no accepted-loop/SE3 constraint.
  expect(source).not.toMatch(/input\s+Real\s+(?:position|rotation|truth)/);
  expect(source).toContain('full descriptor matching and geometric registration');
  expect(Object.keys(retrieved)).not.toContain('loopAccepted');
});

it('independent BoW fixtures retain empty vocabulary, novelty, time exclusion and deterministic ties', () => {
  const query = revisitFixture();
  const recent = structuredClone(query); recent.timeNow = 2.99;
  expect(bowOracle(recent).candidateCount).toBe(0);
  recent.timeNow = 3; expect(bowOracle(recent).candidateId[0]).toBe(1);
  const absent = structuredClone(query); absent.vocabularyEnabled.fill(0);
  expect(bowOracle(absent).retrievalValid).toBe(0); expect(bowOracle(absent).candidateCount).toBe(0);
  const novel = structuredClone(query); novel.descriptorEnabled.fill(0);
  expect(bowOracle(novel).assignmentCount).toBe(0); expect(bowOracle(novel).stored).toBe(0);
  const invalid = structuredClone(query); invalid.descriptor[0][0] = NaN;
  expect(bowOracle(invalid).assignmentCount).toBe(349);
  invalid.descriptorEnabled[0] = 0; expect(bowOracle(invalid).wordIndex[0]).toBe(0);
  const ties = structuredClone(query);
  for (const [slot, id] of [[5, 20], [7, 3], [11, 3]]) {
    ties.previousEnabled[slot] = 1; ties.previousHistogram[slot] = [...ties.previousHistogram[0]];
    ties.previousKeyframeId[slot] = id; ties.previousKeyframeTime[slot] = 1;
  }
  expect(bowOracle(ties).candidateId).toEqual([1, 3, 3, 20]);
  expect(bowOracle(ties).candidateSlot).toEqual([1, 8, 12, 6]);
  const wordTie = structuredClone(query); wordTie.vocabulary[1] = [...wordTie.vocabulary[0]];
  wordTie.descriptor = Array.from({length: 350}, () => [...wordTie.vocabulary[0]]);
  expect(bowOracle(wordTie).wordIndex).toEqual(Array(350).fill(1));
});

it('explicit keyframe state survives serialization, bounded FIFO wrap and vocabulary revision', () => {
  const initial = appearanceFixture(); let result = bowOracle(initial);
  // Updating an existing keyframe at90Hz changes its histogram/time, not ring occupancy.
  for (let step = 1; step <= 90; step++) {
    const f = appearanceFixture(copyBoWState(result)); f.timeNow = 1+step/90;
    result = bowOracle(f);
  }
  expect(result.nextEnabled.reduce((a, b) => a+b, 0)).toBe(1); expect(result.nextSlot).toBe(2);
  for (let id = 2; id <= 130; id++) {
    const f = appearanceFixture(JSON.parse(JSON.stringify(copyBoWState(result))));
    f.queryKeyframeId = id; f.timeNow = id+2; result = bowOracle(f);
  }
  expect(result.nextEnabled.reduce((a, b) => a+b, 0)).toBe(128); expect(result.nextSlot).toBe(3);
  expect(result.nextKeyframeId.slice(0, 3)).toEqual([129, 130, 3]);
  const changed = appearanceFixture(copyBoWState(result)); changed.vocabularyVersion = 2; changed.timeNow = 133; changed.storeKeyframe = 0;
  const reset = bowOracle(changed); expect(reset.nextVersion).toBe(2); expect(reset.candidateCount).toBe(0);
  expect(reset.nextEnabled.every(x => x === 0)).toBe(true);
  const corrupt = appearanceFixture(copyBoWState(result)); corrupt.timeNow = 133; corrupt.storeKeyframe = 0;
  corrupt.previousHistogram[10][0] = NaN;
  expect(bowOracle(corrupt).invalidHistoryCount).toBe(1); expect(bowOracle(corrupt).nextEnabled[10]).toBe(0);
  const stale = structuredClone(corrupt); stale.timeNow = 1;
  expect(bowOracle(stale).configurationValid).toBe(0); expect(bowOracle(stale).stored).toBe(0);
}, 30_000);

it('editable similarity threshold has a decisive independent appearance boundary', () => {
  const initial = appearanceFixture(emptyBoWState(), [0]);
  const query = appearanceFixture(copyBoWState(bowOracle(initial)), [0, 0, 0, 1]);
  query.timeNow = 4; query.queryKeyframeId = 2; query.storeKeyframe = 0;
  expect(bowOracle(query).candidateCount).toBe(1);
  query.minimumSimilarity = 0.99; expect(bowOracle(query).candidateCount).toBe(0);
  expect(source.replace('minimumSimilarity = 0.35', 'minimumSimilarity = 0.99')).not.toBe(source);
});

function setInputs(program: NativeProgram, artifact: NativeProgramArtifact, f: BoWFixture) {
  for (const name of artifact.input_names) {
    const value = f[name as keyof BoWFixture];
    if (value === undefined) throw new Error(`Unknown retrieval input ${name}`);
    program.input(name).set(typeof value === 'number' ? [value] : value.flat());
  }
}
function checkOutputs(program: NativeProgram, expected: BoWResult, name: string) {
  for (const [field, value] of Object.entries(expected)) {
    const wanted = typeof value === 'number' ? [value] : value.flat();
    const actual = program.output(field);
    expect(actual.length, `${name}/${field}`).toBe(wanted.length);
    for (let i = 0; i < wanted.length; i++) {
      expect(Number.isFinite(actual[i]), `${name}/${field}/${i}`).toBe(true);
      expect(Math.abs(actual[i]-wanted[i]), `${name}/${field}/${i}`).toBeLessThan(2e-10);
    }
  }
}

it.skipIf(!artifactPath)('actual issued full350×49/256-word/128-keyframe Modelica retrieval matches independent fixtures', async () => {
  const bytes = readFileSync(artifactPath!), artifact: NativeProgramArtifact = JSON.parse(bytes.toString());
  expect(artifact.model_name).toBe('RGBDBagOfWords');
  const program = await NativeProgram.instantiate(artifact, source);
  expect(program.input('descriptor').length).toBe(350*49);
  expect(program.input('vocabulary').length).toBe(256*49);
  expect(program.input('previousHistogram').length).toBe(128*256);
  const cases: {name: string; candidates: number; executionMs: number}[] = [];
  const run = (name: string, f: BoWFixture) => {
    setInputs(program, artifact, f);
    const p = new Uint8Array(program.memory.buffer, artifact.abi.p_offset, artifact.abi.p_count*8), before = sha(p);
    const start = performance.now(); program.evaluate(f.timeNow); const executionMs = performance.now()-start;
    expect(sha(p), `${name}/read-onlyP`).toBe(before);
    const expected = bowOracle(f); checkOutputs(program, expected, name);
    cases.push({name, candidates: expected.candidateCount, executionMs}); return expected;
  };
  const bootstrap = appearanceFixture(); const first = run('full350 configured vocabulary first keyframe', bootstrap);
  const query = appearanceFixture(JSON.parse(JSON.stringify(copyBoWState(first)))); query.queryKeyframeId = 2; query.timeNow = 4; query.storeKeyframe = 0;
  run('revisit after explicit state JSON persistence', query);
  run('all256 visual word assignments including final slot', appearanceFixture(emptyBoWState(), Array.from({length: 256}, (_, i) => i)));
  const fullHistory = structuredClone(query); fullHistory.storeKeyframe = 1; fullHistory.previousNextSlot = 128;
  for (let slot = 1; slot < 128; slot++) {
    fullHistory.previousEnabled[slot] = 1;
    fullHistory.previousHistogram[slot] = [...fullHistory.previousHistogram[0]];
    fullHistory.previousKeyframeId[slot] = slot === 127 ? 3 : 100+slot;
    fullHistory.previousKeyframeTime[slot] = 1;
  }
  const wrapped = run('full128 history ranks final slot and wraps FIFO', fullHistory);
  expect(wrapped.candidateSlot[1]).toBe(128); expect(wrapped.nextSlot).toBe(1);
  const recent = structuredClone(query); recent.timeNow = 2.9; run('recent frame excluded in simulation time', recent);
  const absent = structuredClone(query); absent.vocabularyEnabled.fill(0); run('no vocabulary', absent);
  const empty = structuredClone(query); empty.descriptorEnabled.fill(0); run('no measured descriptors', empty);
  const nan = structuredClone(query); nan.descriptor[0][0] = NaN; run('active nonfinite descriptor rejected', nan);
  const revised = structuredClone(query); revised.vocabularyVersion = 2; run('vocabulary revision invalidates histories', revised);
  run('full350 recovery', query); program.reset(); run('reset first frame', bootstrap);
  await expect(NativeProgram.instantiate(artifact, source+'\n// stale source')).rejects.toThrow('does not match its source');
  const restored = await NativeProgram.instantiate(JSON.parse(JSON.stringify(artifact)), source);
  setInputs(restored, artifact, query); restored.evaluate(query.timeNow); checkOutputs(restored, bowOracle(query), 'artifact JSON reload');
  if (process.env.RUMOCA_BOW_NUMERICAL_REPORT) writeFileSync(process.env.RUMOCA_BOW_NUMERICAL_REPORT, JSON.stringify({
    status: 'ACTUAL_NATIVE_BOW_NUMERICAL_PASS', sourceSha256: sha(source), artifactSha256: sha(bytes), moduleSha256: artifact.module_sha256,
    compiler: artifact.compiler, cases, stateJsonPersistence: true, artifactJsonReload: true, staleSourceRefused: true,
    retrievalOnly: true, loopAccepted: false, runtimeIntegrated: false, productionPinChanged: false,
  }, null, 2)+'\n');
}, 120_000);

it.skipIf(!artifactPath || !editedPath)('actual Modelica similarity edit changes retrieval after source-bound artifact reload', async () => {
  const editedSource = source.replace('minimumSimilarity = 0.35', 'minimumSimilarity = 0.99');
  const baseline: NativeProgramArtifact = JSON.parse(readFileSync(artifactPath!, 'utf8'));
  const edited: NativeProgramArtifact = JSON.parse(readFileSync(editedPath!, 'utf8'));
  const f = appearanceFixture(copyBoWState(bowOracle(appearanceFixture(emptyBoWState(), [0]))), [0, 0, 0, 1]);
  f.timeNow = 4; f.queryKeyframeId = 2; f.storeKeyframe = 0;
  const a = await NativeProgram.instantiate(baseline, source), b = await NativeProgram.instantiate(edited, editedSource);
  setInputs(a, baseline, f); setInputs(b, edited, f); a.evaluate(4); b.evaluate(4);
  expect(a.output('candidateCount')[0]).toBe(1); expect(b.output('candidateCount')[0]).toBe(0);
  await expect(NativeProgram.instantiate(edited, source)).rejects.toThrow('does not match its source');
}, 120_000);
