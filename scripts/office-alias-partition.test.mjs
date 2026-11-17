import test from 'node:test';
import assert from 'node:assert/strict';
import {aliasPartition} from './office-alias-partition.mjs';
const hash='a'.repeat(64),envelope=()=>({schemaVersion:1,selectionManifestSha256:hash,ordinals:[0,136,273,4241]});
test('partition names only existing frozen ordinals and retains their order',()=>{
  const input=envelope(),before=structuredClone(input);
  assert.deepEqual([...aliasPartition(input,hash,4242)],input.ordinals);assert.deepEqual(input,before);
});
test('partition cannot bind another manifest or carry labels, identities or overrides',()=>{
  assert.throws(()=>aliasPartition(envelope(),'b'.repeat(64),4242),/binding/);
  for(const key of ['label','cases','nativeReason','maxCases','limits'])assert.throws(()=>aliasPartition({...envelope(),[key]:[]},hash,4242),/envelope/);
});
test('partition refuses duplicate, reordered, invented, fractional and empty members',()=>{
  for(const ordinals of [[0,0],[1,0],[-1],[4242],[1.5],[],[0,Infinity]])assert.throws(()=>aliasPartition({...envelope(),ordinals},hash,4242));
});
