import {expect,test} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';

// The native programs need a paired D435 size, which software rendering does
// not provide. The selector must refuse clearly and the inertial baseline must
// come back unharmed; the deployment panel reflects what the site publishes.
test('native SLAM estimator refuses the software camera profile and the inertial baseline recovers',async({page})=>{
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>{const lab=(window as any).__slamLab;return lab?.initialized&&lab.ready&&lab.compiling===false;}),{timeout:90000}).toBe(true);
  const manifestPath='public/vendor/slam/manifest.json';
  const published=existsSync(manifestPath);
  const fmu=published&&!!JSON.parse(readFileSync(manifestPath,'utf8')).fmu;
  const state=page.locator('#deploy-state');
  await expect(state).toContainText(fmu?'FMI-LS WebAssembly':'not published',{timeout:15000});
  const link=page.locator('#download-fmu');
  if(fmu){
    await expect(link).not.toHaveAttribute('aria-disabled','true');
    const response=await page.request.head(await link.evaluate(a=>(a as HTMLAnchorElement).href));
    expect(response.ok()).toBe(true);
  } else await expect(link).toHaveAttribute('aria-disabled','true');
  await page.getByRole('tab',{name:'Configuration',exact:true}).click();
  await page.getByLabel('Estimator backend',{exact:true}).selectOption('native');
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.compiling),{timeout:90000}).toBe(false);
  await expect(page.locator('#status')).toHaveClass(/error/);
  await expect(page.locator('#status')).toContainText(published?/expects .* samples|cannot reserve|160x90.*not published/:'not published');
  expect(await page.evaluate(()=>(window as any).__slamLab.ready)).toBe(false);
  await page.getByLabel('Estimator backend',{exact:true}).selectOption('inertial');
  await expect.poll(()=>page.evaluate(()=>{const lab=(window as any).__slamLab;return lab.ready&&lab.compiling===false;}),{timeout:90000}).toBe(true);
  expect(await page.evaluate(()=>(window as any).__slamLab.project.slamBackend)).toBe('inertial');
  await page.getByRole('button',{name:'Step',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.latest?.frame.sequence??-1),{timeout:60000}).toBeGreaterThanOrEqual(0);
  await expect(page.locator('#flight-status')).toContainText('Inertial baseline');
});
