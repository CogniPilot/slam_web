import {homedir} from 'node:os';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,mkdtemp,writeFile,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {officePairRequests,captureMatchingDefaults,effectivePairSettings,currentDescriptorInputs} from './office-pair-adapter.mjs';
import {rgbdSlamNativeSourceManifest as native} from '../src/modelica-slam-source-manifest.mjs';
import {sha256} from './loop-consensus-probe.mjs';

test('actual candidate identity comes from typed lanes and never localization matchCount',async()=>{
  const sample={sequence:1175,time:235,nativeTrace:{status:0,inputs:{imageEpoch:[1175]},previousCatalog:{nextId:6},
    derived:{sequentialRejectionReason:7,matchCount:999,loopCandidateCount:1,'loopCandidateReferenceId[1]':1,
      'loopCandidateReason[1]':7,'loopCandidateMatchedCount[1]':27},outputs:{}}};
  const result=officePairRequests(sample);
  assert.deepEqual(result.requests[0],{kind:'sequential',referenceId:5,originalReason:7,originalMatchedCount:undefined});
  assert.deepEqual(result.requests[1],{kind:'late-return',rank:0,referenceId:1,originalReason:7,originalMatchedCount:27});
  assert.equal(officePairRequests(sample,{sequentialAlreadySeen:true}).requests.length,1);
  sample.nativeTrace.derived['loopCandidateReason[1]']=3;
  assert.equal(officePairRequests(sample,{sequentialAlreadySeen:true}).events[0].status,'unattempted-before-matcher');
  sample.nativeTrace.derived.loopCandidateCount=0;
  assert.equal(officePairRequests(sample,{sequentialAlreadySeen:true}).events[0].status,'absent-candidates');
  const text=await readFile(new URL('../models/Optimization/RGBDCatalogGraphCapture.mo',import.meta.url),'utf8');
  const defaults=captureMatchingDefaults(text);
  assert.equal(defaults.sequentialSeed,7);assert.equal(defaults.loopSeed,7);assert.equal(defaults.loopMinimumInliers,12);
  const trace={inputs:{loopMinimumInliers:[15],loopCalibratedResiduals:[0]}};
  assert.equal(effectivePairSettings(trace,{kind:'sequential'},defaults).controls.minimumInliers,12);
  const loop=effectivePairSettings(trace,{kind:'late-return',rank:0},defaults);
  assert.equal(loop.controls.minimumInliers,15);assert.equal(loop.controls.calibratedResiduals,0);
  assert.equal(loop.origin.minimumInliers,'native-input:loopMinimumInliers');
});

test('current sparse native pixels bypass reselection and padded image rows are decoded once',()=>{
  const width=424,height=240,rgbStride=width*3+5,zStride=width*2+2;
  const rgb=Buffer.alloc(rgbStride*height,77),depth=Buffer.alloc(zStride*height);
  rgb[rgbStride*(height-1)+width*3-1]=123;depth.writeUInt16LE(2000,0);depth.writeUInt16LE(3000,(height-1)*zStride+(width-1)*2);
  const features=Array(1050).fill(0),featureEnabled=Array(350).fill(0);features[0]=5;features[1]=6;featureEnabled[0]=1;
  features[349*3]=10;features[349*3+1]=20;featureEnabled[349]=1;
  const sample={metadata:{imageLayout:{color:{width,height,format:'RGB8',strideBytes:rgbStride,bytes:rgb.length},
    depth:{width,height,format:'Z16',strideBytes:zStride,bytes:depth.length,isBigEndian:false,unitsMeters:.001}}},
    nativeTrace:{outputs:{features,featureEnabled},inputs:{rgbCalibration:[100,110,211.5,119.5],depthCalibration:[100,110,211.5,119.5],
      disparityNoise:[.08],noiseReferenceFx:[200],baseline:[.05],depthUnits:[.001]}}};
  const inputs=currentDescriptorInputs(sample,rgb,depth);
  assert.equal(inputs.activeCount,350);assert.deepEqual(Array.from(inputs.pixels.slice(698)),[10,20]);
  assert.equal(inputs.rgb.at(-1),123);assert.equal(inputs.depth[0],2000);assert.equal(inputs.depth.at(-1),3000);
  assert.equal(inputs.depthUnits,.001);assert.equal(inputs.pixels[30],0);
  sample.nativeTrace.inputs.depthUnits=[1];assert.throws(()=>currentDescriptorInputs(sample,rgb,depth),/Depth scale differs/);
});

test('complete no-candidate trace creates a receipt and never an empty strict pairs file',async()=>{
  const scratch=resolve(process.env.SLAM_PAIR_TEST_ROOT??join(homedir(),'scratch/slam_web/build/loop-pair-bridge'));await mkdir(scratch,{recursive:true});
  const root=await mkdtemp(join(scratch,'empty-capture-control-')),capture=join(root,'capture'),output=join(root,'pairs');
  await mkdir(join(capture,'frames'),{recursive:true});
  await writeFile(join(capture,'receipt.json'),JSON.stringify({complete:true,framesCompleted:1251,firstTime:0,lastTime:250,
    scope:'CONTROLLED NO-CANDIDATE METADATA FIXTURE. No camera or SLAM execution.'}));
  const source=sha256((await Promise.all(native.paths.map(p=>readFile(p,'utf8')))).join(native.separator));
  await writeFile(join(capture,'native-manifest.json'),JSON.stringify({sourceSha256:source}));
  for(let epoch=0;epoch<=1250;epoch++)await writeFile(join(capture,'frames',String(epoch).padStart(4,'0')+'.json'),JSON.stringify({index:epoch,sequence:epoch,time:epoch/5,
    nativeTrace:{status:0,inputs:{imageEpoch:[epoch]},derived:{sequentialRejectionReason:1,loopCandidateCount:0},outputs:{}}}));
  execFileSync(process.execPath,['scripts/extract-office-loop-pairs.mjs',capture,output],{stdio:'pipe',timeout:15000});
  const receipt=JSON.parse(await readFile(join(output,'extraction-receipt.json')));
  assert.equal(receipt.status,'no-identity-verified-candidates');assert.equal(receipt.lateWindowFrames,76);
  assert.equal(receipt.events.filter(e=>e.status==='absent-candidates').length,76);
  assert.equal(receipt.identityVerifiedCases,0);await assert.rejects(()=>access(join(output,'office-pairs.json')));
  await assert.rejects(()=>access(join(output,'reconstruction-only.json')));
});
