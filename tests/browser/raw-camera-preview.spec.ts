import {test,expect} from '@playwright/test';
import {build} from 'esbuild';

test('raw RGB8/Z16 previews preserve native bytes, row orientation, padding and legacy replay',async({page},testInfo)=>{
 const bundle=await build({stdin:{contents:"import {ColorPreview} from './src/color-preview';import {DepthPreview} from './src/depth-preview';import {allocateRealSenseImages,cameraImageLayout} from './src/gpu-realsense-packing';globalThis.__previews={ColorPreview,DepthPreview,allocateRealSenseImages,cameraImageLayout};",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',logLevel:'silent'});
 await page.route('**/__raw-preview__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><canvas id="color"></canvas><canvas id="depth"></canvas>'}));
 await page.goto('/__raw-preview__');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const results=await page.evaluate(()=>{
  const {ColorPreview,DepthPreview,allocateRealSenseImages,cameraImageLayout}=(window as any).__previews;
  const canvas=document.querySelector<HTMLCanvasElement>('#color')!,ctx=canvas.getContext('2d')!,color=new ColorPreview(),depth=new DepthPreview(document.querySelector('#depth'));
  const results=[];
  for(const [width,height] of [[17,13],[13,17],[848,480]]){
   const {images}=allocateRealSenseImages({width,height},{width,height},.001),layout=cameraImageLayout(images);
   for(let row=0;row<height;row++)for(let x=0;x<width;x++){
    for(let c=0;c<3;c++)images.color.data[row*layout.color.strideBytes+x*3+c]=(row*37+x*7+c*83)%256;
    images.depth.data[row*layout.depth.strideBytes/2+x]=(row*103+x*11)%10001;
   }
   const source=new Uint8Array(images.color.data.buffer),before=source.slice();
   color.draw(ctx,images.color.data,width,height,layout.color);depth.draw(images.depth.data,width,height,10,layout.depth);
   const rgba=ctx.getImageData(0,0,width,height).data,depthRgba=new Uint8Array(width*height*4),gl=depth.renderer.getContext();gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,depthRgba);
   let colorError=0,depthError=0;
   for(let row=0;row<height;row++)for(let x=0;x<width;x++){
    const index=(row*width+x)*4,code=images.depth.data[row*layout.depth.strideBytes/2+x],f=code*.001/10;
    for(let c=0;c<3;c++){
     colorError=Math.max(colorError,Math.abs(rgba[index+c]-images.color.data[row*layout.color.strideBytes+x*3+c]));
     const expected=code===0?0:Math.round([1-f,210/255*Math.sin(f*Math.PI),f][c]*255);
     depthError=Math.max(depthError,Math.abs(depthRgba[((height-1-row)*width+x)*4+c]-expected));
    }
   }
   // Exercise material/type changes used by old recordings, then return to raw.
   const legacy=new Float32Array(width*height);legacy.fill(2);depth.draw(legacy,width,height,10);depth.draw(images.depth.data,width,height,10,layout.depth);
   results.push({width,height,colorError,depthError,sourceExact:source.every((v,i)=>v===before[i]),glError:gl.getError()});
  }
  color.dispose();depth.dispose();return results;
 });
 await testInfo.attach('raw-camera-preview.json',{body:JSON.stringify(results,null,2),contentType:'application/json'});
 for(const result of results){expect(result.colorError).toBe(0);expect(result.depthError).toBeLessThanOrEqual(1);expect(result.sourceExact).toBe(true);expect(result.glError).toBe(0);}
});
