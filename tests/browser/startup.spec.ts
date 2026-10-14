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
  await expect(page.getByLabel('Run model')).toHaveValue('SLAM.Examples.InertialOnly');
  await run.click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.latest?.frame.sequence??-1),{timeout:90_000}).toBeGreaterThan(2);
  await expect(page.getByRole('button',{name:'Ⅱ Pause',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__slamLab.latest.estimate.diagnostics.backend)).toBe('Rumoca Solve IR session');
  expect(await page.evaluate(()=>(window as any).__slamLab.project.algorithmArtifact.modelName)).toBe('SLAM.Examples.InertialOnly');
  const sensor=await page.evaluate(()=>{
    const lab=(window as any).__slamLab,{frame}=lab.latest;
    return {software:lab.runtime.world.graphics.acceleration==='software',width:frame.calibration.width,height:frame.calibration.height,rgb:frame.rgb.length,depth:frame.depth.length,profile:frame.capture.sensorProfile};
  });
  expect(sensor.rgb).toBe(sensor.width*sensor.height*3);expect(sensor.depth).toBe(sensor.width*sensor.height);
  expect([sensor.width,sensor.height]).toEqual(sensor.software?[160,90]:[424,240]);
  await expect(page.locator('#sensor-rate-summary')).toContainText(`${sensor.width} × ${sensor.height}`);
  if(sensor.software){await expect(page.locator('#render-warning')).toBeVisible();await expect(page.locator('#render-warning')).toContainText('CPU');expect(sensor.profile).toBe('software');}
  else await expect(page.locator('#render-warning')).toBeHidden();
});

test('recovers a failed saved model with current defaults and keeps an exact downloadable backup',async({page})=>{
  test.setTimeout(180_000); // Initial preparation, recovery, and a fresh reload.
  await page.goto('/');
  await expect(page.locator('#startup-screen')).toBeHidden({timeout:90_000});
  const original=await page.evaluate(async()=>{
    const project=structuredClone((window as any).__slamLab.project);
    project.algorithm='within Examples; model InertialOnly Real x; equation x=; end InertialOnly;';
    project.name='Warehouse saved experiment';project.environment='warehouse';project.cameraResolution='640x360';project.carsEnabled=false;
    await new Promise<void>((resolve,reject)=>{
      const request=indexedDB.open('slam-lab-projects',1);
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{
        const db=request.result,tx=db.transaction('projects','readwrite');
        tx.objectStore('projects').put(project,'slam-lab.project.v1');
        tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
      };
    });return project;
  });
  await page.reload();
  await expect(page.getByRole('button',{name:'▶ Run',exact:true})).toBeEnabled({timeout:90_000});
  await expect(page.locator('#model-recovery')).toContainText('Loaded current default models');
  const recovered=await page.evaluate(()=>(window as any).__slamLab.project);
  expect(recovered).toMatchObject({name:original.name,environment:'warehouse',cameraResolution:'640x360',carsEnabled:false});
  expect(recovered.algorithm).not.toBe(original.algorithm);
  const backup=await page.evaluate(()=>new Promise<any>((resolve,reject)=>{
    const request=indexedDB.open('slam-lab-projects',1);
    request.onsuccess=()=>{
      const db=request.result,store=db.transaction('projects','readonly').objectStore('projects');
      const latest=store.get('slam-lab.project.v1.recovery');latest.onsuccess=()=>{
        const saved=store.get('slam-lab.project.v1.recovery.'+latest.result);
        saved.onsuccess=()=>{resolve(saved.result);db.close();};saved.onerror=()=>reject(saved.error);
      };latest.onerror=()=>reject(latest.error);
    };request.onerror=()=>reject(request.error);
  }));
  expect(JSON.parse(backup.text)).toEqual(original);
  expect(backup.reason).toContain('Error');
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download previous model',exact:true}).click();
  expect((await download).suggestedFilename()).toBe('previous-model.slam.json');
  await page.reload();
  await expect(page.getByRole('button',{name:'▶ Run',exact:true})).toBeEnabled({timeout:90_000});
  await expect(page.locator('#model-recovery')).toContainText('Previous model backup available');
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
