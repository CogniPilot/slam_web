// Self-contained browser function passed directly to Playwright evaluate().
// Uses production constructors with an explicit sensor raster, never a fake
// renderer identity or a mutation of the UI world's readonly profile.
export async function prepareOfficeDiagnostic({physics,mission,base}){
 const lab=window.__slamLab,previous=lab.runtime;previous.pause();
 while(previous.busy)await new Promise(done=>setTimeout(done,10));
 const project=structuredClone(lab.project);
 Object.assign(project,{name:'Office loop software CI diagnostic',environment:'office-loop',physics,
  slamBackend:'native',cameraResolution:'424x240',seed:7,vehicleCount:1,sceneDetail:'low',carsEnabled:false,peopleEnabled:false,
  lidarEnabled:false,depthCloudEnabled:false,sensorRates:{cameraHz:mission.cameraHz,imuHz:10,lidarHz:5,gpsHz:1}});
 delete project.algorithmArtifact;
 const World=previous.world.constructor,Runtime=previous.constructor;
 const world=new World({canvas:new OffscreenCanvas(mission.width,mission.height),width:mission.width,height:mission.height,pixelRatio:1,base,sensorProfile:'native'});
 if(!/swiftshader/i.test(world.graphics?.renderer??'')||world.graphics?.acceleration!=='software')throw Error('Diagnostic world must retain actual SwiftShader software graphics');
 await world.setCameraResolution(project.cameraResolution);
 if(world.calibration.width!==mission.width||world.calibration.height!==mission.height)throw Error('Diagnostic camera raster differs from the published native profile');
 await world.enableSensorWorker();
 // Empty configuration retains settings and returns the worker's own driver
 // receipt. Raster selection must not masquerade as acceleration there either.
 const sensor=await world.sensorRpc.call('configure',{});
 if(!/swiftshader/i.test(sensor.graphics?.renderer??'')||sensor.graphics?.acceleration!=='software')throw Error('Diagnostic sensor worker must retain actual SwiftShader software graphics');
 const r=new Runtime(world);window.__officeRuntime=r;
 r.onStatus=text=>console.log(JSON.stringify({kind:'office-stage',text}));
 const originalInitial=r.onInitialFrame;let initial;
 r.onInitialFrame=(vehicle,frame,estimate)=>{
  if(vehicle===0)initial={frame,estimate,truth:structuredClone(world.truth)};
  originalInitial.call(r,vehicle,frame,estimate);
 };
 try{await r.compile(project);}finally{r.onInitialFrame=originalInitial;}
 if(!initial)throw Error('Native initialization did not retain its actual time-zero image');
 if(world.calibration.width!==mission.width||world.calibration.height!==mission.height)throw Error('Compilation changed the diagnostic camera raster');
 r.autopilot=false;r.recording=false;lab.viewer?.worker?.postMessage({type:'visibility',visible:false});
 window.__officeInitial=initial;
 return {project:structuredClone(r.project),graphics:world.graphics,sensorGraphics:sensor.graphics,calibration:world.calibration,
  sensorSelection:{profile:world.sensorProfile,width:world.calibration.width,height:world.calibration.height,
   scope:'Explicit calibrated sensor raster on verified software graphics; native is a sensor profile, not a hardware acceleration claim.'},
  nativeProgram:structuredClone(r.slamProgram),physics:await r.physics.call('executionReceipt')};
}
