import {test,expect} from '@playwright/test';
test('real browser language servers highlight code and update diagnostics without compilation',async({page})=>{
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.initialized===true),{timeout:90000}).toBe(true);
  await page.evaluate(()=>(window as any).__slamLab.runtime.pause());
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  await expect(page.locator('.monaco-editor')).toBeVisible();
  await page.getByLabel('Edit node').selectOption('physics');
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.sourceEditor.status),{timeout:30000}).toContain('ready');
  await page.evaluate(()=>(window as any).__slamLab.sourceEditor.editor.setValue('model Broken\n  Real x;\nequation\n  x = ;\nend Broken;'));
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.sourceEditor.getDiagnostics().some((d:any)=>d.severity===1)),{timeout:30000}).toBe(true);
  expect(await page.getByLabel('Node source code').inputValue()).toContain('model Broken');
  await page.evaluate(()=>(window as any).__slamLab.sourceEditor.editor.setValue('model Good\n  Real x;\nequation\n  x = 1;\nend Good;'));
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.sourceEditor.getDiagnostics().filter((d:any)=>d.severity===1).length),{timeout:30000}).toBe(0);
  for(const node of ['sensor','detector','slam','evaluation']){
    await page.getByLabel('Edit node').selectOption(node);
    await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.sourceEditor.status),{timeout:30000}).toContain('Rumoca');
    const original=await page.getByLabel('Node source code').inputValue();
    expect(original).toMatch(/(?:model|function) /);
    await page.evaluate(()=>(window as any).__slamLab.sourceEditor.editor.setValue('model Broken\n Real x;\nequation\n x = ;\nend Broken;'));
    await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.sourceEditor.getDiagnostics().some((d:any)=>d.severity===1)),{timeout:30000}).toBe(true);
    await page.evaluate(source=>(window as any).__slamLab.sourceEditor.editor.setValue(source),original);
    await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.sourceEditor.getDiagnostics().filter((d:any)=>d.severity===1).length),{timeout:30000}).toBe(0);
  }
});
