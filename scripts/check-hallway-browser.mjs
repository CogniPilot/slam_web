import {chromiumLaunchOptions} from './browser-launch.mjs';
import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import {hallwayPhysics} from './hallway-benchmark-physics.mjs';
const [projectPath,output]=process.argv.slice(2);
if(!output)throw Error('Usage: check-hallway-browser.mjs ORIGINAL_PROJECT OUTPUT_PREFIX');
const project=JSON.parse(await readFile(projectPath));
Object.assign(project,{name:'Hallway CPU render smoke',environment:'hallway',slamBackend:'inertial',physics:await hallwayPhysics(project.physics),algorithm:await readFile(new URL('../models/Estimation/Inertial/ModelicaInertial.mo',import.meta.url),'utf8'),algorithmPreset:'Modelica inertial propagation',runtime:'modelica',carsEnabled:false,peopleEnabled:false,lidarEnabled:false,depthCloudEnabled:false,sensorRates:{cameraHz:5,imuHz:10,lidarHz:5,gpsHz:1}});
delete project.algorithmArtifact;delete project.entryPoint;delete project.mainSourcePath;
const browser=await chromium.launch({...chromiumLaunchOptions(),headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/__smoke_seed__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html>'}));
 await page.goto('http://127.0.0.1:4198/__smoke_seed__');await page.evaluate(p=>localStorage.setItem('slam-lab.project.v1',JSON.stringify(p)),project);
 await page.goto('http://127.0.0.1:4198/');await page.waitForFunction(()=>window.__slamLab?.ready&&!window.__slamLab.compiling,undefined,{timeout:120000});
 const result=await page.evaluate(async()=>{
  const lab=window.__slamLab,r=lab.runtime;r.pause();while(r.busy)await new Promise(resolve=>setTimeout(resolve,10));r.autopilot=false;
  const initial=await r.captureInitialFrame();
  if(initial.sequence!==0||initial.time!==0||initial.dt!==0)throw Error('Initial frame clock failed');
  for(let i=0;i<6;i++){await r.step();const f=lab.latest.frame;if(f.sequence!==i+1||Math.abs(f.time-(i+1)/5)>1e-9)throw Error('Frame clock failed');}
  const f=lab.latest.frame;
  return {environment:r.project.environment,graphics:r.world.graphics,roofEnabled:r.world.navigationEnabled,roofs:r.world.navigationRoofs,gps:r.gps,sequence:f.sequence,time:f.time,dimensions:[f.calibration.width,f.calibration.height],imageLayout:f.imageLayout,nonzeroDepth:f.depth.filter(x=>x>0).length,sensorWorkerActive:!!r.world.sensorRpc};
 });
 if(errors.length)throw Error('Browser errors: '+JSON.stringify(errors));
 if(result.environment!=='hallway'||result.graphics.acceleration!=='software'||!result.roofEnabled||result.gps!==null||result.sequence!==6||Math.abs(result.time-1.2)>1e-9||!result.nonzeroDepth||!result.sensorWorkerActive)throw Error('Hallway render/sensor/GPS fixture gate failed: '+JSON.stringify(result));
 await page.screenshot({path:output+'.png'});
 await writeFile(output+'.json',JSON.stringify({result,errors,scope:'Six-frame CPU SwiftShader scene/sensor smoke; not native-resolution capture or SLAM relocalization'},null,2)+'\n');
 console.log(JSON.stringify({result,errors}));
}finally{await browser.close();}
