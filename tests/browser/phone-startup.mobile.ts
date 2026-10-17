import {test,expect,type Page} from '@playwright/test';

const run=(page:Page)=>page.getByRole('button',{name:'▶ Run',exact:true});

async function runsInertialBaseline(page:Page){
  await expect(page.locator('#startup-screen')).toBeHidden({timeout:90_000});
  await expect(run(page)).toBeEnabled({timeout:90_000});
  expect(await page.evaluate(()=>(window as any).__slamLab.project.algorithmArtifact.modelName)).toBe('SLAM.Examples.InertialOnly');
  await run(page).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.latest?.frame.sequence??-1),{timeout:90_000}).toBeGreaterThan(2);
}

test('a phone visitor reaches an enabled Run button and runs the inertial baseline',async({page})=>{
  await page.goto('/');
  await runsInertialBaseline(page);
});

test('a phone that blocks site storage still runs, with saving disabled',async({page})=>{
  // Safari with "Block All Cookies" (common on managed school phones) refuses IndexedDB.
  await page.addInitScript(()=>{
    IDBFactory.prototype.open=function(){throw new DOMException('The operation is insecure.','SecurityError');};
  });
  await page.goto('/');
  await runsInertialBaseline(page);
  await expect(page.locator('#saved')).toContainText('automatic saving disabled');
  await expect(page.locator('#status')).toContainText('download your project');
});

test('a rendering worker that never starts falls back to the page renderer',async({page})=>{
  test.setTimeout(180_000);
  await page.route('**/viewer.worker*',route=>route.fulfill({contentType:'text/javascript',body:'self.onmessage=()=>{};'}));
  await page.goto('/');
  await runsInertialBaseline(page);
  expect(await page.evaluate(()=>(window as any).__slamLab.viewer)).toBeUndefined();
});

test('a compiler that never finishes shows an error instead of a disabled Run button',async({page,context})=>{
  await page.clock.install();
  await context.route('**/vendor/rumoca/rumoca_bind_wasm_bg.wasm*',()=>{/* Held: the compiler never arrives. */});
  await page.goto('/');
  await expect(page.locator('#startup-message')).toContainText('Compiling',{timeout:60_000});
  await page.clock.fastForward('03:01');
  // Either the compiler's own init deadline or the startup deadline may fire first.
  await expect(page.locator('#startup-message')).toContainText('Unable to prepare SLAM Lab');
  await expect(page.locator('#startup-open')).toBeVisible();
});

test('a phone visitor can copy one line of run stats to report back',async({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text:string)=>{(window as any).__copied=text;}}});
  });
  await page.goto('/');
  await runsInertialBaseline(page);
  await page.getByRole('button',{name:'Copy stats',exact:true}).click();
  await expect(page.locator('#status')).toContainText('Stats copied');
  const copied:string=await page.evaluate(()=>(window as any).__copied);
  expect(copied).toContain('sim/wall');
  expect(copied).toContain('devicePixelRatio');
  expect(copied).toContain('Frame work:');
});
