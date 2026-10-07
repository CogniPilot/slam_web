// Independent test oracle only; production retrieval is editable Modelica.
export const features = 350, cells = 49, words = 256, frames = 128;
const matrix = (rows: number, columns: number) => Array.from({length: rows}, () => Array(columns).fill(0) as number[]);
export interface BoWState {
  previousHistogram: number[][]; previousEnabled: number[];
  previousKeyframeId: number[]; previousKeyframeTime: number[];
  previousVersion: number; previousNextSlot: number; previousTime: number;
}
export interface BoWFixture extends BoWState {
  descriptor: number[][]; descriptorEnabled: number[]; descriptorCount: number;
  vocabulary: number[][]; vocabularyEnabled: number[]; vocabularyVersion: number;
  queryKeyframeId: number; timeNow: number; storeKeyframe: number; resetRequested: number;
  maximumWordDistanceSquared: number; minimumAssignments: number; minimumSimilarity: number; minimumAge: number;
}
export interface BoWResult {
  wordIndex: number[]; histogram: number[]; candidateId: number[]; candidateSlot: number[]; candidateScore: number[];
  nextHistogram: number[][]; nextEnabled: number[]; nextKeyframeId: number[]; nextKeyframeTime: number[];
  nextVersion: number; nextSlot: number; nextTime: number;
  configurationValid: number; vocabularyCount: number; assignmentCount: number; retrievalValid: number;
  candidateCount: number; stored: number; invalidHistoryCount: number;
}
export const emptyBoWState = (): BoWState => ({previousHistogram: matrix(frames, words), previousEnabled: Array(frames).fill(0),
  previousKeyframeId: Array(frames).fill(0), previousKeyframeTime: Array(frames).fill(0),
  previousVersion: 0, previousNextSlot: 1, previousTime: 0});
const finite = (x: number, low: number, high: number) => Number.isFinite(x) && x >= low && x <= high;
const integer = (x: number, low: number, high: number) => finite(x, low, high) && Number.isInteger(x);
const unitPatch = (patch: number[]): number[] | null => {
  if (patch.length !== cells || !patch.every(x => finite(x, -1e3, 1e3))) return null;
  const mean = patch.reduce((a, b) => a + b, 0) / cells;
  const centered = patch.map(x => x - mean), energy = centered.reduce((a, x) => a + x*x, 0);
  return energy > 1e-12 && energy <= 1e9 ? centered.map(x => x / Math.sqrt(energy)) : null;
};
const dot = (a: number[], b: number[]) => a.reduce((sum, x, i) => sum + x*b[i], 0);

export function bowOracle(f: BoWFixture): BoWResult {
  const stateValid = integer(f.previousVersion, 0, 1e9) && integer(f.previousNextSlot, 1, frames) && finite(f.previousTime, 0, 1e9);
  const configuration = integer(f.descriptorCount, 0, features) && integer(f.vocabularyVersion, 1, 1e9)
    && integer(f.queryKeyframeId, 0, 1e9) && finite(f.timeNow, 0, 1e9) && (f.timeNow >= f.previousTime || f.resetRequested === 1)
    && [0, 1].includes(f.storeKeyframe) && (!f.storeKeyframe || f.queryKeyframeId >= 1) && [0, 1].includes(f.resetRequested)
    && (stateValid || f.resetRequested === 1) && finite(f.maximumWordDistanceSquared, 0, 4)
    && integer(f.minimumAssignments, 1, features) && finite(f.minimumSimilarity, 0, 1) && finite(f.minimumAge, 0, 1e6);
  const reset = configuration && (f.resetRequested === 1 || f.vocabularyVersion !== f.previousVersion);
  const r: BoWResult = {wordIndex: Array(features).fill(0), histogram: Array(words).fill(0), candidateId: Array(4).fill(0),
    candidateSlot: Array(4).fill(0), candidateScore: Array(4).fill(0), nextHistogram: matrix(frames, words), nextEnabled: Array(frames).fill(0),
    nextKeyframeId: Array(frames).fill(0), nextKeyframeTime: Array(frames).fill(0),
    nextVersion: configuration ? f.vocabularyVersion : stateValid ? f.previousVersion : 0,
    nextSlot: stateValid && !reset ? f.previousNextSlot : 1, nextTime: configuration ? f.timeNow : stateValid ? f.previousTime : 0,
    configurationValid: +configuration, vocabularyCount: 0, assignmentCount: 0, retrievalValid: 0, candidateCount: 0, stored: 0, invalidHistoryCount: 0};
  for (let slot = 0; slot < frames; slot++) {
    const row = f.previousHistogram[slot], mass = row.reduce((a, x) => a + (finite(x, 0, 1) ? x : 0), 0);
    const valid = stateValid && !reset && f.previousEnabled[slot] === 1 && integer(f.previousKeyframeId[slot], 1, 1e9)
      && finite(f.previousKeyframeTime[slot], 0, f.previousTime) && row.every(x => finite(x, 0, 1)) && Math.abs(mass-1) <= 1e-6;
    if (!reset && f.previousEnabled[slot] !== 0 && !valid) r.invalidHistoryCount++;
    if (valid) {r.nextHistogram[slot] = [...row]; r.nextEnabled[slot] = 1;
      r.nextKeyframeId[slot] = f.previousKeyframeId[slot]; r.nextKeyframeTime[slot] = f.previousKeyframeTime[slot];}
  }
  const vocabulary = f.vocabulary.map((v, i) => configuration && f.vocabularyEnabled[i] === 1 ? unitPatch(v) : null);
  r.vocabularyCount = vocabulary.filter(Boolean).length;
  for (let i = 0; i < features; i++) {
    const patch = configuration && i < f.descriptorCount && f.descriptorEnabled[i] === 1 ? unitPatch(f.descriptor[i]) : null;
    if (!patch) continue;
    let best = -1, distance = Infinity;
    vocabulary.forEach((word, index) => {
      if (!word) return;
      const d = Math.max(0, 2-2*dot(patch, word));
      if (d < distance) {best = index; distance = d;}
    });
    if (best >= 0 && distance <= f.maximumWordDistanceSquared) {r.wordIndex[i] = best+1; r.histogram[best]++; r.assignmentCount++;}
  }
  if (r.assignmentCount) r.histogram = r.histogram.map(x => x/r.assignmentCount);
  const documents = r.nextEnabled.reduce((a, b) => a+b, 0);
  const idf = Array.from({length: words}, (_, word) => 1+Math.log((1+documents)/(1+r.nextHistogram.filter((h, slot) => r.nextEnabled[slot] && h[word] > 0).length)));
  const query = r.histogram.map((x, i) => x*idf[i]), queryNorm = Math.hypot(...query);
  r.retrievalValid = +(configuration && r.vocabularyCount > 0 && r.assignmentCount >= f.minimumAssignments && queryNorm*queryNorm > 1e-12);
  const ranked = r.nextHistogram.flatMap((row, slot) => {
    if (!r.retrievalValid || !r.nextEnabled[slot] || f.timeNow-r.nextKeyframeTime[slot] < f.minimumAge || f.queryKeyframeId === r.nextKeyframeId[slot]) return [];
    const weighted = row.map((x, i) => x*idf[i]), norm = Math.hypot(...weighted);
    const score = norm*norm > 1e-12 ? Math.min(1, Math.max(0, dot(query, weighted)/(queryNorm*norm))) : -1;
    return score >= f.minimumSimilarity ? [{score, slot, id: r.nextKeyframeId[slot]}] : [];
  }).sort((a, b) => b.score-a.score || a.id-b.id || a.slot-b.slot).slice(0, 4);
  ranked.forEach((entry, i) => {r.candidateId[i] = entry.id; r.candidateSlot[i] = entry.slot+1; r.candidateScore[i] = entry.score;});
  r.candidateCount = ranked.length;
  if (r.retrievalValid && f.storeKeyframe === 1) {
    const existing = r.nextKeyframeId.findIndex((id, slot) => r.nextEnabled[slot] && id === f.queryKeyframeId);
    const destination = existing >= 0 ? existing : r.nextSlot-1;
    r.nextHistogram[destination] = [...r.histogram]; r.nextEnabled[destination] = 1;
    r.nextKeyframeId[destination] = f.queryKeyframeId; r.nextKeyframeTime[destination] = f.timeNow; r.stored = 1;
    if (existing < 0) r.nextSlot = destination < frames-1 ? destination+2 : 1;
  }
  return r;
}

export function copyBoWState(r: BoWResult): BoWState {
  return {previousHistogram: r.nextHistogram.map(row => [...row]), previousEnabled: [...r.nextEnabled],
    previousKeyframeId: [...r.nextKeyframeId], previousKeyframeTime: [...r.nextKeyframeTime],
    previousVersion: r.nextVersion, previousNextSlot: r.nextSlot, previousTime: r.nextTime};
}
export function appearanceFixture(state: BoWState = emptyBoWState(), selection = [0, 1, 2, 3]): BoWFixture {
  let seed = 1303;
  const random = () => {seed = (Math.imul(seed, 1664525)+1013904223) >>> 0; return seed/2**32-0.5;};
  const vocabulary = Array.from({length: words}, () => unitPatch(Array.from({length: cells}, random))!);
  return {...structuredClone(state), vocabulary, vocabularyEnabled: Array(words).fill(1), vocabularyVersion: 1,
    descriptor: Array.from({length: features}, (_, i) => vocabulary[selection[i % selection.length]].map(x => 1.7*x+0.1)),
    descriptorEnabled: Array(features).fill(1), descriptorCount: features,
    queryKeyframeId: 1, timeNow: 1, storeKeyframe: 1, resetRequested: 0,
    maximumWordDistanceSquared: 0.8, minimumAssignments: 8, minimumSimilarity: 0.35, minimumAge: 2};
}
