import {it, expect} from 'vitest';
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NativeProgram, type NativeProgramArtifact} from '../../src/modelica-native-program';
import {capacity, realFields, robustCases, certifyRobustResult} from './rgbd-robust-registration-fixtures';

const artifactPath = process.env.RUMOCA_ROBUST_ARTIFACT;
const sha = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const source = () => readFileSync('models/Math/RigidPointRegistration.mo', 'utf8')+'\n'
  +readFileSync('tests/compiler-probes/fixtures/RGBDRobustRegistrationFrame.mo', 'utf8');

it('independent robust fixtures span the full domain and distinguish covariance from metric gating', () => {
  const cases = robustCases();
  expect(cases.every(({fixture}) => fixture.pairEnabled.length === capacity)).toBe(true);
  expect(cases.find(c => c.name.startsWith('full350 covariance rejects'))!.fixture.expectedMask.reduce((a,b) => a+b)).toBe(329);
  expect(cases.find(c => c.name.startsWith('covariance permits'))!.fixture.exact).toBe(false);
});

it.skipIf(!artifactPath)('issued full350 robust fit executes covariance, consensus and typed controls', async () => {
  const artifactBytes = readFileSync(artifactPath!);
  const artifact: NativeProgramArtifact = JSON.parse(artifactBytes.toString());
  const text = source(), program = await NativeProgram.instantiate(artifact, text);
  expect(artifact.model_name).toBe('RGBDRobustRegistrationFrame');
  expect(artifact.abi.y_count).toBe(377);
  expect(program.input('sourcePoint').length).toBe(capacity*3);
  expect(program.input('sourceCovariance').length).toBe(capacity*9);
  expect(program.integerInput('maximumHypotheses')).toBeInstanceOf(BigInt64Array);
  expect(program.booleanInput('useCovariance')).toBeInstanceOf(Uint8Array);
  const results: {name: string; executionMs: number; accepted: number; reason: number; count: number; rms: number}[] = [];
  const cases = robustCases();
  let baselineOutput = '';
  for (const {name, fixture} of [...cases, {...cases[0], name:'reset replay'}]) {
    if (name === 'reset replay') program.reset();
    for (const field of realFields) program.input(field).set([fixture[field]].flat(3));
    program.integerInput('maximumHypotheses')[0] = BigInt(fixture.maximumHypotheses);
    program.booleanInput('useCovariance')[0] = +fixture.useCovariance;
    const p = new Uint8Array(program.memory.buffer, artifact.abi.p_offset, artifact.abi.p_count*8);
    const typed = new Uint8Array(program.memory.buffer, artifact.abi.input_lanes_offset, artifact.abi.input_lanes_bytes);
    const before = [sha(p), sha(typed)];
    new Float64Array(program.memory.buffer, artifact.abi.y_offset, artifact.abi.y_count).fill(NaN);
    const start = performance.now(); program.evaluate(results.length/90);
    const executionMs = performance.now()-start;
    expect([sha(p),sha(typed)], `${name}: readonly input lanes`).toEqual(before);
    try {certifyRobustResult(fixture, field => program.output(field));}
    catch (error) {throw Error(`${name}: ${String(error)}`);}
    const outputHash = sha(new Uint8Array(program.memory.buffer,artifact.abi.y_offset,artifact.abi.y_count*8));
    if (!results.length) baselineOutput = outputHash;
    if (name === 'reset replay') expect(outputHash).toBe(baselineOutput);
    results.push({name, executionMs, accepted:program.output('accepted')[0], reason:program.output('rejectionReason')[0],
      count:program.output('validCount')[0], rms:program.output('rms')[0]});
  }
  await expect(NativeProgram.instantiate(artifact, text+'\n// stale source')).rejects.toThrow('does not match its source');
  const restored = await NativeProgram.instantiate(JSON.parse(JSON.stringify(artifact)), text);
  for (const field of realFields) restored.input(field).set(program.input(field));
  restored.integerInput('maximumHypotheses').set(program.integerInput('maximumHypotheses'));
  restored.booleanInput('useCovariance').set(program.booleanInput('useCovariance'));
  restored.evaluate(0);
  certifyRobustResult(cases[0].fixture, field => restored.output(field));
  expect(sha(new Uint8Array(restored.memory.buffer,artifact.abi.y_offset,artifact.abi.y_count*8))).toBe(baselineOutput);
  if (process.env.RUMOCA_ROBUST_REPORT) writeFileSync(process.env.RUMOCA_ROBUST_REPORT, JSON.stringify({
    status:'ACTUAL_FULL350_ROBUST_REGISTRATION_NUMERICAL_PASS', recordedAt:new Date().toISOString(),
    sourceSha256:sha(text), artifactSha256:sha(artifactBytes), moduleSha256:artifact.module_sha256,
    compiler:artifact.compiler, results, readonlyRealAndTypedInputs:true, resetRecovery:true,
    staleSourceRefused:true, jsonReload:true, productionPinChanged:false, runtimeIntegrated:false, fullSlam:false,
    scope:'Production robust registration, 350 pair slots, 64 consensus hypotheses, covariance gate; independent analytic geometry and inverse-covariance residual certification. Not complete SLAM.'
  }, null, 2)+'\n');
}, 120_000);
