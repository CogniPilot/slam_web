import {openModelicaPropagation} from './reference-project';
import {test,expect} from '@playwright/test';

test('GPU 64-beam LiDAR returns radial FLU ranges for planes and restores capture state',async({page})=>{
  await page.goto('/');await openModelicaPropagation(page);
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.latest?.frame.sequence??-1),{timeout:90000}).toBeGreaterThan(1);
  await page.getByRole('button',{name:'Ⅱ Pause'}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  const report=await page.evaluate(async()=>{
    const world=(window as any).__slamLab.runtime.world,template=world.robot.children.find((object:any)=>object.isMesh);
    const scene=new world.scene.constructor(),sensor=new world.robot.constructor();scene.add(sensor);
    const meshes:any[]=[];
    const box=(size:number[],position:number[])=>{
      const mesh=new template.constructor(new template.geometry.constructor(...size),template.material.clone());
      mesh.position.set(...position);scene.add(mesh);meshes.push(mesh);return mesh;
    };
    box([.1,20,20],[5.05,0,0]);box([.1,20,20],[-6.05,0,0]);
    box([20,20,.1],[0,0,-4.05]);box([20,20,.1],[0,0,3.05]);
    box([20,.1,20],[0,-2.05,0]);box([20,.1,20],[0,8.05,0]);
    const blocker=box([.1,1,1],[1.05,0,0]);
    const scanner=new world.lidar.constructor(world.renderer,scene,{columns:1024,cubeResolution:512,near:.1,far:80});
    const reference=new world.lidar.constructor(world.renderer,scene,{columns:1024,cubeResolution:512,near:.1,far:80,cubeFaces:6});
    try {
      const previousTarget=world.renderer.getRenderTarget(),background=scene.background,override=scene.overrideMaterial;
      const pending=scanner.capture(sensor,12.3,[blocker]);
      const restoredBeforeAwait=blocker.visible&&scene.background===background&&scene.overrideMaterial===override&&world.renderer.getRenderTarget()===previousTarget;
      // Independent host oracle is confined to this test. Production hands off
      // the exact dense GPU buffer and does not decode or compact it.
      const elevationAt=(beam:number)=>(15-40*beam/63)*Math.PI/180;
      const rangeAt=(scan:any,index:number)=>scan.samples[4*index+3]/16777214*scan.far;
      const scan=await pending,beam=24,elevation=elevationAt(beam);
      const front=rangeAt(scan,beam*1024),side=rangeAt(scan,beam*1024+256),top=rangeAt(scan,0),floor=rangeAt(scan,63*1024);
      const frontPoint=Array.from(scan.samples.slice(4*beam*1024,4*beam*1024+3));
      const firstTiming={...scanner.timings};
      const same=(a:Float32Array,b:Float32Array)=>a.length===b.length&&new Uint32Array(a.buffer,a.byteOffset,a.length).every((v,i)=>v===new Uint32Array(b.buffer,b.byteOffset,b.length)[i]);
      const direct=new Float32Array(scan.samples.length);
      world.renderer.readRenderTargetPixels(scanner.target,0,0,1024,64,direct);
      const unmodifiedGpuBytes=same(scan.samples,direct);
      const parity=[];let projectionError=0;
      for(const rotation of [[0,0,0],[.31,1.2,-.47]]){
        sensor.rotation.set(...rotation);
        const four=await scanner.capture(sensor,12.3,[blocker],'sync');
        const six=await reference.capture(sensor,12.3,[blocker],'sync');
        const asyncScan=await scanner.capture(sensor,12.3,[blocker],'async');
        parity.push({samples:same(four.samples,six.samples),asyncSamples:same(four.samples,asyncScan.samples)});
        for(let beam=0;beam<64;beam++)for(let col=0;col<1024;col++){
          const index=beam*1024+col,range=rangeAt(four,index);if(!range)continue;
          const elevation=(15-40*beam/63)*Math.PI/180,azimuth=2*Math.PI*col/1024;
          const expected=[range*Math.cos(elevation)*Math.cos(azimuth),range*Math.cos(elevation)*Math.sin(azimuth),range*Math.sin(elevation)];
          for(let axis=0;axis<3;axis++)projectionError=Math.max(projectionError,Math.abs(four.samples[index*4+axis]-expected[axis]));
        }
      }
      sensor.rotation.set(0,0,0);
      sensor.rotation.y=Math.PI/2;
      const rotated=await scanner.capture(sensor,12.4,[blocker]);
      scene.remove(...meshes);
      const empty=await scanner.capture(sensor,12.5);
      return {restoredBeforeAwait,frame:scan.frame,beams:scan.beams,columns:scan.columns,time:scan.time,
        front,side,top,floor,elevation,topElevation:elevationAt(0),floorElevation:elevationAt(63),frontPoint,
        allValid:Array.from({length:64*1024},(_,i)=>rangeAt(scan,i)).every(r=>Number.isFinite(r)&&r>0),sampleValues:scan.samples.length,
        rotatedFront:rangeAt(rotated,beam*1024),rotatedSide:rangeAt(rotated,beam*1024+256),
        emptySamples:empty.samples.every((r:number)=>r===0),unmodifiedGpuBytes,format:scan.format,timing:firstTiming,parity,projectionError};
    }finally{
      scanner.dispose();reference.dispose();for(const mesh of meshes){mesh.geometry.dispose();mesh.material.dispose();}
    }
  });
  expect(report.restoredBeforeAwait).toBe(true);
  expect(report.frame).toBe('FLU');expect(report.beams).toBe(64);expect(report.columns).toBe(1024);expect(report.time).toBe(12.3);
  // Nearest cube texels quantize direction; this tolerance includes that sampling.
  expect(Math.abs(report.front*Math.cos(report.elevation)-5)).toBeLessThan(.06);
  expect(Math.abs(report.side*Math.cos(report.elevation)-4)).toBeLessThan(.06);
  expect(Math.abs(report.top*Math.cos(report.topElevation)-5)).toBeLessThan(.06);
  expect(Math.abs(report.floor*Math.sin(report.floorElevation)+2)).toBeLessThan(.06);
  expect(Math.abs(Number(report.frontPoint[0])-5)).toBeLessThan(.06);
  expect(report.allValid).toBe(true);expect(report.sampleValues).toBe(64*1024*4);expect(report.format).toBe('FLU_XYZ_PACK24');
  expect(Math.abs(report.rotatedFront*Math.cos(report.elevation)-4)).toBeLessThan(.06);
  expect(Math.abs(report.rotatedSide*Math.cos(report.elevation)-6)).toBeLessThan(.06);
  expect(report.emptySamples).toBe(true);
  expect(report.unmodifiedGpuBytes).toBe(true);
  expect(report.timing.method).toContain('GPU cube');
  expect(report.timing.faces).toBe(4);expect(report.timing.readbackBytes).toBe(64*1024*16);
  expect(report.parity).toEqual(Array(2).fill({samples:true,asyncSamples:true}));
  expect(report.projectionError).toBeLessThan(.00002);
  for(const field of ['submitMs','waitMs','handoffMs','totalMs'])expect(Number.isFinite(report.timing[field])&&report.timing[field]>=0).toBe(true);
  console.log('LIDAR PLANES',report);
});
