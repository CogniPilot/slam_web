// Test-only RGB byte repacking into an existing OMC MATv4 input. No estimation math.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const height=90,width=160,channels=4,frameCount=13;
const requireValue=(condition,message)=>{if(!condition)throw Error(message);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const inventory=Array.from({length:frameCount},(_,i)=>[
  {name:`rgb_${i+1}`,rows:height,columns:width*channels},
  {name:`depth_${i+1}`,rows:height,columns:width},
]).flat().concat([
  {name:'calibration',rows:1,columns:14},{name:'opticalToBody',rows:3,columns:3},
  {name:'acquisition',rows:13,columns:2},{name:'imuIntervals',rows:36,columns:8},
  {name:'initialImu',rows:1,columns:6},{name:'oraclePosition',rows:13,columns:3},
]);

function confinedFile(directory,name){
  requireValue(typeof name==='string'&&name.length>0&&!path.isAbsolute(name),'Relative file path required');
  const root=fs.realpathSync(directory),file=fs.realpathSync(path.join(root,name));
  requireValue(file.startsWith(root+path.sep)&&fs.statSync(file).isFile(),`File escaped its owner directory: ${name}`);
  return file;
}
function boundFile(directory,metadata){
  requireValue(metadata&&/^[a-f0-9]{64}$/.test(metadata.sha256)&&Number.isSafeInteger(metadata.bytes)&&metadata.bytes>=0,'Exact file digest and byte count required');
  const file=confinedFile(directory,metadata.path),bytes=fs.readFileSync(file);
  requireValue(bytes.length===metadata.bytes&&sha(bytes)===metadata.sha256,`Bound file changed: ${metadata.path}`);
  return {file,bytes};
}
function appReference(name){return confinedFile(app,name);}
function appRelative(file){
  const relative=path.relative(app,fs.realpathSync(file));
  requireValue(relative!==''&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative),'Durable references must lie inside the application repository');
  return relative.split(path.sep).join('/');
}

export function parseRealMat(bytes){
  requireValue(Buffer.isBuffer(bytes),'MAT bytes must be an owned Buffer');
  const result=[],names=new Set();let offset=0;
  while(offset<bytes.length){
    requireValue(bytes.length-offset>=20,'Truncated MAT header');
    const start=offset,type=bytes.readInt32LE(offset),rows=bytes.readInt32LE(offset+4),columns=bytes.readInt32LE(offset+8),imaginary=bytes.readInt32LE(offset+12),length=bytes.readInt32LE(offset+16);
    requireValue(type===0&&imaginary===0&&rows>0&&columns>0&&length>1&&length<=256,'Only real little-endian Float64 MATv4 matrices are admitted');
    offset+=20;
    requireValue(length<=bytes.length-offset&&bytes[offset+length-1]===0,'Truncated or unterminated MAT name');
    const label=bytes.subarray(offset,offset+length-1);
    requireValue([...label].every(byte=>byte>=32&&byte<=126),'ASCII MAT matrix name required');
    const name=label.toString('ascii');
    requireValue(/^[A-Za-z][A-Za-z0-9_]*$/.test(name)&&!names.has(name),'Unique ordinary MAT names required');names.add(name);
    offset+=length;const cells=rows*columns,payloadBytes=cells*8;
    requireValue(Number.isSafeInteger(payloadBytes)&&payloadBytes<=bytes.length-offset,'Truncated or oversized MAT payload');
    result.push({name,rows,columns,start,dataOffset:offset,end:offset+payloadBytes});offset+=payloadBytes;
  }
  requireValue(result.length>0&&offset===bytes.length,'Complete nonempty MAT required');
  return result;
}

// The only mutated spans are the 13 RGB Float64 payloads; headers and other payloads stay raw.
export function replaceRGBMatrices(original,rgbaFrames){
  const matrices=parseRealMat(original);
  requireValue(same(matrices.map(({name,rows,columns})=>({name,rows,columns})),inventory),'Exact full flight MAT inventory/order required');
  requireValue(Array.isArray(rgbaFrames)&&rgbaFrames.length===frameCount,'Exactly13 RGBA frames required');
  const output=Buffer.from(original),rgbSpans=[];
  for(let index=0;index<frameCount;index++){
    const rgb=rgbaFrames[index],matrix=matrices[2*index];
    requireValue(Buffer.isBuffer(rgb)&&rgb.length===height*width*channels,'Full90x160x4 RGBA byte buffer required');
    for(let row=0;row<height;row++)for(let column=0;column<width*channels;column++)
      output.writeDoubleLE(rgb[row*width*channels+column],matrix.dataOffset+(column*height+row)*8);
    rgbSpans.push({name:matrix.name,start:matrix.dataOffset,end:matrix.end});
  }
  let cursor=0;
  for(const span of rgbSpans){
    requireValue(output.subarray(cursor,span.start).equals(original.subarray(cursor,span.start)),'Non-RGB bytes must remain identical');cursor=span.end;
  }
  requireValue(output.subarray(cursor).equals(original.subarray(cursor)),'Trailing non-RGB bytes must remain identical');
  return {bytes:output,matrices,rgbSpans};
}

function validateRawFrame(directory,frame,original,index){
  requireValue(frame?.sequence===index&&frame.time===original.time,'Exact original frame sequence/time binding required');
  const rgb=frame.rgb,depth=frame.depth;
  requireValue(rgb?.type==='Uint8'&&rgb.order==='row-major top-down RGBA'&&rgb.colorSpace==='sRGB display encoded'
    &&same(rgb.shape,[height,width,channels])&&rgb.bytes===height*width*channels,'Exact captured RGBA byte contract required');
  requireValue(depth?.type==='Float32'&&depth.endianness==='little'&&depth.order==='row-major top-down'
    &&depth.meaning==='axial optical-Z metres'&&depth.encoding==='axial-f32-le-rgba8'
    &&same(depth.shape,[height,width])&&depth.bytes===height*width*4,'Exact captured axial f32 depth contract required');
  return {rgb:boundFile(directory,rgb).bytes,depth:boundFile(directory,depth).bytes};
}

// Recompute the complete matched-capture contract, including unselected control variants.
export function checkMatchedFrameBytes(capture,originalFrames,originalRaw,readRaw){
  requireValue(capture.status==='MATCHED_MSAA_CAPTURE_PASS'&&capture.sourceBookendsEqual===true
    &&capture.frameCount===13&&capture.imuSampleCount===37&&capture.heldIntervalCount===36,'Completed matched capture with complete acquisition counts/bookends required');
  const contracts={baselinePbo0:[0,"World.captureSensorPair(false,'sync',false)",13],baselinePublic0:[0,'World.capture()',13],
    baselineRepeat0:[0,"World.captureSensorPair(false,'sync',false)",13],msaaPublic4:[4,'World.capture()',13],msaaRepeat4:[4,'World.capture()',1]};
  requireValue(same(Object.keys(capture.variants??{}).sort(),Object.keys(contracts).sort()),'Exact five matched capture variants required');
  const raw={};
  for(const [id,[samples,api,count]]of Object.entries(contracts)){
    const variant=capture.variants[id];requireValue(variant.rgbSamples===samples&&variant.api===api&&variant.frames?.length===count,`Exact samples/API/frame count required: ${id}`);
    raw[id]=variant.frames.map((frame,index)=>readRaw(frame,originalFrames[index],index));
    for(let index=0;index<count;index++){
      requireValue(raw[id][index].depth.equals(originalRaw[index].depth),`Matched comparison depth differs from original: ${id}/${index}`);
      if(samples===0)requireValue(raw[id][index].rgb.equals(originalRaw[index].rgb),`Matched baseline RGB differs from original: ${id}/${index}`);
    }
  }
  requireValue(raw.msaaRepeat4[0].rgb.equals(raw.msaaPublic4[0].rgb)&&raw.msaaRepeat4[0].depth.equals(raw.msaaPublic4[0].depth),'MSAA repeated frame0 bytes differ');
  return raw;
}

function captureSourceProof(directory,capture,originalWorld){
  const before=fs.readFileSync(confinedFile(directory,'source-before.json')),after=fs.readFileSync(confinedFile(directory,'source-after.json'));
  requireValue(before.equals(after),'Capture source bookend inventories differ');
  const entries=JSON.parse(before),identity=capture.sourceIdentity;
  requireValue(Array.isArray(entries)&&entries.length>0&&sha(Buffer.from(JSON.stringify(entries)))===identity?.frozenEntriesManifestSha256,'Capture frozen source inventory digest differs');
  const names=new Set();for(const entry of entries){
    requireValue(typeof entry.path==='string'&&!names.has(entry.path)&&/^[a-f0-9]{64}$/.test(entry.sha256)&&Number.isSafeInteger(entry.bytes)&&entry.bytes>=0,'Unique typed source inventory entries required');names.add(entry.path);
  }
  const baseline=boundFile(directory,identity.baselineWorld),variant=boundFile(directory,identity.variantWorld);
  boundFile(directory,identity.driver);boundFile(directory,identity.overlay);boundFile(directory,identity.threePackage);
  const overlay=capture.overlay;
  requireValue(overlay?.path==='src/world.ts'&&typeof overlay.before==='string'&&overlay.before.length>0&&typeof overlay.after==='string'
    &&sha(baseline.bytes)===overlay.preimageSha256&&sha(variant.bytes)===overlay.postimageSha256,'Bound RGB source overlay identity required');
  requireValue(originalWorld&&sha(baseline.bytes)===originalWorld.sha256&&baseline.bytes.length===originalWorld.bytes,'Baseline world must match the original flight source inventory');
  requireValue(overlay.before.includes('private rgbTarget = new THREE.WebGLRenderTarget(')&&!overlay.before.includes('samples:')
    &&overlay.before.split('depthBuffer: true,').length===2&&overlay.after===overlay.before.replace('depthBuffer: true,','depthBuffer: true, samples: 4,'),'Only declared four-sample RGB target overlay is admitted');
  const text=baseline.bytes.toString('utf8');
  requireValue(text.split(overlay.before).length===2&&Buffer.from(text.replace(overlay.before,overlay.after)).equals(variant.bytes),'Variant world must be the exact single declared source overlay');
  for(const [name,file]of [['baseline/src/world.ts',baseline],['msaa4/src/world.ts',variant]]){
    const entry=entries.find(value=>value.path===name);
    requireValue(entry&&entry.sha256===sha(file.bytes)&&entry.bytes===file.bytes.length,'Capture world source differs from bookend inventory');
  }
  return {beforeSha256:sha(before),afterSha256:sha(after),frozenEntriesManifestSha256:identity.frozenEntriesManifestSha256,
    baselineWorldSha256:sha(baseline.bytes),variantWorldSha256:sha(variant.bytes),exactDeclaredOverlay:true};
}

export function deriveRGBFlightInput(parentDirectory,captureManifestFile,variant){
  const parent=fs.realpathSync(parentDirectory),parentReportFile=confinedFile(parent,'report.json');
  const parentReportBytes=fs.readFileSync(parentReportFile),report=JSON.parse(parentReportBytes);
  requireValue(report.model==='RGBDRenderedFlightSLAMAcceptance'&&report.bookendsEqual===true&&report.processStatus===0&&report.simulationSucceeded===true
    &&report.mat?.type==='MATv4 little-endian float64 column-major'&&report.mat?.independentDecode?.pass===true,
  'Frozen actual flight execution input required; estimator acceptance is not implied');
  const original=boundFile(parent,report.mat),matrices=parseRealMat(original.bytes);
  requireValue(same(matrices.map(({name,rows,columns})=>({name,rows,columns})),inventory)&&same(report.mat.matrices,inventory),'Original MAT complete exact inventory/order required');
  for(const matrix of matrices)for(let offset=matrix.dataOffset;offset<matrix.end;offset+=8)
    requireValue(Number.isFinite(original.bytes.readDoubleLE(offset)),'Original flight MAT has a nonfinite lane');
  const parentCapture=path.join(parent,'capture'),flightBytes=fs.readFileSync(confinedFile(parentCapture,'manifest.json'));
  requireValue(sha(flightBytes)===report.captureManifestSha256,'Original capture manifest/report binding required');
  const flight=JSON.parse(flightBytes);
  requireValue(flight.schema==='modelica-rendered-flight-frames-v1'&&flight.status==='ACTUAL_RUMOCA_FLIGHT_RGBD_CAPTURE_PASS'
    &&flight.frameCount===frameCount&&flight.frames?.length===frameCount,'Original complete actual flight capture required');
  const manifestFile=fs.realpathSync(captureManifestFile),captureDirectory=path.dirname(manifestFile),manifestBytes=fs.readFileSync(manifestFile),capture=JSON.parse(manifestBytes);
  requireValue(capture.schema==='modelica-rendered-flight-msaa-comparison-v1'&&capture.physicsReacquired===false,'Matched RGB rendering comparison manifest required');
  requireValue(boundFile(captureDirectory,capture.sourceFlight?.manifest).bytes.equals(flightBytes),'Matched capture must bind byte-exact original flight manifest');
  for(const name of ['measurements','oracleSnapshots','oracle'])requireValue(
    boundFile(captureDirectory,capture.sourceFlight?.[name]).bytes.equals(boundFile(parentCapture,flight[name]).bytes),`Matched original ${name} file differs`);
  requireValue(boundFile(captureDirectory,capture.sourceReplay?.report).bytes.equals(parentReportBytes)
    &&boundFile(captureDirectory,capture.sourceReplay?.mat).bytes.equals(original.bytes),'Matched capture must bind exact original replay report/MAT');
  requireValue(same(capture.calibration,flight.calibration),'Matched capture calibration must equal original calibration');
  const originalBefore=boundFile(parentCapture,report.captureFiles?.find(entry=>entry.path==='sources-before.json')).bytes;
  const originalAfter=boundFile(parentCapture,report.captureFiles?.find(entry=>entry.path==='sources-after.json')).bytes;
  requireValue(originalBefore.equals(originalAfter),'Original flight source inventory bookends differ');
  requireValue(boundFile(captureDirectory,capture.sourceFlight?.sourcesBefore).bytes.equals(originalBefore)
    &&boundFile(captureDirectory,capture.sourceFlight?.sourcesAfter).bytes.equals(originalAfter),'Matched original source inventory files differ');
  const originalWorld=JSON.parse(originalBefore).find(entry=>entry.path==='src/world.ts');
  const sourceBookends=captureSourceProof(captureDirectory,capture,originalWorld);
  const originalRaw=flight.frames.map((frame,index)=>validateRawFrame(parentCapture,frame,frame,index));
  const matchedRaw=checkMatchedFrameBytes(capture,flight.frames,originalRaw,(frame,original,index)=>validateRawFrame(captureDirectory,frame,original,index));
  requireValue(typeof variant==='string'&&Object.hasOwn(capture.variants??{},variant),'Unknown captured RGB variant');
  const selected=capture.variants[variant];
  requireValue(selected.frames?.length===frameCount&&Number.isSafeInteger(selected.rgbSamples)&&selected.rgbSamples>=0
    &&typeof selected.api==='string','Selected variant must supply all13 actual raw frames');
  const frameProofs=[],rgbaFrames=[];
  for(let index=0;index<frameCount;index++){
    const source=flight.frames[index],oldRaw=originalRaw[index],raw=matchedRaw[variant][index];
    requireValue(raw.depth.equals(oldRaw.depth),`Variant depth changed at frame ${index}`);
    // Independently read original MAT cells in logical row-major order before modifying them.
    const rgbMatrix=matrices[2*index],depthMatrix=matrices[2*index+1];
    for(let row=0;row<height;row++){
      for(let column=0;column<width*channels;column++)requireValue(Object.is(original.bytes.readDoubleLE(rgbMatrix.dataOffset+(column*height+row)*8),oldRaw.rgb[row*width*channels+column]),'Original MAT RGB does not match original capture');
      for(let column=0;column<width;column++)requireValue(Object.is(original.bytes.readDoubleLE(depthMatrix.dataOffset+(column*height+row)*8),oldRaw.depth.readFloatLE((row*width+column)*4)),'Original MAT depth does not match original capture');
    }
    rgbaFrames.push(raw.rgb);frameProofs.push({sequence:index,time:source.time,rgb:selected.frames[index].rgb,depth:selected.frames[index].depth,
      originalRgbSha256:sha(oldRaw.rgb),originalDepthSha256:sha(oldRaw.depth),depthByteEquivalent:true,rgbByteEquivalent:raw.rgb.equals(oldRaw.rgb)});
  }
  const result=replaceRGBMatrices(original.bytes,rgbaFrames);
  // Independent inverse traversal: every output logical lane must recover its raw captured byte.
  for(let index=0;index<frameCount;index++)for(let column=0;column<width*channels;column++)for(let row=0;row<height;row++)
    requireValue(Object.is(result.bytes.readDoubleLE(matrices[2*index].dataOffset+(column*height+row)*8),rgbaFrames[index][row*width*channels+column]),'Derived MAT RGB byte conversion is not exact');
  return {bytes:result.bytes,proof:{schemaVersion:1,model:'RGBDRenderedFlightInputPreparation',status:'RGB_ONLY_VARIANT_PREPARED',
    scope:'Test-only raw RGB input derivation; no Modelica execution, estimator acceptance, physics reacquisition or production ABI claim.',
    parent:{receipt:appRelative(parentReportFile).replace(/\/report\.json$/,''),report:{sha256:sha(parentReportBytes),bytes:parentReportBytes.length},
      mat:{path:report.mat.path,sha256:sha(original.bytes),bytes:original.bytes.length},captureManifestSha256:sha(flightBytes)},
    capture:{manifest:appRelative(manifestFile),sha256:sha(manifestBytes),bytes:manifestBytes.length},variant,
    rgbSamples:selected.rgbSamples,api:selected.api,frames:frameProofs,sourceBookends,
    comparisonProof:{allThreeBaselinesRgbDepthEqualOriginal:true,all13MsaaDepthEqualOriginal:true,msaaFrame0RepeatRgbDepthEqual:true,recomputedFromRawBytes:true},
    mat:{path:'rendered-flight.mat',sha256:sha(result.bytes),bytes:result.bytes.length,type:report.mat.type,matrices:inventory},
    preservation:{nonRgbBytesIdentical:true,headersIdentical:true,depthByteEquivalent:true,exactUint8ToFloat64:true,
      rgbPayloadSpans:result.rgbSpans,nonRgbBytes:original.bytes.length-result.rgbSpans.reduce((sum,span)=>sum+span.end-span.start,0)},
    fullSlamAccepted:false}};
}

// Admission redoes all byte/shape/binding checks; proof assertions alone are never authority.
export function validatePreparedRGBFlightInput(directory){
  const root=fs.realpathSync(directory),bytes=fs.readFileSync(confinedFile(root,'report.json')),report=JSON.parse(bytes);
  requireValue(report.model==='RGBDRenderedFlightInputPreparation'&&report.status==='RGB_ONLY_VARIANT_PREPARED','RGB-only preparation input class required');
  const parentReport=appReference(report.parent?.receipt+'/report.json'),manifest=appReference(report.capture?.manifest);
  const derived=deriveRGBFlightInput(path.dirname(parentReport),manifest,report.variant);
  requireValue(same(report,derived.proof),'Preparation proof differs from recomputed complete proof');
  const mat=boundFile(root,report.mat);
  requireValue(mat.bytes.equals(derived.bytes),'Prepared MAT differs from exact bound RGB-only derivation');
  return {report,mat:mat.bytes,reportSha256:sha(bytes)};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  requireValue(process.argv.length===5,'Usage: node dev/prepare-modelica-rgb-flight-input.mjs <original-flight-receipt> <matched-capture-manifest> <variant>');
  const derived=deriveRGBFlightInput(process.argv[2],process.argv[3],process.argv[4]);
  const base=path.join(app,'dev/artifacts/modelica-rgb-flight-input');fs.mkdirSync(base,{recursive:true});
  const directory=fs.mkdtempSync(path.join(base,'rgb-flight-input-'));
  fs.writeFileSync(path.join(directory,'rendered-flight.mat'),derived.bytes);
  fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(derived.proof,null,2)+'\n');
  const tool=fs.readFileSync(fileURLToPath(import.meta.url));fs.writeFileSync(path.join(directory,'prepare-modelica-rgb-flight-input.mjs'),tool);
  fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify({files:fs.readdirSync(directory).sort().map(name=>{const content=fs.readFileSync(path.join(directory,name));return {path:name,bytes:content.length,sha256:sha(content)};})},null,2)+'\n');
  validatePreparedRGBFlightInput(directory);
  console.log(JSON.stringify({directory:path.relative(app,directory),status:derived.proof.status,model:derived.proof.model,variant:derived.proof.variant,mat:derived.proof.mat}));
}
