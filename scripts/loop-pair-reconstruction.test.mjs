import {homedir} from 'node:os';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import * as compiler from '@cognipilot/rumoca';
import {rgbdSlamNativeSourceManifest as native} from '../src/modelica-slam-source-manifest.mjs';
import {loopPairReconstructionSource,instantiateLoopPairKernel,descriptorDefaults,matcherDefaults,
  descriptorOutputs,matcherOutputs,pairMatchIdentity,consensusInputsFromPairs} from './loop-pair-reconstruction.mjs';
import {sha256,consensusDefaults} from './loop-consensus-probe.mjs';

test('native descriptor/matcher/covariance bridge preserves full350 sparse slots and calibration',async()=>{
  const wasm=await readFile(new URL('../node_modules/@cognipilot/rumoca/rumoca_bind_wasm_bg.wasm',import.meta.url));
  const pin=JSON.parse(await readFile(new URL('../rumoca-package.json',import.meta.url)));
  assert.equal(sha256(wasm),pin.files['rumoca_bind_wasm_bg.wasm']);
  await compiler.default({module_or_path:wasm});
  const height=240,width=424,prepared=await loopPairReconstructionSource(height,width),programs={},artifacts={};
  for(const [model,defaults,outputs] of [['LoopCurrentDescriptorProbe',descriptorDefaults,descriptorOutputs],['LoopPairMatcherProbe',matcherDefaults,matcherOutputs]]){
    const artifact=JSON.parse(compiler.prepare_native_program(prepared.source,model));artifacts[model]=artifact;
    programs[model]=await instantiateLoopPairKernel(artifact,prepared.source,defaults,outputs);
  }
  let random=17;
  const rgb=Float64Array.from({length:height*width*3},()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random>>>24;});
  const pixels=Array.from({length:350},(_,i)=>[5+i%25*6,5+Math.floor(i/25)*6]);
  const camera={rgb,depth:new Float64Array(height*width).fill(2000),pixels,
    rgbCalibration:[100,110,79.5,44.5],depthCalibration:[100,110,79.5,44.5],
    disparityNoise:.08,noiseReferenceFx:200,baseline:.05};
  const descriptor=programs.LoopCurrentDescriptorProbe.run(camera);
  assert.equal(descriptor.invalidCount[0],0);assert.deepEqual(descriptor.enabled,Array(350).fill(1));
  for(let i=0;i<350;i++){
    assert.ok(Math.abs(descriptor.point[3*i]-(pixels[i][0]-79.5)*2/100)<1e-12);
    assert.ok(Math.abs(descriptor.point[3*i+1]-(pixels[i][1]-44.5)*2/110)<1e-12);
    assert.equal(descriptor.point[3*i+2],2);
    assert.ok(Math.abs(descriptor.descriptor.slice(i*49,(i+1)*49).reduce((s,v)=>s+v*v,0)-1)<1e-12);
  }
  const matcher={referenceDescriptor:descriptor.descriptor,currentDescriptor:descriptor.descriptor,
    referencePoint:descriptor.point,currentPoint:descriptor.point,referenceEnabled:descriptor.enabled,currentEnabled:descriptor.enabled,
    referenceRgbCalibration:camera.rgbCalibration,currentRgbCalibration:[200,220,79.5,44.5],
    referenceDisparityNoise:.08,currentDisparityNoise:.16,referenceNoiseReferenceFx:200,currentNoiseReferenceFx:400,
    referenceBaseline:.05,currentBaseline:.05};
  const matched=programs.LoopPairMatcherProbe.run(matcher);
  assert.equal(matched.count[0],350);assert.deepEqual(matched.currentIndex,Array.from({length:350},(_,i)=>i+1));
  assert.deepEqual(matched.sourcePoint,descriptor.point);assert.deepEqual(matched.targetPoint,descriptor.point);
  // Independent calibrated-noise calculation; target pixel variance is quarter-sized.
  const p=descriptor.point.slice(0,3),bearing=[p[0]/p[2],p[1]/p[2],1],variance=(p[2]**2*.08/200/.05)**2;
  for(let a=0;a<3;a++)for(let b=0;b<3;b++){
    const pixel=a===b&&a<2?(p[2]*.5/camera.rgbCalibration[a])**2:0;
    assert.ok(Math.abs(matched.sourceCovariance[a*3+b]-(bearing[a]*bearing[b]*variance+pixel))<1e-12);
    assert.ok(Math.abs(matched.targetCovariance[a*3+b]-(bearing[a]*bearing[b]*variance+pixel/4))<1e-12);
  }
  const sparsePixels=structuredClone(pixels);sparsePixels[15]=[0,0];
  const sparse=programs.LoopCurrentDescriptorProbe.run({...camera,pixels:sparsePixels});
  assert.equal(sparse.enabled[15],0);assert.equal(sparse.enabled[349],1);
  const sparseMatched=programs.LoopPairMatcherProbe.run({...matcher,currentDescriptor:sparse.descriptor,currentPoint:sparse.point,currentEnabled:sparse.enabled});
  assert.equal(sparseMatched.count[0],349);assert.equal(sparseMatched.pairEnabled[15],0);assert.equal(sparseMatched.currentIndex[349],350);
  assert.deepEqual(sparseMatched.targetCovariance.slice(15*9,16*9),Array(9).fill(0));
  const metric=programs.LoopPairMatcherProbe.run({...matcher,calibratedResiduals:0});
  assert.ok(metric.sourceCovariance.every(v=>v===0)&&metric.targetCovariance.every(v=>v===0));
  assert.deepEqual(pairMatchIdentity(matched,350),{status:'count-identical',matchCountIdentity:true,count:350,originalMatchedCount:350});
  assert.equal(pairMatchIdentity(matched,349).status,'count-mismatch');
  assert.equal(pairMatchIdentity(matched,undefined).status,'reconstruction-only');
  const inputs=consensusInputsFromPairs(matched,consensusDefaults);
  assert.equal(inputs.sourcePoint.length,350);assert.deepEqual(inputs.sourcePoint[349],descriptor.point.slice(349*3));
  assert.deepEqual(inputs.sourceCovariance[0][0],matched.sourceCovariance.slice(0,3));
  assert.throws(()=>consensusInputsFromPairs(matched,{}),/Missing recorded/);
  // CONTROLLED trace-format integration fixture. It does not simulate a flight
  // or supply an observed native sequential matched-count baseline.
  const scratch=resolve(process.env.SLAM_PAIR_TEST_ROOT??join(homedir(),'scratch/slam_web/build/loop-pair-bridge'));await mkdir(scratch,{recursive:true});
  const root=await mkdtemp(join(scratch,'positive-transport-control-')),capture=join(root,'capture'),pairDir=join(root,'pairs');
  await mkdir(join(capture,'frames'),{recursive:true});await mkdir(join(capture,'native-frames'));
  const rgbBytes=Buffer.from(rgb),zBytes=Buffer.alloc(width*height*2);for(let i=0;i<width*height;i++)zBytes.writeUInt16LE(2000,i*2);
  const image={rgb:{file:'rgb.bin',bytes:rgbBytes.length,sha256:sha256(rgbBytes)},depth:{file:'depth.bin',bytes:zBytes.length,sha256:sha256(zBytes)}};
  await writeFile(join(capture,'rgb.bin'),rgbBytes);await writeFile(join(capture,'depth.bin'),zBytes);
  const reference={generation:1,id:1,epoch:0,imageTime:0,count:350,enabled:descriptor.enabled,descriptor:descriptor.descriptor,
    opticalPoint:descriptor.point,rgbCalibration:camera.rgbCalibration,depthCalibration:camera.depthCalibration,
    disparityNoise:camera.disparityNoise,noiseReferenceFx:camera.noiseReferenceFx,baseline:camera.baseline};
  const referenceBytes=Buffer.from(JSON.stringify(reference)+'\n'),pointer={file:'native-frames/reference.json',sha256:sha256(referenceBytes),id:1,epoch:0,time:0,generation:1};
  await writeFile(join(capture,pointer.file),referenceBytes);
  const baseSource=sha256((await Promise.all(native.paths.map(p=>readFile(p,'utf8')))).join(native.separator));
  const module={file:'controlled-fixture.wasm',sha256:'a'.repeat(64)};
  await writeFile(join(capture,'native-manifest.json'),JSON.stringify({sourceSha256:baseSource,models:{step:{files:{module}}}}));
  await writeFile(join(capture,'receipt.json'),JSON.stringify({complete:true,framesCompleted:1251,firstTime:0,lastTime:250,
    scope:'CONTROLLED TRACE TRANSPORT FIXTURE, NOT AN OFFICE FLIGHT OR ORIGINAL NATIVE SEQUENTIAL COUNT.'}));
  for(let epoch=0;epoch<=1250;epoch++){
    const sample={index:epoch,sequence:epoch,time:epoch/5,image,
      nativeTrace:{status:0,inputs:{imageEpoch:[epoch]},derived:{sequentialRejectionReason:1,loopCandidateCount:0},outputs:{}}};
    if(epoch===1||epoch===1175){
      sample.metadata={imageLayout:{color:{width,height,format:'RGB8',strideBytes:width*3,bytes:rgbBytes.length},
        depth:{width,height,format:'Z16',strideBytes:width*2,bytes:zBytes.length,isBigEndian:false,unitsMeters:.001}}};
      Object.assign(sample.nativeTrace,{previousCatalog:{nextId:2},references:[pointer],retainedCurrent:null,source:{module}});
      Object.assign(sample.nativeTrace.inputs,{rgbCalibration:camera.rgbCalibration,depthCalibration:camera.depthCalibration,
        disparityNoise:[.08],noiseReferenceFx:[200],baseline:[.05],depthUnits:[.001]});
      sample.nativeTrace.outputs={features:pixels.flatMap(([x,y])=>[x,y,0]),featureEnabled:Array(350).fill(1)};
      if(epoch===1)sample.nativeTrace.derived.sequentialRejectionReason=7;
      else Object.assign(sample.nativeTrace.derived,{loopCandidateCount:1,'loopCandidateReferenceId[1]':1,
        'loopCandidateReason[1]':0,'loopCandidateMatchedCount[1]':350});
    }
    await writeFile(join(capture,'frames',String(epoch).padStart(4,'0')+'.json'),JSON.stringify(sample));
  }
  execFileSync(process.execPath,['scripts/extract-office-loop-pairs.mjs',capture,pairDir],{stdio:'pipe',timeout:20000});
  const strict=JSON.parse(await readFile(join(pairDir,'office-pairs.json'))),reconstructed=JSON.parse(await readFile(join(pairDir,'reconstruction-only.json')));
  const extractionReceipt=JSON.parse(await readFile(join(pairDir,'extraction-receipt.json')));
  assert.equal(strict.cases.length,1);assert.equal(strict.cases[0].provenance.kind,'late-return');
  assert.equal(strict.cases[0].provenance.matcher.matchCountIdentity,true);assert.equal(strict.cases[0].provenance.current.epoch,1175);
  assert.equal(strict.cases[0].provenance.matcher.currentIndex[349],350);
  assert.equal(reconstructed.cases.length,1);assert.equal(reconstructed.cases[0].provenance.kind,'sequential');
  assert.equal(reconstructed.cases[0].provenance.matcher.matchCountIdentity,false);
  assert.equal(extractionReceipt.identityVerifiedCases,1);assert.equal(extractionReceipt.reconstructionOnlyCases,1);
  assert.equal(extractionReceipt.events.some(e=>e.status==='extraction-error'),false);
  const report={status:'pass',height,width,capacity:350,calibrationChecked:true,sparseSlotChecked:15,finalSlotPreserved:true,
    descriptorCount:350,sparseMatchCount:349,readonlyInputs:true,sourceSha256:sha256(prepared.source),compiler:pin.revision,
    modules:Object.fromEntries(Object.entries(artifacts).map(([k,a])=>[k,a.module_sha256])),
    traceTransportControl:{strictLoopCases:1,sequentialReconstructionCases:1,kind:'synthetic trace metadata with native CPU descriptor outputs'},
    scope:'Deterministic image/component and controlled transport checks, not an office capture or original sequential Verify count.'};
  if(process.env.SLAM_PAIR_BRIDGE_REPORT){await mkdir(process.env.SLAM_PAIR_BRIDGE_REPORT,{recursive:true});
    await writeFile(process.env.SLAM_PAIR_BRIDGE_REPORT+'/numerics.json',JSON.stringify(report,null,2)+'\n');
    await writeFile(process.env.SLAM_PAIR_BRIDGE_REPORT+'/wrappers.mo',prepared.source);}
});
