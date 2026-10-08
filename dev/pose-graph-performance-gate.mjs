// Evaluate a trusted matched-runtime receipt; this does not execute or certify SLAM.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

export const requiredCases = Object.freeze([
  'rotated correlated loop', '128 nodes with late256th loop',
  'all128 nodes and all256 edges', 'one typed optimizer iteration',
  'stationary odometry optimum', 'disabled NaN padding',
]);

export function poseGraphPerformanceGate(report) {
  const require = (condition,message) => {if (!condition) throw Error(message);};
  require(report?.status === 'MATCHED_PGRUN_RUNTIME_PASS', 'Numerical benchmark must pass first');
  require(Array.isArray(report.results) && report.results.length === requiredCases.length,
    'All six workloads are required');
  require(new Set(report.results.map(row => row.name)).size === requiredCases.length
    && requiredCases.every(name => report.results.some(row => row.name === name)),
  'Missing, duplicate or unknown workload');
  const median = result => {
    require(Array.isArray(result?.timesMs) && result.timesMs.length === 6
      && result.timesMs.every(value => Number.isFinite(value) && value > 0),
    'Six positive finite measurements per engine are required');
    const sorted = [...result.timesMs].sort((a,b) => a-b);
    const value = (sorted[2]+sorted[3])/2;
    require(Number.isFinite(value) && result.medianMs === value, 'Stored median disagrees with measurements');
    return value;
  };
  const cases = requiredCases.map(name => {
    const row = report.results.find(row => row.name === name);
    require(Array.isArray(row.assertions) && row.assertions.length === 4,
      `${name}: four certified ABBA blocks are required`);
    row.assertions.forEach((block,index) => {
      require(block.block === index && block.engine === ['omc','wasm','wasm','omc'][index],
        `${name}: wrong block order`);
      require(Number.isFinite(block.maximumPoseDifference) && block.maximumPoseDifference >= 0
        && block.maximumPoseDifference <= 1e-7, `${name}: pose mismatch`);
      for (const count of ['accepted','pcg']) require(Number.isSafeInteger(block[count]) && block[count] >= 0
        && block[count] === row.assertions[0][count], `${name}: different ${count} iteration counts`);
    });
    const omcMs = median(row.omc), rumocaMs = median(row.rumoca);
    return {name,omcMs,rumocaMs,ratio:rumocaMs/omcMs,passed:rumocaMs < omcMs};
  });
  const passed = cases.every(row => row.passed);
  return {status:passed ? 'PGRUN_FASTER_THAN_OMC_PASS' : 'PGRUN_PERFORMANCE_TARGET_MISSED',
    passed,cases,scope:'Matched CPU WASM versus native C optimizer runtime only; not full SLAM throughput.'};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) throw Error('Usage: node dev/pose-graph-performance-gate.mjs RUNTIME_REPORT');
  const gate = poseGraphPerformanceGate(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));
  console.log(JSON.stringify(gate,null,2));
  process.exitCode = gate.passed ? 0 : 1;
}
