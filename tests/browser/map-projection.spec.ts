import {test,expect} from '@playwright/test';
import {fullModelicaScenario} from './full-modelica-scenarios';
export const projectionFixture={initialPose:[8,-4,3],quaternion:[Math.SQRT1_2,0,0,Math.SQRT1_2],features:[[60,35,1],[80,45,1],[100,55,1]],wall:{scale:[10,10,.2],position:[8,3,-1]}};
test.fixme('full Modelica RGB-D map projection respects live and replay origins',async()=>{
 const report=await fullModelicaScenario('map-projection');
  expect(report.origin.x).toBe(8);expect(report.origin.y).toBe(-4);expect(report.origin.z).toBe(3);
  expect(report.rendered).toHaveLength(3);
  // The near face of the rendered wall lies at Three.js Z=-0.9 (ENU Y=0.9).
  for(const p of report.rendered){expect(p[2]).toBeCloseTo(-.9,4);expect(p[0]).toBeGreaterThan(6);expect(p[0]).toBeLessThan(10);expect(p[1]).toBeGreaterThan(2);expect(p[1]).toBeLessThan(4);}
  expect(report.environmentVisible).toBe(false);
  for(let i=0;i<report.map.length;i++) {
    const [x,y,z]=report.map[i];
    expect(report.liveRendered[i][0]).toBeCloseTo(x,5);expect(report.liveRendered[i][1]).toBeCloseTo(z,5);expect(report.liveRendered[i][2]).toBeCloseTo(-y,5);
  }
});
