import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hardwareBrowserOptions,requireHardwareGraphics,launchHardwareBrowser} from './hardware-browser.mjs';

const hardware={renderer:'ANGLE (NVIDIA, NVIDIA GeForce RTX 3090, Vulkan 1.4.329)',vendor:'Google Inc. (NVIDIA)'};
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'slam-browser-gpu-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const chromium=join(root,'chromium'),version=join(root,'driver-version'),store=join(root,'store'),system=join(root,'system-icd');
  await writeFile(chromium,'#!/bin/sh\nexit 0\n',{mode:0o755});
  await writeFile(version,'595.71.05\n');await mkdir(store);await mkdir(system);
  return {root,system,store,configuration:{env:{CHROMIUM_PATH:chromium,UNRELATED:'preserved'},
    driverVersionPath:version,storeDirectory:store,icdDirectories:[system]},
    async manifest(file,library='libGLX_nvidia.so.0'){
      await mkdir(join(file,'..'),{recursive:true});await writeFile(file,JSON.stringify({ICD:{library_path:library}}));return file;
    }};
}

test('automatically selects only a Nix NVIDIA ICD matching the loaded driver',async t=>{
  const f=await fixture(t),right=await f.manifest(join(f.store,'right-nvidia-x11-595.71.05/share/vulkan/icd.d/nvidia_icd.json'));
  await f.manifest(join(f.store,'old-nvidia-x11-590.1/share/vulkan/icd.d/nvidia_icd.json'));
  const resolved=await hardwareBrowserOptions(f.configuration);
  assert.deepEqual(resolved.receipt.vulkanDriverFiles,[right]);
  assert.equal(resolved.options.env.VK_DRIVER_FILES,right);
  assert.equal(resolved.options.env.UNRELATED,'preserved');
  assert.equal(f.configuration.env.VK_DRIVER_FILES,undefined,'caller environment mutated');
  assert.ok(resolved.options.args.includes('--use-angle=vulkan'));
});

test('system ICD takes precedence over a Nix fallback; explicit selection is preserved',async t=>{
  const f=await fixture(t),system=await f.manifest(join(f.system,'nvidia_icd.json'));
  await f.manifest(join(f.store,'fallback-nvidia-x11-595.71.05/share/vulkan/icd.d/nvidia_icd.json'));
  assert.deepEqual((await hardwareBrowserOptions(f.configuration)).receipt.vulkanDriverFiles,[system]);
  const explicit=await f.manifest(join(f.root,'explicit.json'));
  for(const key of ['VK_DRIVER_FILES','VK_ICD_FILENAMES']){
    const resolved=await hardwareBrowserOptions({...f.configuration,env:{...f.configuration.env,[key]:explicit}});
    assert.deepEqual(resolved.receipt.vulkanDriverFiles,[explicit]);
    assert.equal(resolved.receipt.vulkanSelection,'explicit');
  }
});

test('missing flake browser, invalid manifests and ambiguous matching packages fail before launch',async t=>{
  const f=await fixture(t);
  await assert.rejects(hardwareBrowserOptions({...f.configuration,env:{}}),/Chromium unavailable/);
  const bad=join(f.root,'bad.json');await writeFile(bad,'{"ICD":{}}');
  await assert.rejects(hardwareBrowserOptions({...f.configuration,env:{...f.configuration.env,VK_DRIVER_FILES:bad}}),/Invalid Vulkan ICD/);
  for(const prefix of ['one','two'])await f.manifest(join(f.store,prefix+'-nvidia-x11-595.71.05/share/vulkan/icd.d/nvidia_icd.json'));
  await assert.rejects(hardwareBrowserOptions(f.configuration),/Multiple NVIDIA/);
});

test('an unmatched driver is not replaced with an arbitrary Nix package',async t=>{
  const f=await fixture(t);
  await f.manifest(join(f.store,'old-nvidia-x11-590.1/share/vulkan/icd.d/nvidia_icd.json'));
  const resolved=await hardwareBrowserOptions(f.configuration);
  assert.deepEqual(resolved.receipt.vulkanDriverFiles,[]);
  assert.equal(resolved.receipt.vulkanSelection,'loader-default');
  assert.equal(resolved.options.env.VK_DRIVER_FILES,undefined);
});

test('software, unknown, and non-Vulkan renderers cannot qualify as hardware capture',()=>{
  assert.equal(requireHardwareGraphics(hardware),hardware);
  for(const graphics of [undefined,{},
    {renderer:'ANGLE (Google, Vulkan SwiftShader Device)',vendor:'NVIDIA',acceleration:'hardware-reported'},
    {renderer:'llvmpipe (LLVM)',vendor:'Mesa'},
    {renderer:'ANGLE (NVIDIA, GeForce RTX 3090, OpenGL)',vendor:'NVIDIA'},
    {...hardware,acceleration:'software'},
    {renderer:'ANGLE (Generic Vulkan device)',vendor:'Google Inc.'}]){
    assert.throws(()=>requireHardwareGraphics(graphics),/renderer refused/);
  }
});

function fakeBrowser(graphics){
  const events=[];
  const page={evaluate:async()=>{events.push('renderer probe');return graphics;},close:async()=>events.push('page close')};
  const browser={newPage:async()=>{events.push('new page');return page;},close:async()=>events.push('browser close')};
  return {events,browser,chromium:{launch:async options=>{events.push('launch');assert.equal(options.chromiumSandbox,true);assert.ok(options.args.includes('--use-angle=vulkan'));return browser;}}};
}

test('sandbox-disabling arguments and API overrides are refused before launch',async t=>{
  const f=await fixture(t),fake=fakeBrowser(hardware);
  for(const options of [{chromiumSandbox:false},{args:['--no-sandbox']},
    {args:['--disable-gpu-sandbox']},{args:['--no-sandbox=true']}]){
    await assert.rejects(launchHardwareBrowser(fake.chromium,options,f.configuration),/sandbox-disabling/);
  }
  assert.deepEqual(fake.events,[]);
});

test('fallback is refused and browser closed before the caller can load a simulation; failure retains renderer',async t=>{
  const f=await fixture(t),renderer={renderer:'ANGLE (Google, Vulkan SwiftShader Device)',vendor:'Google Inc.'},fake=fakeBrowser(renderer),receiptPath=join(f.root,'gpu.json');
  await assert.rejects(launchHardwareBrowser(fake.chromium,{receiptPath},f.configuration),/renderer refused/);
  assert.deepEqual(fake.events,['launch','new page','renderer probe','page close','browser close']);
  const receipt=JSON.parse(await readFile(receiptPath));
  assert.equal(receipt.hardwareVerified,false);assert.deepEqual(receipt.graphics,renderer);
  assert.match(receipt.failure,/renderer refused/);
});

test('accepted preflight retains executable, driver choice and actual renderer, leaving browser open',async t=>{
  const f=await fixture(t),fake=fakeBrowser(hardware),receiptPath=join(f.root,'gpu.json');
  const launched=await launchHardwareBrowser(fake.chromium,{receiptPath},f.configuration);
  assert.equal(launched.browser,fake.browser);assert.equal(launched.receipt.hardwareVerified,true);
  assert.deepEqual(fake.events,['launch','new page','renderer probe','page close']);
  assert.deepEqual(JSON.parse(await readFile(receiptPath)).graphics,hardware);
});

test('probe exceptions close both the probe page and browser',async t=>{
  const f=await fixture(t),fake=fakeBrowser(hardware);
  fake.browser.newPage=async()=>({evaluate:async()=>{throw Error('context lost');},close:async()=>fake.events.push('page close')});
  await assert.rejects(launchHardwareBrowser(fake.chromium,{},f.configuration),/context lost/);
  assert.deepEqual(fake.events,['launch','page close','browser close']);
});
