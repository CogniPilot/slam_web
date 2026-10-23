// Research CPU bridge. The shipped Modelica functions own all image,
// descriptor, matching and covariance arithmetic; this module only composes IO.
import {loopConsensusSource,consensusDefaults,sha256} from './loop-consensus-probe.mjs';
import {researchNativeProgram} from './research-native-program.mjs';

export const descriptorDefaults=Object.freeze({activeCount:350,nearDepth:.28,farDepth:10,
  minimumContrast:1e-6,depthUnits:.001});
export const matcherDefaults=Object.freeze({referenceCount:350,currentCount:350,
  descriptorRatio:.8,maximumDescriptorDistance:.8,localizationSigma:.5,depthInflation:1,calibratedResiduals:1});

export async function loopPairReconstructionSource(height=240,width=424){
  if(![[90,160],[240,424],[480,848]].some(([h,w])=>h===height&&w===width))throw Error('Unsupported probe image dimensions');
  const base=await loopConsensusSource(350);
  const wrapper=`
model LoopCurrentDescriptorProbe
  input Real rgb[${height},${width},3]; input Real depth[${height},${width}];
  input Real pixels[350,2]; input Real activeCount = 350;
  input Real rgbCalibration[4]; input Real depthCalibration[4];
  input Real disparityNoise; input Real noiseReferenceFx; input Real baseline;
  input Real nearDepth = 0.28; input Real farDepth = 10;
  input Real minimumContrast = 1e-6; input Real depthUnits = 0.001;
  output Real descriptor[350,49]; output Real point[350,3];
  output Real enabled[350]; output Real invalidCount;
equation
  (descriptor,point,enabled,invalidCount) = DescribeRGBDFrame(rgb,depth,pixels,
    activeCount,rgbCalibration,depthCalibration,disparityNoise,noiseReferenceFx,
    baseline,nearDepth,farDepth,minimumContrast,true,depthUnits=depthUnits);
end LoopCurrentDescriptorProbe;

function LoopPairCovariances
  input Real point[350,3]; input Real enabled[350];
  input Real calibration[4]; input Real localizationSigma; input Real disparityNoise;
  input Real noiseReferenceFx; input Real baseline; input Real depthInflation;
  input Boolean requested;
  output Real covariance[350,3,3];
algorithm
  covariance := zeros(350,3,3);
  for slot in 1:350 loop
    if requested and enabled[slot] == 1.0 then
      covariance[slot,:,:] := RGBDOpticalPointCovariance(point[slot,:],
        calibration[1],calibration[2],localizationSigma,disparityNoise,
        noiseReferenceFx,baseline,depthInflation);
    end if;
  end for;
end LoopPairCovariances;

model LoopPairMatcherProbe
  input Real referenceDescriptor[350,49]; input Real currentDescriptor[350,49];
  input Real referencePoint[350,3]; input Real currentPoint[350,3];
  input Real referenceEnabled[350]; input Real currentEnabled[350];
  input Real referenceCount = 350; input Real currentCount = 350;
  input Real descriptorRatio = 0.8; input Real maximumDescriptorDistance = 0.8;
  input Real referenceRgbCalibration[4]; input Real currentRgbCalibration[4];
  input Real referenceDisparityNoise; input Real currentDisparityNoise;
  input Real referenceNoiseReferenceFx; input Real currentNoiseReferenceFx;
  input Real referenceBaseline; input Real currentBaseline;
  input Real localizationSigma = 0.5; input Real depthInflation = 1;
  input Real calibratedResiduals = 1;
  output Real currentIndex[350]; output Real pairEnabled[350];
  output Real sourcePoint[350,3]; output Real targetPoint[350,3];
  output Real count; output Real configurationValid;
  output Real invalidReference; output Real invalidCurrent;
  output Real nearestDistance[350]; output Real secondDistance[350];
  output Real sourceCovariance[350,3,3]; output Real targetCovariance[350,3,3];
equation
  (currentIndex,pairEnabled,sourcePoint,targetPoint,count,configurationValid,
    invalidReference,invalidCurrent,nearestDistance,secondDistance) =
    MatchRGBDDescriptors(referenceDescriptor,currentDescriptor,referencePoint,
      currentPoint,referenceEnabled,currentEnabled,referenceCount,currentCount,
      descriptorRatio,maximumDescriptorDistance,0.0,identity(3),zeros(3),0.0);
  sourceCovariance = LoopPairCovariances(sourcePoint,pairEnabled,referenceRgbCalibration,
    localizationSigma,referenceDisparityNoise,referenceNoiseReferenceFx,referenceBaseline,
    depthInflation,noEvent(calibratedResiduals > 0.5));
  targetCovariance = LoopPairCovariances(targetPoint,pairEnabled,currentRgbCalibration,
    localizationSigma,currentDisparityNoise,currentNoiseReferenceFx,currentBaseline,
    depthInflation,noEvent(calibratedResiduals > 0.5));
end LoopPairMatcherProbe;
`;
  return {...base,source:base.source+wrapper,height,width};
}

// All views returned by the compiler are copied before another invocation.
export async function instantiateLoopPairKernel(artifact,source,defaults,outputs){
  const program=await researchNativeProgram(artifact,source);
  const names=new Set(artifact.input_names.map(name=>name.replace(/\[.*$/,'')));
  return {run(frame){
    const values={...defaults,...frame};
    for(const name of names)if(!Object.hasOwn(values,name))throw Error('Missing bridge input '+name);
    for(const [name,data] of Object.entries(values)){
      if(!names.has(name))throw Error('Unexpected bridge input '+name);
      const flat=ArrayBuffer.isView(data)?data:[data].flat(3),view=program.input(name);
      if(view.length!==flat.length||Array.from(flat).some(value=>!Number.isFinite(value)))throw Error('Invalid bridge input '+name);
      view.set(flat);
    }
    const p=new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8),before=sha256(p);
    program.evaluate(0);
    if(sha256(p)!==before)throw Error('Bridge changed readonly input storage');
    return Object.fromEntries(outputs.map(name=>[name,Array.from(program.output(name))]));
  }};
}

export const descriptorOutputs=Object.freeze(['descriptor','point','enabled','invalidCount']);
export const matcherOutputs=Object.freeze(['currentIndex','pairEnabled','sourcePoint','targetPoint','count',
  'configurationValid','invalidReference','invalidCurrent','nearestDistance','secondDistance',
  'sourceCovariance','targetCovariance']);

/** A real matched count is an independent original native output, never the
 * localization imageFrom.matchCount or a second reconstruction's count. */
export function pairMatchIdentity(extracted,originalMatchedCount){
  const count=extracted.count[0];
  if(extracted.configurationValid[0]!==1||extracted.invalidReference[0]!==0||extracted.invalidCurrent[0]!==0)
    return {status:'extraction-invalid',matchCountIdentity:false};
  if(originalMatchedCount===undefined)return {status:'reconstruction-only',matchCountIdentity:false,count};
  if(!Number.isSafeInteger(originalMatchedCount)||originalMatchedCount<0||originalMatchedCount>350)
    throw Error('Invalid original verifier matched count');
  return {status:count===originalMatchedCount?'count-identical':'count-mismatch',
    matchCountIdentity:count===originalMatchedCount,count,originalMatchedCount};
}

/** Transport only: reshape compiler outputs to the existing probe JSON schema.
 * The caller must gate pairMatchIdentity separately before classification. */
export function consensusInputsFromPairs(extracted,recordedControls){
  const controls={};
  for(const key of Object.keys(consensusDefaults)){
    if(!Object.hasOwn(recordedControls,key))throw Error('Missing recorded consensus control '+key);
    controls[key]=recordedControls[key];
  }
  const rows=(flat,width,count)=>{
    if(flat?.length!==width*count||flat.some(value=>!Number.isFinite(value)))throw Error('Invalid extracted pair shape');
    return Array.from({length:count},(_,i)=>flat.slice(i*width,(i+1)*width));
  };
  if(extracted.pairEnabled?.length!==350||extracted.pairEnabled.some(value=>value!==0&&value!==1))throw Error('Invalid extracted pair mask');
  const covariance=flat=>rows(flat,9,350).map(row=>rows(row,3,3));
  return {sourcePoint:rows(extracted.sourcePoint,3,350),targetPoint:rows(extracted.targetPoint,3,350),
    pairEnabled:[...extracted.pairEnabled],sourceCovariance:covariance(extracted.sourceCovariance),
    targetCovariance:covariance(extracted.targetCovariance),...controls};
}
