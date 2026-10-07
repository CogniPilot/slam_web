// Packing controls only: synthetic sentinel bytes, no renderer/physics/compiler execution.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parseRealMat,replaceRGBMatrices,checkMatchedFrameBytes} from './prepare-modelica-rgb-flight-input.mjs';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const checks=[];
function check(name,body){body();checks.push({name,pass:true});}
function assert(condition,message){if(!condition)throw Error(message);}
function refuses(name,body){check(name,()=>{let refused=false;try{body();}catch{refused=true;}assert(refused,'Expected strict refusal');});}
// Literal independently encoded MAT: A=[1 -0;2 3], column-major payload.
const literal=Buffer.from('00000000020000000200000000000000020000004100000000000000f03f000000000000004000000000000000800000000000000840','hex');
check('Independent literal header and signed-zero payload',()=>{
  const [matrix]=parseRealMat(literal);assert(matrix.name==='A'&&matrix.rows===2&&matrix.columns===2&&matrix.dataOffset===22&&matrix.end===54,'Literal MAT shape');
  assert(Object.is(literal.readDoubleLE(38),-0),'Literal signed zero');
});
const parts=[],spans=[],frames=[];let offset=0;
// Independent fixture writer uses logical row-major iteration and explicit column-major addresses.
function add(name,rows,columns,rgb=false){
  const header=Buffer.alloc(21+name.length);[0,rows,columns,0,name.length+1].forEach((v,i)=>header.writeInt32LE(v,4*i));header.write(name,20,'ascii');
  const data=Buffer.alloc(rows*columns*8),start=offset+header.length;
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++)data.writeDoubleLE(rgb?(row*7+column*11)%256:row*1024+column+.125,(column*rows+row)*8);
  if(!rgb){data.writeBigUInt64LE(0x7ff8000012345678n,0);if(data.length>=16)data.writeDoubleLE(-0,8);}
  spans.push({name,start,end:start+data.length,rows,columns,rgb});parts.push(header,data);offset=start+data.length;
}
for(let i=0;i<13;i++){
  add(`rgb_${i+1}`,90,640,true);add(`depth_${i+1}`,90,160);
  const rgba=Buffer.alloc(90*160*4);for(let r=0;r<90;r++)for(let c=0;c<640;c++)rgba[r*640+c]=(i*23+r*17+c*31)%256;
  frames.push(rgba);
}
for(const [name,rows,columns]of[['calibration',1,14],['opticalToBody',3,3],['acquisition',13,2],['imuIntervals',36,8],['initialImu',1,6],['oraclePosition',13,3]])add(name,rows,columns);
const original=Buffer.concat(parts),originalCopy=Buffer.from(original),result=replaceRGBMatrices(original,frames);
check('All748800 RGB cells recover independent row/channel/frame sentinels',()=>{
  for(let i=0;i<13;i++){const span=spans[2*i];for(let row=0;row<90;row++)for(let column=0;column<640;column++){
    const expected=(i*23+row*17+column*31)%256;
    assert(Object.is(result.bytes.readDoubleLE(span.start+8*(column*90+row)),expected),'RGB transpose/frame/channel corruption');
  }}
});
check('Every header and non-RGB bit preserved including NaN payload and signed zero',()=>{
  let previous=0;for(const span of spans){
    assert(result.bytes.subarray(previous,span.start).equals(original.subarray(previous,span.start)),'Header changed');
    if(!span.rgb)assert(result.bytes.subarray(span.start,span.end).equals(original.subarray(span.start,span.end)),'Opaque non-RGB bits changed');
    previous=span.end;
  }assert(previous===result.bytes.length,'Complete file coverage');
});
check('Output ownership is independent and input untouched',()=>{
  assert(original.equals(originalCopy)&&result.bytes.buffer!==original.buffer,'Original ownership changed');
  const saved=result.bytes[0];result.bytes[0]^=255;assert(original.equals(originalCopy),'Mutation leaked into original');result.bytes[0]=saved;
});
refuses('Truncated header',()=>parseRealMat(literal.subarray(0,19)));
refuses('Truncated last payload',()=>replaceRGBMatrices(original.subarray(0,-1),frames));
refuses('Trailing bytes',()=>replaceRGBMatrices(Buffer.concat([original,Buffer.from([0])]),frames));
refuses('Duplicate matrix names',()=>parseRealMat(Buffer.concat([literal,literal])));
for(const [name,at,value]of[['Big-endian/typed matrix',0,1000],['Imaginary matrix',12,1],['Zero extent',4,0],['Oversized name',16,257]])
  refuses(name,()=>{const bytes=Buffer.from(literal);bytes.writeInt32LE(value,at);parseRealMat(bytes);});
refuses('Embedded NUL matrix name',()=>{const bytes=Buffer.from(original);bytes[21]=0;parseRealMat(bytes);});
refuses('Wrong full matrix inventory',()=>{const bytes=Buffer.from(original);bytes.write('zzz_1',20,'ascii');replaceRGBMatrices(bytes,frames);});
refuses('Wrong RGB extent',()=>{const bytes=Buffer.from(original);bytes.writeInt32LE(89,4);replaceRGBMatrices(bytes,frames);});
refuses('Missing frame',()=>replaceRGBMatrices(original,frames.slice(1)));
refuses('Wrong raw byte count',()=>replaceRGBMatrices(original,[Buffer.alloc(1),...frames.slice(1)]));
refuses('Typed array alias instead of owned Buffer',()=>replaceRGBMatrices(original,[new Uint8Array(frames[0]),...frames.slice(1)]));

// Isolated comparison-policy controls. The production reader additionally verifies file hashes/metadata.
const originalFrames=Array.from({length:13},(_,sequence)=>({sequence,time:sequence/30}));
const originalRaw=originalFrames.map((_,i)=>({rgb:Buffer.from([i,0,255,255]),depth:Buffer.from([0,0,128,63])}));
function comparisonFixture(){
  const capture={status:'MATCHED_MSAA_CAPTURE_PASS',sourceBookendsEqual:true,frameCount:13,imuSampleCount:37,heldIntervalCount:36,
    comparisons:Array.from({length:13},()=>({baselineRGBEqual:true,historicalRGBEqual:true,allDepthBitEqualOriginal:true})),msaaRepeatEqual:true,variants:{}};
  for(const [id,rgbSamples,api,count]of[
    ['baselinePbo0',0,"World.captureSensorPair(false,'sync',false)",13],['baselinePublic0',0,'World.capture()',13],
    ['baselineRepeat0',0,"World.captureSensorPair(false,'sync',false)",13],['msaaPublic4',4,'World.capture()',13],['msaaRepeat4',4,'World.capture()',1]])
    capture.variants[id]={rgbSamples,api,frames:originalRaw.slice(0,count).map(raw=>({raw:{rgb:Buffer.from(raw.rgb),depth:Buffer.from(raw.depth)}}))};
  return capture;
}
const compare=capture=>checkMatchedFrameBytes(capture,originalFrames,originalRaw,frame=>frame.raw);
check('Complete exact raw comparison accepted',()=>compare(comparisonFixture()));
for(const id of ['baselinePbo0','baselinePublic0','baselineRepeat0'])refuses(`Forged PASS/true flags cannot hide ${id} late RGB mismatch`,()=>{
  const capture=comparisonFixture();capture.variants[id].frames[12].raw.rgb[3]^=1;compare(capture);
});
for(const id of ['baselinePbo0','baselinePublic0','baselineRepeat0','msaaPublic4'])refuses(`Forged PASS cannot hide ${id} late depth mismatch`,()=>{
  const capture=comparisonFixture();capture.variants[id].frames[12].raw.depth[3]^=1;compare(capture);
});
for(const kind of ['rgb','depth'])refuses(`MSAA repeated frame0 ${kind} mismatch`,()=>{
  const capture=comparisonFixture();capture.variants.msaaRepeat4.frames[0].raw[kind][0]^=1;compare(capture);
});
for(const status of ['MATCHED_MSAA_CAPTURE_COMPARISON_FAILED','MATCHED_MSAA_CAPTURE_FAILED','PREPARED_NOT_EXECUTED'])refuses(`Non-success capture status ${status}`,()=>{
  const capture=comparisonFixture();capture.status=status;compare(capture);
});
refuses('False source bookends',()=>{const capture=comparisonFixture();capture.sourceBookendsEqual=false;compare(capture);});
refuses('Missing late baseline frame',()=>{const capture=comparisonFixture();capture.variants.baselineRepeat0.frames.pop();compare(capture);});
refuses('Wrong samples even with PASS status',()=>{const capture=comparisonFixture();capture.variants.msaaPublic4.rgbSamples=0;compare(capture);});
refuses('Wrong public/PBO API even with PASS status',()=>{const capture=comparisonFixture();capture.variants.baselinePublic0.api="World.captureSensorPair(false,'sync',false)";compare(capture);});

const scratch=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(scratch,{recursive:true});
const output=fs.mkdtempSync(path.join(scratch,'rgb-flight-input-packing-'));
fs.writeFileSync(path.join(output,'sentinel-original.mat'),original);fs.writeFileSync(path.join(output,'sentinel-derived.mat'),result.bytes);
const durable=path.join(app,'dev/artifacts/modelica-rgb-flight-input',path.basename(output));fs.mkdirSync(durable,{recursive:true});
const sources=['dev/prepare-modelica-rgb-flight-input.mjs','dev/check-modelica-rgb-flight-input-packing.mjs'].map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
const report={model:'RGBDRenderedFlightInputPackingControls',status:'PACKING_CONTROLS_PASS',checks,sources,
  scope:'Synthetic byte-packing/strict-parser controls only. Not an actual capture, Modelica execution, physics/SLAM or performance receipt.',
  original:{bytes:original.length,sha256:sha(original)},derived:{bytes:result.bytes.length,sha256:sha(result.bytes)},
  scratchHomeRelative:path.relative(os.homedir(),output),rgbCellsChecked:13*90*640,all32MatricesCovered:true};
fs.writeFileSync(path.join(durable,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({directory:path.relative(app,durable),status:report.status,checks:checks.length}));
