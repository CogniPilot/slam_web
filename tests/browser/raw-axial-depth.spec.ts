import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {writeFileSync} from 'node:fs';

// Bundle the actual camera component, without starting a numerical backend.
// This fixture uses the preview's real model/texture assets and WebGL renderer.
test('raw axial Float32 transport preserves geometry, bits, skinning and capture state',async({page})=>{
  const bundle=await build({stdin:{contents:"import * as THREE from 'three';import {World,D435} from './src/world';globalThis.__rawDepthFixture={THREE,World,D435};",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',define:{'import.meta.env.BASE_URL':'"/"'},logLevel:'silent'});
  await page.route('**/__raw-depth-fixture__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Raw axial depth fixture</title>'}));
  await page.goto('/__raw-depth-fixture__');
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const report=await page.evaluate(async()=>{
    const {THREE,World,D435:c}=(globalThis as any).__rawDepthFixture;
    const world=new World({canvas:new OffscreenCanvas(640,400),width:640,height:400,pixelRatio:1,base:location.origin+'/'});
    await world.ready;world.configureActors(false,false);world.actors.group.visible=false;world.navigation.group.visible=false;
    world.sensorGeometryBatches.clear();world.environment.clear();world.scene.fog=null;
    world.update({time:1,x:0,y:0,z:1.5,quaternion:[1,0,0,0],velocity:[0,0,0],accel:[0,0,0],gyro:[0,0,0]});
    world.setDepthCloudEnabled(true);
    const gl=world.renderer.getContext(),originalBackground=world.scene.background;
    world.renderer.setClearColor(0x123456,.37);gl.enable(gl.DITHER);
    const savedColor=world.renderer.getClearColor(new THREE.Color()).getHex(),savedAlpha=world.renderer.getClearAlpha();
    const state=()=>world.scene.background===originalBackground&&world.scene.overrideMaterial===null&&world.renderer.getClearColor(new THREE.Color()).getHex()===savedColor&&world.renderer.getClearAlpha()===savedAlpha&&gl.isEnabled(gl.DITHER);
    const blank=await world.captureAsync('async');
    const blankZero=new Uint32Array(blank.depth.buffer).every((bits:number)=>bits===0)&&blank.depthCloud.samples.every((v:number)=>v===0);
    const material=new THREE.MeshBasicMaterial({color:0x808080,side:THREE.DoubleSide});
    const plane=(a:number,b=0,d=0,width=40,height=40)=>{
      const normal=new THREE.Vector3(1,d,-b).normalize(),x=new THREE.Vector3(b,0,1).normalize(),y=new THREE.Vector3().crossVectors(normal,x);
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),material);
      mesh.position.set(c.forward+a,1.5+c.up,0);mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,normal));
      world.environment.add(mesh);return mesh;
    };
    const a=4.125,b=.17,d=-.11,tilted=plane(a,b,d,14,10);
    const sync=await world.captureAsync('sync'),asyncResult=await world.captureAsync('async'),debug=world.capture();
    const words=(array:Uint8Array|Float32Array)=>new Uint8Array(array.buffer,array.byteOffset,array.byteLength);
    const same=(left:Uint8Array|Float32Array,right:Uint8Array|Float32Array)=>words(left).every((value,index)=>value===words(right)[index]);
    const modesEqual=same(sync.depth,asyncResult.depth)&&same(sync.depth,debug.depth)&&same(sync.rgb,asyncResult.rgb)&&same(sync.rgb,debug.rgb)&&same(sync.depthCloud.samples,asyncResult.depthCloud.samples);
    let planeError=0,cloudError=0,maxExpectedDepth=0,cloudDepthBitsEqual=true,worstPlane:{row:number;column:number;actual:number;expected:number}|undefined;
    const depthWords=new Uint32Array(sync.depth.buffer),cloudWords=new Uint32Array(sync.depthCloud.samples.buffer);
    for(let row=0;row<c.height;row++)for(let column=0;column<c.width;column++){
      const index=row*c.width+column,z=sync.depth[index],expected=a/(1-b*(column-c.cx)/c.fx-d*(row-c.cy)/c.fy);
      maxExpectedDepth=Math.max(maxExpectedDepth,expected);
      if(Math.abs(z-expected)>planeError){planeError=Math.abs(z-expected);worstPlane={row,column,actual:z,expected};}
      const offset=((c.height-1-row)*c.width+column)*4,expectedPoint=[z,-(column-c.cx)*z/c.fx,-(row-c.cy)*z/c.fy];
      for(let axis=0;axis<3;axis++)cloudError=Math.max(cloudError,Math.abs(sync.depthCloud.samples[offset+axis]-expectedPoint[axis]));
      cloudDepthBitsEqual&&=cloudWords[offset+3]===depthWords[index];
    }
    // A rasterizer may quantize screen vertices to its subpixel grid. Inverse
    // depth is affine on this plane: moving each screen vertex by at most one
    // grid step perturbs q=1/z by |dq/du|eps+|dq/dv|eps. Perspective barycentric
    // weights are convex, so the same bound holds at every covered pixel.
    const subpixelBits=gl.getParameter(gl.SUBPIXEL_BITS),gridStep=2**(-subpixelBits);
    const inverseDepthError=(Math.abs(b)/c.fx+Math.abs(d)/c.fy)/a*gridStep;
    const rasterBound=maxExpectedDepth**2*inverseDepthError/(1-maxExpectedDepth*inverseDepthError);
    // Float32 transforms, clipping and reciprocal interpolation add roundoff;
    // reserve 64 machine epsilons, independently of the observed GPU error.
    const planeTolerance=rasterBound+64*2**-23*maxExpectedDepth;
    const centerRow=Math.floor(c.height/2),centerColumn=Math.floor(c.width/2),centerIndex=centerRow*c.width+centerColumn;
    const top=sync.depth[centerColumn],bottom=sync.depth[(c.height-1)*c.width+centerColumn];
    const expectedTop=a/(1-b*(centerColumn-c.cx)/c.fx+d*c.cy/c.fy);
    const expectedBottom=a/(1-b*(centerColumn-c.cx)/c.fx-d*(c.height-1-c.cy)/c.fy);
    world.environment.remove(tilted);
    const ranges=[];
    for(const z of [.2,c.near+.001,c.far-.001,c.far,c.far+.01]){
      const wall=plane(z),frame=await world.captureAsync('sync');
      ranges.push({z,center:frame.depth[centerIndex],invalidCloud:frame.depth[centerIndex]===0?frame.depthCloud.samples.every((v:number)=>v===0):undefined});
      world.environment.remove(wall);
    }
    // Test the actual fragment encoder with uniform words, separating exact
    // byte transport from finite raster interpolation of the camera geometry.
    const encoder=world.depthMaterial,constantEncoder=encoder.clone();
    constantEncoder.fragmentShader=encoder.fragmentShader.replace('varying float z;','uniform float z;');constantEncoder.uniforms.z={value:0};world.depthMaterial=constantEncoder;
    const wordPlane=plane(4),wordCases=[];
    const inputs=new Float32Array([0,-0,-1,.28,.281,.5,1,1+2**-23,Math.PI,4.123456,5.9999995,9.999,10,NaN,Infinity,-Infinity]);
    const inputWords=new Uint32Array(inputs.buffer);
    for(let index=0;index<inputs.length;index++){
      const value=inputs[index];constantEncoder.uniforms.z.value=value;
      const frame=await world.captureAsync('sync'),valid=value>=Math.fround(c.near)&&value<Math.fround(c.far),expectedWord=valid?inputWords[index]:0;
      const actualWords=new Uint32Array(frame.depth.buffer),cloudWords=new Uint32Array(frame.depthCloud.samples.buffer);
      wordCases.push({inputWord:inputWords[index],expectedWord,allCameraWordsEqual:actualWords.every((word:number)=>word===expectedWord),allCloudWordsEqual:cloudWords.every((word:number,offset:number)=>offset%4!==3||word===expectedWord)});
    }
    world.depthMaterial=encoder;constantEncoder.dispose();world.environment.remove(wordPlane);
    // A flat finite patch occupies different pixel widths under RGB/depth optics.
    const patch=plane(4,0,0,2,2),silhouette=await world.captureAsync('sync');
    const columns=Array.from({length:c.width},(_,column)=>column).filter(column=>silhouette.depth[centerRow*c.width+column]>0);
    const expectedColumns=Array.from({length:c.width},(_,column)=>column).filter(column=>Math.abs((column-c.cx)*4/c.fx)<1);
    const depthSilhouetteExact=JSON.stringify(columns)===JSON.stringify(expectedColumns);
    // No lighting/color oracle: compare only the flat-patch RGB silhouette edges.
    const rowRgb=Array.from({length:c.width},(_,column)=>Array.from(silhouette.rgb.slice((centerRow*c.width+column)*4,(centerRow*c.width+column)*4+3)).join(','));
    const centerRgb=rowRgb[centerColumn],rgbColumns=rowRgb.map((value,index)=>value===centerRgb?index:-1).filter(index=>index>=0);
    const opticsDistinct=rgbColumns.length>columns.length&&Math.abs(rgbColumns.length-c.rgbFx/2)<=2;
    world.environment.remove(patch);
    // Skin weights translate a plane along optical Z; the override shader must
    // consume the actual posed vertices, not their undeformed positions.
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,-20,-20,0,-20,20,0,20,20,0,20,-20],3));
    geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals();
    geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],4));
    geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],4));
    const skin=new THREE.SkinnedMesh(geometry,material),root=new THREE.Bone(),bone=new THREE.Bone();root.add(bone);skin.add(root);skin.position.set(c.forward+4,1.5+c.up,0);skin.bind(new THREE.Skeleton([root,bone]));skin.frustumCulled=false;
    world.environment.add(skin);
    const neutral=await world.captureAsync('sync');bone.position.x=.375;skin.updateMatrixWorld(true);skin.skeleton.update();
    const posed=await world.captureAsync('async');
    const skinError=Math.max(neutral.depth.reduce((maximum:number,z:number)=>Math.max(maximum,Math.abs(z-4)),0),
      posed.depth.reduce((maximum:number,z:number)=>Math.max(maximum,Math.abs(z-4.375)),0));
    world.environment.remove(skin);
    // Two material batches use the production static-geometry batching path.
    for(const side of [-1,1]){
      const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material.clone(),1);mesh.userData.sensorGeometryKey='raw-depth-box';
      mesh.setMatrixAt(0,new THREE.Matrix4().makeScale(.2,20,10).setPosition(c.forward+4.1,1.5+c.up,side*5));mesh.computeBoundingSphere();world.environment.add(mesh);
    }
    world.sensorGeometryBatches.rebuild();await world.setSensorGeometryBatching(false);const unbatched=await world.captureAsync('sync');await world.setSensorGeometryBatching(true);const batched=await world.captureAsync('async');
    const batchingEqual=same(unbatched.rgb,batched.rgb)&&same(unbatched.depth,batched.depth)&&same(unbatched.depthCloud.samples,batched.depthCloud.samples);
    const batchCount=world.sensorGeometryBatches.group.children.length;
    const pending=world.captureAsync('async');let lockstepRejected=false;
    try{await world.captureAsync('async');}catch(error){lockstepRejected=String(error).includes('already in progress');}await pending;
    const render=world.renderer.render.bind(world.renderer);let faultRejected=false;
    world.renderer.render=(scene:any,camera:any)=>{if(world.renderer.getRenderTarget()===world.depthTarget)throw new Error('fixture depth render fault');return render(scene,camera);};
    try{await world.captureAsync('sync');}catch(error){faultRejected=String(error).includes('fixture depth render fault');}
    world.renderer.render=render;const faultStateRestored=state();const recovered=await world.captureAsync('async');
    const recoveryEqual=same(recovered.depth,batched.depth);
    const result={encoding:sync.depthEncoding,calibrationEncoding:c.depthEncoding,width:c.width,height:c.height,blankZero,modesEqual,planeError,worstPlane,subpixelBits,rasterBound,planeTolerance,cloudError,cloudDepthBitsEqual,top,bottom,expectedTop,expectedBottom,ranges,wordCases,depthSilhouetteExact,opticsDistinct,skinError,batchingEqual,batchCount,lockstepRejected,faultRejected,faultStateRestored,recoveryEqual,stateRestored:state(),graphics:world.graphics,time:sync.depthCloud.time};
    world.renderer.dispose();return result;
  });
  if(process.env.RAW_AXIAL_DEPTH_REPORT)writeFileSync(process.env.RAW_AXIAL_DEPTH_REPORT,JSON.stringify({report,errors},null,2)+'\n');
  console.log('RAW AXIAL DEPTH',JSON.stringify(report));
  expect(errors).toEqual([]);expect(report.encoding).toBe('axial-f32-le-rgba8');expect(report.calibrationEncoding).toBe(report.encoding);
  expect(report.blankZero).toBe(true);expect(report.modesEqual).toBe(true);expect(report.planeError).toBeLessThan(report.planeTolerance);expect(report.cloudError).toBeLessThan(3e-6);expect(report.cloudDepthBitsEqual).toBe(true);
  expect(report.top).toBeGreaterThan(report.bottom);
  expect(Math.abs(report.top-report.expectedTop)).toBeLessThan(report.planeTolerance);
  expect(Math.abs(report.bottom-report.expectedBottom)).toBeLessThan(report.planeTolerance);
  for(const range of report.ranges){if(range.z<.28||range.z>=10){expect(range.center).toBe(0);expect(range.invalidCloud).toBe(true);}else expect(range.center).toBeCloseTo(range.z,5);}
  expect(report.wordCases).toHaveLength(16);for(const wordCase of report.wordCases){expect(wordCase.allCameraWordsEqual).toBe(true);expect(wordCase.allCloudWordsEqual).toBe(true);}
  expect(report.depthSilhouetteExact).toBe(true);expect(report.opticsDistinct).toBe(true);expect(report.skinError).toBeLessThan(3e-6);
  expect(report.batchingEqual).toBe(true);expect(report.batchCount).toBe(1);expect(report.lockstepRejected).toBe(true);expect(report.faultRejected).toBe(true);expect(report.faultStateRestored).toBe(true);expect(report.recoveryEqual).toBe(true);expect(report.stateRestored).toBe(true);expect(report.time).toBe(1);
});
