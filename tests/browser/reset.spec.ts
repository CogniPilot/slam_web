import {test,expect} from '@playwright/test';

test('Reset reuses unchanged compiled workers, reproduces the initial step, and compiles edited source or explicit Apply',async({page})=>{
  test.setTimeout(180_000);
  await page.goto('/');
  const run=page.getByRole('button',{name:'▶ Run',exact:true});await expect(run).toBeEnabled({timeout:90_000});
  await page.evaluate(()=>{
    const r=(window as any).__slamLab.runtime,w=window as any;
    w.resetCompiles=0;const compile=r.compile.bind(r);r.compile=(...args:any[])=>{w.resetCompiles++;return compile(...args);};
    w.resetWorkerCalls=[];
    for(const key of ['physics','modelicaMath','modelicaState']){
      const worker=r[key],call=worker.call.bind(worker);worker.call=(type:string,...args:any[])=>{w.resetWorkerCalls.push([key,type]);return call(type,...args);};
    }
  });
  const step=async()=>{
    await page.getByRole('button',{name:'Step',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>{const r=(window as any).__slamLab.runtime;return !r.busy&&r.time>0;})).toBe(true);
    return page.evaluate(()=>{const lab=(window as any).__slamLab;return {truth:lab.latest.truth,estimate:lab.latest.estimate,imu:lab.latest.frame.imu,actors:lab.runtime.world.actorMotion};});
  };
  const first=await step();
  const reset=async()=>{
    await page.getByRole('button',{name:'↺ Reset',exact:true}).click();
    await expect(run).toBeEnabled({timeout:90_000});
    await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.time)).toBe(0);
  };
  await reset();expect(await page.evaluate(()=>(window as any).resetCompiles)).toBe(0);
  expect(await step()).toEqual(first);
  await page.locator('#name').fill('Renamed, unchanged model');
  await reset();expect(await page.evaluate(()=>(window as any).resetCompiles)).toBe(0);
  expect(await step()).toEqual(first);
  const calls=await page.evaluate(()=>(window as any).resetWorkerCalls);
  expect(calls.filter(([,type]:string[])=>type==='init')).toEqual([]);
  for(const key of ['physics','modelicaMath','modelicaState'])expect(calls.filter(([worker,type]:string[])=>worker===key&&type==='reset')).toHaveLength(2);
  // Editing the selected source must invalidate reuse even before Apply.
  await page.evaluate(()=>{const e=(window as any).__slamLab.sourceEditor.editor;e.setValue(e.getValue()+'\n// changed source');});
  await reset();expect(await page.evaluate(()=>(window as any).resetCompiles)).toBe(1);
  await page.getByRole('button',{name:'Apply & reset',exact:true}).click();
  await expect(run).toBeEnabled({timeout:90_000});
  expect(await page.evaluate(()=>(window as any).resetCompiles)).toBe(2);
});
