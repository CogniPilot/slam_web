// Transport/selection adapter for capture-office-ci traces. No matching math.
export function nativeTraceValue(trace,name,rank){
  const values=trace.outputs?.[name];
  if(rank!==undefined&&values?.[rank]!==undefined)return values[rank];
  if(rank!==undefined)return trace.derived?.[`${name}[${rank+1}]`];
  return trace.derived?.[name]??(values?.length===1?values[0]:undefined);
}

export function officePairRequests(sample,{sequentialAlreadySeen=false}={}){
  const trace=sample.nativeTrace,requests=[],events=[];
  if(!trace||trace.status!==0)throw Error('Missing successful native trace');
  if(trace.inputs?.imageEpoch?.[0]!==sample.sequence)throw Error('Trace epoch differs from raw image');
  const sequential=nativeTraceValue(trace,'sequentialRejectionReason')??sample.native?.diagnostics?.sequentialRejectionReason;
  let sequentialSeen=sequentialAlreadySeen;
  if(!sequentialAlreadySeen&&sequential===7){
    sequentialSeen=true;
    const nextId=trace.previousCatalog?.nextId;
    if(!Number.isSafeInteger(nextId)||nextId<2)events.push({kind:'sequential',status:'missing-prior-catalog'});
    else requests.push({kind:'sequential',referenceId:nextId-1,originalReason:7,originalMatchedCount:undefined});
  }
  if(sample.time>=235&&sample.time<=250){
    const count=nativeTraceValue(trace,'loopCandidateCount')??sample.native?.loopClosure?.candidateCount;
    if(!Number.isInteger(count)||count<0||count>4)events.push({kind:'late-return',status:'invalid-candidate-count'});
    else if(count===0)events.push({kind:'late-return',status:'absent-candidates'});
    else for(let rank=0;rank<count;rank++){
      const parsed=sample.native?.loopClosure?.candidates?.length===count?sample.native.loopClosure.candidates[rank]:undefined;
      const referenceId=nativeTraceValue(trace,'loopCandidateReferenceId',rank)??parsed?.referenceId;
      const reason=nativeTraceValue(trace,'loopCandidateReason',rank)??parsed?.reason;
      const matchedCount=nativeTraceValue(trace,'loopCandidateMatchedCount',rank)??parsed?.matchedCount;
      if(!Number.isSafeInteger(referenceId)||referenceId<1||!Number.isSafeInteger(reason))events.push({kind:'late-return',rank,status:'invalid-candidate-identity'});
      else if(![0,6,7,8,9,11].includes(reason))events.push({kind:'late-return',rank,referenceId,originalReason:reason,status:'unattempted-before-matcher'});
      else requests.push({kind:'late-return',rank,referenceId,originalReason:reason,originalMatchedCount:matchedCount});
    }
  }
  return {requests,events,sequentialSeen};
}

export function captureMatchingDefaults(text){
  const start=text.indexOf('  function Capture\n'),end=text.indexOf('  protected',start);
  if(start<0||end<start)throw Error('Capture settings owner not found');
  const header=text.slice(start,end),expressions=new Map();
  for(const match of header.matchAll(/\binput (?:Real|Integer|Boolean) (\w+)\s*=\s*([^;]+);/g))expressions.set(match[1],match[2].trim());
  const values={};
  for(let pass=0;pass<expressions.size;pass++)for(const [name,expression] of expressions){
    if(Object.hasOwn(values,name))continue;
    if(expression==='true'||expression==='false')values[name]=expression==='true'?1:0;
    else if(Number.isFinite(Number(expression)))values[name]=Number(expression);
    else if(Object.hasOwn(values,expression))values[name]=values[expression];
  }
  const loopSeed=/\binput Integer seeds\[[^\]]+\]\s*=\s*fill\((\d+),/.exec(header);
  if(!loopSeed)throw Error('Loop seed owner changed');
  values.loopSeed=Number(loopSeed[1]);
  return values;
}

export function effectivePairSettings(trace,request,defaults){
  const origin={},read=(target,name)=>{
    const slot=trace.inputs?.[name],value=slot===undefined?defaults[name]:slot[0];
    if(!Number.isFinite(value))throw Error('Missing effective setting '+name);
    origin[target]=slot===undefined?'source-bound-default:'+name:'native-input:'+name;return value;
  };
  const controls={requested:1};origin.requested='actual-attempted-candidate';
  controls.seed=read('seed',request.kind==='sequential'?'sequentialSeed':'loopSeed');
  if(request.kind==='late-return'&&trace.inputs?.seeds){
    controls.seed=trace.inputs.seeds[request.rank];origin.seed='native-input:seeds['+request.rank+']';
  }
  for(const name of ['trials','refinements','coordinateLimit','rankTolerance','minimumPivot'])controls[name]=read(name,name);
  for(const name of ['minimumInliers','minimumFraction','inlierDistance','maximumRms','calibratedResiduals','maximumNormalizedSquared']){
    const source=request.kind==='sequential'?name:'loop'+name[0].toUpperCase()+name.slice(1);
    controls[name]=read(name,source);
  }
  const matcher={descriptorRatio:read('descriptorRatio','descriptorRatio'),
    maximumDescriptorDistance:read('maximumDescriptorDistance','maximumDescriptorDistance'),
    localizationSigma:read('localizationSigma','localizationSigma'),depthInflation:read('depthInflation','depthInflation'),
    calibratedResiduals:controls.calibratedResiduals};
  return {controls,matcher,origin};
}

export function currentDescriptorInputs(sample,rgbBytes,depthBytes){
  const trace=sample.nativeTrace,layout=sample.metadata?.imageLayout;
  if(!layout||layout.color.format!=='RGB8'||layout.depth.format!=='Z16'||layout.depth.isBigEndian!==false)
    throw Error('Expected raw little-endian RGB8/Z16 images');
  const {width,height}=layout.color;
  if(width!==424||height!==240||layout.depth.width!==width||layout.depth.height!==height)throw Error('Unexpected office dimensions');
  const features=trace.outputs?.features,mask=trace.outputs?.featureEnabled;
  if(features?.length!==1050||features.some(v=>!Number.isFinite(v))||mask?.length!==350||mask.some(v=>v!==0&&v!==1))throw Error('Missing full sparse native features');
  const rgb=new Float64Array(width*height*3),depth=new Float64Array(width*height),pixels=new Float64Array(700);
  const rgbStride=layout.color.strideBytes,zStride=layout.depth.strideBytes;
  if(!Number.isInteger(rgbStride)||rgbStride<width*3||!Number.isInteger(zStride)||zStride<width*2||zStride%2||rgbBytes.length!==layout.color.bytes||depthBytes.length!==layout.depth.bytes||rgbBytes.length<rgbStride*height||depthBytes.length<zStride*height)
    throw Error('Invalid captured image byte layout');
  for(let row=0;row<height;row++)rgb.set(rgbBytes.subarray(row*rgbStride,row*rgbStride+width*3),row*width*3);
  const z=new DataView(depthBytes.buffer,depthBytes.byteOffset,depthBytes.byteLength);
  for(let row=0;row<height;row++)for(let column=0;column<width;column++)depth[row*width+column]=z.getUint16(row*zStride+column*2,true);
  for(let slot=0;slot<350;slot++){
    if(mask[slot]===0&&(features[slot*3]!==0||features[slot*3+1]!==0))throw Error('Disabled native feature pixels are not canonical zero');
    pixels[slot*2]=features[slot*3];pixels[slot*2+1]=features[slot*3+1];
  }
  const inputs={rgb,depth,pixels,activeCount:350};
  for(const name of ['rgbCalibration','depthCalibration','disparityNoise','noiseReferenceFx','baseline','depthUnits']){
    const slot=trace.inputs?.[name];if(!slot||slot.some(v=>!Number.isFinite(v)))throw Error('Missing native camera input '+name);
    inputs[name]=name.endsWith('Calibration')?slot:slot[0];
  }
  if(inputs.depthUnits!==layout.depth.unitsMeters)throw Error('Depth scale differs between native input and image metadata');
  return inputs;
}

export function validateCatalogMatcherFrame(frame,pointer,currentEpoch){
  if(frame.id!==pointer.id||frame.epoch!==pointer.epoch||frame.imageTime!==pointer.time||frame.generation!==pointer.generation||frame.epoch>=currentEpoch)
    throw Error('Catalog pointer identity differs');
  if(!Number.isInteger(frame.count)||frame.count<0||frame.count>350||frame.enabled?.length!==350||frame.enabled.some((v,i)=>v!==0&&v!==1||v===1&&i>=frame.count))throw Error('Invalid native frame domain');
  for(const [name,count] of [['descriptor',17150],['opticalPoint',1050],['rgbCalibration',4]])
    if(frame[name]?.length!==count||frame[name].some(v=>!Number.isFinite(v)))throw Error('Invalid native frame field '+name);
  for(const name of ['disparityNoise','noiseReferenceFx','baseline'])if(!Number.isFinite(frame[name]))throw Error('Invalid native frame noise '+name);
  return frame;
}
