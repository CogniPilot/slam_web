import {test,expect} from '@playwright/test';
import {build} from 'esbuild';

test('native Z16 display unprojects on the GPU with dense cloud parity and no XYZ readback',async({page},testInfo)=>{
 const bundle=await build({stdin:{contents:"import * as THREE from 'three';import {World,D435} from './src/world';import {GpuDepthCloudRaster} from './src/depth-cloud-raster';globalThis.__raster={THREE,World,D435,GpuDepthCloudRaster};",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',define:{'import.meta.env.BASE_URL':'"/"'},logLevel:'silent'});
 await page.route('**/__depth-raster__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Native depth presentation</title>'}));
 await page.goto('/__depth-raster__');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const result=await page.evaluate(async()=>{
  const {THREE,World,D435:c,GpuDepthCloudRaster}=(window as any).__raster;
  const world=new World({canvas:new OffscreenCanvas(640,400),width:640,height:400,pixelRatio:1,base:location.origin+'/'});await world.ready;
  world.configureActors(false,false);world.actors.group.visible=false;world.navigation.group.visible=false;world.sensorGeometryBatches.clear();world.environment.clear();world.scene.fog=null;
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.MeshBasicMaterial({color:0x789abc,side:THREE.DoubleSide}));
  plane.rotation.y=Math.PI/2;plane.position.set(c.forward+4,1.5+c.up,0);world.environment.add(plane);
  world.update({time:.1,x:0,y:0,z:1.5,quaternion:[1,0,0,0],velocity:[0,0,0],accel:[0,0,0],gyro:[0,0,0]});
  await world.setDepthNoise({seed:7,disparityNoisePx:.08,referenceFx:c.fx,baselineMeters:c.baseline,dropoutProbability:.005,unitsMeters:.001});world.setDepthCloudEnabled(true);
  const [dense,denseScan]=await world.captureSensorPair(true,'sync',false,true),gl=world.renderer.getContext(),copy=gl.getBufferSubData.bind(gl);
  let copies=0,readBytes=0;gl.getBufferSubData=(target:any,offset:any,destination:any,...rest:any[])=>{copies++;readBytes+=destination.byteLength;return copy(target,offset,destination,...rest);};
  const [compact,scan]=await world.captureSensorPair(true,'sync',false,true,false);gl.getBufferSubData=copy;
  const equal=(a:any,b:any)=>{const x=new Uint8Array(a.buffer,a.byteOffset,a.byteLength),y=new Uint8Array(b.buffer,b.byteOffset,b.byteLength);return x.length===y.length&&x.every((v,i)=>v===y[i]);};
  const compactCloud=compact.depthRaster,texture=world.rasterCloud.texture,geometry=world.depthCloudView.geometry;
  const expectedReduction=c.width*c.height*16;
  // Transform feedback compiles the actual presentation vertex shader, with
  // a test-only point output. It observes every native pixel, not a screenshot.
  const gpuPoints=(cloud:any)=>{
   const gpu=new GpuDepthCloudRaster();gpu.set(cloud);world.renderer.initTexture(gpu.texture);
   const shader=(type:number,source:string)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
   const vertex=shader(gl.VERTEX_SHADER,'#version 300 es\n'+gpu.material.vertexShader.replace('out float valid;','out float valid;out vec4 fixturePoint;').replace('gl_Position=','fixturePoint=vec4(valid>0.0?point:vec3(0.0),valid);gl_Position='));
   const fragment=shader(gl.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;out vec4 color;void main(){color=vec4(1.0);}');
   const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.transformFeedbackVaryings(program,['fixturePoint'],gl.INTERLEAVED_ATTRIBS);gl.linkProgram(program);
   if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
   const uniform=(name:string)=>gl.getUniformLocation(program,name);
   gl.uniform1i(uniform('depth'),0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,world.renderer.properties.get(gpu.texture).__webglTexture);
   gl.uniform1i(uniform('width'),cloud.width);gl.uniform4f(uniform('intrinsics'),cloud.calibration.fx,cloud.calibration.fy,cloud.calibration.cx,cloud.calibration.cy);
   for(const [name,value] of [['unitsMeters',cloud.unitsMeters],['nearDepth',cloud.calibration.near],['farDepth',cloud.calibration.far]] as const)gl.uniform1f(uniform(name),value);
   const identity=new THREE.Matrix4().elements;gl.uniformMatrix4fv(uniform('modelViewMatrix'),false,identity);gl.uniformMatrix4fv(uniform('projectionMatrix'),false,identity);
   const data=new Float32Array(cloud.width*cloud.height*4),buffer=gl.createBuffer(),feedback=gl.createTransformFeedback(),vao=gl.createVertexArray();gl.bindVertexArray(vao);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,feedback);
   gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER,buffer);gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER,data.byteLength,gl.STREAM_READ);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,buffer);
   gl.enable(gl.RASTERIZER_DISCARD);gl.beginTransformFeedback(gl.POINTS);gl.drawArrays(gl.POINTS,0,cloud.width*cloud.height);gl.endTransformFeedback();gl.disable(gl.RASTERIZER_DISCARD);
   gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER,0,data);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null);gl.bindVertexArray(null);
   gl.deleteTransformFeedback(feedback);gl.deleteBuffer(buffer);gl.deleteVertexArray(vao);gl.deleteProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);gpu.dispose();world.renderer.resetState();return data;
  };
  const projected=gpuPoints(compactCloud);let maxError=0,valid=0,invalid=0;
  for(let row=0;row<c.height;row++)for(let column=0;column<c.width;column++){
   const a=(row*c.width+column)*4,b=((c.height-1-row)*c.width+column)*4;
   if(projected[a+3]>0)valid++;else invalid++;
   for(let lane=0;lane<4;lane++)maxError=Math.max(maxError,Math.abs(projected[a+lane]-dense.depthCloud.samples[b+lane]));
  }
  const diagnosticCases=[];
  for(const [width,height,units] of [[13,17,.001],[17,13,.002],[848,480,.001]]){
   const stride=Math.ceil(width*2/4)*4,samples=new Uint16Array(stride/2*height).fill(65535);
   for(let row=0;row<height;row++)for(let column=0;column<width;column++)samples[row*stride/2+column]=[0,139,140,1000,1999,4999,5000,65535][(row*width+column)%8];
   const cloud={...compactCloud,width,height,strideBytes:stride,samples,unitsMeters:units,calibration:{fx:width*.7,fy:height*.8,cx:width*.37,cy:height*.61,near:.28,far:10}};
   const actual=gpuPoints(cloud);let error=0,validity=true;
   for(let row=0;row<height;row++)for(let column=0;column<width;column++){
    const z=Math.fround(samples[row*stride/2+column]*Math.fround(units)),accepted=z>=.28&&z<10&&z>0,offset=(row*width+column)*4;
    const expected=accepted?[z,-(column-cloud.calibration.cx)*z/cloud.calibration.fx,-(row-cloud.calibration.cy)*z/cloud.calibration.fy,z]:[0,0,0,0];
    validity&&=(actual[offset+3]>0)===accepted;for(let lane=0;lane<4;lane++)error=Math.max(error,Math.abs(actual[offset+lane]-expected[lane]));
   }
   diagnosticCases.push({width,height,units,error,validity});
  }
  // Actual Three.js rendering must produce the same display from either
  // representation, including a translated and rotated capture pose.
  world.environment.visible=false;world.robot.visible=false;world.lighting.celestialGroup.visible=false;world.scene.background=new THREE.Color(0);
  world.view.position.set(0,2,5);world.view.lookAt(4,1.5,0);world.view.updateMatrixWorld();
  const target=new THREE.WebGLRenderTarget(640,400,{depthBuffer:true}),posed={x:1,y:-.5,z:2,quaternion:[Math.cos(.15),0,0,Math.sin(.15)]};
  const image=(raster:boolean)=>{if(raster)world.setDepthRaster({...compactCloud,pose:posed});else world.setDepthCloud({...dense.depthCloud,pose:posed});
   world.renderer.setRenderTarget(target);world.renderer.render(world.scene,world.view);const bytes=new Uint8Array(640*400*4);world.renderer.readRenderTargetPixels(target,0,0,640,400,bytes);return bytes;};
  const oldImage=image(false),newImage=image(true);let different=0,drawn=0;for(let i=0;i<oldImage.length;i+=4){if(oldImage[i]||oldImage[i+1]||oldImage[i+2])drawn++;if(oldImage[i]!==newImage[i]||oldImage[i+1]!==newImage[i+1]||oldImage[i+2]!==newImage[i+2])different++;}
  world.setDepthRaster(compactCloud);const stable=world.rasterCloud.texture===texture&&world.depthCloudView.geometry===geometry&&!world.depthCloudView.geometry.getAttribute('position');
  const captureOnly=await world.captureSensors(true);
  const output={graphics:world.graphics,copies,readBytes,expectedBytes:compact.rgb.byteLength+compact.depth.byteLength+scan.samples.byteLength,
   expectedReduction,actualReduction:dense.rgb.buffer.byteLength-compact.rgb.buffer.byteLength,
   rgbExact:equal(dense.rgb,compact.rgb),depthExact:equal(dense.depth,compact.depth),lidarExact:equal(denseScan.samples,scan.samples),
   noDenseReadback:!compact.depthCloud&&!!compactCloud,sharedDepth:compactCloud.samples===compact.depth,
   displaySamples:compactCloud.samples.length,maxError,valid,invalid,diagnosticCases,drawn,different,stable,
   algorithmKeys:Object.keys(captureOnly[0]).sort(),liveRaster:!!world.latestDepthRaster&&!world.latestDepthCloud,error:gl.getError()};
  world.renderer.setRenderTarget(null);target.dispose();world.renderer.dispose();return output;
 });
 await testInfo.attach('depth-cloud-raster.json',{body:JSON.stringify(result,null,2),contentType:'application/json'});
 for(const key of ['rgbExact','depthExact','lidarExact','noDenseReadback','sharedDepth','stable','liveRaster'] as const)expect(result[key]).toBe(true);
 expect(result.algorithmKeys).toEqual(['depth','imageLayout','rgb']);expect(result.copies).toBe(1);expect(result.readBytes).toBe(result.expectedBytes);
 expect(result.actualReduction).toBe(result.expectedReduction);expect(result.expectedReduction).toBe(6512640);expect(result.displaySamples).toBe(848*480);
 expect(result.valid).toBeGreaterThan(400000);expect(result.invalid).toBeGreaterThan(1000);expect(result.maxError).toBeLessThan(2e-6);
 for(const c of result.diagnosticCases){expect(c.validity).toBe(true);expect(c.error).toBeLessThan(3e-6);}
 expect(result.drawn).toBeGreaterThan(1000);expect(result.different).toBeLessThan(50);expect(result.error).toBe(0);
});
