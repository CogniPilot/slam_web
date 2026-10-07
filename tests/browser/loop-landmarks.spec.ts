import {test,expect} from '@playwright/test';
import {fullModelicaScenario} from './full-modelica-scenarios';

// These fidelity requirements stay pending until the complete sensor-only
// Modelica backend is wired. Inertial propagation alone cannot satisfy them.
test.fixme('full Modelica observed revisits and contradicted landmark pruning',async()=>{
  const result=await fullModelicaScenario('loop-landmarks');
  expect(result.revisit.loops).toBeGreaterThan(0);expect(result.revisit.baselineLoops).toBe(0);
  expect(result.revisit.finalError).toBeLessThan(result.revisit.baselineFinal*.3);
  expect(result.revisit.ate).toBeLessThan(result.revisit.baselineAte*.8);
  expect(result.revisit.costAfter).toBeLessThan(result.revisit.costBefore);
  expect(result.revisit.words).toBeGreaterThan(6);expect(result.revisit.words).toBeLessThanOrEqual(512);
  expect(result.revisit.confirmed).toBeGreaterThan(10);expect(result.revisit.minimumCovariance).toBeGreaterThan(0);
  expect(result.genuineAccepted).toBe(true);expect(result.falseRejected).toBe(true);
  expect(result.membership.before).toBe(3);expect(result.membership.after).toBe(2);
  expect(result.membership.freePruned).toBe(1);expect(result.membership.occludedRetained).toBe(true);
  expect(result.membership.graphCorrectionError).toBeLessThan(1e-12);
});
