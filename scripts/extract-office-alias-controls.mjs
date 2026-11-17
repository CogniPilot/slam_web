// Separate, frozen same-observation controls. The CI late-window extractor and
// shipped kernels are imported unchanged; this file does IO and identity gates.
import * as compiler from '@cognipilot/rumoca';
import {readFile,writeFile,mkdir,realpath,rename,stat} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {performance} from 'node:perf_hooks';
import {isDeepStrictEqual} from 'node:util';
import {rgbdSlamNativeSourceManifest as native} from '../src/modelica-slam-source-manifest.mjs';
import {sha256} from './loop-consensus-probe.mjs';
import {aliasPolicy,nativeAliasRequests,parseAliasOptions,checkAliasLimit} from './office-alias-selection.mjs';
import {validateFrozenFrameInventory} from './office-alias-frame-inventory.mjs';
import {aliasPartition} from './office-alias-partition.mjs';
import {captureMatchingDefaults,effectivePairSettings,currentDescriptorInputs,validateCatalogMatcherFrame} from './office-pair-adapter.mjs';
import {loopPairReconstructionSource,instantiateLoopPairKernel,descriptorDefaults,matcherDefaults,
  descriptorOutputs,matcherOutputs,pairMatchIdentity,consensusInputsFromPairs} from './loop-pair-reconstruction.mjs';

const [captureArg,selectionArg,outputArg,...args]=process.argv.slice(2);
if(!captureArg||!selectionArg||!outputArg)throw Error('Usage: extract-office-alias-controls.mjs CAPTURE FROZEN_SELECTION NEW_OUTPUT [--seconds N] [--partition FILE]');
let partitionPath;
const partitionIndex=args.indexOf('--partition');
if(partitionIndex!==-1){
  if(args.filter(a=>a==='--partition').length!==1||!args[partitionIndex+1]||args[partitionIndex+1].startsWith('--'))throw Error('Invalid alias partition option');
  partitionPath=args[partitionIndex+1];args.splice(partitionIndex,2);
}
const limits=parseAliasOptions(args),capture=await realpath(captureArg),selection=await realpath(selectionArg),output=resolve(outputArg);
await mkdir(output);const started=performance.now(),strict=[],programs={},samples=new Map();
const receipt={schemaVersion:1,status:'running',limits,events:[],identityVerifiedCases:0,
  scope:'Frozen non-late actual native attempts only. No forced pairs, sequential reconstruction, truth selection, alias labels or loop-closure acceptance.'};
const expired=()=>performance.now()-started>=limits.seconds*1000;
async function saveJSON(file,value){
  await writeFile(join(output,file+'.tmp'),JSON.stringify(value)+'\n');await rename(join(output,file+'.tmp'),join(output,file));
}
async function checkpoint(){
  receipt.elapsedMs=performance.now()-started;
  receipt.identityVerifiedCases=strict.length;
  receipt.unfinishedCases=receipt.events.filter(e=>e.status==='pending').map(e=>e.key);
  receipt.processedCases=receipt.events.length-receipt.unfinishedCases.length;
  if(partition){
    receipt.partition.completedCases=receipt.events.filter((e,i)=>partition.has(i)&&e.status!=='pending').length;
    receipt.partition.unfinishedCases=receipt.events.filter((e,i)=>partition.has(i)&&e.status==='pending').map(e=>e.key);
  }
  receipt.caseErrors=receipt.events.filter(e=>['extraction-error','count-mismatch','extraction-invalid'].includes(e.status)).length;
  receipt.missingNativeCounts=receipt.events.filter(e=>['missing-native-count','invalid-native-count'].includes(e.status)).length;
  if(strict.length)await saveJSON('office-alias-pairs.json',{schemaVersion:1,capacity:350,
    selectionManifestSha256:receipt.selectionManifestSha256,scope:receipt.scope,cases:strict});
  await saveJSON('extraction-receipt.json',receipt);
}
async function boundedRead(path){
  if((await stat(path)).size>8*1024**2)throw Error('Oversized capture JSON/image artifact');
  return readFile(path);
}
async function verifiedFile(entry){
  if(!entry||typeof entry.file!=='string'||!/^[a-f0-9]{64}$/.test(entry.sha256??''))throw Error('Missing capture artifact binding');
  const path=await realpath(resolve(capture,entry.file));if(!path.startsWith(capture+sep))throw Error('Capture artifact escapes its root');
  const bytes=await boundedRead(path);
  if(sha256(bytes)!==entry.sha256||entry.bytes!==undefined&&bytes.length!==entry.bytes)throw Error('Capture artifact hash/size mismatch');
  return bytes;
}
async function sampleAt(epoch){
  if(!Number.isSafeInteger(epoch)||epoch<0||epoch>=aliasPolicy.expectedFrames)throw Error('Invalid frame epoch');
  const frozenHash=frozenFrames?.get(epoch);
  if(frozenHash===undefined)throw Error('Frame epoch is missing from frozen frame inventory: '+epoch);
  if(!samples.has(epoch)){
    const bytes=await boundedRead(join(capture,'frames',String(epoch).padStart(4,'0')+'.json')),sample=JSON.parse(bytes);
    const hash=sha256(bytes);
    if(hash!==frozenHash)throw Error('Captured frame hash differs from frozen frame inventory at epoch '+epoch);
    if(sample.sequence!==epoch||sample.index!==epoch||!Number.isFinite(sample.time)||Math.abs(sample.time-epoch/5)>1e-7)
      throw Error('Capture frame clock identity differs');
    if(samples.size===16)samples.delete(samples.keys().next().value);
    samples.set(epoch,{sample,sha256:hash});
  }
  return samples.get(epoch);
}
async function catalogAt(pointer,beforeEpoch){
  return validateCatalogMatcherFrame(JSON.parse(await verifiedFile(pointer)),pointer,beforeEpoch);
}
let prepared,pin,frozenFrames,partition;
async function kernel(key){
  if(programs[key])return programs[key];
  if(!prepared){
    pin=JSON.parse(await readFile(new URL('../rumoca-package.json',import.meta.url)));
    const wasm=await readFile(new URL('../node_modules/@cognipilot/rumoca/rumoca_bind_wasm_bg.wasm',import.meta.url));
    if(sha256(wasm)!==pin.files['rumoca_bind_wasm_bg.wasm'])throw Error('Bridge compiler differs from pin');
    await compiler.default({module_or_path:wasm});
    if(compiler.get_git_commit()!==pin.revision.slice(0,12))throw Error('Bridge compiler revision differs');
    prepared=await loopPairReconstructionSource();
    receipt.extraction={sourceSha256:sha256(prepared.source),compilerRevision:pin.revision,modules:{}};
    await writeFile(join(output,'reconstruction.mo'),prepared.source);
  }
  const [model,defaults,outputs]=key==='descriptor'
    ?['LoopCurrentDescriptorProbe',descriptorDefaults,descriptorOutputs]
    :['LoopPairMatcherProbe',matcherDefaults,matcherOutputs];
  const artifact=JSON.parse(compiler.prepare_native_program(prepared.source,model));
  programs[key]=await instantiateLoopPairKernel(artifact,prepared.source,defaults,outputs);
  receipt.extraction.modules[key]=artifact.module_sha256;
  await writeFile(join(output,key+'.artifact.json'),JSON.stringify(artifact));
  return programs[key];
}
try{
  const bytes=await readFile(join(selection,'case-manifest.json')),manifest=JSON.parse(bytes),hash=sha256(bytes);
  const sidecar=await readFile(join(selection,'case-manifest.sha256'),'utf8');
  const frozen=JSON.parse(await readFile(join(selection,'selection-receipt.json')));
  if(sidecar!==hash+'  case-manifest.json\n'||frozen.manifestSha256!==hash||!['frozen','frozen-partial'].includes(frozen.status))
    throw Error('Frozen selection hash/receipt mismatch');
  if(manifest.schemaVersion!==1||manifest.kind!=='office-native-alias-controls'||!isDeepStrictEqual(manifest.policy,aliasPolicy)
      ||!Array.isArray(manifest.cases)||!Array.isArray(manifest.omittedCases)
      ||manifest.cases.length>checkAliasLimit(manifest.limits?.maxCases)
      ||manifest.cases.length!==manifest.coverage?.selectedCases
      ||manifest.cases.length+manifest.omittedCases.length!==manifest.coverage?.eligibleCasesObserved
      ||!isDeepStrictEqual(frozen.coverage,manifest.coverage))throw Error('Invalid frozen native selection envelope');
  for(const name of ['office-alias-selection.mjs','freeze-office-alias-controls.mjs'])
    if(manifest.selectionSource?.[name]!==sha256(await readFile(new URL('./'+name,import.meta.url))))
      throw Error('Frozen selection implementation differs');
  const all=[...manifest.cases,...manifest.omittedCases];let previous=-1;
  for(const entry of all){
    const ordinal=entry.currentEpoch*4+entry.rank;
    if(!Number.isSafeInteger(entry.currentEpoch)||entry.currentEpoch<0||entry.currentEpoch>=1175
        ||!Number.isSafeInteger(entry.rank)||entry.rank<0||entry.rank>=4||ordinal<=previous)
      throw Error('Frozen cases are duplicated, unordered or outside the non-late domain');
    previous=ordinal;
  }
  frozenFrames=validateFrozenFrameInventory(manifest);
  const captureBytes=await readFile(join(capture,'receipt.json')),nativeBytes=await readFile(join(capture,'native-manifest.json'));
  if(sha256(captureBytes)!==manifest.capture.receiptSha256||sha256(nativeBytes)!==manifest.capture.nativeManifestSha256)
    throw Error('Capture identity differs from frozen selection');
  const source=sha256((await Promise.all(native.paths.map(path=>readFile(new URL('../'+path,import.meta.url),'utf8')))).join(native.separator));
  const nativeManifest=JSON.parse(nativeBytes),profile=nativeManifest.profiles?.['424x240']??nativeManifest;
  if((nativeManifest.baseSourceSha256??nativeManifest.sourceSha256)!==source)throw Error('Captured native owners differ from pinned reconstruction');
  const defaults=captureMatchingDefaults(await readFile(new URL('../models/Optimization/RGBDCatalogGraphCapture.mo',import.meta.url),'utf8'));
  Object.assign(receipt,{selectionManifestSha256:hash,nativeBaseSourceSha256:source,coverage:manifest.coverage,
    frozenFrameInventory:{validated:true,frames:frozenFrames.size,sha256:sha256(JSON.stringify(manifest.frameInventory))},
    extractionAdapterSha256:sha256(await readFile(new URL('./extract-office-alias-controls.mjs',import.meta.url))),
    events:manifest.cases.map(entry=>({key:entry.key,currentEpoch:entry.currentEpoch,rank:entry.rank,status:'pending'}))});
  if(partitionPath){
    const partitionBytes=await boundedRead(partitionPath);
    partition=aliasPartition(JSON.parse(partitionBytes),hash,manifest.cases.length);
    receipt.partition={sha256:sha256(partitionBytes),selectionManifestSha256:hash,ordinals:[...partition],
      requestedCases:partition.size,outsidePartitionCases:manifest.cases.length-partition.size,
      scope:'Explicit subset of unchanged frozen membership; all outside members remain pending, never covered by this run.'};
    await writeFile(join(output,'partition.json'),partitionBytes,{flag:'wx'});
  }
  await writeFile(join(output,'case-manifest.json'),bytes,{flag:'wx'});
  await checkpoint();
  for(const [index,entry] of manifest.cases.entries()){
    if(partition&&!partition.has(index))continue;
    if(expired())break;
    const event=receipt.events[index];
    try{
      const {sample,sha256:frameHash}=await sampleAt(entry.currentEpoch),trace=sample.nativeTrace;
      const actual=nativeAliasRequests(sample).cases.find(row=>row.key===entry.key);
      if(!actual||!isDeepStrictEqual({...actual,frameSha256:frameHash},entry))throw Error('Frozen case is not the bound actual native attempt');
      if(entry.baselineStatus!=='present')event.status=entry.baselineStatus==='missing'?'missing-native-count':'invalid-native-count';
      else{
        if(entry.referenceBinding!=='bound')throw Error('Missing actual native reference payload binding');
        const module=profile.models[entry.currentEpoch===0?'initialize':'step'].files.module;
        if(trace.source?.module?.sha256!==module.sha256)throw Error('Trace module differs from captured manifest');
        const pointer=trace.references.find(ref=>ref.id===entry.referenceId),reference=await catalogAt(pointer,entry.currentEpoch);
        const {sample:referenceSample,sha256:referenceFrameSha}=await sampleAt(reference.epoch);
        if(referenceSample.time!==reference.imageTime)throw Error('Reference time differs from raw observation');
        await verifiedFile(referenceSample.image.rgb);await verifiedFile(referenceSample.image.depth);
        const rgb=await verifiedFile(sample.image.rgb),depth=await verifiedFile(sample.image.depth);
        let current,extent;
        if(trace.retainedCurrent){
          if(trace.retainedCurrent.epoch!==entry.currentEpoch||trace.retainedCurrent.id!==entry.currentId)throw Error('Retained current identity differs');
          current=await catalogAt(trace.retainedCurrent,entry.currentEpoch+1);extent='actual-retained-current';
        }else{
          const inputs=currentDescriptorInputs(sample,rgb,depth),result=(await kernel('descriptor')).run(inputs);
          current={descriptor:result.descriptor,opticalPoint:result.point,enabled:result.enabled,count:350,
            rgbCalibration:inputs.rgbCalibration,disparityNoise:inputs.disparityNoise,noiseReferenceFx:inputs.noiseReferenceFx,baseline:inputs.baseline};
          extent='padded-disabled-domain';
        }
        if(!isDeepStrictEqual(current.enabled,trace.outputs.featureEnabled))throw Error('Current enabled mask differs from native output');
        // The existing settings adapter's late-return kind means loop inputs,
        // independent of time. Keep native rank seed and loop settings exactly.
        const settings=effectivePairSettings(trace,{kind:'late-return',rank:entry.rank},defaults);
        const extracted=(await kernel('matcher')).run({referenceDescriptor:reference.descriptor,currentDescriptor:current.descriptor,
          referencePoint:reference.opticalPoint,currentPoint:current.opticalPoint,referenceEnabled:reference.enabled,currentEnabled:current.enabled,
          referenceCount:reference.count,currentCount:current.count,referenceRgbCalibration:reference.rgbCalibration,currentRgbCalibration:current.rgbCalibration,
          referenceDisparityNoise:reference.disparityNoise,currentDisparityNoise:current.disparityNoise,
          referenceNoiseReferenceFx:reference.noiseReferenceFx,currentNoiseReferenceFx:current.noiseReferenceFx,
          referenceBaseline:reference.baseline,currentBaseline:current.baseline,...settings.matcher});
        const identity=pairMatchIdentity(extracted,entry.nativeMatchedCount);Object.assign(event,identity);
        if(identity.status==='count-identical')strict.push({name:entry.key,
          provenance:{kind:'native-alias-control',selectionManifestSha256:hash,rank:entry.rank,nativeReason:entry.nativeReason,
            reference:{id:reference.id,epoch:reference.epoch,time:reference.imageTime,generation:reference.generation,
              payloadSha256:pointer.sha256,frameSha256:referenceFrameSha,rgbSha256:referenceSample.image.rgb.sha256,depthSha256:referenceSample.image.depth.sha256},
            current:{id:entry.currentId,epoch:entry.currentEpoch,time:sample.time,frameSha256:frameHash,
              rgbSha256:sample.image.rgb.sha256,depthSha256:sample.image.depth.sha256},currentExtentPolicy:extent,
            settingsSha256:sha256(JSON.stringify(settings)),settingsOrigin:settings.origin,extraction:structuredClone(receipt.extraction),
            matcher:{configurationValid:extracted.configurationValid[0],invalidReference:extracted.invalidReference[0],invalidCurrent:extracted.invalidCurrent[0],
              count:identity.count,originalMatchedCount:entry.nativeMatchedCount,matchCountIdentity:true,currentIndex:extracted.currentIndex}},
          inputs:consensusInputsFromPairs(extracted,settings.controls)});
      }
    }catch(error){event.status='extraction-error';event.error=String(error);}
    await checkpoint();
  }
  receipt.status=receipt.events.some(e=>e.status==='pending')?'partial':strict.length?'identity-verified-alias-control-cases':'no-identity-verified-alias-control-cases';
  receipt.stopReason=receipt.status==='partial'?(partition&&receipt.partition.unfinishedCases.length===0?'declared-partition-complete':'cooperative-time-budget'):null;
}catch(error){receipt.status='failed';receipt.failure=String(error);process.exitCode=1;}
finally{
  await checkpoint();
  console.log(JSON.stringify({status:receipt.status,cases:strict.length,processedCases:receipt.processedCases,
    unfinishedCases:receipt.unfinishedCases,caseErrors:receipt.caseErrors,scope:receipt.scope}));
}
