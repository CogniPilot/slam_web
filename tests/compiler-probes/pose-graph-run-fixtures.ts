// Independent test geometry; never imported by the application.
import {correlatedInformation, cost, expQ, eye, graphInputs, inverse, loopFixture, matrix,
  multiply, mv, norm, product, rotation, transpose,
  type Graph, type Matrix, type Pose, type Quaternion} from './pose-graph-fixtures';

export interface RunCase {
  name: string;
  graph: Graph;
  truth?: Pose[];
  maximumIterations: number;
  costRatio: number;
  stationary?: boolean;
  poisonPadding?: boolean;
}

export function denseGraph(): {graph: Graph; truth: Pose[]} {
  const truth = loopFixture(128).truth;
  const poses = truth.map((pose, i) => i === 0 ? structuredClone(pose) : {
    p: pose.p.map((v, k) => v + .06*Math.sin(.37*i + k)),
    q: product(pose.q, expQ([.01*Math.sin(i), -.012*Math.cos(i), .008*Math.sin(.3*i)])),
  });
  const pairs = [
    ...Array.from({length:127}, (_, i) => [0,i+1]),
    ...Array.from({length:127}, (_, i) => [i,i+1]),
    [127,0], [65,32],
  ];
  const edges = pairs.map(([from,to], slot) => ({from, to, slot,
    t: mv(transpose(rotation(truth[from].q)), truth[to].p.map((v,k) => v-truth[from].p[k])),
    q: product(inverse(truth[from].q), truth[to].q), information:correlatedInformation(),
  }));
  return {graph:{poses, edges, active:Array(128).fill(true)}, truth};
}

export function runCases(): RunCase[] {
  const small = loopFixture(8), full = loopFixture(128), dense = denseGraph();
  return [
    {name:'rotated correlated loop', graph:small.graph, maximumIterations:8, costRatio:.02},
    {name:'128 nodes with late256th loop', graph:full.graph, maximumIterations:8, costRatio:.1},
    {name:'all128 nodes and all256 edges', ...dense, maximumIterations:8, costRatio:1e-6},
    {name:'one typed optimizer iteration', graph:small.graph, maximumIterations:1, costRatio:.99},
    {name:'stationary odometry optimum', graph:{...small.graph, edges:small.graph.edges.slice(0,-1)},
      maximumIterations:8, costRatio:1, stationary:true},
    {name:'disabled NaN padding', graph:small.graph, maximumIterations:8, costRatio:.02, poisonPadding:true},
  ];
}

export function loadRun(target: {input(name:string):Float64Array; integerInput(name:string):BigInt64Array}, test:RunCase) {
  const inputs = graphInputs(test.graph);
  for (const field of ['position','rotation','nodeMask','edgeMask','translation','measuredRotation','information'])
    target.input(field).set([inputs[field]].flat(3) as number[]);
  // Test-authored element names; no record/array ABI is inferred by the loader.
  for (const [name,field] of [['source','fromNode'],['target','toNode']])
    (inputs[field] as number[]).forEach((v,i) => {target.integerInput(`${name}[${i+1}]`)[0] = BigInt(v);});
  for (const [name,value] of Object.entries({initialCost:cost(test.graph),initialDamping:.001,
    maximumPositionStep:.5,maximumAngleStep:.2,pcgTolerance:1e-5})) target.input(name)[0] = value;
  for (const [name,value] of Object.entries({maximumIterations:test.maximumIterations,
    maximumPCG:48,maximumBacktracks:8})) target.integerInput(name)[0] = BigInt(value);
  if (test.poisonPadding) {
    target.input('position').fill(NaN,test.graph.poses.length*3);
    target.input('rotation').fill(NaN,test.graph.poses.length*9);
    for (const slot of [100,200,254]) {
      target.integerInput(`source[${slot+1}]`)[0] = 9223372036854775807n;
      target.integerInput(`target[${slot+1}]`)[0] = -9223372036854775808n;
      for (const [name,width] of [['translation',3],['measuredRotation',9],['information',36]] as const)
        target.input(name).fill(NaN,slot*width,(slot+1)*width);
    }
  }
}

// Stable quaternion reconstruction is independent of the production matrix-log
// residual and analytic Jacobian code. It handles every quaternion hemisphere.
export function quaternionFromMatrix(R: Matrix): Quaternion {
  const trace = R[0][0]+R[1][1]+R[2][2];
  if (trace > 0) {
    const s = 2*Math.sqrt(1+trace);
    return [s/4, (R[2][1]-R[1][2])/s, (R[0][2]-R[2][0])/s, (R[1][0]-R[0][1])/s];
  }
  const axis = [R[0][0],R[1][1],R[2][2]].indexOf(Math.max(R[0][0],R[1][1],R[2][2]));
  const j = (axis+1)%3, k = (axis+2)%3, s = 2*Math.sqrt(1+R[axis][axis]-R[j][j]-R[k][k]);
  const q: Quaternion = [0,0,0,0];
  q[0] = (R[k][j]-R[j][k])/s; q[axis+1] = s/4;
  q[j+1] = (R[j][axis]+R[axis][j])/s; q[k+1] = (R[k][axis]+R[axis][k])/s;
  return q;
}

export function certifyRun(test: RunCase, output: (name:string) => Float64Array) {
  const check = (ok:boolean, message:string) => {if (!ok) throw Error(`${test.name}: ${message}`);};
  const p = output('nextPosition'), R = output('nextRotation');
  check(p.length === 384 && R.length === 1152, 'full128 output shapes');
  const result: Graph = {...test.graph, poses:test.graph.poses.map((pose, i) => {
    const r = matrix(3,3,(a,b) => R[9*i+3*a+b]);
    if (test.graph.active[i]) {
      check(p.slice(3*i,3*i+3).every(Number.isFinite) && r.flat().every(Number.isFinite), 'finite active pose');
      const gram = multiply(transpose(r),r), det = r[0][0]*(r[1][1]*r[2][2]-r[1][2]*r[2][1])
        -r[0][1]*(r[1][0]*r[2][2]-r[1][2]*r[2][0])+r[0][2]*(r[1][0]*r[2][1]-r[1][1]*r[2][0]);
      check(Math.max(...gram.flat().map((v,k) => Math.abs(v-eye(3).flat()[k]))) < 1e-7
        && Math.abs(det-1) < 1e-7, 'proper rotation');
    }
    return {p:[...p.slice(3*i,3*i+3)], q:quaternionFromMatrix(r)};
  })};
  const before = cost(test.graph), after = cost(result), reported = output('cost')[0];
  check(Number.isFinite(after) && Number.isFinite(reported), 'finite objective');
  check(Math.abs(reported-after) < 1e-9*Math.max(1,before), 'independent objective agreement');
  check([...p.slice(0,3)].every((v,k) => v === test.graph.poses[0].p[k]), 'exact position gauge');
  check([...R.slice(0,9)].every((v,k) => v === rotation(test.graph.poses[0].q).flat()[k]), 'exact rotation gauge');
  const accepted = output('acceptedIterations')[0], pcg = output('pcgIterations')[0];
  check(Number.isInteger(accepted) && accepted >= 0 && accepted <= test.maximumIterations, 'accepted iteration budget');
  check(Number.isInteger(pcg) && pcg >= 0 && pcg <= 48*test.maximumIterations, 'PCG iteration budget');
  if (test.stationary) {
    check(accepted === 0, 'stationary point has no accepted descent');
    check(test.graph.poses.every((pose,i) => pose.p.every((v,k) => v === p[3*i+k])
      && rotation(pose.q).flat().every((v,k) => v === R[9*i+k])), 'stationary state is exact');
  } else {
    check(accepted > 0 && after < before*test.costRatio, 'required objective improvement');
  }
  if (test.truth) {
    const positionError = Math.max(...result.poses.map((pose,i) => norm(pose.p.map((v,k) => v-test.truth![i].p[k]))));
    const rotationError = Math.max(...result.poses.flatMap((pose,i) => rotation(pose.q).flat()
      .map((v,k) => Math.abs(v-rotation(test.truth![i].q).flat()[k]))));
    check(positionError < 1e-4 && rotationError < 1e-4, 'known full-graph geometry');
  }
  return {before, after, reported, accepted, pcg};
}
