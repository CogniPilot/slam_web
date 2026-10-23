import test from 'node:test';
import assert from 'node:assert/strict';
import {declaredView,copyCatalog,installOfficeNativeTrace} from './office-native-observation.mjs';
// Explicit native Catalog shape; use distinct typed previous/next offsets so
// reading the wrong side cannot accidentally pass.
function fixture(inPlace=false){
 const definitions={nextId:1,nextSlot:1,lastEpoch:1,lastTime:1,occupied:64,generations:64,ids:64,epochs:64,imageTimes:64,counts:64,
  featureEnabled:64*350,descriptors:64*350*49,opticalPoints:64*350*3,pixelCoordinates:64*350*2,rgbSizes:128,depthSizes:128,rgbCalibrations:256,depthCalibrations:256,
  opticalToBodyRotations:64*9,cameraOriginsBody:64*3,disparityNoises:64,noiseReferenceFocals:64,baselines:64,vocabularyVersions:64};
 const state_runs=[];let offset=0;
 for(const [name,count]of Object.entries(definitions)){
  state_runs.push({name:'estimator.localization.catalog.'+name,lane:'f64',count,previous:offset,next:inPlace?offset:offset+count*8});offset+=count*8*(inPlace?1:2);
 }
 const inputs={imageRequested:{lane:'f64',count:1,offset},imageEpoch:{lane:'f64',count:1,offset:offset+8}};
 const p={memory:{buffer:new ArrayBuffer(offset+16)},layout:{model:'D435FastSLAMStep',state_runs,inputs,files:{module:{sha256:'exact-module'}}}};
 const view=(name,side)=>{const run=state_runs.find(r=>r.name.endsWith('.'+name));return new Float64Array(p.memory.buffer,run[side],run.count);};
 const fill=(side,id,epoch)=>{
  view('nextId',side)[0]=id+1;view('nextSlot',side)[0]=id+1;view('lastEpoch',side)[0]=epoch;
  view('occupied',side).fill(0);view('occupied',side)[0]=1;view('generations',side)[0]=1;view('ids',side)[0]=id;view('epochs',side)[0]=epoch;view('counts',side)[0]=350;
  view('descriptors',side)[349*49]=id+.25;view('featureEnabled',side)[349]=1;
 };
 fill('previous',1,0);if(!inPlace)fill('next',99,98);
 new Float64Array(p.memory.buffer,offset,2).set([1,1]);
 p.output=name=>name==='features'?new Float64Array(1050).fill(3):name==='featureEnabled'?new Float64Array(350).fill(1):name==='loopCandidateReferenceId'?new Float64Array([1]):undefined;
 p.derived=()=>({sequentialRejectionReason:7,loopCandidateCount:1});p.entry=()=>{fill('next',2,1);return 0;};
 return {p,view,fill};
}
test('uses declared previous offsets, retains slot350 and owns snapshot copies',()=>{
 const {p,view}=fixture();const snapshot=copyCatalog(p,'previous');
 assert.equal(snapshot.frames[0].id,1);assert.equal(snapshot.frames[0].descriptor[349*49],1.25);
 assert.equal(copyCatalog(p,'next').frames[0].id,99);
 view('descriptors','previous')[349*49]=999;assert.equal(snapshot.frames[0].descriptor[349*49],1.25);
 assert.throws(()=>declaredView(p,{offset:1,count:1,lane:'f64'}),/ABI/);
 assert.throws(()=>declaredView(p,{offset:p.memory.buffer.byteLength,count:1,lane:'f64'}),/ABI/);
});
for(const inPlace of [false,true])test('entry observation preserves bytes/status and prior identity '+(inPlace?'in place':'disjoint'),async()=>{
 const clean=fixture(inPlace),wrapped=fixture(inPlace),target={};
 class Program{static async load(){return wrapped.p;}}
 installOfficeNativeTrace(Program,target);const p=await Program.load();
 assert.equal(clean.p.entry(),p.entry());
 assert.deepEqual(new Uint8Array(p.memory.buffer),new Uint8Array(clean.p.memory.buffer));
 assert.equal(target.__officeNativeTrace.references[0].id,1);
 assert.equal(target.__officeNativeTrace.references[0].descriptor[349*49],1.25);
 assert.equal(target.__officeNativeTrace.retainedCurrent.id,2);
 assert.equal(target.__officeNativeTrace.outputs.features.length,1050);
 assert.equal(target.__officeNativeTrace.outputs.featureEnabled.length,350);
 assert.match(target.__officeNativeTrace.scope,/not a substitute/);
});
test('IMU-only calls do not snapshot or read a nonexistent catalog',async()=>{
 const p={memory:{buffer:new ArrayBuffer(8)},layout:{inputs:{imageRequested:{offset:0,count:1,lane:'f64'}}},entry:()=>42},target={};
 class Program{static async load(){return p;}}
 installOfficeNativeTrace(Program,target);await Program.load();assert.equal(p.entry(),42);assert.equal(target.__officeNativeTrace,undefined);
});
test('records native refusal without changing the returned status or decoding scratch',async()=>{
 const {p}=fixture();p.entry=()=>17;const target={};class Program{static async load(){return p;}}
 installOfficeNativeTrace(Program,target);await Program.load();assert.equal(p.entry(),17);assert.equal(target.__officeNativeTrace.status,17);
});

test('retains older typed-lane loop references using actual count/rank bounds',async()=>{
 const {p,view}=fixture();view('nextId','previous')[0]=3;view('occupied','previous')[1]=1;view('ids','previous')[1]=2;view('generations','previous')[1]=1;view('epochs','previous')[1]=1;view('counts','previous')[1]=350;
 const output=p.output;p.output=name=>name==='loopCandidateReferenceId'?undefined:output(name);
 p.derived=()=>({loopCandidateCount:1,'loopCandidateReferenceId[1]':1,'loopCandidateReferenceId[2]':99});
 const target={};class Program{static async load(){return p;}}installOfficeNativeTrace(Program,target);await Program.load();p.entry();
 assert.deepEqual(target.__officeNativeTrace.references.map(frame=>frame.id),[1,2]);
});
test('refuses invalid candidate-rank bounds',async()=>{
 const {p}=fixture();p.derived=()=>({loopCandidateCount:5});class Program{static async load(){return p;}}installOfficeNativeTrace(Program,{});await Program.load();assert.throws(()=>p.entry(),/candidate count/);
});

test('hashes actual decoded native assets and refuses a declared-byte mismatch',async()=>{
 const {p}=fixture(),bytes=new Uint8Array([1,2,3]);
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
 class Program{static async load(layout,fetch){await fetch('module.wasm','identity');return p;}}
 installOfficeNativeTrace(Program,{});
 const layout={files:{module:{file:'module.wasm',bytes:3,sha256:digest}}};
 await Program.load(layout,async()=>bytes);
 await assert.rejects(()=>Program.load(layout,async()=>new Uint8Array([1,2,4])),/identity failure/);
});
