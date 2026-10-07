import {expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {defaultGraph} from '../../src/graph';
import {modelicaSourcePath} from '../../src/modelica-source-locations.mjs';
/** Select propagation explicitly for detector/graphics tests; this is not SLAM acceptance. */
export async function openModelicaPropagation(page:Page,packedReadback?:boolean,readback?:'sync'|'async',renderViewer=false){
 // Startup prepares the default experiment without requiring Apply. Import
 // only after that finishes, so it cannot race the initial compilation.
 await expect.poll(()=>page.evaluate(()=>{const lab=(window as any).__slamLab;return lab?.initialized&&lab.compiling===false;}),{timeout:90000}).toBe(true);
 if(packedReadback!==undefined)await page.evaluate(enabled=>(window as any).__slamLab.runtime.world.setSensorPackedReadback(enabled),packedReadback);
 if(readback!==undefined)await page.evaluate(mode=>(window as any).__slamLab.runtime.world.setSensorReadback(mode),readback);
 const source=readFileSync('models/Estimation/Inertial/ModelicaInertial.mo','utf8');
 const prepared=await page.evaluate(source=>{const lab=(window as any).__slamLab;return lab.ready&&lab.project.runtime==='modelica'&&lab.project.algorithm===source;},source);
 if(!prepared){
 const project=await page.evaluate(source=>{const project=structuredClone((window as any).__slamLab.project);project.name='Reference Modelica propagation';project.algorithm=source;project.algorithmPreset='Modelica inertial propagation';project.runtime='modelica';delete project.algorithmArtifact;delete project.entryPoint;delete project.modelicaSources;delete project.mainSourcePath;return project;},source);
 await page.locator('#open').setInputFiles({name:'modelica-propagation.slam.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
 await expect.poll(()=>page.evaluate(()=>{const lab=(window as any).__slamLab;return lab?.project.name==='Reference Modelica propagation'&&lab.ready;}),{timeout:90000}).toBe(true);
 }
 // Sensor/component tests do not measure the continuously redrawn viewer.
 // Avoid competing software shader work; startup and clock gates keep it on.
 await page.evaluate(visible=>(window as any).__slamLab.viewer.worker.postMessage({type:'visibility',visible}),renderViewer);
 await page.getByRole('button',{name:'▶ Run',exact:true}).click();
 // Consumers need an actual sensor frame, not six unused city captures.
 await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.latest?.frame.sequence??-1),{timeout:90000}).toBeGreaterThanOrEqual(0);
}

/** Timing/estimator tests use a small scene; city fidelity has dedicated gates.
 * Keep the real camera resolution, shader/readback path and Modelica physics.
 */
export async function openEconomicalPropagation(page:Page,renderViewer=false){
 const fixture={format:'slam-lab-project',version:1,name:'Sensor timing fixture',
  environment:'warehouse',seed:7,sceneDetail:'low',depthCloudEnabled:false,carsEnabled:false,peopleEnabled:false,
  sensorRates:{cameraHz:30,lidarHz:10,imuHz:180,gpsHz:1},
  algorithm:readFileSync('models/Estimation/Inertial/ModelicaInertial.mo','utf8'),algorithmPreset:'Modelica inertial propagation',
  physics:readFileSync('models/Vehicles/LabQuadrotor.mo','utf8'),
  detector:['D435ImageProfile','HarrisNativeFrame','D435HarrisFeatures'].map(name=>readFileSync(modelicaSourcePath(name),'utf8')).join('\n'),
  detectorPreset:'Modelica Harris · integration pending',detectorLanguage:'modelica',runtime:'modelica',graph:defaultGraph()};
 await page.route('**/__timing_seed__.txt',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Sensor timing fixture</title>'}));
 await page.goto('/__timing_seed__.txt');
 await page.evaluate(project=>localStorage.setItem('slam-lab.project.v1',JSON.stringify(project)),fixture);
 await page.goto('/');
 await openModelicaPropagation(page,undefined,undefined,renderViewer);
}
