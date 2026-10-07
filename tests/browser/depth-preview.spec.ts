import {test,expect} from '@playwright/test';
import {build} from 'esbuild';

test('GPU depth preview preserves float input and displays top-down calibrated depth colors',async({page},testInfo)=>{
 const bundle=await build({stdin:{contents:"import {DepthPreview} from './src/depth-preview';globalThis.__depthPreview=DepthPreview;",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',logLevel:'silent'});
 await page.route('**/__depth-preview__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Depth preview test</title>'}));
 await page.goto('/__depth-preview__');
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const result=await page.evaluate(async()=>{
  const DepthPreview=(window as any).__depthPreview;
  const canvas=document.createElement('canvas');document.body.append(canvas);
  const preview=new DepthPreview(canvas),rows=[];
  for(const [width,height,far] of [[17,13,10],[13,17,20],[848,480,10]]){
   const backing=new ArrayBuffer(width*height*4+16),depth=new Float32Array(backing,8,width*height);
   for(let i=0;i<depth.length;i++)depth[i]=i%11===0?0:i%13===0?-0:((i*17)%103)/100*far;
   const bytes=new Uint8Array(backing),before=bytes.slice();
   for(let frame=0;frame<2;frame++){
    preview.draw(depth,width,height,far);
    const gl=preview.renderer.getContext(),pixels=new Uint8Array(width*height*4);
    gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let maxError=0,invalidBlack=true;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
     const z=depth[y*width+x],f=Math.max(0,Math.min(1,z/far)),offset=((height-1-y)*width+x)*4;
     const expected=[z?Math.round(255*(1-f)):0,z?Math.round(210*Math.sin(f*Math.PI)):0,z?Math.round(255*f):0,255];
     for(let channel=0;channel<4;channel++)maxError=Math.max(maxError,Math.abs(pixels[offset+channel]-expected[channel]));
     if(z===0)invalidBlack&&=pixels[offset]===0&&pixels[offset+1]===0&&pixels[offset+2]===0;
    }
    rows.push({width,height,frame,maxError,invalidBlack,unchanged:before.every((v,i)=>v===bytes[i]),error:gl.getError()});
    depth.reverse();before.set(new Uint8Array(backing));
   }
  }
  preview.dispose();return rows;
 });
 await testInfo.attach('depth-preview-parity.json',{body:JSON.stringify(result,null,2),contentType:'application/json'});
 expect(result).toHaveLength(6);
 for(const row of result){expect(row.maxError).toBeLessThanOrEqual(1);expect(row.invalidBlack).toBe(true);expect(row.unchanged).toBe(true);expect(row.error).toBe(0);}
});
