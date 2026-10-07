import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzePhysicsCpuProfile} from './analyze-physics-cpu-profile.mjs';

const node=(id,name,url,children=[])=>({id,callFrame:{functionName:name,url,lineNumber:0,columnNumber:0},children});
const fixture=()=>({nodes:[
  node(1,'(root)','',[2]),node(2,'advance_to','http://localhost/compiler.js',[3]),
  node(3,'js-to-wasm:iidii:','wasm://wasm/bridge',[4,7]),
  node(4,'rumoca_solver::projection::project_algebraic_singleton_assignment','http://localhost/compiler.wasm',[5]),
  node(5,'rumoca_eval_solve::typed_program::eval_pure_call','http://localhost/compiler.wasm',[6]),
  node(6,'EvalFrame::eval_operation','http://localhost/compiler.wasm'),
  node(7,'wasm-function[0]','wasm://wasm/actual',[8]),node(8,'sin',''),
],samples:[6,8,3],timeDeltas:[2000,700,300]});

test('compiler execution below V8 entry trampoline is not a generated kernel',()=>{
  const result=analyzePhysicsCpuProfile(fixture());
  assert.equal(result.attribution.advanceUs,3000);
  assert.equal(result.attribution.advanceGeneratedKernelInclusiveUs,700);
  assert.equal(result.attribution.compilerWasmLeafUs,2000);
  assert.equal(result.attribution.engineBridgeLeafUs,300);
  assert.deepEqual(result.attribution.generatedModuleUrls,['wasm://wasm/actual']);
  assert.equal(result.advanceGroups.typedPureCallInclusiveUs,2000);
  assert.equal(result.advanceGroups.projectionSingletonAssignmentInclusiveUs,2000);
});

test('imported math descendants remain inside actual generated-kernel time',()=>{
  const profile=fixture();profile.samples=[8];profile.timeDeltas=[11];
  const result=analyzePhysicsCpuProfile(profile);
  assert.equal(result.attribution.advanceGeneratedKernelInclusiveUs,11);
  assert.equal(result.attribution.generatedKernelLeafUs,0);
});

test('unrecognized WASM frames stay unclassified rather than becoming evidence',()=>{
  const profile=fixture();profile.nodes.push(node(9,'engine-internal','wasm://wasm/unknown'));
  profile.nodes[2].children.push(9);profile.samples=[9];profile.timeDeltas=[17];
  const result=analyzePhysicsCpuProfile(profile);
  assert.equal(result.attribution.advanceGeneratedKernelInclusiveUs,0);
  assert.equal(result.attribution.unclassifiedWasmLeafUs,17);
  assert.equal(result.unclassifiedWasmFrames[0].functionName,'engine-internal');
});

test('duplicate call frames are aggregated across separate stack contexts',()=>{
  const profile=fixture();profile.nodes.push({...profile.nodes[5],id:9});
  profile.nodes[0].children.push(9);profile.samples=[6,9];profile.timeDeltas=[19,23];
  const result=analyzePhysicsCpuProfile(profile);
  assert.equal(result.topSelfFrames[0].microseconds,42);
  assert.equal(result.attribution.advanceUs,19);
});

test('invalid samples and cyclic ancestry cannot produce profile claims',()=>{
  for(const change of [profile=>profile.timeDeltas.pop(),profile=>profile.samples[0]=999,
    profile=>profile.timeDeltas[0]=NaN,profile=>profile.nodes[5].children.push(1)]){
    const profile=fixture();change(profile);
    assert.throws(()=>analyzePhysicsCpuProfile(profile));
  }
});
