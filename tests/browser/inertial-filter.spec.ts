import {test,expect} from '@playwright/test';
import {fullModelicaScenario} from './full-modelica-scenarios';

// These fidelity requirements stay pending until the complete sensor-only
// Modelica backend is wired. Inertial propagation alone cannot satisfy them.
test.fixme('full Modelica ESKF bias, dropout recovery and loop covariance',async()=>{
  const result=await fullModelicaScenario('inertial-filter');
  expect(result.bias.accelError).toBeLessThan(.025);
  expect(result.bias.gyroError).toBeLessThan(.001);
  expect(result.bias.positionError).toBeLessThan(.04);
  expect(result.bias.velocityError).toBeLessThan(.05);
  expect(result.bias.accepted).toBeGreaterThanOrEqual(98);
  expect(result.bias.minEigenvalue).toBeGreaterThan(-1e-12);
  expect(result.outlierRejected).toBe(true);
  expect(result.statePreserved).toBe(true);
  expect(result.recovery.uncertaintyAfter).toBeGreaterThan(result.recovery.uncertaintyBefore*10);
  expect(result.recovery.positionError).toBeLessThan(.06);
  expect(result.recovery.accepted).toBeGreaterThanOrEqual(73);
  expect(result.recovery.minEigenvalue).toBeGreaterThan(-1e-12);
  expect(result.matrices.shape).toEqual([15,15]);
  expect(result.matrices.minEigenvalue).toBeGreaterThan(0);
  expect(result.matrices.maxIntegralError).toBeLessThan(1e-12);
  expect(result.matrices.analyticPositionError).toBeLessThan(1e-10);
  expect(result.geometric.updates).toBeGreaterThan(10);
  expect(result.geometric.points).toBeGreaterThan(20);
  expect(result.geometric.positionNorm).toBeLessThan(.08);
  expect(result.geometric.minEigenvalue).toBeGreaterThan(-1e-12);
  expect(result.geometric.mode).toContain('15-state ESKF');
  expect(result.correction.loops).toBe(1);
  expect(result.correction.covarianceError).toBeLessThan(1e-12);
  expect(result.correction.velocityError).toBeLessThan(1e-12);
  expect(result.correction.gravityError).toBeLessThan(1e-12);
  expect(result.correction.biasesPreserved).toBe(true);
  expect(result.correction.minEigenvalue).toBeGreaterThan(-1e-12);
});
