// Measurement harness, never part of the application. No CV or host dynamics.
import {World,D435} from '../src/world';
import {GpuReadback} from '../src/gpu-readback';
import {GpuRasterRows} from '../src/gpu-raster-rows';
import * as THREE from 'three';

// Historical CPU layout conversion retained only in this measurement harness.
function copyRowsTopDown(bytes:Uint8Array,width:number,height:number){
  const result=new Uint8Array(bytes.length),stride=width*4;
  for(let row=0;row<height;row++)result.set(bytes.subarray(row*stride,(row+1)*stride),(height-row-1)*stride);
  return result;
}

function verifyGpuRows(renderer:THREE.WebGLRenderer){
  const rows=new GpuRasterRows(),gl=renderer.getContext() as WebGL2RenderingContext,previous=renderer.getRenderTarget(),controls=[];
  try{
    for(const [width,height] of [[17,13],[13,17],[D435.width,D435.height]])for(const colorSpace of [THREE.NoColorSpace,THREE.SRGBColorSpace]){
      const source=new THREE.WebGLRenderTarget(width,height,{type:THREE.UnsignedByteType,colorSpace,depthBuffer:false});
      try{
        const bytes=new Uint8Array(width*height*4);
        for(let index=0;index<bytes.length;index++)bytes[index]=(index*37+(index>>>8)*13)&255;
        // Raw IEEE754 controls, including signed zero and NaN payloads. These
        // are bytes, never sampled or decoded as floating-point colors.
        const bits=new Uint32Array(bytes.buffer);bits.set([0x80000000,0x7fc01234,0x3f800000,0xff800000]);
        renderer.setRenderTarget(source);
        const texture=gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME) as WebGLTexture;
        const binding=gl.getParameter(gl.TEXTURE_BINDING_2D);
        try{gl.bindTexture(gl.TEXTURE_2D,texture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);}
        finally{gl.bindTexture(gl.TEXTURE_2D,binding);}
        const destination=rows.bindTopDown(renderer,source),actual=new Uint8Array(bytes.length),unchanged=new Uint8Array(bytes.length);
        renderer.readRenderTargetPixels(destination,0,0,width,height,actual);
        renderer.readRenderTargetPixels(source,0,0,width,height,unchanged);
        const expected=copyRowsTopDown(bytes,width,height);
        if(!actual.every((value,index)=>value===expected[index])||!unchanged.every((value,index)=>value===bytes[index]))throw Error('GPU encoded-byte/row control failed');
        if(gl.getParameter(gl.READ_FRAMEBUFFER_BINDING)!==gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING)||gl.getError()!==gl.NO_ERROR)throw Error('GPU row conversion did not restore framebuffer state');
        controls.push({width,height,colorSpace,bytesExact:true,sourceUnchanged:true,framebufferStateRestored:true});
      }finally{source.dispose();}
    }
  }finally{renderer.setRenderTarget(previous);rows.dispose();}
  return controls;
}

export async function prepareNativeGpuTransport(captures:number,warmup:number){
  const world=new World({canvas:new OffscreenCanvas(640,360),width:640,height:360,pixelRatio:1,base:location.href});
  world.build('city','medium');world.configureActors(false,false);world.setDepthCloudEnabled(false);world.setLighting('day');
  await world.ready;
  world.update({time:0,x:2,y:-1,z:2.4,quaternion:[1,0,0,0],velocity:[0,0,0],accel:[0,0,9.80665],gyro:[0,0,0]});
  const [frame,scan]=await world.captureSensorPair(true,'sync',false);
  if(!scan)throw Error('Missing GPU LiDAR reference');
  const targets=world as unknown as {rgbTarget:THREE.WebGLRenderTarget;depthTarget:THREE.WebGLRenderTarget;lidar:{target:THREE.WebGLRenderTarget}};
  const {width,height}=D435,byteLength=width*height*4,scanLength=scan.samples.byteLength;
  if(targets.rgbTarget.width!==width||targets.rgbTarget.height!==height||targets.depthTarget.width!==width||targets.depthTarget.height!==height)throw Error('Camera target does not match its native calibration');
  if(targets.lidar.target.width!==scan.columns||targets.lidar.target.height!==scan.beams||scanLength!==scan.columns*scan.beams*16)throw Error('LiDAR target does not match its scan layout');
  if(frame.rgb.byteLength!==byteLength||frame.depth.byteLength!==byteLength)throw Error('Camera reference length mismatch');
  if(world.graphics.acceleration!=='hardware-reported')throw Error('This performance probe requires reported hardware acceleration');
  const renderer=world.renderer,gl=renderer.getContext() as WebGL2RenderingContext,readback=new GpuReadback(gl),gpuRows=new GpuRasterRows();
  const rowControls=verifyGpuRows(renderer);
  const previous=renderer.getRenderTarget();
  gl.finish(); // Complete the one scene render before transport-only measurements.
  const same=(a:Uint8Array,b:Uint8Array)=>a.length===b.length&&a.every((value,index)=>value===b[index]);
  const asBytes=(view:Uint8Array|Float32Array)=>new Uint8Array(view.buffer,view.byteOffset,view.byteLength);
  const rows:any[]=[],guard=64;
  let expectedMemory:ArrayBuffer|undefined,observedDirectCopies=0;
  const original=gl.getBufferSubData;
  gl.getBufferSubData=function(...args:Parameters<WebGL2RenderingContext['getBufferSubData']>){
    if(expectedMemory){if(args[2].buffer!==expectedMemory)throw Error('Direct transfer used intermediate CPU storage');observedDirectCopies++;}
    return original.apply(gl,args);
  };
  const run=()=>{
    try{
      for(const lidarEnabled of [false,true]){
        const size=byteLength*2+(lidarEnabled?scanLength:0),pages=Math.ceil((size+guard*2)/65536);
        const memory=new WebAssembly.Memory({initial:pages,maximum:pages}),all=new Uint8Array(memory.buffer);all.fill(99);
        const packed=new Uint8Array(memory.buffer,guard,size);
        const direct:(Uint8Array|Float32Array)[]=[new Uint8Array(memory.buffer,guard,byteLength),new Uint8Array(memory.buffer,guard+byteLength,byteLength)];
        const buffered:(Uint8Array|Float32Array)[]=[new Uint8Array(byteLength),new Uint8Array(byteLength)];
        if(lidarEnabled){direct.push(new Float32Array(memory.buffer,guard+byteLength*2,scanLength/4));buffered.push(new Float32Array(scanLength/4));}
        const submit=(views:(Uint8Array|Float32Array)[],topDown=false)=>(read:(w:number,h:number,bytes:Uint8Array|Float32Array)=>void)=>{
          if(topDown)gpuRows.bindTopDown(renderer,targets.rgbTarget);else renderer.setRenderTarget(targets.rgbTarget);read(width,height,views[0]);
          if(topDown)gpuRows.bindTopDown(renderer,targets.depthTarget);else renderer.setRenderTarget(targets.depthTarget);read(width,height,views[1]);
          if(lidarEnabled){renderer.setRenderTarget(targets.lidar.target);read(scan.columns,scan.beams,views[2]);}
        };
        const perform=(mode:string)=>{
          let readbackMs:number,handoffMs=0;
          if(mode==='direct-bottom-up'||mode==='direct-gpu-top-down'){
            expectedMemory=memory.buffer;
            try{readbackMs=readback.readBatchPackedSync(size,submit(direct,mode==='direct-gpu-top-down'),packed);}finally{expectedMemory=undefined;}
          }else{
            readbackMs=readback.readBatchPackedSync(size,submit(buffered,mode==='buffered-gpu-top-down'));
            const start=performance.now();
            const rgb=mode==='buffered-top-down'?copyRowsTopDown(buffered[0] as Uint8Array,width,height):buffered[0];
            const depth=mode==='buffered-top-down'?copyRowsTopDown(buffered[1] as Uint8Array,width,height):buffered[1];
            packed.set(asBytes(rgb));packed.set(asBytes(depth),byteLength);
            if(lidarEnabled)packed.set(asBytes(buffered[2]),byteLength*2);
            handoffMs=performance.now()-start;
          }
          return {readbackMs,handoffMs};
        };
        perform('buffered-bottom-up');const rawReference=packed.slice();
        perform('direct-bottom-up');if(!same(packed,rawReference))throw Error('Direct raw-byte mismatch');
        perform('buffered-top-down');
        if(!same(packed.subarray(0,byteLength),frame.rgb)||!same(packed.subarray(byteLength,byteLength*2),asBytes(frame.depth)))throw Error('Native top-down camera parity failed');
        if(lidarEnabled&&!same(packed.subarray(byteLength*2),asBytes(scan.samples)))throw Error('LiDAR raw-bit parity failed');
        const topDownReference=packed.slice();
        perform('direct-gpu-top-down');if(!same(packed,topDownReference))throw Error('GPU row flip changed RGB/depth/LiDAR bits');
        perform('buffered-gpu-top-down');if(!same(packed,topDownReference))throw Error('Buffered GPU row flip changed RGB/depth/LiDAR bits');
        if(!all.subarray(0,guard).every(value=>value===99)||!all.subarray(guard+size).every(value=>value===99))throw Error('WASM guard overwritten');
        const windows=[];
        const order=['buffered-bottom-up','direct-bottom-up','buffered-top-down','direct-gpu-top-down','buffered-gpu-top-down'];
        for(let repetition=0;repetition<2;repetition++){
          const forward=repetition===0?order:[...order].reverse();
          for(const mode of [...forward,...forward.toReversed()]){
            for(let index=0;index<warmup;index++)perform(mode);
            let readbackMs=0,handoffMs=0;const started=performance.now();
            for(let index=0;index<captures;index++){const sample=perform(mode);readbackMs+=sample.readbackMs;handoffMs+=sample.handoffMs;}
            windows.push({repetition,mode,captures,wallMs:performance.now()-started,readbackMs,handoffMs});
          }
        }
        perform('direct-bottom-up');
        if(!same(packed,rawReference)||!all.subarray(0,guard).every(value=>value===99)||!all.subarray(guard+size).every(value=>value===99))throw Error('Timed transport corrupted bytes or guards');
        if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL transport error');
        rows.push({lidarEnabled,bytes:size,rawBytesMatch:true,topDownCameraMatchesProduction:true,gpuTopDownMatchesProduction:true,lidarBitsPreserved:true,guardsPreserved:true,windows});
      }
      return {graphics:world.graphics,calibration:D435,rowControls,lidar:{beams:scan.beams,columns:scan.columns,bytes:scanLength,format:scan.format},
        heldTime:scan.time,observedDirectCopies,rows};
    }finally{gl.getBufferSubData=original;renderer.setRenderTarget(previous);readback.dispose();gpuRows.dispose();}
  };
  return run;
}
