import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,readdirSync,chmodSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createHash} from 'node:crypto';import {execFileSync,spawnSync} from 'node:child_process';
// End-to-end restore against a stub gh that serves one run, one artifact and its zip; the entry budget is per pass.
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const dir=mkdtempSync(join(tmpdir(),'restore-comparison-input-')),bin=join(dir,'bin');
execFileSync('mkdir',[bin]);
writeFileSync(join(bin,'gh'),`#!/usr/bin/env node
const {readFileSync}=require('node:fs'),{join}=require('node:path'),stub=process.env.STUB_GH;
const path=process.argv[3]??'';
if(path.endsWith('/zip'))process.stdout.write(readFileSync(join(stub,'archive.zip')));
else if(path.includes('/actions/runs/'))process.stdout.write(readFileSync(join(stub,'run.json')));
else process.stdout.write(readFileSync(join(stub,'artifact.json')));
`);
chmodSync(join(bin,'gh'),0o755);
const pinFields={repository:'CogniPilot/slam_web',runId:'40300000000',head:'a'.repeat(40),artifactId:12700000000,
 artifactName:'office-loop-software-40300000000-1',sealManifestSha256:'f'.repeat(64)};
let cases=0;
function restore(pass,entries){
 const stub=join(dir,'case'+(++cases));execFileSync('mkdir',[stub]);
 execFileSync('python3',['-c',`import sys,zipfile
with zipfile.ZipFile(sys.argv[1],'w') as z:
    for i in range(int(sys.argv[2])): z.writestr(f'comparison/capture/frames/{i:05d}.json','{}')`,join(stub,'archive.zip'),String(entries)]);
 const archive=readFileSync(join(stub,'archive.zip'));
 const pin=pass==='2'?{schemaVersion:1,experiment:'phase-b-candidate-pass-1',...pinFields,archiveBytes:archive.length,archiveSha256:sha(archive),
  originalFiles:entries,candidateManifestSha256:'e'.repeat(64)}
  :{schemaVersion:1,experiment:'phase-b-baseline-pass-2',...pinFields,archiveBytes:archive.length,archiveSha256:sha(archive),
  originalFiles:entries,chromium:'154.0.8037.92',frames:1251,snapshotPlanSha256:null};
 const raw=Buffer.from(JSON.stringify(pin));writeFileSync(join(stub,'pin.json'),raw);
 writeFileSync(join(stub,'run.json'),JSON.stringify({head_sha:pin.head}));
 writeFileSync(join(stub,'artifact.json'),JSON.stringify({id:pin.artifactId,name:pin.artifactName,size_in_bytes:archive.length,
  digest:'sha256:'+sha(archive),expired:false,workflow_run:{id:Number(pin.runId)}}));
 const env={PATH:bin+':'+process.env.PATH,STUB_GH:stub,OFFICE_PHASE_B_PASS:pass};
 if(pass==='2')Object.assign(env,{OFFICE_PHASE_B_CANDIDATE_PIN:join(stub,'pin.json'),OFFICE_PHASE_B_CANDIDATE_PIN_SHA256:sha(raw)});
 else Object.assign(env,{OFFICE_PHASE_B_PIN:join(stub,'pin.json'),OFFICE_PHASE_B_PIN_SHA256:sha(raw)});
 const result=spawnSync(process.execPath,['scripts/restore-office-comparison-input.mjs',join(stub,'out'),join(stub,'download.zip')],{env,encoding:'utf8'});
 return {...result,out:join(stub,'out')};
}

test('pass 2 restores a job-2 artifact above the single-replay budget',()=>{
 const result=restore('2',7750);
 assert.equal(result.status,0,result.stderr);
 assert.equal(readdirSync(join(result.out,'qualified/comparison/capture/frames')).length,7750);
 assert.equal(JSON.parse(readFileSync(join(result.out,'input-receipt.json'))).pin.experiment,'phase-b-candidate-pass-1');
});
test('pass 2 still refuses an archive over its budget',()=>{
 const result=restore('2',8001);
 assert.notEqual(result.status,0);assert.match(result.stderr,/exceeds fixed replay budget/);
});
test('pass 1 keeps the 5000-entry budget',()=>{
 assert.equal(restore('1',5000).status,0);
 const result=restore('1',5001);
 assert.notEqual(result.status,0);assert.match(result.stderr,/exceeds fixed replay budget/);
});
