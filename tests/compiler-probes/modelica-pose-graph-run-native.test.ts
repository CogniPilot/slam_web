import {expect, it} from 'vitest';
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NativeProgram, type NativeProgramArtifact} from '../../src/modelica-native-program';
import {admissibleGraphInputs, cost, expQ, finiteDifferenceOptimizer, graphInputs, rotation} from './pose-graph-fixtures';
import {certifyRun, loadRun, quaternionFromMatrix, runCases, type RunCase} from './pose-graph-run-fixtures';

const artifactPath = process.env.RUMOCA_POSE_GRAPH_RUN_ARTIFACT;
const validationPath = process.env.RUMOCA_POSE_GRAPH_VALIDATION_ARTIFACT;
const source = () => readFileSync('models/Optimization/ModelicaPoseGraph.mo','utf8')+'\n'
  +readFileSync('tests/compiler-probes/fixtures/PoseGraphStorage.mo','utf8');
const sha = (bytes:string|Uint8Array) => createHash('sha256').update(bytes).digest('hex');

it('independent full256 graph and quaternion oracle cover non-axis-aligned loops', () => {
  const cases = runCases(), dense = cases.find(test => test.truth)!;
  expect(dense.graph.poses).toHaveLength(128); expect(dense.graph.edges).toHaveLength(256);
  expect(new Set(dense.graph.edges.map(edge => edge.slot)).size).toBe(256);
  expect(dense.graph.edges[254].from).toBe(127);
  expect(cost({...dense.graph, poses:dense.truth!})).toBeLessThan(1e-22);
  for (const vector of [[0,0,0],[.2,-.7,1], [3,.2,-.1],[-.1,3,.2],[.1,-.2,3]]) {
    const R = rotation(expQ(vector)), restored = rotation(quaternionFromMatrix(R));
    expect(Math.max(...R.flat().map((v,k) => Math.abs(v-restored.flat()[k])))).toBeLessThan(1e-14);
  }
});

it.skipIf(!artifactPath)('issued full128/256 PGRun executes nonlinear loop correction with typed limits', async () => {
  const bytes = readFileSync(artifactPath!), artifact:NativeProgramArtifact = JSON.parse(bytes.toString());
  const text = source(), program = await NativeProgram.instantiate(artifact,text);
  expect(artifact.model_name).toBe('PoseGraphRunStorage');
  for (const name of ['source','target']) for (let i=1; i<=256; i++)
    expect(program.integerInput(`${name}[${i}]`)).toBeInstanceOf(BigInt64Array);
  const results:Record<string,unknown>[] = [], cases = runCases();
  const run = (target:NativeProgram, test:RunCase) => {
    loadRun(target,test);
    const abi = artifact.abi;
    const p = new Uint8Array(target.memory.buffer,abi.p_offset,abi.p_count*8);
    const typed = new Uint8Array(target.memory.buffer,abi.input_lanes_offset,abi.input_lanes_bytes);
    const before = [sha(p),sha(typed)];
    new Float64Array(target.memory.buffer,abi.y_offset,abi.y_count).fill(NaN);
    const start = performance.now(); target.evaluate(results.length/90);
    const elapsedMs = performance.now()-start;
    expect([sha(p),sha(typed)], `${test.name}: readonly inputs`).toEqual(before);
    const result = certifyRun(test, name => target.output(name));
    results.push({name:test.name,elapsedMs,...result});
    return sha(new Uint8Array(target.memory.buffer,abi.y_offset,abi.y_count*8));
  };
  const baseline = run(program,cases[0]);
  const oracle = graphInputs(finiteDifferenceOptimizer(cases[0].graph));
  expect(Math.max(...program.output('nextPosition').map((v,k) => Math.abs(v-(oracle.position as number[][]).flat()[k])))).toBeLessThan(.003);
  expect(Math.max(...program.output('nextRotation').map((v,k) => Math.abs(v-(oracle.rotation as number[][][]).flat(2)[k])))).toBeLessThan(.002);
  for (const test of cases.slice(1)) run(program,test);
  expect(run(program,{...cases[0],name:'recovery after sparse NaN padding'})).toBe(baseline);
  program.reset(); expect(run(program,{...cases[0],name:'reset replay'})).toBe(baseline);
  const reloaded = await NativeProgram.instantiate(JSON.parse(JSON.stringify(artifact)),text);
  expect(run(reloaded,{...cases[0],name:'JSON reload'})).toBe(baseline);
  await expect(NativeProgram.instantiate(artifact,text+'\n// stale source')).rejects.toThrow('does not match its source');
  if (process.env.RUMOCA_POSE_GRAPH_RUN_REPORT) writeFileSync(process.env.RUMOCA_POSE_GRAPH_RUN_REPORT,JSON.stringify({
    status:'ACTUAL_FULL128_256_PGRUN_NUMERICAL_PASS', recordedAt:new Date().toISOString(),
    sourceSha256:sha(text),artifactSha256:sha(bytes),moduleSha256:artifact.module_sha256,compiler:artifact.compiler,
    fullCapacity:[128,256], results, readonlyRealAndTypedInputs:true, resetRecovery:true,jsonReload:true,
    staleSourceRefused:true,productionPinChanged:false,runtimeIntegrated:false,fullSlam:false,
    scope:'Production PGRun iteration kernel only. Complete optimizer validation/publication remains blocked by scratch planning.'
  },null,2)+'\n');
},120_000);

it.skipIf(!validationPath)('issued full128/256 validation preserves typed endpoints and refuses malformed graphs', async () => {
  const bytes = readFileSync(validationPath!), artifact:NativeProgramArtifact = JSON.parse(bytes.toString());
  const text = readFileSync('models/Optimization/ModelicaPoseGraph.mo','utf8')+'\n'
    +readFileSync('tests/compiler-probes/fixtures/PoseGraphValidationStorage.mo','utf8');
  const program = await NativeProgram.instantiate(artifact,text);
  expect(artifact.model_name).toBe('PoseGraphValidationStorage');
  const sparse = graphInputs(runCases()[0].graph), dense = graphInputs(runCases()[2].graph);
  const cases:{name:string;inputs:Record<string,unknown>}[] = [
    {name:'all128 nodes and all256 edges',inputs:dense},{name:'sparse eight-node loop',inputs:sparse},
  ];
  const edits:Record<string,(x:Record<string,unknown>) => void> = {
    'fractional node mask':x => {(x.nodeMask as number[])[3] = .5;},
    'NaN edge mask':x => {(x.edgeMask as number[])[255] = NaN;},
    'fractional endpoint':x => {(x.toNode as number[])[255] = 2.5;},
    'out of range endpoint':x => {(x.fromNode as number[])[255] = 129;},
    'inactive endpoint':x => {(x.toNode as number[])[255] = 127;},
    'disconnected active node':x => {(x.nodeMask as number[])[127] = 1;},
    'reflected rotation':x => {(x.rotation as number[][][])[3][0][0] *= -1;},
    'asymmetric information':x => {(x.information as number[][][])[255][0][1] += .2;},
    'singular information':x => {const W = (x.information as number[][][])[255];
      for (let k=0; k<6; k++) {W[5][k] = 0; W[k][5] = 0;}},
    'indefinite information':x => {const W = (x.information as number[][][])[255]; W[0][1] = 100; W[1][0] = 100;},
    'nonfinite information':x => {(x.information as number[][][])[255][4][4] = Infinity;},
  };
  for (const [name,edit] of Object.entries(edits)) {
    const inputs = structuredClone(sparse); edit(inputs); cases.push({name,inputs});
  }
  const padding = structuredClone(sparse);
  (padding.fromNode as number[])[200] = NaN; (padding.toNode as number[])[200] = Infinity;
  (padding.information as number[][][])[200][0][0] = NaN;
  cases.push({name:'disabled nonfinite edge padding',inputs:padding},
    {name:'valid recovery',inputs:sparse});
  const results:Record<string,unknown>[] = [];
  for (const {name,inputs} of cases) {
    for (const [field,values] of Object.entries(inputs)) program.input(field).set([values].flat(3) as number[]);
    const before = sha(new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8));
    new Uint8Array(program.memory.buffer,artifact.abi.output_lanes_offset,artifact.abi.output_lanes_bytes).fill(0xa5);
    const expected = admissibleGraphInputs(inputs), start = performance.now(); program.evaluate(0);
    const elapsedMs = performance.now()-start, status = program.output('status')[0];
    expect(status === 1,name).toBe(expected);
    if (!expected) expect(status,name).toBeLessThan(0);
    expect(sha(new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8)),name).toBe(before);
    for (let i=0; i<256; i++) {
      const source = program.integerOutput(`source[${i+1}]`)[0], target = program.integerOutput(`target[${i+1}]`)[0];
      expect(source >= 1n && source <= 128n && target >= 1n && target <= 128n,name).toBe(true);
      if (expected && (inputs.edgeMask as number[])[i] === 1) {
        expect(source,name).toBe(BigInt((inputs.fromNode as number[])[i]));
        expect(target,name).toBe(BigInt((inputs.toNode as number[])[i]));
      }
    }
    expect(program.output('activeNodes')[0]).toBe((inputs.nodeMask as number[]).filter(v => v === 1).length);
    expect(program.output('activeEdges')[0]).toBe((inputs.edgeMask as number[]).filter(v => v === 1).length);
    results.push({name,status,elapsedMs});
  }
  if (process.env.RUMOCA_POSE_GRAPH_VALIDATION_REPORT) writeFileSync(process.env.RUMOCA_POSE_GRAPH_VALIDATION_REPORT,JSON.stringify({
    status:'ACTUAL_FULL128_256_VALIDATION_NUMERICAL_PASS',recordedAt:new Date().toISOString(),sourceSha256:sha(text),
    artifactSha256:sha(bytes),moduleSha256:artifact.module_sha256,compiler:artifact.compiler,results,
    typedEndpointOutputs:true,readonlyInputs:true,productionPinChanged:false,fullSlam:false,
    scope:'PGValidateGraph component only; complete optimizer compilation and atomic publication remain unverified.'
  },null,2)+'\n');
},120_000);
