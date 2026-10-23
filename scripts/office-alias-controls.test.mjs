import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm,access} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {sha256} from './loop-consensus-probe.mjs';
import {rgbdSlamNativeSourceManifest as native} from '../src/modelica-slam-source-manifest.mjs';
import {nativeAliasRequests,parseAliasOptions} from './office-alias-selection.mjs';
import {validateFrozenFrameInventory} from './office-alias-frame-inventory.mjs';

function sample(epoch=1){return {index:epoch,sequence:epoch,time:epoch/5,nativeTrace:{status:0,
  inputs:{imageEpoch:[epoch]},previousCatalog:{nextId:5},outputs:{},
  references:[{id:1,epoch:0,time:0,generation:1,sha256:'a'.repeat(64)}],
  derived:{loopAttempted:true,loopCandidateCount:1,'loopCandidateReferenceId[1]':1,'loopCandidateCurrentId[1]':5,
    'loopCandidateReason[1]':7,'loopCandidateMatchedCount[1]':27}}};}
test('native identity/rank selection excludes late frames and never reads truth or pose',()=>{
  const s=sample();Object.defineProperty(s,'truth',{get(){throw Error('Truth was read');}});
  Object.defineProperty(s,'native',{get(){throw Error('Parsed estimate/pose was read');}});
  const entry=nativeAliasRequests(s).cases[0];
  assert.equal(entry.referenceId,1);assert.equal(entry.currentId,5);assert.equal(entry.referenceEpoch,0);
  assert.equal(entry.nativeMatchedCount,27);assert.equal(entry.rank,0);
  assert.equal(nativeAliasRequests(sample(1174)).cases.length,1);
  assert.equal(nativeAliasRequests(sample(1175)).cases.length,0);
  s.nativeTrace.outputs={loopCandidateReferenceId:[2],loopCandidateCurrentId:[5],loopCandidateReason:[0],loopCandidateMatchedCount:[13]};
  assert.equal(nativeAliasRequests(s).cases[0].referenceId,2);
});
test('no actual attempted candidate means no controls, including sequential/localization counts',()=>{
  const s=sample();Object.assign(s.nativeTrace.derived,{loopAttempted:false,sequentialRejectionReason:7,matchCount:999});
  assert.equal(nativeAliasRequests(s).cases.length,0);
  delete s.nativeTrace.derived.loopAttempted;assert.equal(nativeAliasRequests(s).events[0].status,'missing-native-attempt-flag');
  s.nativeTrace.derived.loopAttempted=true;s.nativeTrace.derived.loopCandidateCount=5;
  assert.equal(nativeAliasRequests(s).events[0].status,'invalid-native-candidate-count');
  s.nativeTrace.derived.loopCandidateCount=1;s.nativeTrace.derived['loopCandidateReason[1]']=10;
  assert.equal(nativeAliasRequests(s).events[0].status,'unattempted-before-matcher');
});
test('missing baselines/payloads stay in frozen inventory; invalid identities cannot become pairs',()=>{
  const s=sample();delete s.nativeTrace.derived['loopCandidateMatchedCount[1]'];s.nativeTrace.references=[];
  const entry=nativeAliasRequests(s).cases[0];assert.equal(entry.baselineStatus,'missing');assert.equal(entry.referenceEpoch,null);
  s.nativeTrace.derived['loopCandidateCurrentId[1]']=6;assert.equal(nativeAliasRequests(s).cases.length,0);
  assert.throws(()=>parseAliasOptions(['--max-cases','4701'],{selection:true}),/limit/);
  assert.throws(()=>parseAliasOptions(['--max-cases','3']),/option/);
});

async function fixture(run){
  const base=join(homedir(),'scratch/slam_web/tmp');await mkdir(base,{recursive:true});
  const root=await mkdtemp(join(base,'alias-controls-'));
  try{
    const capture=join(root,'capture');await mkdir(join(capture,'frames'),{recursive:true});
    const source=sha256((await Promise.all(native.paths.map(path=>readFile(path,'utf8')))).join(native.separator));
    await writeFile(join(capture,'native-manifest.json'),JSON.stringify({sourceSha256:source}));
    await writeFile(join(capture,'receipt.json'),JSON.stringify({complete:false,framesCompleted:3,firstTime:0,lastTime:.4,
      scope:'CONTROLLED PARTIAL TRACE METADATA FIXTURE, NOT CAMERA/FLIGHT EVIDENCE.'}));
    for(let epoch=0;epoch<3;epoch++){
      const s=sample(epoch);if(epoch===0)s.nativeTrace.derived.loopCandidateCount=0;
      // No native count: the extraction must reject without compiling/rebuilding pairs.
      delete s.nativeTrace.derived['loopCandidateMatchedCount[1]'];
      await writeFile(join(capture,'frames',String(epoch).padStart(4,'0')+'.json'),JSON.stringify(s));
    }
    await run({root,capture});
  }finally{await rm(root,{recursive:true,force:true});}
}
function invoke(script,args){return spawnSync(process.execPath,['scripts/'+script,...args],{encoding:'utf8',timeout:10000});}
async function freeze(f,name='selection',extra=[]){
  const selection=join(f.root,name),result=invoke('freeze-office-alias-controls.mjs',[f.capture,selection,'--max-cases','1',...extra]);
  assert.equal(result.status,0,result.stderr);return selection;
}
test('freezes deterministic pre-outcome order, explicit cap omissions and partial capture coverage',()=>fixture(async f=>{
  const a=await freeze(f),b=await freeze(f,'selection-again');
  assert.deepEqual(await readFile(join(a,'case-manifest.json')),await readFile(join(b,'case-manifest.json')));
  const manifest=JSON.parse(await readFile(join(a,'case-manifest.json')));
  assert.equal(manifest.cases[0].currentEpoch,1);assert.equal(manifest.omittedCases[0].currentEpoch,2);
  assert.equal(manifest.coverage.omittedByCaseLimit,1);assert.equal(manifest.coverage.captureComplete,false);
  assert.equal(manifest.coverage.unrecordedNonLateEpochs.count,1172);
  assert.equal(manifest.coverage.selectionScanComplete,true);
  assert.equal(manifest.cases.some(entry=>Object.hasOwn(entry,'truth')),false);
}));
test('frozen inventory must be a complete ordered prefix with consistent current/reference bindings',()=>fixture(async f=>{
  const selection=await freeze(f),original=JSON.parse(await readFile(join(selection,'case-manifest.json')));
  const valid=validateFrozenFrameInventory(original);assert.equal(valid.size,3);
  assert.equal(valid.get(0),original.frameInventory[0].sha256);
  const mutations=[
    m=>{m.frameInventory=null;},
    m=>{m.frameInventory.pop();},
    m=>{m.frameInventory[1].epoch=0;},
    m=>{m.frameInventory.reverse();},
    m=>{m.frameInventory[0].sha256='not-a-hash';},
    m=>{m.coverage.scannedNonLateFrames=4;},
    m=>{m.coverage.recordedFrames=1252;},
    m=>{m.cases[0].frameSha256='0'.repeat(64);},
    m=>{m.omittedCases[0].frameSha256='0'.repeat(64);},
    m=>{m.cases[0].referenceEpoch=3;}
  ];
  for(const mutate of mutations){const changed=structuredClone(original);mutate(changed);assert.throws(()=>validateFrozenFrameInventory(changed),/frozen|Frozen/);}
}));
test('even a rehashed missing reference inventory row is refused before any promotion',()=>fixture(async f=>{
  const selection=await freeze(f),path=join(selection,'case-manifest.json'),manifest=JSON.parse(await readFile(path));
  manifest.frameInventory=manifest.frameInventory.filter(row=>row.epoch!==0);
  const bytes=Buffer.from(JSON.stringify(manifest)+'\n'),hash=sha256(bytes);await writeFile(path,bytes);
  await writeFile(join(selection,'case-manifest.sha256'),hash+'  case-manifest.json\n');
  const frozenPath=join(selection,'selection-receipt.json'),frozen=JSON.parse(await readFile(frozenPath));frozen.manifestSha256=hash;
  await writeFile(frozenPath,JSON.stringify(frozen));
  const output=join(f.root,'missing-inventory'),result=invoke('extract-office-alias-controls.mjs',[f.capture,selection,output]);
  assert.notEqual(result.status,0);
  const receipt=JSON.parse(await readFile(join(output,'extraction-receipt.json')));
  assert.equal(receipt.status,'failed');assert.match(receipt.failure,/frozen frame inventory/);
  await assert.rejects(()=>access(join(output,'office-alias-pairs.json')));
}));
test('missing native counts never create strict or reconstruction-only controls',()=>fixture(async f=>{
  const selection=await freeze(f),output=join(f.root,'pairs');
  const result=invoke('extract-office-alias-controls.mjs',[f.capture,selection,output]);assert.equal(result.status,0,result.stderr);
  const receipt=JSON.parse(await readFile(join(output,'extraction-receipt.json')));
  assert.equal(receipt.missingNativeCounts,1);assert.equal(receipt.events[0].status,'missing-native-count');
  assert.equal(receipt.identityVerifiedCases,0);assert.equal(receipt.coverage.omittedByCaseLimit,1);
  await assert.rejects(()=>access(join(output,'office-alias-pairs.json')));
  await assert.rejects(()=>access(join(output,'reconstruction-only.json')));
}));
test('rehashing a forced/unproposed case cannot satisfy actual native selection identity',()=>fixture(async f=>{
  const selection=await freeze(f),path=join(selection,'case-manifest.json');
  const manifest=JSON.parse(await readFile(path));manifest.cases[0].referenceId=3;
  manifest.cases[0].key=manifest.cases[0].key.replace('reference-1','reference-3');
  const bytes=Buffer.from(JSON.stringify(manifest)+'\n'),hash=sha256(bytes);
  await writeFile(path,bytes);await writeFile(join(selection,'case-manifest.sha256'),hash+'  case-manifest.json\n');
  const receiptPath=join(selection,'selection-receipt.json'),frozen=JSON.parse(await readFile(receiptPath));frozen.manifestSha256=hash;
  await writeFile(receiptPath,JSON.stringify(frozen));
  const output=join(f.root,'forced'),result=invoke('extract-office-alias-controls.mjs',[f.capture,selection,output]);
  assert.equal(result.status,0,result.stderr);
  const receipt=JSON.parse(await readFile(join(output,'extraction-receipt.json')));
  assert.equal(receipt.caseErrors,1);assert.match(receipt.events[0].error,/actual native attempt/);
  await assert.rejects(()=>access(join(output,'office-alias-pairs.json')));
}));
test('changed captured bytes and changed frozen manifest are refused separately',()=>fixture(async f=>{
  const selection=await freeze(f),file=join(f.capture,'frames/0001.json'),s=JSON.parse(await readFile(file));
  s.extra='modified after freeze';await writeFile(file,JSON.stringify(s));
  const output=join(f.root,'changed'),result=invoke('extract-office-alias-controls.mjs',[f.capture,selection,output]);
  assert.equal(result.status,0,result.stderr);
  const receipt=JSON.parse(await readFile(join(output,'extraction-receipt.json')));assert.equal(receipt.caseErrors,1);
  await writeFile(join(selection,'case-manifest.json'),'{}');
  const corrupt=invoke('extract-office-alias-controls.mjs',[f.capture,selection,join(f.root,'corrupt')]);
  assert.notEqual(corrupt.status,0);assert.match(corrupt.stdout,/failed/);
}));
test('a predeclared zero case limit inventories all omissions without replacing cases',()=>fixture(async f=>{
  const selection=await freeze(f,'zero',['--max-cases','0']),output=join(f.root,'empty');
  const manifest=JSON.parse(await readFile(join(selection,'case-manifest.json')));
  assert.equal(manifest.cases.length,0);assert.equal(manifest.omittedCases.length,2);
  assert.equal(invoke('extract-office-alias-controls.mjs',[f.capture,selection,output]).status,0);
  const receipt=JSON.parse(await readFile(join(output,'extraction-receipt.json')));
  assert.equal(receipt.status,'no-identity-verified-alias-control-cases');assert.equal(receipt.coverage.omittedByCaseLimit,2);
}));
