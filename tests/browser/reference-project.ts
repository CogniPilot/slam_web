import {expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
/** Select propagation explicitly for detector/graphics tests; this is not SLAM acceptance. */
export async function openModelicaPropagation(page:Page,packedReadback?:boolean,readback?:'sync'|'async'){
 // Startup prepares the default experiment without requiring Apply. Import
 // only after that finishes, so it cannot race the initial compilation.
 await expect.poll(()=>page.evaluate(()=>{const lab=(window as any).__slamLab;return lab?.initialized&&lab.compiling===false;}),{timeout:90000}).toBe(true);
 if(packedReadback!==undefined)await page.evaluate(enabled=>(window as any).__slamLab.runtime.world.setSensorPackedReadback(enabled),packedReadback);
 if(readback!==undefined)await page.evaluate(mode=>(window as any).__slamLab.runtime.world.setSensorReadback(mode),readback);
 const source=readFileSync('models/ModelicaInertial.mo','utf8');
 const project=await page.evaluate(source=>{const project=structuredClone((window as any).__slamLab.project);project.name='Reference Modelica propagation';project.algorithm=source;project.algorithmPreset='Modelica inertial propagation';project.runtime='modelica';delete project.algorithmArtifact;return project;},source);
 await page.locator('#open').setInputFiles({name:'modelica-propagation.slam.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
 await expect.poll(()=>page.evaluate(()=>{const lab=(window as any).__slamLab;return lab?.project.name==='Reference Modelica propagation'&&lab.ready;}),{timeout:90000}).toBe(true);
 await page.getByRole('button',{name:'▶ Run',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.latest?.frame.sequence??-1),{timeout:90000}).toBeGreaterThan(5);
}
