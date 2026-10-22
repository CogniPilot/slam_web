// Hardware capture policy: select the flake's Chromium and resolve the host's
// NVIDIA Vulkan manifest, then verify the actual renderer before loading SLAM.
import {access,readFile,readdir,writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {delimiter,join} from 'node:path';

export const HARDWARE_BROWSER_ARGS=Object.freeze([
  '--enable-gpu','--use-gl=angle','--use-angle=vulkan','--enable-features=Vulkan',
  '--disable-vulkan-surface','--ignore-gpu-blocklist',
]);

export async function hardwareBrowserOptions({env=process.env,
  driverVersionPath='/sys/module/nvidia/version',storeDirectory='/nix/store',
  icdDirectories=['/run/opengl-driver/share/vulkan/icd.d','/etc/vulkan/icd.d','/usr/share/vulkan/icd.d']}={}){
  const executablePath=env.CHROMIUM_PATH;
  if(!executablePath)throw Error('Hardware capture needs the flake Chromium; run from nix develop (CHROMIUM_PATH is set there).');
  await access(executablePath,constants.X_OK);
  const launchEnv={...env};
  let driverVersion;
  try{driverVersion=(await readFile(driverVersionPath,'utf8')).trim();}
  catch(error){if(error.code!=='ENOENT')throw error;}
  const explicit=env.VK_DRIVER_FILES||env.VK_ICD_FILENAMES;
  let files=explicit?explicit.split(delimiter):[];
  if(!explicit){
    for(const directory of icdDirectories){
      let names;
      try{names=await readdir(directory);}
      catch(error){if(error.code==='ENOENT')continue;throw error;}
      files=names.filter(name=>/^nvidia.*\.json$/i.test(name)).sort().map(name=>join(directory,name));
      if(files.length)break;
    }
    if(!files.length&&driverVersion&&/^\d+(?:\.\d+)+$/.test(driverVersion)){
      const names=await readdir(storeDirectory);
      for(const name of names.filter(name=>name.endsWith('-nvidia-x11-'+driverVersion)).sort()){
        const path=join(storeDirectory,name,'share/vulkan/icd.d/nvidia_icd.json');
        try{await access(path,constants.R_OK);files.push(path);}
        catch(error){if(error.code!=='ENOENT')throw error;}
      }
      if(files.length>1)throw Error('Multiple NVIDIA Vulkan manifests match the loaded driver; set VK_DRIVER_FILES to the intended package.');
    }
    if(files.length)launchEnv.VK_DRIVER_FILES=files.join(delimiter);
  }
  for(const file of files){
    const manifest=JSON.parse(await readFile(file,'utf8'));
    if(typeof manifest?.ICD?.library_path!=='string'||!manifest.ICD.library_path.trim())throw Error('Invalid Vulkan ICD manifest: '+file);
  }
  return {options:{executablePath,env:launchEnv,args:[...HARDWARE_BROWSER_ARGS]},
    receipt:{executablePath,driverVersion:driverVersion??null,vulkanDriverFiles:files,
      vulkanSelection:explicit?'explicit':files.length?'auto-nvidia':'loader-default'}};
}

export function requireHardwareGraphics(graphics){
  const renderer=graphics?.renderer??'',vendor=graphics?.vendor??'',driver=renderer+' '+vendor;
  if(graphics?.acceleration==='software'||/swiftshader|llvmpipe|lavapipe|softpipe|software|basic render/i.test(driver)
    ||!/nvidia|geforce|radeon|intel|adreno|mali|powervr|amd|qualcomm/i.test(driver)
    ||!/ANGLE.*Vulkan/i.test(renderer)){
    throw Error('Hardware capture requires a named GPU on ANGLE Vulkan; renderer refused: '+(renderer||'unavailable'));
  }
  return graphics;
}

export async function launchHardwareBrowser(chromium,{receiptPath,...options}={},configuration={}){
  let browser,receipt={hardwareVerified:false};
  try{
    const selected=await hardwareBrowserOptions(configuration);receipt={...selected.receipt,hardwareVerified:false};
    browser=await chromium.launch({headless:true,...options,...selected.options,
      args:[...selected.options.args,...(options.args??[])]});
    const page=await browser.newPage();
    try{
      receipt.graphics=await page.evaluate(()=>{
        const gl=document.createElement('canvas').getContext('webgl2');
        if(!gl)return {renderer:'',vendor:'',api:'WebGL 2 unavailable'};
        const ext=gl.getExtension('WEBGL_debug_renderer_info');
        const graphics={api:'WebGL 2',renderer:String(gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER)),
          vendor:String(gl.getParameter(ext?ext.UNMASKED_VENDOR_WEBGL:gl.VENDOR))};
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return graphics;
      });
    }finally{await page.close();}
    requireHardwareGraphics(receipt.graphics);
    receipt.hardwareVerified=true;
    if(receiptPath)await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');
    return {browser,receipt};
  }catch(error){
    receipt.hardwareVerified=false;receipt.failure=String(error);
    error.browserGpu=receipt;
    await browser?.close();
    if(receiptPath)await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');
    throw error;
  }
}
