import {openModelicaPropagation} from './reference-project';
import { test,expect } from '@playwright/test';
test.fixme('full Modelica serverless UAV sensor → vision → SLAM graph, persistence and replay',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')console.log('BROWSER:',message.text());});
  await page.goto('/');await openModelicaPropagation(page);
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.latest?.frame.sequence??-1),{timeout:90_000}).toBeGreaterThan(5);
  await page.getByRole('button',{name:'Ⅱ Pause'}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  const snapshot=await page.evaluate(()=>{
    const lab=(window as any).__slamLab,{frame,estimate,truth}=lab.latest;
    return {time:frame.time,truthTime:truth.time,pose:[truth.x,truth.y,truth.z],rgb:frame.rgb.some((x:number)=>x>20),validDepth:Array.from(frame.depth).filter((x:any)=>x>0).length,features:estimate.features.length,map:estimate.points.length,topics:Array.from(lab.runtime.flow.stats.keys()),estimate:[estimate.x,estimate.y,estimate.z]};
  });
  console.log('SLAM SNAPSHOT',snapshot);
  expect(snapshot.time).toBe(snapshot.truthTime);
  expect(snapshot.rgb).toBe(true);expect(snapshot.validDepth).toBeGreaterThan(100);
  expect(snapshot.features).toBeGreaterThan(10);expect(snapshot.map).toBeGreaterThan(10);
  expect(snapshot.topics).toContain('lab/node/detector/features');expect(snapshot.topics).toContain('lab/slam/odometry');
  expect(snapshot.pose[2]).toBeGreaterThan(1);expect(snapshot.estimate.every(Number.isFinite)).toBe(true);
  await page.screenshot({path:'test-results/slam-lab.png',fullPage:true});
  await page.getByLabel('Edit node').selectOption('detector');
  await page.getByLabel('Node preset').selectOption('Modelica FAST · full resolution');
  await page.getByRole('button',{name:'Apply & reset'}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.ready),{timeout:90_000}).toBe(true);
  await expect(page.getByRole('button',{name:'Step',exact:true})).toBeEnabled({timeout:90_000});
  await page.getByRole('button',{name:'Step',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.latest?.frame.sequence)).toBe(0);
  await page.getByLabel('Project name').fill('Saved vision experiment');
  await page.getByRole('button',{name:'Save project',exact:true}).click();
  await expect(page.locator('#saved')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByLabel('Project name')).toHaveValue('Saved vision experiment');
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.latest?.frame.sequence??-1),{timeout:90_000}).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('native vision source remains editable while Modelica inertial propagation runs',async({page})=>{
  await page.goto('/');await openModelicaPropagation(page);
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.latest?.frame.sequence??-1),{timeout:90_000}).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Ⅱ Pause'}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  await page.getByLabel('Edit node').selectOption('detector');
  await page.getByLabel('Node preset').selectOption('Modelica FAST · integration pending');
  await page.getByRole('button',{name:'Apply & reset'}).click();
  await expect(page.getByRole('button',{name:'Step',exact:true})).toBeEnabled({timeout:90_000});
  await page.getByRole('button',{name:'Step',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.latest?.frame.sequence)).toBe(0);
  expect(await page.evaluate(()=>(window as any).__slamLab.latest.estimate.features)).toBeUndefined();
  await expect(page.locator('#metric-features')).toHaveText('Pending');
  await expect(page.locator('#flight-status')).toContainText('visual SLAM pending');
  await page.getByLabel('Edit node').selectOption('slam');
  await page.getByLabel('Node preset').selectOption('Modelica inertial propagation');
  await page.getByRole('button',{name:'Apply & reset'}).click();
  await expect(page.getByRole('button',{name:'Step',exact:true})).toBeEnabled({timeout:90_000});
  await page.getByRole('button',{name:'Step',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.latest?.frame.sequence)).toBe(0);
  expect(await page.evaluate(()=>(window as any).__slamLab.latest.estimate.diagnostics.backend)).toBe('Rumoca Solve IR session');
  await page.getByLabel('Simulation speed').selectOption('Infinity');
  await page.getByRole('button',{name:'▶ Run',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.latest?.frame.sequence),{timeout:30_000}).toBeGreaterThan(20);
  await page.getByRole('button',{name:'Ⅱ Pause'}).click();
  console.log('FASTER CLOCK',await page.locator('#metric-rtf').innerText());
});

test('depth is physical optical-Z and rendering cannot leak the estimated map',async({page})=>{
  await page.goto('/');await openModelicaPropagation(page);
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.latest?.frame.sequence??-1),{timeout:90_000}).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Ⅱ Pause'}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  const result=await page.evaluate(async()=>{
    const world=(window as any).__slamLab.runtime.world;
    const box=world.environment.children.find((child:any)=>child.isInstancedMesh);
    world.sensorGeometryBatches.clear();world.environment.clear();world.environment.add(box);
    world.configureActors(false,false);world.actors.group.visible=false;world.navigation.group.visible=false;
    box.count=1;const matrix=world.robot.matrix.clone();matrix.makeScale(.2,10,10);matrix.setPosition(5,1.5,0);box.setMatrixAt(0,matrix);box.instanceMatrix.needsUpdate=true;box.computeBoundingSphere();
    world.update({x:0,y:0,z:1.5,quaternion:[1,0,0,0]});
    const calibration=(window as any).__slamLab.latest.frame.calibration;
    // Isolate optical geometry from the separately qualified noise shader.
    await world.setDepthNoise({seed:7,disparityNoisePx:0,referenceFx:calibration.fx,baselineMeters:calibration.baseline,dropoutProbability:0,unitsMeters:.001});
    const first=world.capture().depth;
    world.setMap([[1,0,0],[1,.1,0],[1,0,.1]]);const second=world.capture().depth;
    const row=Math.floor(calibration.height/2),column=Math.floor(calibration.width/2);
    return {depth:first[row*calibration.width+column],offAxis:first[row*calibration.width+column+Math.floor(calibration.width/8)],same:first.every((v:number,i:number)=>v===second[i])};
  });
  expect(result.depth).toBeCloseTo(4.72,2);expect(result.offAxis).toBeCloseTo(4.72,2);expect(result.same).toBe(true);
});

test.fixme('Modelica custom feature filter and exported dataset replay',async()=>{
  // Pending a typed Modelica graph-node adapter: preserve the original fixture
  // requirements of 350 Grid inputs, 175 filtered outputs and two replay frames.
  const required={inputFeatures:350,outputFeatures:175,frames:2,finalTime:2/90};
  throw new Error(`Modelica feature graph/replay adapter pending: ${JSON.stringify(required)}`);
});
