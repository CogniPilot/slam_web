// Controlled transport with the real shipped kernels. This fixture is not a
// rendered capture or an independent native Verify matched-count observation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm,access} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
import * as compiler from '@cognipilot/rumoca';
import {rgbdSlamNativeSourceManifest as native} from '../src/modelica-slam-source-manifest.mjs';
import {sha256} from './loop-consensus-probe.mjs';
import {loopPairReconstructionSource,instantiateLoopPairKernel,descriptorDefaults,descriptorOutputs} from './loop-pair-reconstruction.mjs';

test('real kernels enforce sparse native identity for frozen non-late controls and disclose unfinished work',async()=>{
  const scratch=join(homedir(),'scratch/slam_web/tmp');await mkdir(scratch,{recursive:true});
  const root=await mkdtemp(join(scratch,'alias-native-control-'));
  try{
    const wasm=await readFile(new URL('../node_modules/@cognipilot/rumoca/rumoca_bind_wasm_bg.wasm',import.meta.url));
    const pin=JSON.parse(await readFile(new URL('../rumoca-package.json',import.meta.url)));
    assert.equal(sha256(wasm),pin.files['rumoca_bind_wasm_bg.wasm']);await compiler.default({module_or_path:wasm});
    const prepared=await loopPairReconstructionSource(),artifact=JSON.parse(compiler.prepare_native_program(prepared.source,'LoopCurrentDescriptorProbe'));
    const descriptorKernel=await instantiateLoopPairKernel(artifact,prepared.source,descriptorDefaults,descriptorOutputs);
    const width=424,height=240;let random=17;
    const rgb=Float64Array.from({length:width*height*3},()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random>>>24;});
    const pixels=Array.from({length:350},(_,i)=>[5+i%25*6,5+Math.floor(i/25)*6]);pixels[15]=[0,0];
    const camera={rgb,depth:new Float64Array(width*height).fill(2000),pixels,rgbCalibration:[100,110,79.5,44.5],
      depthCalibration:[100,110,79.5,44.5],disparityNoise:.08,noiseReferenceFx:200,baseline:.05};
    const descriptor=descriptorKernel.run(camera);assert.equal(descriptor.enabled[15],0);assert.equal(descriptor.enabled[349],1);
    const capture=join(root,'capture'),selection=join(root,'selection'),output=join(root,'pairs');
    await mkdir(join(capture,'frames'),{recursive:true});await mkdir(join(capture,'native-frames'));
    const rgbBytes=Buffer.from(rgb),depthBytes=Buffer.alloc(width*height*2);
    for(let i=0;i<width*height;i++)depthBytes.writeUInt16LE(2000,i*2);
    const image={rgb:{file:'rgb.bin',bytes:rgbBytes.length,sha256:sha256(rgbBytes)},depth:{file:'depth.bin',bytes:depthBytes.length,sha256:sha256(depthBytes)}};
    await writeFile(join(capture,'rgb.bin'),rgbBytes);await writeFile(join(capture,'depth.bin'),depthBytes);
    const frame={generation:1,id:1,epoch:0,imageTime:0,count:350,descriptor:descriptor.descriptor,opticalPoint:descriptor.point,
      enabled:descriptor.enabled,rgbCalibration:camera.rgbCalibration,depthCalibration:camera.depthCalibration,
      disparityNoise:.08,noiseReferenceFx:200,baseline:.05};
    async function payload(value,name){
      const bytes=Buffer.from(JSON.stringify(value)+'\n'),pointer={file:'native-frames/'+name+'.json',sha256:sha256(bytes),
        id:value.id,epoch:value.epoch,time:value.imageTime,generation:value.generation};
      await writeFile(join(capture,pointer.file),bytes);return pointer;
    }
    const reference=await payload(frame,'reference'),current=await payload({...frame,id:2,epoch:25,imageTime:5},'retained-current');
    const source=sha256((await Promise.all(native.paths.map(path=>readFile(path,'utf8')))).join(native.separator));
    const module={file:'controlled-native-module.wasm',sha256:'a'.repeat(64)};
    await writeFile(join(capture,'native-manifest.json'),JSON.stringify({sourceSha256:source,models:{step:{files:{module}}}}));
    await writeFile(join(capture,'receipt.json'),JSON.stringify({complete:true,framesCompleted:1251,firstTime:0,lastTime:250,
      scope:'CONTROLLED SYNTHETIC TRANSPORT FIXTURE, NOT OFFICE FLIGHT OR OBSERVED NATIVE VERIFIER COUNTS.'}));
    for(let epoch=0;epoch<=1250;epoch++){
      const active=epoch>=25&&epoch<=30,caseIndex=epoch-24,trace={status:0,inputs:{imageEpoch:[epoch]},outputs:{},
        derived:{loopAttempted:active,loopCandidateCount:active?1:0}};
      const sample={index:epoch,sequence:epoch,time:epoch/5,image,nativeTrace:trace};
      if(active){
        Object.assign(trace,{previousCatalog:{nextId:caseIndex+1},references:caseIndex===6?[]:[reference],source:{module},retainedCurrent:caseIndex===1?current:null});
        Object.assign(trace.inputs,{rgbCalibration:camera.rgbCalibration,depthCalibration:camera.depthCalibration,
          disparityNoise:[.08],noiseReferenceFx:[200],baseline:[.05],depthUnits:[.001]});
        Object.assign(trace.derived,{'loopCandidateReferenceId[1]':1,'loopCandidateCurrentId[1]':caseIndex+1,
          'loopCandidateReason[1]':caseIndex===1?11:7,'loopCandidateMatchedCount[1]':caseIndex===2?348:349});
        if(caseIndex===4)delete trace.derived['loopCandidateMatchedCount[1]'];
        trace.outputs={features:pixels.flatMap(([x,y])=>[x,y,0]),featureEnabled:[...descriptor.enabled]};
        if(caseIndex===5)trace.outputs.featureEnabled[15]=1;
        sample.metadata={imageLayout:{color:{width,height,format:'RGB8',strideBytes:width*3,bytes:rgbBytes.length},
          depth:{width,height,format:'Z16',strideBytes:width*2,bytes:depthBytes.length,isBigEndian:false,unitsMeters:.001}}};
      }
      await writeFile(join(capture,'frames',String(epoch).padStart(4,'0')+'.json'),JSON.stringify(sample));
    }
    const run=(script,args,timeout=20000)=>{
      const result=spawnSync(process.execPath,['scripts/'+script,...args],{encoding:'utf8',timeout});
      assert.equal(result.status,0,result.stderr+'\n'+result.stdout);return result;
    };
    run('freeze-office-alias-controls.mjs',[capture,selection,'--max-cases','6']);
    const frozen=await readFile(join(selection,'case-manifest.json'));
    run('extract-office-alias-controls.mjs',[capture,selection,output]);
    assert.deepEqual(await readFile(join(selection,'case-manifest.json')),frozen);
    const strict=JSON.parse(await readFile(join(output,'office-alias-pairs.json'))),receipt=JSON.parse(await readFile(join(output,'extraction-receipt.json')));
    assert.deepEqual(strict.cases.map(c=>c.provenance.current.epoch),[25,27]);
    assert.equal(strict.cases[0].provenance.currentExtentPolicy,'actual-retained-current');
    assert.equal(strict.cases[1].provenance.currentExtentPolicy,'padded-disabled-domain');
    for(const entry of strict.cases){
      assert.equal(entry.provenance.matcher.count,349);assert.equal(entry.provenance.matcher.originalMatchedCount,349);
      assert.equal(entry.provenance.matcher.matchCountIdentity,true);assert.equal(entry.inputs.pairEnabled[15],0);
      assert.equal(entry.provenance.matcher.currentIndex[349],350);assert.equal(entry.provenance.kind,'native-alias-control');
      assert.equal(entry.provenance.selectionManifestSha256,sha256(frozen));
    }
    assert.equal(receipt.events[1].status,'count-mismatch');assert.equal(receipt.events[3].status,'missing-native-count');
    assert.match(receipt.events[4].error,/mask differs/);assert.match(receipt.events[5].error,/reference payload binding/);
    assert.equal(receipt.caseErrors,3);assert.equal(receipt.processedCases,6);assert.equal(receipt.unfinishedCases.length,0);
    assert.equal(receipt.coverage.scannedNonLateFrames,1175);assert.equal(receipt.coverage.omittedByCaseLimit,0);
    await assert.rejects(()=>access(join(output,'reconstruction-only.json')));
    const unfinished=join(root,'unfinished');run('extract-office-alias-controls.mjs',[capture,selection,unfinished,'--seconds','0.000000001']);
    const pending=JSON.parse(await readFile(join(unfinished,'extraction-receipt.json')));
    assert.equal(pending.status,'partial');assert.equal(pending.unfinishedCases.length,6);assert.equal(pending.processedCases,0);
    await assert.rejects(()=>access(join(unfinished,'office-alias-pairs.json')));
    const partitionPath=join(root,'partition.json'),partitionOutput=join(root,'partition-output');
    await writeFile(partitionPath,JSON.stringify({schemaVersion:1,selectionManifestSha256:sha256(frozen),ordinals:[2]}));
    run('extract-office-alias-controls.mjs',[capture,selection,partitionOutput,'--partition',partitionPath]);
    const partitionReceipt=JSON.parse(await readFile(join(partitionOutput,'extraction-receipt.json')));
    const partitionPairs=JSON.parse(await readFile(join(partitionOutput,'office-alias-pairs.json')));
    assert.deepEqual(partitionPairs.cases.map(c=>c.provenance.current.epoch),[27]);
    assert.equal(partitionReceipt.events.length,6);assert.equal(partitionReceipt.processedCases,1);
    assert.equal(partitionReceipt.partition.requestedCases,1);assert.equal(partitionReceipt.partition.outsidePartitionCases,5);
    assert.equal(partitionReceipt.partition.completedCases,1);assert.deepEqual(partitionReceipt.partition.unfinishedCases,[]);
    assert.equal(partitionReceipt.status,'partial');assert.equal(partitionReceipt.stopReason,'declared-partition-complete');
    assert.equal(partitionReceipt.unfinishedCases.length,5);assert.equal(partitionReceipt.events[0].status,'pending');
    assert.deepEqual(await readFile(join(selection,'case-manifest.json')),frozen);
    if(process.env.SLAM_ALIAS_REPORT)await writeFile(process.env.SLAM_ALIAS_REPORT,JSON.stringify({status:'pass',capacity:350,
      sparseHole:15,finalSlot:349,strictCases:2,countMismatchCases:1,missingCountCases:1,maskAndReferenceErrors:2,
      unfinishedCases:6,sourceSha256:sha256(prepared.source),descriptorModule:artifact.module_sha256,
      extractionModules:receipt.extraction.modules,compiler:pin.revision,
      scope:'Controlled synthetic trace transport using real shipped kernels; no office/browser, independently observed native Verify count or alias-acceptance evidence.'},null,2)+'\n');
  }finally{await rm(root,{recursive:true,force:true});}
});
