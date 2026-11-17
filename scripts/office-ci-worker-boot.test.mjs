import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';

test('the actual diagnostic worker bundle boots with Vite-compatible raw imports',async()=>{
 const scratch=join(homedir(),'scratch/slam_web/tmp');await mkdir(scratch,{recursive:true});
 const output=await mkdtemp(join(scratch,'office-worker-boot-'));
 try{
  const file=join(output,'worker.js'),build=spawnSync(process.execPath,['scripts/build-office-ci-trace.mjs',file],{encoding:'utf8',timeout:30000});
  assert.equal(build.status,0,build.stderr);
  const replies=[],self={postMessage:message=>replies.push(message)};
  // Evaluate the real emitted artifact, not a mock raw-import transform. No
  // browser or native computation is claimed by this module-boot control.
  vm.runInNewContext(await readFile(file,'utf8'),{self,URL,performance},{timeout:5000});
  assert.equal(typeof self.onmessage,'function');
  await self.onmessage({data:{id:19,type:'step',frame:{}}});
  assert.equal(replies.length,1);assert.equal(replies[0].id,19);
  assert.equal(replies[0].error,'Initialize native SLAM first');
 }finally{await rm(output,{recursive:true,force:true});}
});
