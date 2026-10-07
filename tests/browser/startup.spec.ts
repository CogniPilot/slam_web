import {test,expect} from '@playwright/test';

test('a fresh visitor starts the prepared inertial experiment with Run alone',async({page})=>{
  await page.goto('/');
  const run=page.getByRole('button',{name:'▶ Run',exact:true});
  await expect(run).toBeEnabled({timeout:90_000});
  expect(await page.evaluate(()=>(window as any).__slamLab.runtime.running)).toBe(false);
  await expect(page.getByLabel('Node preset')).toHaveValue('Modelica inertial propagation');
  await run.click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.latest?.frame.sequence??-1),{timeout:90_000}).toBeGreaterThan(2);
  await expect(page.getByRole('button',{name:'Ⅱ Pause',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__slamLab.latest.estimate.diagnostics.backend)).toBe('Rumoca Solve IR session');
  const sensor=await page.evaluate(()=>{
    const lab=(window as any).__slamLab,{frame}=lab.latest;
    return {software:lab.runtime.world.graphics.acceleration==='software',width:frame.calibration.width,height:frame.calibration.height,rgb:frame.rgb.length,depth:frame.depth.length,profile:frame.capture.sensorProfile};
  });
  expect(sensor.rgb).toBe(sensor.width*sensor.height*3);expect(sensor.depth).toBe(sensor.width*sensor.height);
  expect([sensor.width,sensor.height]).toEqual(sensor.software?[160,90]:[848,480]);
  if(sensor.software){await expect(page.locator('#render-warning')).toBeVisible();await expect(page.locator('#render-warning')).toContainText('CPU');expect(sensor.profile).toBe('software');}
  else await expect(page.locator('#render-warning')).toBeHidden();
});

test.describe('phone layout',()=>{
  test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  test('lightweight defaults, scrollable editor and Run without Apply',async({page})=>{
    await page.goto('/');
    const run=page.getByRole('button',{name:'▶ Run',exact:true});
    await expect(run).toBeEnabled({timeout:90_000});
    const layout=await page.evaluate(()=>{
      const lab=(window as any).__slamLab;
      return {project:lab.project,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
        world:document.querySelector('.visuals')!.getBoundingClientRect().bottom,
        editor:document.querySelector('.editor')!.getBoundingClientRect().top};
    });
    expect(layout.project).toMatchObject({environment:'city',sceneDetail:'low',lidarEnabled:false,depthCloudEnabled:false});
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
    expect(layout.editor).toBeGreaterThanOrEqual(layout.world);
    await expect(page.getByRole('heading',{name:'Node graph',exact:true})).toHaveCount(0);
    await expect(run).toBeInViewport();
    await run.click();
    await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.latest?.frame.sequence??-1),{timeout:90_000}).toBeGreaterThan(2);
    await page.getByRole('tab',{name:'Configuration',exact:true}).click();
    await expect(page.getByLabel('Environment',{exact:true})).toHaveValue('city');
    await page.screenshot({path:'test-results/mobile-startup.png',fullPage:true});
  });
});
