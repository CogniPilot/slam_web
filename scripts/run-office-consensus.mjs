import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {sha256} from './office-ci-contract.mjs';
const [pairs,output]=process.argv.slice(2);if(!output)throw Error('Usage: run-office-consensus.mjs PAIRS NEW_OUTPUT');
await mkdir(output);
const extraction=JSON.parse(await readFile(join(pairs,'extraction-receipt.json'),'utf8'));
if(!['identity-verified-loop-cases','no-identity-verified-candidates'].includes(extraction.status)||!Number.isSafeInteger(extraction.identityVerifiedCases)||extraction.identityVerifiedCases<0)throw Error('Incomplete pair extraction receipt');
const input={schemaVersion:1,capacity:350,cases:[]},groups=[];
for(const [file,classification]of [['office-pairs.json','match-count-identity-checked']]){
 let bytes;try{bytes=await readFile(join(pairs,file));}catch(error){if(error.code==='ENOENT')continue;throw error;}
 const source=JSON.parse(bytes);
 if(source.schemaVersion!==1||source.capacity!==350||(!Array.isArray(source.cases)||source.cases.length===0))throw Error('Invalid office pair envelope: '+file);
 for(const entry of source.cases){
  if(!entry.provenance||!entry.inputs)throw Error('Missing office pair provenance');
  if(file==='office-pairs.json'){const matcher=entry.provenance.matcher;if(matcher?.matchCountIdentity!==true||matcher.configurationValid!==1||matcher.invalidReference!==0||matcher.invalidCurrent!==0||!Number.isSafeInteger(matcher.count)||matcher.count!==matcher.originalMatchedCount)throw Error('Unverified case in identity-checked pair file');}
  const name=classification+':'+entry.name;input.cases.push({...entry,name});groups.push({name,classification,sourceFile:file});
 }
}
if(input.cases.length!==extraction.identityVerifiedCases)throw Error('Pair extraction case count mismatch');
const bytes=Buffer.from(JSON.stringify(input)+'\n');await writeFile(join(output,'combined-pairs.json'),bytes);
const receipt={schemaVersion:1,status:input.cases.length?'running':'no-eligible-pairs',cases:groups,inputSha256:sha256(bytes),extraction,
 scope:'Consensus on actual extracted pairs; reconstruction-only cases lack native matchedCount identity and are never submitted to this probe. Absence is not a registration refusal. No loop-closure acceptance.'};
try{
 if(input.cases.length){
  const result=spawnSync(process.execPath,['scripts/probe-loop-consensus.mjs',join(output,'combined-pairs.json'),join(output,'probe')],{stdio:'inherit'});
  if(result.error)throw result.error;if(result.status!==0)throw Error('Office consensus probe failed: '+result.status);
  const probe=JSON.parse(await readFile(join(output,'probe/receipt.json'),'utf8'));
  if(probe.status!=='pass'||probe.inputSha256!==receipt.inputSha256||probe.results.length!==groups.length||probe.results.some(row=>row.identity!==true))throw Error('Consensus result/input identity failure');
  receipt.status='pass';
 }
}catch(error){receipt.status='failed';receipt.failure=String(error);process.exitCode=1;}
finally{await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,cases:groups.length,scope:receipt.scope}));}
