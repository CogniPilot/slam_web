// Follow the public startup flow before a diagnostic takes over lockstep.
export async function startProfileRun(page,minimumSequence=2){
  await page.locator('#startup-screen').waitFor({state:'hidden',timeout:90000});
  await page.waitForFunction(()=>window.__slamLab?.ready===true,null,{timeout:90000});
  if(!await page.evaluate(()=>window.__slamLab.runtime.running))await page.locator('#run').click();
  await page.waitForFunction(sequence=>window.__slamLab?.latest?.frame.sequence>=sequence,
    minimumSequence,{timeout:90000});
  await page.evaluate(async()=>{
    const runtime=window.__slamLab.runtime;runtime.pause();
    while(runtime.busy)await new Promise(resolve=>setTimeout(resolve,10));
  });
}
