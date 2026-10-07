// Read-only representation statistics; no compiler admission or local eligibility.
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const record=JSON.parse(fs.readFileSync('dev/modelica-schmidt-reference-transaction-verification.json'));
const binding=record.artifacts.find(item=>item.path.endsWith('/solve.json.gz'));
const compressed=fs.readFileSync(binding.path),wireBytes=gunzipSync(compressed);
if(sha(compressed)!==binding.sha256||sha(wireBytes)!==binding.uncompressedSha256)throw Error('Original Solve bytes changed');
// Source/identity u64 fields are deliberately never used or reserialized here.
const wire=JSON.parse(wireBytes),mapBytes=fs.readFileSync('dev/artifacts/schmidt-transaction-profile/owner-source-map.json');
const ownerMap=JSON.parse(mapBytes);
function inventory(program,regionPath=[]){
  const scalarKinds={},opcodes={};let tensorRegisters=0;
  for(const type of program.register_types){
    if(type.dimensions.length===0)scalarKinds[type.scalar.kind]=(scalarKinds[type.scalar.kind]??0)+1;
    else tensorRegisters++;
  }
  const regions=[];
  for(const [index,node]of program.operations.entries()){
    const operation=node.operation;opcodes[operation.operation]=(opcodes[operation.operation]??0)+1;
    if(operation.operation==='fold')regions.push(inventory(operation.transition.body,[...regionPath,[index,0]]));
    if(operation.operation==='map')regions.push(inventory(operation.body.body,[...regionPath,[index,0]]));
    if(operation.operation==='conditional'){
      regions.push(inventory(operation.if_true.body,[...regionPath,[index,0]]));
      regions.push(inventory(operation.if_false.body,[...regionPath,[index,1]]));
    }
  }
  const scalarRegisters=Object.values(scalarKinds).reduce((sum,count)=>sum+count,0);
  return {regionPath,scalarRegisters,scalarKinds,tensorRegisters,opcodes,regions,
    completeOwnerScalarUpperBound:scalarRegisters+regions.reduce((sum,region)=>sum+region.completeOwnerScalarUpperBound,0)};
}
const owners=wire.pure_calls.owners.map((owner,index)=>{
  if(owner.id!==index)throw Error('Unexpected owner ordinal');
  const source=ownerMap.owners.find(item=>item.owner===index);
  if(!source)throw Error('Missing lossless owner/source map entry');
  return {owner:index,functionIndex:source.functionIndex,callSource:source.callSource,inventory:inventory(owner.body)};
});
const psd=owners.filter(owner=>owner.callSource.startsWith('SLAMCovariancePSDCheck('));
if(psd.length!==9)throw Error('Original covariance helper inventory changed');
const report={schemaVersion:1,status:'ORIGINAL_FULL21_READ_ONLY_SCALAR_REGISTER_INVENTORY',recordedAt:new Date().toISOString(),
  probeSha256:sha(fs.readFileSync(import.meta.filename)),sourceSha256:record.sourceSha256,moduleSha256:record.moduleSha256,
  solveSha256:sha(wireBytes),losslessOwnerSourceMapSha256:sha(mapBytes),owners,psdOwners:psd.map(owner=>owner.owner),
  scope:'Counts only, across the original complete owner and all nested region paths. Rank-zero registers are an upper bound; use analysis and frame-slot alias exclusions can lower actual local eligibility. Source/identity u64 values are not interpreted or reserialized. No native artifact, acceptance, local allocation, performance or full-SLAM claim.'};
const directory=process.argv[2];if(!directory)throw Error('OUTPUT_DIRECTORY required');fs.mkdirSync(directory,{recursive:true});
fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,owners:owners.length,psd:psd.map(owner=>({owner:owner.owner,functionIndex:owner.functionIndex,scalarUpperBound:owner.inventory.completeOwnerScalarUpperBound}))}));
