import {D435_IMAGE} from "../../src/camera-profile";
import {test,expect} from '@playwright/test';
import {openModelicaPropagation} from './reference-project';
import {openConfiguration,openEditor} from './configuration-pane';

test('graphics quality preserves enterable Big city rooms and synchronized GPU sensor geometry',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto('/');await openModelicaPropagation(page);
  await page.evaluate(()=>{(window as any).__slamLab.runtime.pause();});
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  await openConfiguration(page);
  await expect(page.locator('#environment option[value="big-city"]')).toHaveText('Big city · furnished interiors');
  await page.getByLabel('Environment',{exact:true}).selectOption('big-city');
  await openEditor(page);
  await page.getByRole('button',{name:'Apply & reset',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.ready),{timeout:90000}).toBe(true);
  const result=await page.evaluate(async()=>{
    const lab=(window as any).__slamLab,runtime=lab.runtime,world=runtime.world;
    const profiles=[];
    world.configureActors(false,false);world.setDepthCloudEnabled(true);
    for(const detail of ['low','medium','high']){
      world.build('big-city',detail);await world.ready;
      const city=world.bigCity,rooms=[];
      for(const [index,interior] of city.interiors.entries()){
        const p=interior.entrance.inside,time=10+index;
        // Face through the open room's central aisle. FLU forward is body+X.
        const yaw=interior.id==='apartment'?-Math.PI/2:Math.PI/2;
        world.setActorMotion(await runtime.modelicaMath.call('actors',{time}));
        world.update({x:p[0],y:p[1],z:p[2],quaternion:[Math.cos(yaw/2),0,0,Math.sin(yaw/2)],time});
        const [local]=await world.captureSensorPair(false,'sync',false,true,false);await world.setSensorReadback('sync');
        const [worker,lidar]=await world.captureSensors(true);
        const same=(a:any,b:any)=>a.length===b.length&&a.every((v:number,i:number)=>v===b[i]);
        let minimum=Infinity,maximum=-Infinity;
        for(let i=0;i<local.rgb.length;i+=3){const value=local.rgb[i]+local.rgb[i+1]+local.rgb[i+2];minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);}
        rooms.push({id:interior.id,rgbParity:same(local.rgb,worker.rgb),depthParity:same(local.depth,worker.depth),
          rgbRange:maximum-minimum,validDepth:local.depth.filter((v:number)=>v>0).length,
          pixels:worker.rgb.length,depthPixels:worker.depth.length,lidarSamples:lidar.samples.length,
          renderUsesRawBuffer:world.lidarView.geometry.getAttribute('position').data.array===lidar.samples,
          lidarTime:lidar.time,cloudTime:(world.latestDepthRaster??world.latestDepthCloud).time,time});
      }
      world.render();
      profiles.push({detail,rooms,stats:city.stats,pixelRatio:world.renderer.getPixelRatio(),
        width:world.renderer.domElement.width,height:world.renderer.domElement.height,shadows:world.renderer.shadowMap.enabled,
        roofs:world.navigationRoofs.length,trainingBuildingVisible:world.navigation.group.visible});
    }
    return {profiles,dt:runtime.dt};
  });
  expect(errors).toEqual([]);expect(result.dt).toBe(1/30);
  expect(result.profiles[0].width).toBeLessThan(result.profiles[2].width);
  expect(result.profiles[0].height).toBeLessThan(result.profiles[2].height);
  expect(result.profiles[0].shadows).toBe(false);expect(result.profiles[2].shadows).toBe(true);
  expect(result.profiles[0].stats.triangles).toBeLessThan(result.profiles[2].stats.triangles);
  for(const profile of result.profiles){
    expect(profile.roofs).toBe(3);expect(profile.trainingBuildingVisible).toBe(false);
    for(const room of profile.rooms){
      expect(room.rgbParity).toBe(true);expect(room.depthParity).toBe(true);
      expect(room.rgbRange).toBeGreaterThan(40);expect(room.validDepth).toBeGreaterThan(1000);
      expect(room.pixels).toBe(D435_IMAGE.width*D435_IMAGE.height*3);expect(room.depthPixels).toBe(D435_IMAGE.width*D435_IMAGE.height);
      expect(room.lidarSamples).toBe(64*1024*4);expect(room.lidarTime).toBe(room.time);expect(room.cloudTime).toBe(room.time);
      expect(room.renderUsesRawBuffer).toBe(true);
    }
  }
  const before=await page.evaluate(()=>JSON.stringify((window as any).__slamLab.runtime.world.committedTruth));
  await openConfiguration(page);
  for(const room of ['store','apartment','conference','overview']){
    await page.getByLabel('Inspect Big city',{exact:true}).selectOption(room);
    await page.waitForTimeout(150); // Allow the 30 Hz presentation worker to draw the chosen camera.
    await page.locator('#world').screenshot({path:`test-results/big-city-${room}.png`});
  }
  expect(await page.evaluate(()=>JSON.stringify((window as any).__slamLab.runtime.world.committedTruth))).toBe(before);
  await page.screenshot({path:'test-results/big-city-quality.png',fullPage:true});
  console.log('BIG CITY GPU QUALITY',JSON.stringify(result));
});
