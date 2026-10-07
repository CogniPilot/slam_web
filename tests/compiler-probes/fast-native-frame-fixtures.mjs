// Independent review oracle only. This file is not imported by production.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const circle=[[0,3],[0,4],[1,5],[2,6],[3,6],[4,6],[5,5],[6,4],[6,3],[6,2],[5,1],[4,0],[3,0],[2,0],[1,1],[0,2]];
const bits=x=>{const b=Buffer.alloc(8);b.writeDoubleLE(x);return b.toString('hex');};
export function directNineArc(patch,initial=0){
 const d=circle.map(([r,c])=>patch[r*7+c]-patch[24]);let result=initial;
 for(let arc=0;arc<16;arc++) {let low=d[arc],high=d[arc];for(let k=1;k<9;k++){const x=d[(arc+k)%16];low=low<x?low:x;high=high>x?high:x;}const dark=-high;const response=low>dark?low:dark;result=result>response?result:response;}
 return result;
}
// Source-level optimized recurrence reference, not compiled Modelica evidence.
function orderedWindows(patch,initial=0){const d=circle.map(([r,c])=>patch[r*7+c]-patch[24]);const e=[...d,...d.slice(0,8)];const window=(a,n,offset,low)=>Array.from({length:n},(_,i)=>low?(a[i]<a[i+offset]?a[i]:a[i+offset]):(a[i]>a[i+offset]?a[i]:a[i+offset]));const low8=window(window(window(e,22,1,true),20,2,true),16,4,true);const high8=window(window(window(e,22,1,false),20,2,false),16,4,false);let result=initial;for(let i=0;i<16;i++){const bright=low8[i]<e[i+8]?low8[i]:e[i+8];const dark=-(high8[i]>e[i+8]?high8[i]:e[i+8]);const response=bright>dark?bright:dark;result=result>response?result:response;}return result;}
// A separate balanced range reduction reproduces the source's ordered tree.
// NaNs make sequential min/max reassociation invalid, so only finite patches
// additionally use the existing independent sequential nine-sample oracle.
function balancedNineArc(patch,initial=0){
 const d=circle.map(([r,c])=>patch[r*7+c]-patch[24]);
 const reduce=(start,count,low)=>{
  if(count===1)return d[start%16];
  const a=reduce(start,count/2,low),b=reduce(start+count/2,count/2,low);
  return low?(a<b?a:b):(a>b?a:b);
 };
 let result=initial;
 for(let arc=0;arc<16;arc++){
  const low=reduce(arc,8,true),high=reduce(arc,8,false),last=d[(arc+8)%16];
  const bright=low<last?low:last,dark=-(high>last?high:last);
  const response=bright>dark?bright:dark;result=result>response?result:response;
 }
 return result;
}
function frame(name,height,width,pixel,{byteRgba=false,nonfinite=false}={}){
 const rgb=[];
 for(let r=0;r<height;r++)for(let c=0;c<width;c++){
  rgb.push(...pixel(r,c),byteRgba?(r*29+c*11)%256:((r*29+c*11)%257)/256);
 }
 const gray=Array.from({length:height*width},(_,i)=>((rgb[4*i]+rgb[4*i+1])+rgb[4*i+2])/3);
 const scores=new Array(height*width).fill(0),floored=new Array(height*width).fill(0);
 for(let r=3;r<height-3;r++)for(let c=3;c<width-3;c++){
  const patch=[];for(let dr=-3;dr<=3;dr++)for(let dc=-3;dc<=3;dc++)patch.push(gray[(r+dr)*width+c+dc]);
  for(const initial of [0,1]){
   const value=balancedNineArc(patch,initial);
   assert.equal(bits(value),bits(orderedWindows(patch,initial)),`${name}/${r}/${c}/${initial}`);
   if(!nonfinite)assert.equal(bits(value),bits(directNineArc(patch,initial)));
   (initial===0?scores:floored)[r*width+c]=value;
  }
 }
 const result={name,height,width,expectedScoreBits:scores.map(bits),floorOneScoreBits:floored.map(bits)};
 if(nonfinite){result.rgbaBits=rgb.map(bits);result.nonfiniteRgb=true;}
 else{result.rgb=rgb;result.expectedScores=scores;}
 if(byteRgba){assert(rgb.every(v=>Number.isInteger(v)&&v>=0&&v<=255));result.inputEncoding='rgba8-row-major-channel-contiguous';}
 return result;
}

const patches=[];for(const [name,fill,center] of [['black',0,0],['white',255,255],['bright-nine',255,0],['dark-nine',0,255],['float-ties',0.125,0.125],['signed-zero',-0,0],['signed-zero-center',0,-0]]){const p=new Array(49).fill(fill);p[24]=center;const expected=directNineArc(p);assert.equal(bits(expected),bits(orderedWindows(p)));patches.push({name,patch:p,patchBits:p.map(bits),expectedScore:expected,expectedScoreBits:bits(expected)});}
for(let arc=0;arc<16;arc++){const p=new Array(49).fill(100);for(let k=0;k<9;k++){const [r,c]=circle[(arc+k)%16];p[r*7+c]=118;}assert.equal(directNineArc(p),18);patches.push({name:`threshold-equality-arc-${arc}`,patch:p,patchBits:p.map(bits),expectedScore:18,expectedScoreBits:bits(18)});}
const frames=[frame('black',90,160,()=>[0,0,0]),frame('white',90,160,()=>[255,255,255]),frame('edges-ties',90,160,(r,c)=>((r%13<6)===(c%17<8)?[255,255,255]:[0,0,0])),frame('colored-float',90,160,(r,c)=>[(r*31+c*17)%256,(r*11+c*47)%256,((r*7+c*3)%256)+0.125])];
const byteRgbaFrames=[frame('byte-RGBA-asymmetric',90,160,(r,c)=>[(r*31+c*17)%256,(r*11+c*47)%256,(r*7+c*3)%256],{byteRgba:true})];
// The asymmetric fixture must actually distinguish both axis reversals.
for(const f of byteRgbaFrames){
 for(const vertical of [false,true])assert(f.expectedScores.some((v,i)=>v!==f.expectedScores[vertical?(f.height-1-Math.floor(i/f.width))*f.width+i%f.width:Math.floor(i/f.width)*f.width+f.width-1-i%f.width]));
}
const nonfiniteRgbFrames=[
 frame('nonfinite-RGB-NaN',90,160,(r,c)=>[(r*31+c*17)%256,(r*11+c*47)%256,(r+c)%11===0?NaN:(r*7+c*3)%256],{nonfinite:true}),
 frame('nonfinite-RGB-infinities',90,160,(r,c)=>[(r*31+c*17)%256,(r*11+c*47)%256,(r+c)%13===0?Infinity:(r+c)%17===0?-Infinity:(r*7+c*3)%256],{nonfinite:true})
];
assert(nonfiniteRgbFrames.some(f=>f.expectedScoreBits.some(v=>Number.isNaN(Buffer.from(v,'hex').readDoubleLE()))),'Nonfinite cases must exercise nonfinite scores');

const dimensionEdit=frame('dimension-edit',12,17,(r,c)=>[(r+c)%3*90,(r*7+c*3)%256,(r*13+c)%256]);
// Binary bit encoding permits ignored nonfinite alpha without nonstandard JSON numbers.
const nanAlpha=frames[2].rgb.slice();for(let i=3;i<nanAlpha.length;i+=4)nanAlpha[i]=NaN;
const ignoredNaNAlpha={name:'ignored-NaN-alpha',height:90,width:160,rgbaBits:nanAlpha.map(bits),expectedScores:frames[2].expectedScores,expectedScoreBits:frames[2].expectedScoreBits,floorOneScoreBits:frames[2].floorOneScoreBits,scope:'Raw ABI bytes fixture; actual transport/compiler execution pending'};
const source=fs.readFileSync('models/Vision/Features/FastNativeFrame.mo');const fixture={schema:1,scope:'Independent direct FAST-9 oracle versus source-level optimized reference; actual compiler/WASM acceptance pending',sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),height:90,width:160,radius:3,channels:4,frames,byteRgbaFrames,nonfiniteRgbFrames,ignoredNaNAlpha,patches,sourceEdits:[{replace:'parameter Integer height = 90;',with:'parameter Integer height = 12;'},{replace:'parameter Integer width = 160;',with:'parameter Integer width = 17;'}],dimensionEdit,thresholdEdit:{replace:'parameter Real absolute_threshold = 18;',with:'parameter Real absolute_threshold = 19;',expectedSelection:[19,0,1e8,3,240,1,3,3],scoresUnchanged:true},scoreEdit:{replace:'responses[1] := 0.0;',with:'responses[1] := 1.0;',scope:'Full source scoring edit; every guarded border stays +0'},actualWasmExecuted:false};
fs.writeFileSync(process.argv[2]??'dev/artifacts/fast-native-frame/independent-fixtures.json',JSON.stringify(fixture)+'\n');console.log(JSON.stringify({sourceSha256:fixture.sourceSha256,frames:frames.length,fullFrameScores:frames.length*14400,additionalByteFrames:byteRgbaFrames.length,nonfiniteFrames:nonfiniteRgbFrames.length,sourceOrderedFullFrameChecks:(frames.length+byteRgbaFrames.length+nonfiniteRgbFrames.length)*14400,patches:patches.length,dimensionEditScores:dimensionEdit.expectedScores.length,actualWasmExecuted:false}));
