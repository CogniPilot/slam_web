import {test,expect} from '@playwright/test';
import {fullModelicaScenario} from './full-modelica-scenarios';

// These fidelity requirements stay pending until the complete sensor-only
// Modelica backend is wired. Inertial propagation alone cannot satisfy them.
test.fixme('full Modelica RGB-D plane observability and closed sensor-only trajectory',async()=>{
  const result=await fullModelicaScenario('visual-tracking');
  expect(result.plane.rank).toBe(3);expect(result.plane.nullModes).toBe(3);
  expect(result.plane.normalError).toBeLessThan(.015);expect(result.plane.tangentChange).toBeLessThan(.002);
  expect(result.plane.yawChange).toBeLessThan(.001);expect(result.plane.samples).toBeLessThanOrEqual(600);
  expect(result.geometry.rank).toBe(6);expect(result.geometry.positionError).toBeLessThan(.015);
  expect(result.geometry.rotationError).toBeLessThan(.007);expect(result.geometry.minimumCovariance).toBeGreaterThan(0);
  expect(result.closed.ate).toBeLessThan(.16);expect(result.closed.finalError).toBeLessThan(.2);
  expect(result.closed.updates).toBeGreaterThan(20);expect(result.closed.matches).toBeGreaterThan(100);
  expect(result.closed.keyframes).toBeGreaterThanOrEqual(7);expect(result.closed.maxSamples).toBeLessThanOrEqual(600);
  expect(result.closed.minimumCovariance).toBeGreaterThan(0);expect(result.closed.mappedFrames).toBeGreaterThan(20);
});
