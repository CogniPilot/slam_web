// Capture-office-ci -> actual sparse pair artifacts. No office classification
// is published without the independent original loop matched-count baseline.
import * as compiler from '@cognipilot/rumoca';
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {rgbdSlamNativeSourceManifest} from '../src/modelica-slam-source-manifest.mjs';
import {sha256} from './loop-consensus-probe.mjs';
import {loopPairReconstructionSource,instantiateLoopPairKernel,descriptorDefaults,matcherDefaults,
  descriptorOutputs,matcherOutputs,pairMatchIdentity,consensusInputsFromPairs} from './loop-pair-reconstruction.mjs';
import {officePairRequests,captureMatchingDefaults,effectivePairSettings,currentDescriptorInputs,validateCatalogMatcherFrame} from './office-pair-adapter.mjs';

const [captureArg,outputArg]=process.argv.slice(2);
if(!captureArg||!outputArg)throw Error('Usage: extract-office-loop-pairs.mjs CAPTURE NEW_OUTPUT');
const capture=await realpath(captureArg),output=resolve(outputArg);await mkdir(output);
const receipt={schemaVersion:1,status:'running',identityVerifiedCases:0,reconstructionOnlyCases:0,events:[],
  fastReselection:false,scope:'Actual capture trace extraction. Sequential cases without an original Verify count remain reconstruction-only. No GPU, accuracy or loop-closure acceptance.'};
const strict=[],reconstructions=[],references=new Map(),frameCache=new Map();let kernels;
async function verifiedFile(entry){
  if(!entry||typeof entry.file!=='string'||!entry.sha256)throw Error('Missing capture artifact binding');
  const path=await realpath(resolve(capture,entry.file));
  if(!path.startsWith(capture+sep))throw Error('Capture artifact escapes its root');
  const bytes=await readFile(path);
  if(sha256(bytes)!==entry.sha256||entry.bytes!==undefined&&entry.bytes!==bytes.length)throw Error('Capture artifact hash/size mismatch: '+entry.file);
  return bytes;
}
async function loadFrame(epoch){
  if(!frameCache.has(epoch)){
    const bytes=await readFile(join(capture,'frames',String(epoch).padStart(4,'0')+'.json')),frame=JSON.parse(bytes);
    if(frame.sequence!==epoch||frame.index!==epoch||Math.abs(frame.time-epoch/5)>1e-7)throw Error('Capture epoch/time mismatch');
    frameCache.set(epoch,{frame,sha256:sha256(bytes)});
  }
  return frameCache.get(epoch);
}
async function loadCatalog(pointer,currentEpoch){
  if(!pointer)throw Error('Missing native catalog reference payload');
  let frame=references.get(pointer.sha256);
  if(!frame){frame=JSON.parse(await verifiedFile(pointer));references.set(pointer.sha256,frame);}
  return validateCatalogMatcherFrame(frame,pointer,currentEpoch);
}
async function initializeKernels(){
  if(kernels)return kernels;
  const pin=JSON.parse(await readFile(new URL('../rumoca-package.json',import.meta.url))),wasm=await readFile(new URL('../node_modules/@cognipilot/rumoca/rumoca_bind_wasm_bg.wasm',import.meta.url));
  if(sha256(wasm)!==pin.files['rumoca_bind_wasm_bg.wasm'])throw Error('Bridge compiler differs from pin');
  await compiler.default({module_or_path:wasm});
  if(compiler.get_git_commit()!==pin.revision.slice(0,12))throw Error('Bridge compiler revision differs');
  const prepared=await loopPairReconstructionSource(),programs={};
  receipt.extraction={producer:'raw-reconstruction',sourceSha256:sha256(prepared.source),compilerRevision:pin.revision,modules:{}};
  for(const [key,model,defaults,outputs] of [['descriptor','LoopCurrentDescriptorProbe',descriptorDefaults,descriptorOutputs],['matcher','LoopPairMatcherProbe',matcherDefaults,matcherOutputs]]){
    const artifact=JSON.parse(compiler.prepare_native_program(prepared.source,model));
    programs[key]=await instantiateLoopPairKernel(artifact,prepared.source,defaults,outputs);
    receipt.extraction.modules[key]=artifact.module_sha256;
    await writeFile(join(output,key+'.artifact.json'),JSON.stringify(artifact));
  }
  await writeFile(join(output,'reconstruction.mo'),prepared.source);kernels=programs;return programs;
}
try{
  const captureBytes=await readFile(join(capture,'receipt.json')),captureReceipt=JSON.parse(captureBytes);
  if(!captureReceipt.complete||captureReceipt.failure||captureReceipt.framesCompleted!==1251||captureReceipt.firstTime!==0||Math.abs(captureReceipt.lastTime-250)>1e-7)throw Error('Office capture is not complete through 250 s');
  receipt.captureReceiptSha256=sha256(captureBytes);
  receipt.captureScope=captureReceipt.scope;
  const manifest=JSON.parse(await readFile(join(capture,'native-manifest.json'))),profile=manifest.profiles?.['424x240']??manifest;
  const ownerBytes=await Promise.all(rgbdSlamNativeSourceManifest.paths.map(path=>readFile(new URL('../'+path,import.meta.url),'utf8')));
  const localSource=sha256(ownerBytes.join(rgbdSlamNativeSourceManifest.separator));
  if((manifest.baseSourceSha256??manifest.sourceSha256)!==localSource)throw Error('Captured native source differs from local reconstruction owners');
  receipt.nativeBaseSourceSha256=localSource;
  const defaults=captureMatchingDefaults(await readFile(new URL('../models/Optimization/RGBDCatalogGraphCapture.mo',import.meta.url),'utf8'));
  let sequentialSeen=false,lateFrames=0;
  for(let epoch=0;epoch<=1250;epoch++){
    const {frame:sample,sha256:sampleSha}=await loadFrame(epoch),trace=sample.nativeTrace;
    const selection=officePairRequests(sample,{sequentialAlreadySeen:sequentialSeen});sequentialSeen=selection.sequentialSeen;
    if(sample.time>=235)lateFrames++;
    for(const event of selection.events)receipt.events.push({currentEpoch:epoch,time:sample.time,...event});
    if(!selection.requests.length)continue;
    const module=profile.models[epoch===0?'initialize':'step'].files.module;
    if(trace.source?.module?.sha256!==module.sha256)throw Error('Trace module differs from captured manifest');
    const programs=await initializeKernels();
    const rgbBytes=await verifiedFile(sample.image.rgb),depthBytes=await verifiedFile(sample.image.depth);
    let current,currentExtentPolicy;
    if(trace.retainedCurrent){
      if(trace.retainedCurrent.epoch!==epoch)throw Error('Retained current epoch differs');
      current=await loadCatalog(trace.retainedCurrent,epoch+1);currentExtentPolicy='actual-retained-current';
      if(!isDeepStrictEqual(current.enabled,trace.outputs.featureEnabled))throw Error('Retained current mask differs from native output');
    }else{
      const inputs=currentDescriptorInputs(sample,rgbBytes,depthBytes),reconstructed=programs.descriptor.run(inputs);
      if(!isDeepStrictEqual(reconstructed.enabled,trace.outputs.featureEnabled))throw Error('Reconstructed current mask differs from native output');
      current={descriptor:reconstructed.descriptor,opticalPoint:reconstructed.point,enabled:reconstructed.enabled,count:350,
        rgbCalibration:inputs.rgbCalibration,disparityNoise:inputs.disparityNoise,noiseReferenceFx:inputs.noiseReferenceFx,baseline:inputs.baseline};
      currentExtentPolicy='padded-disabled-domain';
    }
    for(const request of selection.requests){
      const event={kind:request.kind,currentEpoch:epoch,time:sample.time,referenceId:request.referenceId,originalReason:request.originalReason,rank:request.rank};
      try{
        const pointer=trace.references?.find(ref=>ref.id===request.referenceId),reference=await loadCatalog(pointer,epoch);
        const {frame:referenceSample,sha256:referenceFrameSha}=await loadFrame(reference.epoch);
        if(referenceSample.time!==reference.imageTime)throw Error('Reference catalog time differs from acquisition');
        // Verify source image artifacts once per reference identity, without
        // rerunning its detector or descriptor owner.
        if(!receipt.events.some(row=>row.referenceImagesVerified===pointer.sha256)){
          await verifiedFile(referenceSample.image.rgb);await verifiedFile(referenceSample.image.depth);
          receipt.events.push({status:'reference-images-verified',referenceImagesVerified:pointer.sha256,referenceEpoch:reference.epoch});
        }
        const settings=effectivePairSettings(trace,request,defaults);
        const extracted=programs.matcher.run({referenceDescriptor:reference.descriptor,currentDescriptor:current.descriptor,
          referencePoint:reference.opticalPoint,currentPoint:current.opticalPoint,referenceEnabled:reference.enabled,currentEnabled:current.enabled,
          referenceCount:reference.count,currentCount:current.count,referenceRgbCalibration:reference.rgbCalibration,currentRgbCalibration:current.rgbCalibration,
          referenceDisparityNoise:reference.disparityNoise,currentDisparityNoise:current.disparityNoise,
          referenceNoiseReferenceFx:reference.noiseReferenceFx,currentNoiseReferenceFx:current.noiseReferenceFx,
          referenceBaseline:reference.baseline,currentBaseline:current.baseline,...settings.matcher});
        const identity=pairMatchIdentity(extracted,request.originalMatchedCount);Object.assign(event,identity);
        const provenance={kind:request.kind,reference:{id:reference.id,epoch:reference.epoch,time:reference.imageTime,
          generation:reference.generation,rgbSha256:referenceSample.image.rgb.sha256,depthSha256:referenceSample.image.depth.sha256,
          frameSha256:referenceFrameSha,payloadSha256:pointer.sha256},
          current:{epoch,time:sample.time,rgbSha256:sample.image.rgb.sha256,depthSha256:sample.image.depth.sha256,frameSha256:sampleSha},
          originalReason:request.originalReason,currentExtentPolicy,settingsSha256:sha256(JSON.stringify(settings)),settingsOrigin:settings.origin,
          extraction:{producer:'raw-reconstruction',sourceSha256:receipt.extraction.sourceSha256,compilerRevision:receipt.extraction.compilerRevision,
            moduleSha256:receipt.extraction.modules.matcher,descriptorModuleSha256:receipt.extraction.modules.descriptor},
          matcher:{configurationValid:extracted.configurationValid[0],invalidReference:extracted.invalidReference[0],invalidCurrent:extracted.invalidCurrent[0],
            count:identity.count,originalMatchedCount:request.originalMatchedCount??null,matchCountIdentity:identity.matchCountIdentity,currentIndex:extracted.currentIndex}};
        const entry={name:`${request.kind}-epoch-${epoch}-reference-${reference.id}`,provenance,inputs:consensusInputsFromPairs(extracted,settings.controls)};
        if(request.kind==='sequential'&&identity.status==='reconstruction-only')reconstructions.push(entry);
        else if(request.kind==='late-return'&&identity.status==='count-identical')strict.push(entry);
      }catch(error){event.status='extraction-error';event.error=String(error);}
      receipt.events.push(event);
    }
  }
  receipt.sequentialRefusalObserved=sequentialSeen;receipt.lateWindowFrames=lateFrames;
  receipt.caseErrors=receipt.events.filter(event=>['extraction-error','count-mismatch','extraction-invalid'].includes(event.status)).length;
  receipt.missingLoopCountBaselines=receipt.events.filter(event=>event.kind==='late-return'&&event.status==='reconstruction-only').length;
  receipt.identityVerifiedCases=strict.length;receipt.reconstructionOnlyCases=reconstructions.length;
  if(strict.length)await writeFile(join(output,'office-pairs.json'),JSON.stringify({schemaVersion:1,capacity:350,cases:strict})+'\n');
  if(reconstructions.length)await writeFile(join(output,'reconstruction-only.json'),JSON.stringify({schemaVersion:1,capacity:350,
    scope:'Sequential reconstruction only: no original native matched-count identity. Do not classify with the consensus probe.',cases:reconstructions})+'\n');
  receipt.status=strict.length?'identity-verified-loop-cases':'no-identity-verified-candidates';
}catch(error){receipt.status='failed';receipt.failure=String(error);process.exitCode=1;}
finally{
  await writeFile(join(output,'extraction-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({status:receipt.status,identityVerifiedCases:strict.length,reconstructionOnlyCases:reconstructions.length,
    caseErrors:receipt.caseErrors??0,missingLoopCountBaselines:receipt.missingLoopCountBaselines??0,failure:receipt.failure??null}));
}
