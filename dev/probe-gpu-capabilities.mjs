import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--enable-gpu','--use-gl=angle','--use-angle=gl']});
try{
  const page=await browser.newPage();await page.goto(process.env.SLAM_PREVIEW_URL??'http://127.0.0.1:4173');
  const report=await page.evaluate(async()=>{
    const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2');if(!gl)throw new Error('WebGL2 unavailable');
    const ext=gl.getExtension('OVR_multiview2'),debug=gl.getExtension('WEBGL_debug_renderer_info');
    const adapter=await navigator.gpu?.requestAdapter();
    return {browser:navigator.userAgent,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),multiview:!!ext,maxViews:ext?gl.getParameter(ext.MAX_VIEWS_OVR):null,webgpu:!!adapter,webgpuFeatures:adapter?[...adapter.features]:[],webgpuInfo:adapter?{vendor:adapter.info.vendor,architecture:adapter.info.architecture,device:adapter.info.device,description:adapter.info.description}:null,scope:'Capability only; no WebGPU/multiview renderer or numeric/performance acceptance'};
  });await writeFile(process.env.SLAM_CAPABILITY_OUT??'test-results/gpu-capabilities.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
