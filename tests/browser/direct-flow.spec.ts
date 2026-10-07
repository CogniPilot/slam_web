import {test,expect} from '@playwright/test';
import {openModelicaPropagation} from './reference-project';

test('camera/INS baseline keeps vision pending and never loads the retired compiler adapter',async({page})=>{
 const requests:string[]=[];page.on('request',request=>requests.push(request.url()));
 await page.goto('/');await openModelicaPropagation(page);
 await page.evaluate(()=>(window as any).__slamLab.runtime.pause());
 await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
 const result=await page.evaluate(async()=>{
  const lab=(window as any).__slamLab,r=lab.runtime,state=r.modelicaState;
  const original=state.worker.postMessage.bind(state.worker);let imuFrame:any;
  state.worker.postMessage=(message:any,...rest:any[])=>{if(message.type==='step')imuFrame=message.frame;return original(message,...rest);};
  try{
   await r.step();const {frame,estimate,truth}=lab.latest;
   return {imuKeys:Object.keys(imuFrame).sort(),sameImu:imuFrame.imu===frame.imu,sameIntervals:imuFrame.imuIntervals===frame.imuIntervals,
    rgbBytes:frame.rgb.byteLength,depthBytes:frame.depth.byteLength,layout:frame.imageLayout,
    rawTypes:frame.rgb instanceof Uint8Array&&frame.depth instanceof Uint16Array,
    shared:frame.rgb.buffer===frame.depth.buffer,pending:Array.from(r.pendingNodes),features:estimate.features,
    artifact:lab.project.detectorArtifact,detectorActivity:r.flow.stats.has('lab/node/detector/features'),
    allTimesMatch:imuFrame.time===frame.time&&truth.time===frame.time,
    dt:frame.dt,cameraHz:r.sensorClock.rates.cameraHz,intervalDuration:frame.imuIntervals.reduce((sum:number,x:any)=>sum+x.dt,0),
    noise:frame.capture.depthNoise,depthPreviewGpu:!!document.querySelector<HTMLCanvasElement>('#depth')!.getContext('webgl2')};
  }finally{state.worker.postMessage=original;}
 });
 expect(result.imuKeys).toEqual(['dt','imu','imuIntervals','time']);
 for(const key of ['sameImu','sameIntervals','allTimesMatch','depthPreviewGpu'] as const)expect(result[key]).toBe(true);
 expect(result.rgbBytes).toBe(848*480*3);expect(result.depthBytes).toBe(848*480*2);
 expect(result.rawTypes).toBe(true);expect(result.shared).toBe(true);
 expect(result.layout).toMatchObject({rowOrder:'top-down',aligned:false,clockDomain:'simulation',color:{format:'RGB8',strideBytes:2544},depth:{format:'Z16',strideBytes:1696,unitsMeters:.001,isBigEndian:false}});
 expect(result.dt).toBe(1/result.cameraHz);expect(result.intervalDuration).toBeCloseTo(result.dt,12);
 expect(result.pending).toEqual([['detector','Rumoca native full-frame feature detection pending']]);
 expect(result.features).toBeUndefined();expect(result.artifact).toBeUndefined();expect(result.detectorActivity).toBe(false);
 expect(result.noise.model).toBe('independent-pixel-hash-v1');
 expect(requests.some(url=>/modelica-vision|wabt|modelica-.*raster-export/.test(url))).toBe(false);
 await expect(page.locator('#metric-features')).toHaveText('Pending');
});
