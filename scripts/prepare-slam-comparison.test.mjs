import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

test('hallway sealing excludes truth/state while retaining valid images despite an archive warning',async()=>{
 const root=await mkdtemp(join(tmpdir(),'slam-seal-'));
 try{
  const source=join(root,'capture'),output=join(root,'sealed');await mkdir(join(source,'hallway/frames'),{recursive:true});
  const rgb=Buffer.alloc(48,127),depth=Buffer.alloc(32);for(let i=0;i<16;i++)depth.writeUInt16LE(1000,i*2);
  const image={};
  for(const [kind,bytes]of [['rgb',rgb],['depth',depth]]){
   const file='frames/0000-'+kind+'.bin';await writeFile(join(source,'hallway',file),bytes);
   image[kind]={file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  }
  const metadata={time:0,sequence:0,imageLayout:{color:{format:'RGB8',width:4,height:4,strideBytes:12},depth:{format:'Z16',width:4,height:4,strideBytes:8,isBigEndian:false,unitsMeters:.001},rowOrder:'top-down'},
   calibration:{fx:4,fy:4,rgbFx:4,rgbFy:4},imu:{accel:[0,0,9.81],gyro:[0,0,0]}};
  await writeFile(join(source,'hallway/frames/0000.json'),JSON.stringify({index:0,time:0,sequence:0,metadata,image,state:{poison:'DO_NOT_EXPOSE'},truth:{time:0,x:1,y:2,z:3,quaternion:[1,0,0,0]}}));
  await writeFile(join(source,'receipt.json'),JSON.stringify({cases:[{environment:'hallway',frames:1}],pageErrors:['Asset archive: inspector body unavailable']}));
  const result=spawnSync(process.execPath,['scripts/prepare-slam-comparison.mjs',source,output],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const text=await readFile(join(output,'sensors.json'),'utf8'),input=JSON.parse(text);
  assert.equal(input.sensorFrames[0].scene,'hallway');assert.ok(!text.includes('DO_NOT_EXPOSE'));
  assert.ok(!('truth'in input.sensorFrames[0]));assert.ok(!('state'in input.sensorFrames[0]));
  const truth=JSON.parse(await readFile(join(output,'ground-truth.json'),'utf8'));assert.deepEqual(truth.samples[0].bodyPosition,[1,2,3]);
 }finally{await rm(root,{recursive:true,force:true});}
});

for(const [name,receipt]of [['runtime failure',{cases:[{environment:'hallway',frames:1}],pageErrors:['WebGL context lost']}],['empty completed capture',{cases:[]} ]]){
 test('sealing refuses '+name,async()=>{
  const root=await mkdtemp(join(tmpdir(),'slam-seal-refuse-'));
  try{
   await writeFile(join(root,'receipt.json'),JSON.stringify(receipt));
   const result=spawnSync(process.execPath,['scripts/prepare-slam-comparison.mjs',root,join(root,'sealed')],{encoding:'utf8'});
   assert.notEqual(result.status,0);
  }finally{await rm(root,{recursive:true,force:true});}
 });
}

const sealOneFrame=async(root,scene,cases)=>{
 const source=join(root,'capture');await mkdir(join(source,scene,'frames'),{recursive:true});
 const rgb=Buffer.alloc(48,127),depth=Buffer.alloc(32);for(let i=0;i<16;i++)depth.writeUInt16LE(1000,i*2);
 const image={};
 for(const [kind,bytes]of [['rgb',rgb],['depth',depth]]){
  const file='frames/0000-'+kind+'.bin';await writeFile(join(source,scene,file),bytes);
  image[kind]={file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 }
 const metadata={time:0,sequence:0,imageLayout:{color:{format:'RGB8',width:4,height:4,strideBytes:12},depth:{format:'Z16',width:4,height:4,strideBytes:8,isBigEndian:false,unitsMeters:.001},rowOrder:'top-down'},
  calibration:{fx:4,fy:4,rgbFx:4,rgbFy:4},imu:{accel:[0,0,9.81],gyro:[0,0,0]}};
 await writeFile(join(source,scene,'frames/0000.json'),JSON.stringify({index:0,time:0,sequence:0,metadata,image,truth:{time:0,x:0,y:0,z:1.5,quaternion:[1,0,0,0]}}));
 await writeFile(join(source,'receipt.json'),JSON.stringify({cases}));
 return spawnSync(process.execPath,['scripts/prepare-slam-comparison.mjs',source,join(root,'sealed')],{encoding:'utf8'});
};

test('sealing accepts a new scene id and records it in the manifest scene list',async()=>{
 const root=await mkdtemp(join(tmpdir(),'slam-seal-office-'));
 try{
  const result=await sealOneFrame(root,'office-loop',[{environment:'office-loop',frames:1}]);
  assert.equal(result.status,0,result.stderr);
  const manifest=JSON.parse(await readFile(join(root,'sealed','manifest.json'),'utf8'));
  assert.deepEqual(manifest.scenes,['office-loop']);
  const input=JSON.parse(await readFile(join(root,'sealed','sensors.json'),'utf8'));
  assert.equal(input.sensorFrames[0].scene,'office-loop');
 }finally{await rm(root,{recursive:true,force:true});}
});

for(const [name,cases]of [['a path-like scene id',[{environment:'../office',frames:1}]],['an uppercase scene id',[{environment:'Office',frames:1}]],['a duplicated scene',[{environment:'office-loop',frames:1},{environment:'office-loop',frames:1}]]]){
 test('sealing refuses '+name,async()=>{
  const root=await mkdtemp(join(tmpdir(),'slam-seal-scene-'));
  try{
   const result=await sealOneFrame(root,'office-loop',cases);
   assert.notEqual(result.status,0);
   assert.match(result.stderr,/Invalid scene id|Duplicate scene/);
  }finally{await rm(root,{recursive:true,force:true});}
 });
}
