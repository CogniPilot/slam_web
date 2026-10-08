import {expect,it} from 'vitest';
import {poseGraphPerformanceGate,requiredCases} from '../dev/pose-graph-performance-gate.mjs';

const receipt = () => ({status:'MATCHED_PGRUN_RUNTIME_PASS',results:requiredCases.map(name => ({
  name,omc:{timesMs:[10,10,10,10,10,10],medianMs:10},
  rumoca:{timesMs:[8,8,8,8,8,8],medianMs:8},
  assertions:['omc','wasm','wasm','omc'].map((engine,block) => ({
    engine,block,maximumPoseDifference:0,accepted:3,pcg:111,
  })),
}))});

it('requires a strict win on every workload, including stationary and padding controls',() => {
  expect(poseGraphPerformanceGate(receipt()).passed).toBe(true);
  for (const index of [4,5]) {
    const report = receipt();
    report.results[index].rumoca = {timesMs:[10,10,10,10,10,10],medianMs:10};
    const gate = poseGraphPerformanceGate(report);
    expect(gate.passed).toBe(false);
    expect(gate.cases[index].passed).toBe(false);
  }
});

it('refuses faster timings obtained with different solver work or missing controls',() => {
  const mismatch = receipt();
  mismatch.results[0].assertions[1].pcg--;
  expect(() => poseGraphPerformanceGate(mismatch)).toThrow('iteration counts');
  const missing = receipt(); missing.results.pop();
  expect(() => poseGraphPerformanceGate(missing)).toThrow('six workloads');
  const duplicate = receipt(); duplicate.results[5] = duplicate.results[0];
  expect(() => poseGraphPerformanceGate(duplicate)).toThrow('duplicate');
});

it('refuses fabricated medians, invalid samples, uncertified outputs and reordered blocks',() => {
  const median = receipt(); median.results[0].rumoca.medianMs = 1;
  expect(() => poseGraphPerformanceGate(median)).toThrow('median');
  const nan = receipt(); nan.results[0].rumoca.timesMs[0] = NaN;
  expect(() => poseGraphPerformanceGate(nan)).toThrow('finite');
  const output = receipt(); output.results[0].assertions[1].maximumPoseDifference = NaN;
  expect(() => poseGraphPerformanceGate(output)).toThrow('pose mismatch');
  const order = receipt(); order.results[0].assertions.reverse();
  expect(() => poseGraphPerformanceGate(order)).toThrow('block order');
  const failed = receipt(); failed.status = 'FAILED';
  expect(() => poseGraphPerformanceGate(failed)).toThrow('must pass first');
});
