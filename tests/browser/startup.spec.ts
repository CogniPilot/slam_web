import {test,expect} from '@playwright/test';

test('a fresh visitor sees progress until the inertial experiment is ready, then starts with Run alone',async({page,context})=>{
  let releaseCompiler!:()=>void;
  const compilerAllowed=new Promise<void>(resolve=>{releaseCompiler=resolve;});
  await context.route('**/vendor/rumoca/rumoca_bind_wasm_bg.wasm',async route=>{
    await compilerAllowed;await route.continue();
  });
  await page.goto('/');
  await expect(page.getByRole('progressbar',{name:'Loading SLAM Lab'})).toBeVisible();
  await expect(page.locator('#app')).toHaveJSProperty('inert',true);
  await expect(page.locator('#app')).toBeHidden();
  // Hidden contents still have dimensions for Three.js and Monaco initialization.
  expect(await page.locator('#world').evaluate(element=>element.clientWidth)).toBeGreaterThan(0);
  releaseCompiler();
  await expect(page.locator('#startup-screen')).toBeHidden({timeout:90_000});
  await expect(page.locator('#app')).toHaveJSProperty('inert',false);
  await expect(page.locator('#app')).toHaveAttribute('aria-busy','false');
  const run=page.getByRole('button',{name:'▶ Run',exact:true});
  await expect(run).toBeEnabled({timeout:90_000});
  expect(await page.evaluate(()=>(window as any).__slamLab.runtime.running)).toBe(false);
  await expect(page.getByLabel('Run model')).toHaveValue('Examples.InertialOnly');
  await run.click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.latest?.frame.sequence??-1),{timeout:90_000}).toBeGreaterThan(2);
  await expect(page.getByRole('button',{name:'Ⅱ Pause',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__slamLab.latest.estimate.diagnostics.backend)).toBe('Rumoca Solve IR session');
  expect(await page.evaluate(()=>(window as any).__slamLab.project.algorithmArtifact.modelName)).toBe('Examples.InertialOnly');
  const sensor=await page.evaluate(()=>{
    const lab=(window as any).__slamLab,{frame}=lab.latest;
    return {software:lab.runtime.world.graphics.acceleration==='software',width:frame.calibration.width,height:frame.calibration.height,rgb:frame.rgb.length,depth:frame.depth.length,profile:frame.capture.sensorProfile};
  });
  expect(sensor.rgb).toBe(sensor.width*sensor.height*3);expect(sensor.depth).toBe(sensor.width*sensor.height);
  expect([sensor.width,sensor.height]).toEqual(sensor.software?[160,90]:[848,480]);
  if(sensor.software){await expect(page.locator('#render-warning')).toBeVisible();await expect(page.locator('#render-warning')).toContainText('CPU');expect(sensor.profile).toBe('software');}
  else await expect(page.locator('#render-warning')).toBeHidden();
});

test('failed initial compilation offers source recovery instead of an endless loading screen',async({page})=>{
  await page.goto('/');
  await expect(page.locator('#startup-screen')).toBeHidden({timeout:90_000});
  await page.evaluate(async()=>{
    const lab=(window as any).__slamLab;
    lab.project.algorithm='within Examples; model InertialOnly Real x; equation x=; end InertialOnly;';
    await new Promise<void>((resolve,reject)=>{
      const request=indexedDB.open('slam-lab-projects',1);
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{
        const db=request.result,tx=db.transaction('projects','readwrite');
        tx.objectStore('projects').put(lab.project,'slam-lab.project.v1');
        tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
      };
    });
  });
  await page.reload();
  await expect(page.locator('#startup-message')).toContainText('Unable to prepare SLAM Lab',{timeout:90_000});
  await expect(page.getByRole('progressbar')).toBeHidden();
  await page.getByRole('button',{name:'Open workspace',exact:true}).click();
  await expect(page.locator('#startup-screen')).toBeHidden();
  await expect(page.locator('.monaco-editor')).toBeVisible();
  expect(await page.getByLabel('Modelica source').inputValue()).toContain('equation x=;');
  await expect(page.locator('#status')).toHaveClass(/error/);
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
