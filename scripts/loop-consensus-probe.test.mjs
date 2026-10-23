import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {instrumentConsensus,loopConsensusSource,consensusFailure} from './loop-consensus-probe.mjs';

test('observation source edits only the consensus owner and fails on changed anchors',async()=>{
  const original=await readFile(new URL('../models/LoopClosure/RGBDLoopVerification.mo',import.meta.url),'utf8');
  const instrumented=instrumentConsensus(original),start=original.indexOf('  function Consensus\n'),end=original.indexOf('  end Consensus;',start);
  assert.equal(instrumented.slice(0,start),original.slice(0,start));
  assert.equal(instrumented.slice(instrumented.indexOf('  end Consensus;',start)),original.slice(end));
  assert.throws(()=>instrumentConsensus(original.replace('Integer count; Integer bestCount;','Integer count; Integer changed;')),/anchor changed/);
  assert.throws(()=>instrumentConsensus(''),/not found/);
});
test('probe retains shipped capacities and hashes while its input domain is explicit',async()=>{
  const a=await loopConsensusSource(32),b=await loopConsensusSource(32,{diagnostics:true});
  assert.equal(a.originalSourceSha256,b.originalSourceSha256);
  assert.deepEqual(a.sources,b.sources);
  assert.match(a.source,/input Real sourcePoint\[32,3\]/);
  assert.match(a.source,/constant Integer featureCapacity = 350/);
  assert.match(b.source,/output Integer bestCount; output Real bestCost/);
  for(const size of [0,2,351,3.5,NaN])await assert.rejects(()=>loopConsensusSource(size),/3\.\.350/);
});
test('failure labels distinguish match floor, sampled consensus, refinement and stabilization',()=>{
  assert.equal(consensusFailure({valid:true,reason:0}),'accepted');
  assert.match(consensusFailure({valid:false,reason:4}),/descriptor matches/);
  assert.match(consensusFailure({valid:false,reason:5,refinementCount:0}),/no sampled model/);
  assert.match(consensusFailure({valid:false,reason:5,refinementCount:1,lastFitAccepted:false}),/solve refused/);
  assert.match(consensusFailure({valid:false,reason:5,refinementCount:1,lastFitAccepted:true}),/fell below/);
  assert.match(consensusFailure({valid:false,reason:6}),/stabilize/);
});
