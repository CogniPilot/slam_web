import {openModelicaPropagation} from './reference-project';
import {test,expect} from '@playwright/test';

test('camera RGB is sRGB, wall textures survive detail changes, and axial depth stays raw',async({page})=>{
  await page.goto('/');await openModelicaPropagation(page);
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.ready),{timeout:90000}).toBe(true);
  await page.getByRole('button',{name:'Ⅱ Pause'}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  const report=await page.evaluate(()=>{
    const world=(window as any).__slamLab.runtime.world;
    const snapshots=[];
    for(const detail of ['low','medium','high']) {
      world.build('city',detail);world.render();
      snapshots.push({detail,instances:world.environment.children.reduce((n:number,mesh:any)=>n+mesh.count,0),batches:world.environment.children.length,
        textured:world.environment.children.filter((mesh:any)=>mesh.material.map).length,textures:world.renderer.info.memory.textures});
    }
    const firstTextureCount=world.renderer.info.memory.textures;
    for(let i=0;i<4;i++){world.build('city','high');world.render();}
    const rebuiltTextureCount=world.renderer.info.memory.textures;
    // A twenty-metre flat plane perpendicular to camera +X has exactly four
    // metres optical-Z at every pixel. It detects color encoding accidentally
    // applied to the 24-bit axial-depth payload, including away from centre.
    const sample=world.environment.children[0],geometry=sample.geometry.clone();
    const Wall=sample.constructor,wall=new Wall(geometry,world.materials.solid(0x808080),1);
    const matrix=world.robot.matrix.clone();matrix.makeScale(.2,20,20);matrix.setPosition(4.28,1.46,0);wall.setMatrixAt(0,matrix);wall.instanceMatrix.needsUpdate=true;
    world.environment.clear();world.environment.add(wall);world.environment.visible=true;
    world.robot.position.set(0,1.5,0);world.robot.quaternion.set(0,0,0,1);world.robot.updateMatrixWorld(true);
    const encoded=world.capture();
    const rgbTarget=world.rgbTarget,Target=rgbTarget.constructor;
    const linearTarget=new Target(160,90,{depthBuffer:true,type:rgbTarget.texture.type,colorSpace:world.depthTarget.texture.colorSpace});
    world.rgbTarget=linearTarget;const linear=world.capture();world.rgbTarget=rgbTarget;linearTarget.dispose();
    const at=(buffer:Uint8Array,x:number,y:number)=>Array.from(buffer.slice((y*160+x)*4,(y*160+x)*4+3));
    const rgbEncoded=at(encoded.rgb,80,45),rgbLinear=at(linear.rgb,80,45);
    // Restore a genuine metric-brick material on the same flat plane, and
    // measure horizontal pixel variation with unchanged flat surface depth.
    wall.material=world.materials.surface('brick',0xba7253);
    const textured=world.capture();
    const row=Array.from({length:100},(_,i)=>textured.rgb[(45*160+30+i)*4]);
    const depths=[0,79,80,159,20*160+35,45*160+80,89*160+159].map(i=>encoded.depth[i]);
    return {snapshots,firstTextureCount,rebuiltTextureCount,rgbEncoded,rgbLinear,depths,
      textureRange:Math.max(...row)-Math.min(...row),rawDepthColorSpace:world.depthTarget.texture.colorSpace,
      rgbColorSpace:world.rgbTarget.texture.colorSpace};
  });
  expect(report.snapshots[0].instances).toBeLessThan(report.snapshots[1].instances);
  expect(report.snapshots[1].instances).toBeLessThan(report.snapshots[2].instances);
  for(const snapshot of report.snapshots){expect(snapshot.textured).toBeGreaterThan(5);expect(snapshot.batches).toBeLessThanOrEqual(32);}
  expect(report.rebuiltTextureCount).toBe(report.firstTextureCount);
  expect(report.rgbColorSpace).toBe('srgb');expect(report.rawDepthColorSpace).toBe('');
  for(let channel=0;channel<3;channel++) {
    const linear=report.rgbLinear[channel]/255;
    const expected=Math.round(255*(linear<=.0031308?12.92*linear:1.055*Math.pow(linear,1/2.4)-.055));
    expect(Math.abs(report.rgbEncoded[channel]-expected)).toBeLessThanOrEqual(2);
    expect(report.rgbEncoded[channel]).toBeGreaterThan(report.rgbLinear[channel]+20);
  }
  for(const depth of report.depths)expect(depth).toBeCloseTo(4,4);
  expect(report.textureRange).toBeGreaterThan(15);
});
