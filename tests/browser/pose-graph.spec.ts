import {test,expect} from '@playwright/test';
import {fullModelicaScenario} from './full-modelica-scenarios';

// These fidelity requirements stay pending until the complete sensor-only
// Modelica backend is wired. Inertial propagation alone cannot satisfy them.
test.fixme('full Modelica SE3 optimization, map correction and false-loop rejection',async()=>{
  const result=await fullModelicaScenario('pose-graph');
  expect(result.graph.anchorPreserved).toBe(true);
  expect(result.graph.iterations).toBeGreaterThan(0);
  expect(result.graph.iterations).toBeLessThanOrEqual(6);
  expect(result.graph.costAfter).toBeLessThan(result.graph.costBefore*.2);
  expect(result.graph.after).toBeLessThan(result.graph.before*.65);
  expect(result.graph.endpointError).toBeLessThan(.08);
  expect(result.graph.rotationError).toBeLessThan(1e-10);
  expect(result.corrected.loops).toBe(1);
  expect(result.corrected.after).toBeLessThan(result.corrected.before);
  expect(result.corrected.mapAfter).toBeLessThan(result.corrected.mapBefore*.7);
  expect(result.corrected.livePoseCorrected).toBe(true);
  expect(result.corrected.finiteMap).toBe(true);
  expect(result.corrected.points).toBeGreaterThan(0);
  expect(result.rejected.inconsistentGeometry).toBe(true);
  expect(result.rejected.textureless).toBe(true);
  expect(result.rejected.loops).toBe(0);
  expect(result.rejected.rejected).toBeGreaterThan(0);
  expect(result.rejected.onlyOdometry).toBe(true);
  expect(result.rejected.posePreserved).toBe(true);
});
