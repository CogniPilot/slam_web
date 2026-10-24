// Synthetic refusal controls for the Phase B job-1 admission. Each fixture is built the way the CI job builds an artifact:
// frames whose truth follows the two-circuit reference, flight receipts from the reviewed checker, a seal from the repaired
// verifier, then the recorded seal/1 status and its ReferenceError log. Images are two buffers hard-linked into every frame.
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,linkSync,readFileSync,appendFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync,execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {OFFICE_MISSION,sha256} from './office-ci-contract.mjs';
import {reference} from './office-phase-b-checks.mjs';
import {CAPTURE_HEAD,loadAdmission,requireJob1Pipeline} from './office-phase-b-admission.mjs';
import {validateGrant,extractArchive,admitExtracted} from './admit-phase-b-capture.mjs';
const {frames,width,height,cameraHz}=OFFICE_MISSION,RUN='40100000001';
const rgb=Buffer.alloc(width*height*3,5),depth=Buffer.alloc(width*height*2,2);
const node=args=>spawnSync(process.execPath,args,{encoding:'utf8'});
const script=name=>new URL('./'+name,import.meta.url).pathname;
const SEAL_LOG=`file:///home/runner/slam_web/scripts/verify-office-ci-artifacts.mjs:54
console.log(JSON.stringify({frames:OFFICE_MISSION.frames,sealedFiles:files.length,consensusStatus:consensus.status,scope:receipt.scope}));
                                                                                             ^

ReferenceError: consensus is not defined
    at file:///home/runner/slam_web/scripts/verify-office-ci-artifacts.mjs:54:94

Node.js v22.23.3
`;
function artifact(){
 const root=mkdtempSync(join(tmpdir(),'phase-b-admit-')),capture=join(root,'capture');mkdirSync(join(capture,'frames'),{recursive:true});
 writeFileSync(join(root,'.rgb'),rgb);writeFileSync(join(root,'.depth'),depth);
 const layout={color:{format:'RGB8',width,height,strideBytes:width*3,bytes:rgb.length},
  depth:{format:'Z16',isBigEndian:false,unitsMeters:.001,width,height,strideBytes:width*2,bytes:depth.length},rowOrder:'top-down',clockDomain:'simulation'};
 for(let index=0;index<frames;index++){
  const stem=String(index).padStart(4,'0'),time=index/cameraHz,image={};
  for(const [kind,bytes,src] of [['rgb',rgb,'.rgb'],['depth',depth,'.depth']]){const file=`frames/${stem}-${kind}.bin`;linkSync(join(root,src),join(capture,file));image[kind]={file,bytes:bytes.length,sha256:sha256(bytes)};}
  const r=reference(time,'two-circuit'),truth={x:r.x,y:r.y,z:r.z,quaternion:[Math.cos(r.heading/2),0,0,Math.sin(r.heading/2)],velocity:[0,0,0]};
  const metadata={sequence:index,time,dt:index?1/cameraHz:0,calibration:{width,height},imageLayout:layout,imuIntervals:index?[{time,dt:1/cameraHz,imu:{accel:[0,0,9.81],gyro:[0,0,0]}}]:[]};
  writeFileSync(join(capture,'frames',stem+'.json'),JSON.stringify({index,sequence:index,time,metadata,truth,image,nativeTrace:{status:0,inputs:{imageEpoch:[index]},references:[]}}));
 }
 writeFileSync(join(capture,'receipt.json'),JSON.stringify({scene:'office-loop-two-circuit',complete:true,failure:null,framesCompleted:frames,firstTime:0,lastTime:250,
  physicsSourceSha256:'p',loadedPhysicsSourceSha256:'p',environment:'office-loop',graphics:{renderer:'SwiftShader (synthetic)'},scope:'synthetic fixture'}));
 writeFileSync(join(root,'build-origin.json'),JSON.stringify({source:'synthetic',runId:RUN,head:CAPTURE_HEAD}));
 mkdirSync(join(root,'flight'));
 for(const mode of ['envelope','return'])assert.equal(node([script('office-phase-b-checks.mjs'),mode,'--capture',capture,'--route','two-circuit','--out',join(root,'flight',mode)]).status,0);
 rmSync(join(root,'.rgb'));rmSync(join(root,'.depth'));
 assert.equal(node([script('verify-office-ci-artifacts.mjs'),root]).status,0);
 writeFileSync(join(root,'pipeline-status.json'),JSON.stringify({schemaVersion:1,stage:'seal',exitCode:1,finishedAt:'2026-10-24T21:53:30.000Z',scope:'synthetic'}));
 writeFileSync(join(root,'seal.log'),SEAL_LOG);
 return root;
}
const reseal=root=>{rmSync(join(root,'SHA256SUMS'));rmSync(join(root,'summary.json'));assert.equal(node([script('verify-office-ci-artifacts.mjs'),root]).status,0);};
const grantFor=(change={})=>{const g={schemaVersion:1,experiment:'phase-b-job1-admission',repository:'CogniPilot/slam_web',runId:RUN,attempt:1,head:CAPTURE_HEAD,
 artifactId:12600000001,artifactName:`office-loop-software-${RUN}-1`,archiveBytes:1,archiveSha256:'a'.repeat(64),...change};const raw=Buffer.from(JSON.stringify(g));return {g,raw,sha:sha256(raw)};};
const admit=root=>admitExtracted(root,grantFor().g,mkdtempSync(join(tmpdir(),'phase-b-admit-work-')));

test('the synthetic seal/1 artifact is admitted, and the receipt binds job 2 to it alone',()=>{
 const result=admit(artifact());
 assert.equal(result.pipeline.stage,'seal');assert.equal(result.failure.error,'ReferenceError: consensus is not defined');
 const receipt={schemaVersion:1,status:'admitted',grantSha256:'b'.repeat(64),runId:RUN,attempt:1,head:CAPTURE_HEAD,artifactId:12600000001,archiveBytes:9,archiveSha256:'c'.repeat(64),...result,scope:'s'};
 const dir=mkdtempSync(join(tmpdir(),'phase-b-admission-')),raw=Buffer.from(JSON.stringify(receipt));writeFileSync(join(dir,'a.json'),raw);
 const admission=loadAdmission({OFFICE_PHASE_B_ADMISSION:join(dir,'a.json'),OFFICE_PHASE_B_ADMISSION_SHA256:sha256(raw)});
 const pin={runId:RUN,head:CAPTURE_HEAD,artifactId:12600000001,archiveBytes:9,archiveSha256:'c'.repeat(64),sealManifestSha256:result.sealManifestSha256,originalFiles:result.sealedFiles};
 assert.equal(requireJob1Pipeline({stage:'seal',exitCode:1},pin,admission),'admitted');
 assert.throws(()=>requireJob1Pipeline({stage:'seal',exitCode:1},{...pin,archiveSha256:'d'.repeat(64)},admission),/differs from its admission/);
 assert.throws(()=>requireJob1Pipeline({stage:'flight-return',exitCode:2},pin,admission),/differs from its admission/);
 assert.throws(()=>requireJob1Pipeline({stage:'seal',exitCode:1},pin,null),/Job-1 pipeline incomplete/);
 assert.equal(requireJob1Pipeline({stage:'complete',exitCode:0},pin,null),'complete');
});
test('refusal controls: inventory, hashes, status, log, identity and reproduction',()=>{
 const cases=[
  ['an unsealed extra file',root=>writeFileSync(join(root,'extra.txt'),'x'),/inventory differs/],
  ['a sealed file changed',root=>appendFileSync(join(root,'capture/receipt.json'),' '),/sealed file differs/],
  ['a complete/0 artifact (not the exception)',root=>writeFileSync(join(root,'pipeline-status.json'),JSON.stringify({schemaVersion:1,stage:'complete',exitCode:0,finishedAt:'t',scope:'s'})),/not exactly seal\/1/],
  ['a different failure stage',root=>writeFileSync(join(root,'pipeline-status.json'),JSON.stringify({schemaVersion:1,stage:'flight-return',exitCode:1,finishedAt:'t',scope:'s'})),/not exactly seal\/1/],
  ['a different error in seal.log',root=>writeFileSync(join(root,'seal.log'),SEAL_LOG.replace('ReferenceError: consensus is not defined','TypeError: x is not a function')),/sole post-seal ReferenceError/],
  ['a second error in seal.log',root=>appendFileSync(join(root,'seal.log'),'Error: Camera artifact integrity failure\n'),/sole post-seal ReferenceError/],
  ['seal.log missing',root=>rmSync(join(root,'seal.log')),/missing or sealed seal.log/],
  ['another run',root=>{writeFileSync(join(root,'build-origin.json'),JSON.stringify({source:'synthetic',runId:'1',head:CAPTURE_HEAD}));reseal(root);},/build origin differs/],
  ['a flight receipt that does not reproduce',root=>{const p=join(root,'flight/return/return-receipt.json'),r=JSON.parse(readFileSync(p));r.endpoints[0].position=0.05;writeFileSync(p,JSON.stringify(r,null,1)+'\n');reseal(root);},/flight return receipt differs/],
  ['a summary that does not reproduce',root=>{const s=JSON.parse(readFileSync(join(root,'summary.json')));s.frames=1250;writeFileSync(join(root,'summary.json'),JSON.stringify(s));
   const lines=readFileSync(join(root,'SHA256SUMS'),'utf8').split('\n').map(l=>l.endsWith('  summary.json')?sha256(readFileSync(join(root,'summary.json')))+'  summary.json':l);writeFileSync(join(root,'SHA256SUMS'),lines.join('\n'));},/summary.json differs/],
 ];
 for(const [name,mutate,error] of cases){const root=artifact();mutate(root);assert.throws(()=>admit(root),error,name);}
});
test('the grant and the zip: exact bytes, attempt 1, frozen head, safe members',()=>{
 const {raw,sha}=grantFor();assert.equal(validateGrant(raw,sha).runId,RUN);
 assert.throws(()=>validateGrant(raw,'0'.repeat(64)),/grant hash mismatch/);
 for(const change of [{attempt:2},{head:'f'.repeat(40)},{artifactName:'office-loop-software-1-1'},{extra:true}]){const g=grantFor(change);assert.throws(()=>validateGrant(g.raw,g.sha),/grant (is not valid|fields differ)/);}
 const dir=mkdtempSync(join(tmpdir(),'phase-b-zip-')),zip=join(dir,'a.zip');
 execFileSync('python3',['-I','-B','-c','import sys,zipfile\nwith zipfile.ZipFile(sys.argv[1],"w") as z: z.writestr("../evil","x")',zip]);
 const bytes=readFileSync(zip),g=grantFor({archiveBytes:bytes.length,archiveSha256:createHash('sha256').update(bytes).digest('hex')}).g;
 assert.throws(()=>extractArchive(zip,g,join(dir,'x')),/Command failed/);
 assert.throws(()=>extractArchive(zip,{...g,archiveSha256:'e'.repeat(64)},join(dir,'y')),/not the granted original/);
});
