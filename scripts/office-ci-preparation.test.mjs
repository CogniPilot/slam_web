import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {resolve} from 'node:path';
import {prepareOfficeDiagnostic} from './office-ci-preparation.mjs';import {OFFICE_MISSION} from './office-ci-contract.mjs';
// Actual profile selection/calibration code, with controlled browser/runtime
// transports. These controls do not render a camera or execute a mission.
const bundled=await build({entryPoints:[resolve('src/camera-profile.ts')],bundle:true,platform:'node',format:'esm',write:false});
const {resolveSensorProfile,d435Calibration,SOFTWARE_CAMERA,D435}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
async function fixture(options,check){
 const savedWindow=globalThis.window,savedCanvas=globalThis.OffscreenCanvas;
 const graphics=Object.freeze(options.hardware?{renderer:'NVIDIA control',acceleration:'hardware-reported'}:{renderer:'ANGLE SwiftShader Device',acceleration:'software'}),worlds=[],runtimes=[];
 const initialFrame={sequence:0,time:0,dt:0},initialEstimate={x:0,y:0,z:0};let images=0;
 class World{
  constructor(settings){this.settings=settings;this.graphics=graphics;this.sensorProfile=resolveSensorProfile(graphics.acceleration,options.ignoreSelection?undefined:settings?.sensorProfile);this.calibration={...(this.sensorProfile==='software'?SOFTWARE_CAMERA:D435)};this.truth={x:0,y:0,z:1.5,quaternion:[1,0,0,0]};worlds.push(this);}
  async setCameraResolution(id){this.calibration={...(this.sensorProfile==='software'?SOFTWARE_CAMERA:d435Calibration(id))};}
  async enableSensorWorker(){this.workerRequest={profile:this.sensorProfile,width:this.calibration.width,height:this.calibration.height};this.sensorRpc={call:async(type,settings)=>{assert.equal(type,'configure');assert.deepEqual(settings,{});return{graphics:options.hardwareSensor?{renderer:'NVIDIA control',acceleration:'hardware-reported'}:graphics};}};}
 }
 class Runtime{
  constructor(world){this.world=world;this.busy=false;this.onInitialFrame=()=>{};this.slamProgram={sourceSha256:'controlled-module'};this.physics={call:async method=>{assert.equal(method,'executionReceipt');return{engine:'wasm_program'};}};runtimes.push(this);}
  pause(){this.paused=true;}
  async compile(project){this.project=structuredClone(project);await this.world.setCameraResolution(project.cameraResolution);if(!options.noInitial){images++;this.onInitialFrame(0,initialFrame,initialEstimate);}}
 }
 const previous=new Runtime(new World()),project=Object.freeze({name:'UI original',environment:'city',modelicaSources:{'kept.mo':'unchanged'},algorithmArtifact:{old:true}});
 globalThis.window={__slamLab:{runtime:previous,project}};globalThis.OffscreenCanvas=class{constructor(width,height){this.width=width;this.height=height;}};
 try{await check({previous,project,graphics,worlds,runtimes,initialFrame,initialEstimate,images:()=>images,invoke:()=>prepareOfficeDiagnostic({physics:'prepared route',mission:OFFICE_MISSION,base:'http://127.0.0.1:4173/'})});}
 finally{if(savedWindow===undefined)delete globalThis.window;else globalThis.window=savedWindow;if(savedCanvas===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=savedCanvas;}
}
test('explicit diagnostic raster is424x240 on real software classification, with UI fallback untouched',()=>fixture({},async f=>{
 assert.equal(f.previous.world.sensorProfile,'software');assert.equal(f.previous.world.calibration.width,160);
 const result=await f.invoke(),runtime=window.__officeRuntime;
 assert.notEqual(runtime,f.previous);assert.notEqual(runtime.world,f.previous.world);assert.equal(f.previous.paused,true);
 assert.deepEqual([result.calibration.width,result.calibration.height],[424,240]);assert.equal(result.sensorSelection.profile,'native');
 assert.deepEqual(runtime.world.workerRequest,{profile:'native',width:424,height:240});assert.equal(result.graphics,f.graphics);assert.equal(result.graphics.acceleration,'software');
 assert.equal(f.previous.world.sensorProfile,'software');assert.equal(f.previous.world.calibration.width,160);assert.equal(f.project.name,'UI original');assert.equal(f.project.environment,'city');
 assert.equal(result.project.modelicaSources['kept.mo'],'unchanged');assert.equal(result.project.physics,'prepared route');assert.equal(result.project.algorithmArtifact,undefined);
 assert.equal(runtime.autopilot,false);assert.equal(runtime.recording,false);assert.equal(f.images(),1);assert.equal(window.__officeInitial.frame,f.initialFrame);assert.equal(window.__officeInitial.estimate,f.initialEstimate);
}));
test('the software160x90 fallback cannot silently satisfy a424x240 diagnostic request',()=>fixture({ignoreSelection:true},async f=>{
 await assert.rejects(f.invoke(),/camera raster differs/);assert.equal(f.images(),0);assert.equal(f.runtimes.length,1);
}));
test('an explicit calibrated raster never substitutes for actual software renderer evidence',()=>fixture({hardware:true},async f=>{
 await assert.rejects(f.invoke(),/actual SwiftShader software/);assert.equal(f.images(),0);
}));
test('a fresh runtime must retain its actual initialization observation',()=>fixture({noInitial:true},async f=>{
 await assert.rejects(f.invoke(),/actual time-zero image/);assert.equal(f.images(),0);
}));
test('sensor-worker graphics are verified independently of the host world',()=>fixture({hardwareSensor:true},async f=>{
 await assert.rejects(f.invoke(),/sensor worker must retain actual SwiftShader/);assert.equal(f.images(),0);
}));
