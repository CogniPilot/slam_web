// End-to-end seal of synthetic office CI artifacts for both scenes. The images are two shared byte buffers hard-linked
// into every frame, so the fixture stays small while the verifier reads and hashes the real file layout.
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,linkSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
import {OFFICE_MISSION,sha256} from './office-ci-contract.mjs';
const {frames,width,height,cameraHz}=OFFICE_MISSION;
const rgb=Buffer.alloc(width*height*3,7),depth=Buffer.alloc(width*height*2,3);
function artifact(scene,flight={envelope:'pass',return:'pass'}){
 const root=mkdtempSync(join(tmpdir(),'office-ci-seal-')),capture=join(root,'capture');mkdirSync(join(capture,'frames'),{recursive:true});
 writeFileSync(join(root,'rgb.bin'),rgb);writeFileSync(join(root,'depth.bin'),depth);
 const layout={color:{format:'RGB8',width,height,strideBytes:width*3,bytes:rgb.length},
  depth:{format:'Z16',isBigEndian:false,unitsMeters:.001,width,height,strideBytes:width*2,bytes:depth.length},rowOrder:'top-down',clockDomain:'simulation'};
 for(let index=0;index<frames;index++){
  const stem=String(index).padStart(4,'0'),time=index/cameraHz,image={};
  for(const [kind,bytes] of [['rgb',rgb],['depth',depth]]){
   const file=`frames/${stem}-${kind}.bin`;linkSync(join(root,kind+'.bin'),join(capture,file));image[kind]={file,bytes:bytes.length,sha256:sha256(bytes)};
  }
  const imuIntervals=index?[{time,dt:1/cameraHz,imu:{accel:[0,0,9.81],gyro:[0,0,0]}}]:[];
  const metadata={sequence:index,time,dt:index?1/cameraHz:0,calibration:{width,height},imageLayout:layout,imuIntervals};
  writeFileSync(join(capture,'frames',stem+'.json'),JSON.stringify({index,sequence:index,time,metadata,image,nativeTrace:{status:0,inputs:{imageEpoch:[index]},references:[]}}));
 }
 writeFileSync(join(capture,'receipt.json'),JSON.stringify({scene,complete:true,failure:null,framesCompleted:frames,firstTime:0,lastTime:250,
  physicsSourceSha256:'p',loadedPhysicsSourceSha256:'p',environment:'office-loop',graphics:{renderer:'SwiftShader (synthetic)'},scope:'synthetic fixture'}));
 if(scene==='office-loop-two-circuit')for(const check of ['envelope','return']){
  mkdirSync(join(root,'flight',check),{recursive:true});
  writeFileSync(join(root,'flight',check,check+'-receipt.json'),JSON.stringify({check:'phase-b-'+check,route:'two-circuit',status:flight[check]}));
 }else{
  mkdirSync(join(root,'consensus'));mkdirSync(join(root,'pairs'));
  const combined=Buffer.from(JSON.stringify({cases:[]}));writeFileSync(join(root,'consensus/combined-pairs.json'),combined);
  writeFileSync(join(root,'consensus/receipt.json'),JSON.stringify({status:'no-eligible-pairs',inputSha256:sha256(combined),cases:[]}));
  writeFileSync(join(root,'pairs/extraction-receipt.json'),JSON.stringify({status:'pass',identityVerifiedCases:0,caseErrors:0,missingLoopCountBaselines:0,reconstructionOnlyCases:0}));
 }
 return root;
}
const seal=root=>spawnSync(process.execPath,[new URL('./verify-office-ci-artifacts.mjs',import.meta.url).pathname,root],{encoding:'utf8'});
const lastLine=out=>JSON.parse(out.trim().split('\n').at(-1));

test('the two-circuit capture seals with both flight receipts passing',()=>{
 const root=artifact('office-loop-two-circuit'),run=seal(root);
 assert.equal(run.status,0,run.stderr);assert.ok(existsSync(join(root,'SHA256SUMS')));
 assert.deepEqual(lastLine(run.stdout).flight,{envelope:'pass',return:'pass'});
 assert.equal(JSON.parse(readFileSync(join(root,'summary.json'),'utf8')).scene,'office-loop-two-circuit');
});
test('the single-loop capture still seals with its consensus status',()=>{
 const root=artifact('office-loop'),run=seal(root);
 assert.equal(run.status,0,run.stderr);assert.ok(existsSync(join(root,'SHA256SUMS')));
 const line=lastLine(run.stdout);
 assert.deepEqual(Object.keys(line),['frames','sealedFiles','consensusStatus','scope']);assert.equal(line.consensusStatus,'no-eligible-pairs');
});
test('a refused flight receipt never seals',()=>{
 const root=artifact('office-loop-two-circuit',{envelope:'pass',return:'refused'}),run=seal(root);
 assert.notEqual(run.status,0);assert.ok(!existsSync(join(root,'SHA256SUMS')));
});
