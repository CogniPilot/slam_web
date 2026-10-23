import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
async function fixture(run){
 const base=join(homedir(),'scratch/slam_web/tmp');await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'office-consensus-test-'));
 try{const pairs=join(root,'pairs'),output=join(root,'consensus');await mkdir(pairs);await writeFile(join(pairs,'extraction-receipt.json'),JSON.stringify({schemaVersion:1,status:'no-identity-verified-candidates',identityVerifiedCases:0}));await run({pairs,output});}
 finally{await rm(root,{recursive:true,force:true});}
}
const invoke=({pairs,output})=>spawnSync(process.execPath,['scripts/run-office-consensus.mjs',pairs,output],{encoding:'utf8',timeout:10000});
test('records explicit absence without replacing office evidence with fixtures',async()=>fixture(async f=>{
 const result=invoke(f);assert.equal(result.status,0,result.stderr);
 const receipt=JSON.parse(await readFile(join(f.output,'receipt.json'),'utf8'));
 assert.equal(receipt.status,'no-eligible-pairs');assert.deepEqual(receipt.cases,[]);
 assert.equal(JSON.parse(await readFile(join(f.output,'combined-pairs.json'),'utf8')).cases.length,0);
}));
test('reconstruction-only pairs never enter the identity-gated consensus probe',async()=>fixture(async f=>{
 await writeFile(join(f.pairs,'reconstruction-only.json'),JSON.stringify({schemaVersion:1,capacity:350,cases:[{name:'sequential-without-native-count',inputs:{},provenance:{matcher:{matchCountIdentity:false}}}]}));
 const result=invoke(f);assert.equal(result.status,0,result.stderr);
 const receipt=JSON.parse(await readFile(join(f.output,'receipt.json'),'utf8'));
 assert.equal(receipt.status,'no-eligible-pairs');assert.deepEqual(receipt.cases,[]);
}));
test('missing strict cases cannot silently pass a claimed extraction count',async()=>fixture(async f=>{
 await writeFile(join(f.pairs,'extraction-receipt.json'),JSON.stringify({schemaVersion:1,status:'identity-verified-loop-cases',identityVerifiedCases:1}));
 assert.match(invoke(f).stderr,/case count mismatch/);
}));
for(const matcher of [{matchCountIdentity:false},{matchCountIdentity:true,configurationValid:1,invalidReference:0,invalidCurrent:0,count:12,originalMatchedCount:11}])
 test('refuses falsely labelled match-count identity',async()=>fixture(async f=>{
  await writeFile(join(f.pairs,'office-pairs.json'),JSON.stringify({schemaVersion:1,capacity:350,cases:[{name:'refused',provenance:{matcher},inputs:{}}]}));
  const result=invoke(f);assert.notEqual(result.status,0);assert.match(result.stderr,/Unverified case/);
 }));
test('rejects empty strict files and malformed pair envelopes',async()=>fixture(async f=>{
 await writeFile(join(f.pairs,'office-pairs.json'),JSON.stringify({schemaVersion:1,capacity:350,cases:[]}));
 assert.match(invoke(f).stderr,/Invalid office pair envelope/);
}));
