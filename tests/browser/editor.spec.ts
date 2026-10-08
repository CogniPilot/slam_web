import {openExperimentFile} from './source-files';
import {test,expect} from '@playwright/test';
test.afterEach(async({page},info)=>{
  if(info.status===info.expectedStatus)return;
  const state=await page.evaluate(()=>{
    const editor=(window as any).__slamLab?.sourceEditor;
    return {title:document.querySelector('#editor-title')?.textContent,
      status:editor?.status,diagnostics:editor?.getDiagnostics()};
  }).catch(error=>({error:String(error)}));
  await info.attach('editor-diagnostics',{body:JSON.stringify(state),contentType:'application/json'});
});

test('physics, sensor, native Harris, inertial and evaluation editors update live diagnostics',async({page})=>{
  await page.goto('/');
  await expect(page.locator('#startup-screen')).toBeHidden({timeout:90000});
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.ready===true),{timeout:90000}).toBe(true);
  await page.evaluate(()=>(window as any).__slamLab.runtime.pause());
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  await openExperimentFile(page,'physics');
  await expect(page.locator('.monaco-editor')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.sourceEditor.status),{timeout:30000}).toContain('ready');
  await page.evaluate(()=>(window as any).__slamLab.sourceEditor.editor.setValue('model Broken\n  Real x;\nequation\n  x = ;\nend Broken;'));
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.sourceEditor.getDiagnostics().some((d:any)=>d.severity===1)),{timeout:30000}).toBe(true);
  expect(await page.getByLabel('Modelica source').inputValue()).toContain('model Broken');
  await page.evaluate(()=>(window as any).__slamLab.sourceEditor.editor.setValue('model Good\n  Real x;\nequation\n  x = 1;\nend Good;'));
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.sourceEditor.getDiagnostics().filter((d:any)=>d.severity===1).length),{timeout:30000}).toBe(0);
  for(const node of ['sensor','detector','slam','evaluation']){
    await openExperimentFile(page,node);
    await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.sourceEditor.status),{timeout:30000}).toContain('Rumoca');
    const original=await page.getByLabel('Modelica source').inputValue();
    expect(original).toMatch(/(?:model|function) /);
    if(node==='detector')expect(original).toContain('model D435HarrisFeatures');
    await page.evaluate(()=>(window as any).__slamLab.sourceEditor.editor.setValue('model Broken\n Real x;\nequation\n x = ;\nend Broken;'));
    await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.sourceEditor.getDiagnostics().some((d:any)=>d.severity===1)),{timeout:30000}).toBe(true);
    await page.evaluate(source=>(window as any).__slamLab.sourceEditor.editor.setValue(source),original);
    await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.sourceEditor.getDiagnostics().filter((d:any)=>d.severity===1).length),{timeout:30000}).toBe(0);
  }
});
