import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {openExperimentFile, openLibraryFile} from './source-files';

test('canonical library edits persist and the reloaded example executes the edited inertial component',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('button',{name:'▶ Run',exact:true})).toBeEnabled({timeout:90000});
  const path='models/Libraries/CogniPilot/Control/Multirotor/LogLinear/package.mo';
  await openLibraryFile(page,path);
  const original=readFileSync(path,'utf8');
  await expect(page.getByLabel('Modelica source')).toHaveValue(original);
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.sourceEditor.status),{timeout:30000}).toContain('ready');
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.sourceEditor.getDiagnostics()
    .filter((diagnostic:any)=>diagnostic.severity===1).length),{timeout:30000}).toBe(0);
  const edited=original.replace('attitudeGain[3](each unit = "1/s") = {2.0, 2.0, 1.0}',
    'attitudeGain[3](each unit = "1/s") = {2.1, 2.1, 1.0}');
  expect(edited).not.toBe(original);
  await page.evaluate(source=>(window as any).__slamLab.sourceEditor.editor.setValue(source),edited);
  const inertialPath='models/Libraries/CogniPilot/SLAM/Inertial/ModelicaInertial.mo';
  await openLibraryFile(page,inertialPath);
  const inertial=readFileSync(inertialPath,'utf8'),editedInertial=inertial.replace('gravity = 9.81','gravity = 9.0');
  expect(editedInertial).not.toBe(inertial);
  await page.evaluate(source=>(window as any).__slamLab.sourceEditor.editor.setValue(source),editedInertial);
  await page.getByRole('button',{name:'Save project',exact:true}).click();
  await expect(page.locator('#saved')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByRole('button',{name:'▶ Run',exact:true})).toBeEnabled({timeout:90000});
  await openLibraryFile(page,path);
  await expect(page.getByLabel('Modelica source')).toHaveValue(edited);
  expect(await page.evaluate(()=>(window as any).__slamLab.project.physics))
    .toContain('Control.Multirotor.LogLinear.Controller controller');
  const result=await page.evaluate(async()=>{
    const lab=(window as any).__slamLab;
    // Drive the actual prepared WASM worker with a known held IMU measurement.
    const estimate=await lab.runtime.modelicaState.call('step',{frame:{time:.1,dt:.1,
      imu:{accel:[0,0,9.81],gyro:[0,0,0]}}});
    return {model:lab.project.algorithmArtifact.modelName,estimate};
  });
  expect(result.model).toBe('SLAM.Examples.InertialOnly');
  expect(result.estimate.z).toBeCloseTo(.00405,10);
  expect(result.estimate.diagnostics.backend).toBe('Rumoca Solve IR session');
});

test('model selection executes the chosen example and preserves independent source edits',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('button',{name:'▶ Run',exact:true})).toBeEnabled({timeout:90000});
  const selector=page.getByLabel('Run model');
  await expect(selector).toHaveValue('SLAM.Examples.InertialOnly');
  await expect(selector.locator('option[value="SLAM.Examples.SmoothedInertial"]')).toHaveCount(1);
  const credit=page.getByRole('link',{name:'Powered by Rumoca',exact:true});
  await expect(credit).toHaveAttribute('href','https://github.com/CogniPilot/rumoca');
  expect(await credit.locator('img').evaluate(image=>(image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const main=await page.getByLabel('Modelica source').inputValue();
  expect(main).toBe(readFileSync('models/Libraries/CogniPilot/SLAM/Examples/InertialOnly.mo','utf8'));
  await selector.selectOption('SLAM.Examples.SmoothedInertial');
  await page.getByRole('button',{name:'▶ Run',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.project.algorithmArtifact?.modelName),{timeout:90000}).toBe('SLAM.Examples.SmoothedInertial');
  await page.getByRole('button',{name:'Ⅱ Pause',exact:true}).click();
  await expect(page.getByLabel('Modelica source')).toHaveValue(main);
  const path='models/Libraries/CogniPilot/SLAM/Examples/SmoothedInertial.mo';
  await openLibraryFile(page,path);
  const original=readFileSync(path,'utf8'),edited=original.replace('accelTimeConstant=0.12','accelTimeConstant=0.18');
  await page.evaluate(source=>(window as any).__slamLab.sourceEditor.editor.setValue(source),edited);
  await openExperimentFile(page,'slam');
  await expect(page.getByLabel('Modelica source')).toHaveValue(main);
  await page.getByRole('button',{name:'Save project',exact:true}).click();
  await expect(page.locator('#saved')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByRole('button',{name:'▶ Run',exact:true})).toBeEnabled({timeout:90000});
  await expect(selector).toHaveValue('SLAM.Examples.SmoothedInertial');
  await openLibraryFile(page,path);
  await expect(page.getByLabel('Modelica source')).toHaveValue(edited);
  const downloadReady=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export source',exact:true}).click();
  expect((await downloadReady).suggestedFilename()).toBe('SmoothedInertial.mo');
});

test('late model discovery preserves a newer selection',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('button',{name:'▶ Run',exact:true})).toBeEnabled({timeout:90000});
  const selector=page.getByLabel('Run model');
  await expect(selector.locator('option[value="SLAM.Examples.ResponsiveInertial"]')).toHaveCount(1);
  await page.evaluate(()=>{
    const editor=(window as any).__slamLab.sourceEditor;
    const original=editor.simulationModels.bind(editor);
    editor.simulationModels=async(...args:unknown[])=>{
      const names=await original(...args);
      editor.simulationModels=original;
      return new Promise(resolve=>{(window as any).finishModelDiscovery=()=>resolve(names);});
    };
    editor.editor.setValue(editor.editor.getValue()+'\n// Edited during model discovery\n');
  });
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).finishModelDiscovery)).toBe('function');
  await selector.selectOption('SLAM.Examples.ResponsiveInertial');
  await page.evaluate(()=>(window as any).finishModelDiscovery());
  // Let the discovery continuation and the next presentation frame complete.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(selector).toHaveValue('SLAM.Examples.ResponsiveInertial');
  expect(await page.evaluate(()=>(window as any).__slamLab.project.entryPoint)).toBe('SLAM.Examples.ResponsiveInertial');
});
