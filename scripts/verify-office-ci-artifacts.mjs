import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {OFFICE_MISSION,sha256,validateOfficeSample,assertCompleteOfficeCapture} from './office-ci-contract.mjs';
if(!process.argv[2])throw Error('Usage: verify-office-ci-artifacts.mjs OUTPUT');const root=resolve(process.argv[2]);
const capture=join(root,'capture'),receipt=JSON.parse(await readFile(join(capture,'receipt.json'),'utf8'));
assertCompleteOfficeCapture(receipt);
if(receipt.complete!==true)throw Error('Capture completion receipt was not sealed');
const references=new Map();
for(let index=0;index<OFFICE_MISSION.frames;index++){
 const frame=JSON.parse(await readFile(join(capture,'frames',String(index).padStart(4,'0')+'.json'),'utf8'));validateOfficeSample(frame,index);
 if(frame.nativeTrace?.status!==0||frame.nativeTrace.inputs?.imageEpoch?.[0]!==index)throw Error('Missing native observation provenance');
 for(const kind of ['rgb','depth']){const image=frame.image[kind];
  if(!new RegExp(`^frames/[0-9]{4}-${kind}\\.bin$`).test(image.file))throw Error('Invalid camera artifact path');
  const bytes=await readFile(join(capture,image.file));if(bytes.length!==image.bytes||sha256(bytes)!==image.sha256)throw Error('Camera artifact integrity failure');
 }
 for(const reference of [...frame.nativeTrace.references,...(frame.nativeTrace.retainedCurrent?[frame.nativeTrace.retainedCurrent]:[])]){
  if(!/^native-frames\/[0-9]+-[0-9]+-[0-9]+-[a-f0-9]{16}\.json$/.test(reference.file))throw Error('Invalid reference artifact path');
  if(!references.has(reference.file)){
   const bytes=await readFile(join(capture,reference.file));if(sha256(bytes)!==reference.sha256)throw Error('Reference artifact integrity failure');
   references.set(reference.file,{sha256:sha256(bytes),payload:JSON.parse(bytes)});
  }
  const cached=references.get(reference.file);if(cached.sha256!==reference.sha256||cached.payload.id!==reference.id||cached.payload.epoch!==reference.epoch||cached.payload.generation!==reference.generation)throw Error('Reference artifact identity failure');
 }
}
const consensus=JSON.parse(await readFile(join(root,'consensus/receipt.json'),'utf8'));
if(!['pass','no-eligible-pairs'].includes(consensus.status))throw Error('Consensus stage incomplete');
if(sha256(await readFile(join(root,'consensus/combined-pairs.json')))!==consensus.inputSha256)throw Error('Consensus input hash mismatch');
const combined=JSON.parse(await readFile(join(root,'consensus/combined-pairs.json'),'utf8'));
const extraction=JSON.parse(await readFile(join(root,'pairs/extraction-receipt.json'),'utf8'));
if(combined.cases.length!==consensus.cases.length||combined.cases.length!==extraction.identityVerifiedCases)throw Error('Consensus case inventory mismatch');
if(consensus.status==='pass'){
 const probe=JSON.parse(await readFile(join(root,'consensus/probe/receipt.json'),'utf8'));
 if(probe.status!=='pass'||probe.inputSha256!==consensus.inputSha256||probe.results.length!==combined.cases.length||probe.results.some(row=>row.identity!==true))throw Error('Consensus probe identity receipt mismatch');
}else if(combined.cases.length)throw Error('No-pairs receipt contains consensus cases');
await writeFile(join(root,'summary.json'),JSON.stringify({schemaVersion:1,captureComplete:true,frames:OFFICE_MISSION.frames,referenceSnapshots:references.size,consensusStatus:consensus.status,cases:consensus.cases,extraction:{status:extraction.status,caseErrors:extraction.caseErrors,missingLoopCountBaselines:extraction.missingLoopCountBaselines,reconstructionOnlyCases:extraction.reconstructionOnlyCases},scope:receipt.scope,claim:'Full software-rendered diagnostic acquisition; loop closure remains to be assessed from actual outcomes.'},null,2)+'\n');
const files=[];
async function visit(path){for(const entry of await readdir(path,{withFileTypes:true})){const file=join(path,entry.name);if(entry.isSymbolicLink())throw Error('Artifact symlinks are refused');if(entry.isDirectory())await visit(file);else if(entry.isFile()&&!['SHA256SUMS','pipeline-status.json'].includes(entry.name))files.push(file);}}
await visit(root);const lines=[];
for(const file of files.sort()){const hash=createHash('sha256');for await(const bytes of createReadStream(file))hash.update(bytes);lines.push(hash.digest('hex')+'  '+file.slice(resolve(root).length+1));}
await writeFile(join(root,'SHA256SUMS'),lines.join('\n')+'\n');
console.log(JSON.stringify({frames:OFFICE_MISSION.frames,sealedFiles:files.length,consensusStatus:consensus.status,scope:receipt.scope}));
