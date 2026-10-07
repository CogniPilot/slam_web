import {I, inverse, multiply, mv, rotation, transpose, type Matrix} from './rgbd-registration-uncertainty-fixtures';

export const capacity = 350;
export const realFields = ['sourcePoint', 'targetPoint', 'pairEnabled', 'activeCount',
  'coordinateLimit', 'rankTolerance', 'maximumRms', 'minimumConsensusFraction',
  'sourceCovariance', 'targetCovariance', 'maximumNormalizedSquared', 'covarianceMinimumPivot'] as const;
export type RobustFixture = {
  sourcePoint: Matrix; targetPoint: Matrix; pairEnabled: number[];
  sourceCovariance: Matrix[]; targetCovariance: Matrix[];
  activeCount: number; coordinateLimit: number; rankTolerance: number; maximumRms: number;
  maximumHypotheses: number; minimumConsensusFraction: number; useCovariance: boolean;
  maximumNormalizedSquared: number; covarianceMinimumPivot: number;
  expectedRotation: Matrix; expectedTranslation: number[]; expectedMask: number[];
  reason: number; geometryTolerance: number; exact: boolean; expectedRank: number;
};

// Analytic geometry, not a second implementation of consensus or Horn fitting.
export function robustFixture(dense = false): RobustFixture {
  const expectedRotation = dense ? rotation([1, 2, -3], .12) : [[0,-1,0],[1,0,0],[0,0,1]];
  const expectedTranslation = [.04, -.01, .02];
  const slots = dense ? Array.from({length: capacity}, (_, i) => i)
    : [0, 3, 8, 74, 119, 208, 280, 309, 332, 349];
  const sourcePoint = Array.from({length: capacity}, () => Array(3).fill(NaN));
  const targetPoint = structuredClone(sourcePoint), pairEnabled = Array(capacity).fill(0);
  const sourceCovariance = Array.from({length: capacity}, () => I(3).map(row => row.map(() => NaN)));
  const targetCovariance = structuredClone(sourceCovariance);
  slots.forEach((slot, i) => {
    const p = i + 1;
    sourcePoint[slot] = dense ? [((i % 25)-12)*.025, (Math.floor(i/25)-7)*.02, 2+(i%17)*.03]
      : [.3*p, .2*(p*p%7), 2+.1*(p*p*p%11)];
    targetPoint[slot] = mv(expectedRotation, sourcePoint[slot]).map((v, a) => v+expectedTranslation[a]);
    sourceCovariance[slot] = [[1e-4,0,0],[0,1e-4,0],[0,0,.01]];
    targetCovariance[slot] = structuredClone(sourceCovariance[slot]);
    pairEnabled[slot] = 1;
  });
  return {sourcePoint, targetPoint, pairEnabled, sourceCovariance, targetCovariance,
    activeCount: capacity, coordinateLimit: 1e6, rankTolerance: 1e-8, maximumRms: .02,
    maximumHypotheses: 64, minimumConsensusFraction: .5, useCovariance: true,
    maximumNormalizedSquared: 9, covarianceMinimumPivot: 1e-10,
    expectedRotation, expectedTranslation, expectedMask: [...pairEnabled], reason: 0,
    geometryTolerance: 1e-8, exact: true, expectedRank: 3};
}

export function robustCases(): {name: string; fixture: RobustFixture}[] {
  const cases: {name: string; fixture: RobustFixture}[] = [];
  const add = (name: string, change: (f: RobustFixture) => void = () => {}, dense = false) => {
    const fixture = robustFixture(dense); change(fixture); cases.push({name, fixture});
  };
  const outliers = (f: RobustFixture) => {
    for (const [slot, offset] of [[74, [.4,0,0]], [332, [0,-.4,0]]] as const) {
      f.targetPoint[slot] = f.targetPoint[slot].map((v, a) => v+offset[a]);
      f.expectedMask[slot] = 0;
    }
  };
  const noise = (f: RobustFixture) => {
    let i = 0;
    f.pairEnabled.forEach((enabled, slot) => { if (enabled) f.targetPoint[slot][2] += ++i%2 ? -.06 : .06; });
    f.exact = false; f.geometryTolerance = .1;
  };
  add('sparse clean covariance with poisoned inactive slots');
  add('full350 clean covariance', () => {}, true);
  add('sparse covariance rejects two moving correspondences', outliers);
  add('full350 covariance rejects twenty-one moving correspondences', f => {
    for (let i = 0; i < capacity; i += 17) {
      f.targetPoint[i][0] += .4; f.expectedMask[i] = 0;
    }
  }, true);
  add('metric mode ignores poisoned covariance', f => {
    f.useCovariance = false; f.sourceCovariance.forEach(c => c.forEach(row => row.fill(NaN)));
    f.targetCovariance = structuredClone(f.sourceCovariance);
  });
  add('metric consensus rejects two moving correspondences', f => {f.useCovariance = false; outliers(f);});
  add('covariance permits axial noise above metric RMS', noise);
  add('covariance separates axial noise and lateral outliers', f => {noise(f); outliers(f);});
  add('insufficient covariance consensus', f => {outliers(f); f.minimumConsensusFraction = .9; f.reason = 7;});
  add('insufficient metric consensus', f => {outliers(f); f.useCovariance = false; f.minimumConsensusFraction = .9; f.reason = 7;});
  add('invalid active coordinate', f => {f.sourcePoint[74][0] = NaN; f.reason = 2;});
  add('invalid active mask', f => {f.pairEnabled[74] = .5; f.reason = 2;});
  add('negative covariance', f => {f.sourceCovariance[74][0][0] = -1; f.reason = 1;});
  add('asymmetric covariance', f => {f.targetCovariance[349][0][1] = .001; f.reason = 1;});
  add('singular covariance', f => {f.sourceCovariance[349][2][2] = 0; f.reason = 1;});
  add('fractional active count', f => {f.activeCount = 350.5; f.reason = 1;});
  add('nonfinite consensus fraction', f => {f.minimumConsensusFraction = NaN; f.reason = 1;});
  add('typed zero hypothesis budget', f => {f.maximumHypotheses = 0; f.reason = 1;});
  add('typed budget above limit', f => {f.maximumHypotheses = 1025; f.reason = 1;});
  add('typed minimum budget clean fit', f => {f.maximumHypotheses = 1;});
  const firstSampleOutliers = (f: RobustFixture) => {
    // These two correspondences contaminate the first deterministic sample.
    for (const slot of [3,309]) {f.targetPoint[slot][0] += .4; f.expectedMask[slot] = 0;}
  };
  add('typed one-hypothesis budget limits consensus', f => {
    firstSampleOutliers(f); f.maximumHypotheses = 1; f.reason = 7;
  });
  add('typed restored budget recovers consensus', firstSampleOutliers);
  add('empty input domain', f => {f.activeCount = 0; f.reason = 3;});
  add('partial active domain ignores last poisoned slot', f => {
    f.activeCount = 349; f.expectedMask[349] = 0;
    f.sourcePoint[349].fill(NaN); f.sourceCovariance[349].forEach(row => row.fill(NaN));
  });
  add('planar wall features retain an observable rigid pose', f => {
    f.pairEnabled.forEach((enabled,i) => {if (enabled) {
      f.sourcePoint[i][2] = 2;
      f.targetPoint[i] = mv(f.expectedRotation,f.sourcePoint[i]).map((v,a) => v+f.expectedTranslation[a]);
    }}); f.expectedRank = 2;
  });
  add('collinear points refuse pose', f => {
    f.pairEnabled.forEach((enabled, i) => { if (enabled) {
      f.sourcePoint[i] = [.3*i, 0, 2];
      f.targetPoint[i] = mv(f.expectedRotation, f.sourcePoint[i]).map((v, a) => v+f.expectedTranslation[a]);
    }}); f.reason = 4;
  });
  add('recovery after invalid and degenerate frames');
  return cases;
}

export function certifyRobustResult(f: RobustFixture, output: (name: string) => ArrayLike<number>) {
  const near = (actual: number, expected: number, tolerance = 1e-8) => {
    if (!Number.isFinite(actual) || !Number.isFinite(expected) || Math.abs(actual-expected) > tolerance)
      throw Error(`Expected ${expected} +/- ${tolerance}, got ${actual}`);
  };
  const scalar = (name: string) => output(name)[0];
  for (const name of ['accepted','rejectionReason','rotation','translation','validCount','invalidCount',
    'rank','cost','rms','eigenGap','sourceCentroid','targetCentroid','finalInlierMask','rejectedCount'])
    if (Array.from(output(name)).some(value => !Number.isFinite(value))) throw Error(`${name} is not finite`);
  near(scalar('accepted'), +(f.reason === 0), 0); near(scalar('rejectionReason'), f.reason, 0);
  const mask = Array.from(output('finalInlierMask'));
  if (mask.length !== capacity) throw Error('Full350 output mask required');
  mask.forEach((value, i) => near(value, f.reason ? 0 : f.expectedMask[i], 0));
  const R = Array.from({length: 3}, (_, i) => Array.from(output('rotation')).slice(i*3, i*3+3));
  const t = Array.from(output('translation'));
  R.flat().forEach((value, i) => near(value, (f.reason ? I(3) : f.expectedRotation).flat()[i],
    f.exact ? f.geometryTolerance : .03));
  t.forEach((value, i) => near(value, f.reason ? 0 : f.expectedTranslation[i], f.geometryTolerance));
  if (f.reason) {near(scalar('rejectedCount'), 0, 0); return;}
  const count = mask.reduce((a, b) => a+b, 0);
  near(scalar('validCount'), count, 0); near(scalar('invalidCount'), 0, 0);
  near(scalar('rejectedCount'), f.pairEnabled.slice(0, f.activeCount).filter(v => v === 1).length-count, 0);
  const sourceMean = [0,0,0], targetMean = [0,0,0]; let cost = 0;
  mask.forEach((enabled, i) => { if (enabled) {
    for (let a = 0; a < 3; a++) {sourceMean[a] += f.sourcePoint[i][a]/count; targetMean[a] += f.targetPoint[i][a]/count;}
    const residual = mv(R, f.sourcePoint[i]).map((v, a) => v+t[a]-f.targetPoint[i][a]);
    const squared = residual.reduce((sum, value) => sum+value*value, 0); cost += squared;
    if (f.useCovariance) {
      const rotated = multiply(multiply(R, f.sourceCovariance[i]), transpose(R));
      const covariance = rotated.map((row, a) => row.map((v, b) => v+f.targetCovariance[i][a][b]));
      const score = mv(inverse(covariance), residual).reduce((sum, v, a) => sum+v*residual[a], 0);
      if (score > f.maximumNormalizedSquared+1e-8) throw Error(`Uncertified covariance residual ${i}: ${score}`);
    } else if (squared > f.maximumRms**2+1e-8) throw Error(`Uncertified metric residual ${i}`);
  }});
  sourceMean.forEach((v, i) => near(output('sourceCentroid')[i], v));
  targetMean.forEach((v, i) => near(output('targetCentroid')[i], v));
  near(scalar('cost'), cost); near(scalar('rms'), Math.sqrt(cost/count));
  const orthogonal = multiply(R, transpose(R));
  orthogonal.flat().forEach((v, i) => near(v, I(3).flat()[i]));
  const determinant = R[0][0]*(R[1][1]*R[2][2]-R[1][2]*R[2][1])
    -R[0][1]*(R[1][0]*R[2][2]-R[1][2]*R[2][0])+R[0][2]*(R[1][0]*R[2][1]-R[1][1]*R[2][0]);
  near(determinant, 1); near(scalar('rank'), f.expectedRank, 0);
  if (!(scalar('eigenGap') > 0)) throw Error('Accepted geometry must have a positive eigen gap');
  if (!f.exact && !(scalar('rms') > f.maximumRms)) throw Error('Axial-noise control must exceed the metric RMS gate');
  if (f.exact) {
    near(scalar('rms'), 0);
    const covariance = I(3).map(row => row.map(() => 0));
    mask.forEach((enabled,i) => {if (enabled) for (let a=0;a<3;a++) for (let b=0;b<3;b++)
      covariance[a][b] += (f.sourcePoint[i][a]-sourceMean[a])*(f.sourcePoint[i][b]-sourceMean[b])/count;});
    // Closed-form symmetric 3x3 spectrum; independent of the 4x4 Jacobi fit.
    const q = covariance.reduce((sum,row,i) => sum+row[i],0)/3;
    const centered = covariance.map((row,i) => row.map((v,j) => v-(i===j ? q : 0)));
    const p = Math.sqrt(centered.flat().reduce((sum,v) => sum+v*v,0)/6);
    const b = centered.map(row => row.map(v => v/(p || 1)));
    const det = b[0][0]*(b[1][1]*b[2][2]-b[1][2]*b[2][1])
      -b[0][1]*(b[1][0]*b[2][2]-b[1][2]*b[2][0])+b[0][2]*(b[1][0]*b[2][1]-b[1][1]*b[2][0]);
    const largest = p === 0 ? q : q+2*p*Math.cos(Math.acos(Math.max(-1,Math.min(1,det/2)))/3);
    near(scalar('eigenGap'),2*(3*q-largest));
  }
}
