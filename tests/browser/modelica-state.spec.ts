// Pending the replacement native host deployment adapter.
import {test,expect} from '@playwright/test';
import process from 'node:process';
test.fixme('edited stateful Modelica deploys identical persistent WASM and reloads locally',async({page})=>{
  test.skip(!process.env.SLAM_COMPANION_TEST,'Requires the replacement native Modelica companion');
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.ready),{timeout:90000}).toBe(true);
  await page.getByRole('button',{name:'Ⅱ Pause'}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  await page.getByLabel('Edit node').selectOption('slam');
  await page.getByLabel('Node preset').selectOption('Modelica inertial propagation');
  const editor=page.getByLabel('Node source code');await editor.fill((await editor.inputValue()).replace('accel_tau = 0.03','accel_tau = 0.06'));
  await expect(page.locator('#language')).toContainText('Modelica');
  await page.getByRole('button',{name:'Apply & reset'}).click();
  await expect(page.getByRole('button',{name:'Step',exact:true})).toBeEnabled({timeout:90000});
  const digest=await page.evaluate(()=>(window as any).__slamLab.project.algorithmArtifact.sourceSha256);
  await page.getByLabel('External adapter endpoint').fill(process.env.SLAM_COMPANION_ENDPOINT??'ws://127.0.0.1:19979');
  await page.getByRole('button',{name:'Connect',exact:true}).click();
  await expect(page.locator('#remote-state')).toContainText('Connected',{timeout:15000});
  await page.getByLabel('Companion target ID').fill('test-companion');await page.getByLabel('Deployment token').fill('test-only');
  await page.getByRole('button',{name:'Deploy project',exact:true}).click();
  await expect(page.locator('#deploy-state')).toContainText('activated',{timeout:30000});
  for(let i=0;i<8;i++) {
    await page.getByRole('button',{name:'Step',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.latest?.frame.sequence)).toBe(i);
    await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.externalSamples)).toBeGreaterThan(i);
    const {local,native}=await page.evaluate(()=>{const lab=(window as any).__slamLab;return {local:lab.latest.estimate,native:lab.externalLatest};});
    for(const axis of ['x','y','z'])expect(native[axis]).toBeCloseTo(local[axis],12);
    expect(native.quaternion).toEqual(local.quaternion);expect(local.diagnostics.stateCount).toBe(16);
    expect(native.features).toEqual(local.features);
    await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  }
  const displacement=await page.evaluate(()=>{const p=(window as any).__slamLab.latest.estimate;return Math.hypot(p.x,p.y,p.z);});expect(displacement).toBeGreaterThan(.001);
  await expect(page.locator('#comparisons')).toContainText('8 pairs');
  await page.getByRole('button',{name:'Save project',exact:true}).click();await expect(page.locator('#saved')).toHaveText('Saved locally');
  await page.reload();await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.ready),{timeout:90000}).toBe(true);
  expect(await page.evaluate(()=>(window as any).__slamLab.project.algorithmArtifact.sourceSha256)).toBe(digest);
  expect(await page.evaluate(()=>(window as any).__slamLab.project.runtime)).toBe('modelica');
});
