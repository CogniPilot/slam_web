import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceResourcePlan} from './reference-resource-plan.mjs';
test('legacy reference limits remain unchanged; hosted runner uses explicit smaller limits',()=>{
  assert.deepEqual(referenceResourcePlan({}),{seconds:120,rssMiB:8192,availableMiB:16384,cpus:'8,9',ompThreads:1,compilerProcesses:2});
  assert.deepEqual(referenceResourcePlan({SLAM_REFERENCE_RSS_MIB:'2048',SLAM_REFERENCE_AVAILABLE_MIB:'512',SLAM_REFERENCE_CPUS:''}),
    {seconds:120,rssMiB:2048,availableMiB:512,cpus:'',ompThreads:1,compilerProcesses:2});
});
test('configuration cannot raise the wall ceiling, lower the reserve or inject CPU commands',()=>{
  for(const env of [{SLAM_REFERENCE_SECONDS:'121'},{SLAM_REFERENCE_SECONDS:'0'},{SLAM_REFERENCE_RSS_MIB:'8193'},
    {SLAM_REFERENCE_RSS_MIB:'2g'},{SLAM_REFERENCE_AVAILABLE_MIB:'0'},{SLAM_REFERENCE_AVAILABLE_MIB:'511'},
    {SLAM_REFERENCE_CPUS:'0,0'},{SLAM_REFERENCE_CPUS:'0; echo bad'},{SLAM_REFERENCE_CPUS:'-1'}])assert.throws(()=>referenceResourcePlan(env));
});
