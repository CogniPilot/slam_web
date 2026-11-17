import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import * as compiler from '@cognipilot/rumoca';
import {loopConsensusSource,instantiateConsensusProbe,resultNames,consensusFailure,sha256} from './loop-consensus-probe.mjs';
import {loopConsensusFixtures} from './loop-consensus-fixtures.mjs';

test('actual full350 shipped consensus and observation outputs agree on analytic controls',async()=>{
  const pin=JSON.parse(await readFile(new URL('../rumoca-package.json',import.meta.url)));
  const wasm=await readFile(new URL('../node_modules/@cognipilot/rumoca/rumoca_bind_wasm_bg.wasm',import.meta.url));
  assert.equal(sha256(wasm),pin.files['rumoca_bind_wasm_bg.wasm']);
  await compiler.default({module_or_path:wasm});
  assert.equal(compiler.get_git_commit(),pin.revision.slice(0,12));
  const fixtures=loopConsensusFixtures(),programs=[],sourceHashes=[];
  for(const diagnostics of [false,true]){
    const prepared=await loopConsensusSource(fixtures.capacity,{diagnostics});
    const artifact=JSON.parse(compiler.prepare_native_program(prepared.source,'LoopConsensusProbe'));
    programs.push(await instantiateConsensusProbe(artifact,prepared.source));
    sourceHashes.push({sourceSha256:sha256(prepared.source),moduleSha256:artifact.module_sha256});
  }
  const rows=[];
  for(const entry of fixtures.cases){
    const original=programs[0].run(entry.inputs),observed=programs[1].run(entry.inputs);
    for(const key of resultNames)assert.deepEqual(observed[key],original[key],entry.name+' original output '+key);
    for(const [key,expected] of Object.entries(entry.expected))assert.deepEqual(observed[key],expected,entry.name+' '+key);
    if(observed.valid){
      for(const key of ['rotation','translation'])for(let i=0;i<observed[key].length;i++)
        assert.ok(Math.abs(observed[key][i]-fixtures.truth[key][i])<1e-9,entry.name+' '+key);
      assert.equal(observed.mask.filter(Boolean).length,observed.inliers);
      assert.ok(observed.mask.every((v,i)=>!v||entry.inputs.pairEnabled[i]===1));
      assert.equal(observed.mask.at(-1),entry.inputs.pairEnabled.at(-1));
    }else{
      assert.deepEqual(observed.mask,Array(350).fill(0));
      assert.deepEqual(observed.translation,[0,0,0]);
    }
    rows.push({name:entry.name,identity:true,failure:consensusFailure(observed),...observed});
  }
  const clean=fixtures.cases[0].inputs;
  assert.throws(()=>programs[1].run({...clean,trials:3.5}),/Integer control/);
  assert.throws(()=>programs[1].run({...clean,requested:2}),/Boolean control/);
  assert.throws(()=>programs[1].run({pairEnabled:clean.pairEnabled}),/Missing probe input/);
  assert.throws(()=>programs[1].run({...clean,sourcePoint:[[0,0,0]]}),/Invalid probe input/);
  assert.equal(programs[1].run(clean).valid,true);
  const report={status:'pass',capacity:350,activePairs:32,compiler:pin.revision,sourceHashes,rows,
    scope:'Analytic component controls; no office image or full-SLAM result.',readonlyInputs:true};
  if(process.env.SLAM_LOOP_PROBE_REPORT){
    const directory=process.env.SLAM_LOOP_PROBE_REPORT;await mkdir(directory,{recursive:true});
    await writeFile(join(directory,'numerics.json'),JSON.stringify(report,null,2)+'\n');
    await writeFile(join(directory,'fixtures.json'),JSON.stringify(fixtures)+'\n');
  }
});
