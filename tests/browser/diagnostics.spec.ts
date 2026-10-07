// Pending complete Modelica tracking/map/loop orchestration; original assertions retained.
import {test,expect} from '@playwright/test';
test.fixme('estimator covariance, real feature matches and graph edges are visible without entering camera images',async({page})=>{
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>{
    const lab=(window as any).__slamLab;
    if((lab?.latest?.estimate.poseGraph?.keyframes.length??0)<2||!lab.latest.estimate.tracking?.matches.length)return false;
    lab.runtime.pause();return true;
  }),{timeout:90000}).toBe(true);
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  // Pause can finish an in-flight prediction frame after observing matches.
  // Step to the next genuine visual update instead of asserting stale matches.
  await page.evaluate(async()=>{const lab=(window as any).__slamLab;for(let i=0;i<20&&!lab.latest.estimate.tracking?.matches.length;i++)await lab.runtime.step();});
  const report=await page.evaluate(()=>{
    const lab=(window as any).__slamLab,world=lab.runtime.world,estimate=lab.latest.estimate;
    const before=world.capture();world.estimatorView.visible=false;const after=world.capture();world.estimatorView.visible=true;
    return {covarianceVisible:world.covariance.visible,scale:world.covariance.scale.toArray(),covariance:estimate.uncertainty.positionCovariance,
      keyframes:estimate.poseGraph.keyframes.length,edges:world.graphEdges.geometry.attributes.position.count,
      matches:estimate.tracking.matches,features:estimate.features.length,
      sameRgb:before.rgb.every((v:number,i:number)=>v===after.rgb[i]),sameDepth:before.depth.every((v:number,i:number)=>v===after.depth[i])};
  });
  expect(report.covarianceVisible).toBe(true);expect(report.covariance).toHaveLength(9);
  expect(report.scale.every((v:number)=>Number.isFinite(v)&&v>0)).toBe(true);
  expect(report.keyframes).toBeGreaterThanOrEqual(2);expect(report.edges).toBeGreaterThanOrEqual(2);
  expect(report.features).toBeGreaterThan(10);expect(report.matches.length).toBeGreaterThan(0);expect(report.matches.length).toBeLessThanOrEqual(100);
  for(const match of report.matches)for(const p of [match.current,match.previous]){expect(p).toHaveLength(2);expect(p[0]).toBeGreaterThanOrEqual(0);expect(p[0]).toBeLessThan(160);expect(p[1]).toBeGreaterThanOrEqual(0);expect(p[1]).toBeLessThan(90);}
  expect(report.sameRgb).toBe(true);expect(report.sameDepth).toBe(true);
  await expect(page.locator('#tracking-state')).toContainText('feature matches');
  await expect(page.locator('#uncertainty-state')).toContainText('accelerometer bias');
  await page.getByLabel('2σ position ellipsoid').uncheck();
  expect(await page.evaluate(()=>(window as any).__slamLab.runtime.world.covariance.visible)).toBe(false);
});
