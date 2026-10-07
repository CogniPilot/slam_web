import {beforeAll,afterAll,expect,it} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NativeProgram,type NativeProgramArtifact} from '../../src/modelica-native-program';
import {rawDescriptorOracle} from './rgbd-descriptor-frame-fixtures';
import {defaultE} from './rgbd-registration-uncertainty-fixtures';
import {selectionOracle} from './feature-selection-bounded-oracle';
import {localizationSource,localizationImage,initialFactors,predictedFactors,opticalNoise,identityCorrection,
  snapshotFields,coldState,covariance,captured} from './rgbd-localization-fixtures';

const artifactPath=process.env.RUMOCA_LOCALIZATION_ARTIFACT;
const fullArtifactPath=process.env.RUMOCA_FULL_LOCALIZATION_ARTIFACT;
const source=process.env.RUMOCA_LOCALIZATION_SOURCE?readFileSync(process.env.RUMOCA_LOCALIZATION_SOURCE,'utf8'):localizationSource();
const sha=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex');
const report={status:artifactPath?'RUNNING':'ARTIFACT_NOT_PROVIDED',sourceSha256:sha(source),
  actualCases:[] as string[],actualNumericalCases:0,oracleChecks:0,fullSlamAccepted:false,runtimeIntegrated:false};
const save=()=>{if(process.env.RUMOCA_LOCALIZATION_REPORT)writeFileSync(process.env.RUMOCA_LOCALIZATION_REPORT,JSON.stringify(report,null,2)+'\n');};
let p:NativeProgram,a:NativeProgramArtifact;
beforeAll(async()=>{save();if(!artifactPath)return;a=JSON.parse(readFileSync(artifactPath,'utf8'));
  expect(a.model_name).toBe('RGBDInertialLocalizationStep');expect(a.var_layout.shapes.rgb).toEqual([90,160,4]);
  expect(a.var_layout.shapes.referenceDescriptor).toEqual([350,49]);expect(a.var_layout.shapes.crossCovariance).toEqual([15,6]);
  p=await NativeProgram.instantiate(a,source);});
afterAll(()=>{if(artifactPath)report.status=report.actualNumericalCases===3?'ACTUAL_CONNECTED_LOCALIZATION_PASS':'FAILED_OR_INCOMPLETE';save();});
const near=(actual:ArrayLike<number>,expected:ArrayLike<number>,name:string,tolerance=2e-8)=>{
  expect(actual.length,name).toBe(expected.length);for(let i=0;i<expected.length;i++)
    if(!Number.isFinite(actual[i])||Math.abs(actual[i]-expected[i])>tolerance)throw Error(`${name}[${i}]: ${actual[i]} != ${expected[i]}`);
};
const state=()=>Object.fromEntries(Object.entries(snapshotFields).map(([input,output])=>[input,Array.from(p.output(output))]));
function execute(label:string,s:Record<string,number[]>,options:{frame?:number;capture?:number;epoch?:number;h?:number;image?:ReturnType<typeof localizationImage>}={}){
  const f=options.image??localizationImage(),inputs:Record<string,number[]>={...s,rgb:f.rgb.flat(2),depth:f.depth.flat(),pixels:f.pixels.flat(),
    activeCount:[f.activeCount],rgbCalibration:f.rgbCalibration,depthCalibration:f.depthCalibration,disparityNoise:[f.disparityNoise],
    noiseReferenceFx:[f.noiseReferenceFx],baseline:[f.baseline],opticalToBody:defaultE.flat(),cameraOriginBody:[.18,0,-.04],
    accel:[0,0,9.81],gyro:[0,0,0],gravity:[0,0,-9.81],h:[options.h??1/90],frameEnabled:[options.frame??1],
    imageCaptureRequested:[options.capture??0],currentEpoch:[options.epoch??0],featureScore:Array(350).fill(1)};
  for(const [name,v] of Object.entries(inputs)){expect(p.input(name).length,name).toBe(v.length);p.input(name).set(v);}
  const before=new Uint8Array(p.memory.buffer,a.abi.p_offset,a.abi.p_count*8).slice();p.evaluate((options.epoch??0)/90);
  expect(new Uint8Array(p.memory.buffer,a.abi.p_offset,a.abi.p_count*8),'complete P readonly').toEqual(before);
  report.actualCases.push(label);save();return state();
}
function covarianceFields(expected:ReturnType<typeof covariance>){near(p.output('nextCovariance'),expected.current.flat(),'P225');
  near(p.output('nextCrossCovariance'),expected.cross.flat(),'cross90');near(p.output('nextReferenceCovariance'),expected.reference.flat(),'reference36');}
function retained(before:Record<string,number[]>,after:Record<string,number[]>){
  for(const name of Object.keys(snapshotFields).filter(n=>n.startsWith('reference')&&!['referenceUsed','referenceCovariance'].includes(n)))
    expect(after[name],`retained ${name}`).toEqual(before[name]);
}

it('independent full350 image/geometry and correlated covariance fixtures qualify the connected cases (oracle only)',()=>{
  const f=localizationImage(),o=opticalNoise(f);expect(o.descriptor.enabled).toEqual(Array(350).fill(1));
  expect(o.matched.count).toBe(350);expect(o.matched.currentIndex).toEqual(Array.from({length:350},(_,i)=>i+1));
  expect(o.noise.validCount).toBe(350);expect(o.noise.relativeCovariance.flat().every(Number.isFinite)).toBe(true);
  const first=captured(predictedFactors(initialFactors())),before=covariance(first),prediction=covariance(predictedFactors(first));
  const pose=[0,1,2,6,7,8];
  expect(before.reference).toEqual(pose.map(i=>pose.map(j=>before.current[i][j])));
  expect(before.cross).toEqual(before.current.map(row=>pose.map(j=>row[j])));
  expect(prediction.cross.flat().some((v,i)=>v!==before.cross.flat()[i])).toBe(true);
  const corrected=identityCorrection(predictedFactors(first),o.noise.relativeCovariance);
  expect(corrected.nis).toBeLessThan(1e-12);expect(corrected.d.every(v=>Math.abs(v)<1e-12)).toBe(true);
  expect(corrected.posterior[15][15]).toBe(prediction.reference[0][0]);
  const alpha=structuredClone(f);alpha.rgb.forEach(row=>row.forEach(pixel=>pixel[3]=NaN));
  expect(rawDescriptorOracle(alpha)).toEqual(o.descriptor);
  report.oracleChecks++;save();
});

it.skipIf(!artifactPath)('actual first capture commits full350 image metadata and all correlated covariance blocks; held interval retains reference',()=>{
  const image=localizationImage(),expectedImage=rawDescriptorOracle(image),first=execute('first image creates estimated reference',coldState(),{capture:1});
  expect(p.output('predictionAccepted')[0]).toBe(1);expect(p.output('captureAccepted')[0]).toBe(1);expect(p.output('observationAccepted')[0]).toBe(0);
  near(p.output('nextReferenceDescriptor'),expectedImage.descriptor.flat(),'all17150 descriptor cells');
  near(p.output('nextReferencePoint'),expectedImage.point.flat(),'all1050 point cells');
  expect(first.referenceEnabled).toEqual(expectedImage.enabled);expect(first.referencePixels).toEqual(image.pixels.flat());
  expect(first.referenceCount).toEqual([350]);expect(first.referenceAvailable).toEqual([1]);expect(first.referenceEpoch).toEqual([0]);
  near(p.output('nextQuaternion'),[1,0,0,0],'source quaternion');near(p.output('nextPosition'),[.6,-.8,1.2],'estimated stationary position');
  let factors=captured(predictedFactors(initialFactors()));covarianceFields(covariance(factors));
  const held=execute('held IMU interval cannot replace reference',first,{frame:0,capture:1,epoch:1});
  expect(p.output('captureAccepted')[0]).toBe(0);expect(p.output('observationAccepted')[0]).toBe(0);retained(first,held);
  factors=predictedFactors(factors);covarianceFields(covariance(factors));
  const late=349,world=expectedImage.point[late];
  // Last-slot world candidate is generated by source, not viewer arithmetic.
  execute('last-slot optical-to-world candidate',coldState(),{capture:1});
  near(p.output('mapCandidatePoint').slice(late*3,late*3+3),[.6+world[2]+.18,-.8-world[0],1.2-world[1]-.04],'last350 map point');
  expect(p.output('mapCandidateEnabled')[late]).toBe(1);report.actualNumericalCases++;save();
},60000);

it.skipIf(!artifactPath)('actual relative correction consumes pair, refuses same-frame capture, and a fresh image refreezes image and covariance together',()=>{
  const first=execute('initial reference',coldState(),{capture:1}),factors=captured(predictedFactors(initialFactors()));
  const c=identityCorrection(predictedFactors(factors),opticalNoise().noise.relativeCovariance);
  const corrected=execute('same-scene optical correction and simultaneous capture request',first,{capture:1,epoch:1});
  expect(p.output('visualValid')[0]).toBe(1);expect(p.output('matchCount')[0]).toBe(350);
  expect(p.output('observationAccepted')[0]).toBe(1);expect(p.output('captureAccepted')[0]).toBe(0);expect(p.output('captureRejected')[0]).toBe(1);
  retained(first,corrected);expect(corrected.referenceUsed).toEqual([1]);expect(corrected.lastUsedEpoch).toEqual([1]);
  near(p.output('nextCovariance'),c.posterior.slice(0,15).flatMap(r=>r.slice(0,15)),'corrected225');
  near(p.output('nextCrossCovariance'),c.posterior.slice(0,15).flatMap(r=>r.slice(15)),'corrected90');
  near(p.output('nextReferenceCovariance'),c.posterior.slice(15).flatMap(r=>r.slice(15)),'frozen36');
  expect(p.output('trackingEnabled')).toEqual(new Float64Array(350).fill(1));
  expect(Array.from(p.output('trackingCurrentPixel'))).toEqual(localizationImage().pixels.flat());
  near(p.output('positionCovariance'),c.posterior.slice(0,3).flatMap(r=>r.slice(0,3)),'viewer position block');
  near(p.output('attitudeCovariance'),c.posterior.slice(6,9).flatMap(r=>r.slice(6,9)),'viewer angle block');
  const next=execute('used reference may only be replaced by a fresh frame',corrected,{capture:1,epoch:2});
  expect(p.output('imageReuseRejected')[0]).toBe(1);expect(p.output('observationAccepted')[0]).toBe(0);
  expect(p.output('captureAccepted')[0]).toBe(1);expect(next.referenceEpoch).toEqual([2]);expect(next.referenceUsed).toEqual([0]);
  report.actualNumericalCases++;save();
},60000);

it.skipIf(!artifactPath)('actual invalid image/step preserves corresponding snapshot; source-bound reset and JSON reload recover',async()=>{
  const first=execute('initial reference for failures',coldState(),{capture:1});
  const flat=localizationImage();flat.rgb.forEach(row=>row.forEach(pixel=>pixel.fill(0)));
  const invalid=execute('flat image refuses replacement but predicts',first,{image:flat,capture:1,epoch:1});
  expect(p.output('frameValid')[0]).toBe(0);expect(p.output('captureAccepted')[0]).toBe(0);expect(p.output('captureRejected')[0]).toBe(1);retained(first,invalid);
  const zero=execute('zero-step all filter state retained',first,{h:0,capture:1,epoch:1});
  for(const name of Object.keys(snapshotFields))expect(zero[name],name).toEqual(first[name]);
  const malformed=localizationImage();malformed.activeCount=350.5;
  const count=execute('malformed count cannot replace geometry',first,{image:malformed,capture:1,epoch:1});retained(first,count);
  const zeroNoise=localizationImage();zeroNoise.disparityNoise=0;
  const unsupportedNoise=execute('noise outside uncertainty contract cannot replace reference',first,{image:zeroNoise,capture:1,epoch:1});
  expect(p.output('frameValid')[0]).toBe(0);expect(p.output('captureAccepted')[0]).toBe(0);retained(first,unsupportedNoise);
  const sparse=localizationImage();sparse.pixels=sparse.pixels.map(()=>[-1,-1]);
  const lastPixels=[[5,5],[50,5],[100,5],[5,45],[50,45],[100,80]];
  lastPixels.forEach((pixel,i)=>{sparse.pixels[344+i]=pixel;});
  const sparseExpected=rawDescriptorOracle(sparse);
  const late=execute('sparse final six slots bootstrap full350 reference',coldState(),{image:sparse,capture:1});
  expect(p.output('captureAccepted')[0]).toBe(1);expect(late.referenceCount).toEqual([350]);
  expect(late.referenceEnabled).toEqual([...Array(344).fill(0),...Array(6).fill(1)]);
  near(p.output('nextReferenceDescriptor'),sparseExpected.descriptor.flat(),'sparse17150');
  near(p.output('nextReferencePoint'),sparseExpected.point.flat(),'sparse1050');
  execute('sparse final slots correct without prefix truncation',late,{image:sparse,epoch:1});
  expect(p.output('matchCount')[0]).toBe(6);expect(p.output('observationAccepted')[0]).toBe(1);
  expect(p.output('trackingEnabled')[349]).toBe(1);expect(p.output('mapCandidateEnabled')[349]).toBe(1);
  p.reset();const replay=execute('reset replay',coldState(),{capture:1});expect(replay).toEqual(first);
  p=await NativeProgram.instantiate(JSON.parse(JSON.stringify(a)),source);
  const reload=execute('source/artifact/snapshot JSON reload',JSON.parse(JSON.stringify(first)),{frame:0,epoch:1});
  retained(first,reload);await expect(NativeProgram.instantiate(a,source+'\n// stale binding\n')).rejects.toThrow();
  report.actualNumericalCases++;save();
},60000);

it.skipIf(!fullArtifactPath)('actual original14400 FAST/NMS frontend drives calibrated350-slot first-capture transaction',async()=>{
  const full:NativeProgramArtifact=JSON.parse(readFileSync(fullArtifactPath!,'utf8'));
  expect(full.model_name).toBe('RGBDFastInertialLocalizationStep');
  const fixture=JSON.parse(readFileSync('dev/artifacts/fast-native-frame/independent-fixtures.json','utf8'));
  expect(fixture.height).toBe(90);expect(fixture.width).toBe(160);expect(fixture.frames.length).toBe(4);
  const core=p,coreArtifact=a;const results:unknown[]=[];
  try{
    a=full;p=await NativeProgram.instantiate(full,source);
    for(const frame of fixture.frames){
      const selected=selectionOracle(frame.expectedScores,[18,0,1e8,3,350,1,3,3],false,'specification',
        {width:160,height:90,minimumBorder:3});
      expect(selected.valid).toBe(1);
      const f=localizationImage();f.rgb=Array.from({length:90},(_,y)=>Array.from({length:160},(_,x)=>frame.rgb.slice((y*160+x)*4,(y*160+x)*4+4)));
      f.pixels=Array.from({length:350},(_,i)=>selected.features[i]?.slice(0,2)??[0,0]);f.activeCount=selected.features.length;
      const expected=rawDescriptorOracle(f),incoming=coldState();
      const data:Record<string,number[]>={...incoming,rgb:frame.rgb,depth:f.depth.flat(),rgbCalibration:f.rgbCalibration,
        depthCalibration:f.depthCalibration,disparityNoise:[.08],noiseReferenceFx:[f.noiseReferenceFx],baseline:[.05],
        opticalToBody:defaultE.flat(),cameraOriginBody:[.18,0,-.04],accel:[0,0,9.81],gyro:[0,0,0],gravity:[0,0,-9.81],
        h:[1/90],frameEnabled:[1],imageCaptureRequested:[1],currentEpoch:[0]};
      for(const [name,v] of Object.entries(data))p.input(name).set(v);
      const before=new Uint8Array(p.memory.buffer,a.abi.p_offset,a.abi.p_count*8).slice();
      p.evaluate(0);expect(p.output('selectionValid')[0]).toBe(1);
      expect(new Uint8Array(p.memory.buffer,a.abi.p_offset,a.abi.p_count*8),'full source P readonly').toEqual(before);
      expect(Array.from(p.output('detector.scores'))).toEqual(frame.expectedScores);
      near(p.output('currentDescriptor'),expected.descriptor.flat(),'fullsource17150');
      near(p.output('currentPoint'),expected.point.flat(),'fullsource1050');
      expect(Array.from(p.output('currentEnabled'))).toEqual(expected.enabled);
      const accepted=+(expected.enabled.reduce((sum,v)=>sum+v,0)>=3);
      expect(p.output('captureAccepted')[0]).toBe(accepted);
      const features=Array.from({length:350},(_,i)=>expected.enabled[i]?selected.features[i]:[0,0,0]);
      near(p.output('features'),features.flat(),'all350 source selected features');
      near(p.output('nextReferenceDescriptor'),accepted?expected.descriptor.flat():incoming.referenceDescriptor,'fullsource reference commit');
      results.push({frame:frame.name,rasterScores:14400,selected:selected.features.length,validDescriptors:expected.enabled.reduce((sum,v)=>sum+v,0),captureAccepted:accepted});
      p.reset();
    }
    if(process.env.RUMOCA_FULL_LOCALIZATION_REPORT)writeFileSync(process.env.RUMOCA_FULL_LOCALIZATION_REPORT,
      JSON.stringify({status:'ACTUAL_FULL_RASTER_LOCALIZATION_FIRST_CAPTURE_PASS',sourceSha256:sha(source),
        moduleSha256:full.module_sha256,cases:results,fullSlamAccepted:false},null,2)+'\n');
  }finally{p=core;a=coreArtifact;}
},120000);
