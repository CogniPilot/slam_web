// Capture shared observations with Modelica physics and Three.js cameras. The
// inertial viewer estimate is discarded; estimator replay happens separately.
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile,statfs} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {execFileSync} from 'node:child_process';
import {hallwayPhysics} from './hallway-benchmark-physics.mjs';

const [sourceCapture,output]=process.argv.slice(2);
if(!output)throw Error('Usage: capture-environment-scale.mjs ORIGINAL_CAPTURE NEW_OUTPUT');
const wallBudget=Number(process.env.SCALE_CAPTURE_WALL_SECONDS??600),jobStarted=performance.now();
if(!Number.isFinite(wallBudget)||wallBudget<30||wallBudget>3600)throw Error('Wall budget must be 30..3600 seconds');
const sha=x=>createHash('sha256').update(x).digest('hex');
const frames=Number(process.env.SCALE_CAPTURE_FRAMES??3001);
if(!Number.isInteger(frames)||frames<2||frames>3001)throw Error('Frame count must be 2..3001');
const disk=await statfs(resolve(output,'..'));
if(disk.bavail*disk.bsize<10*1024**3)throw Error('Capture requires at least 10 GiB free before starting');
await mkdir(output);
await mkdir(join(output,'hallway/frames'),{recursive:true});
await mkdir(join(output,'web-assets'));
const captureScript=await readFile(new URL(import.meta.url));
await writeFile(join(output,'capture-script.mjs'),captureScript);
await writeFile(join(output,'hallway-benchmark-physics.mjs'),await readFile(new URL('./hallway-benchmark-physics.mjs',import.meta.url)));
const projectBytes=await readFile(join(sourceCapture,'city/project.json'));
const initialBytes=await readFile(join(sourceCapture,'city/frames/0000.json'));
const nativeProfile=await readFile(join(sourceCapture,'city/native-profile.json'));
const parameters=JSON.parse(initialBytes).state.parameters;
const project=JSON.parse(projectBytes);
Object.assign(project,{name:'Ten-minute hallway return',environment:'hallway',physics:await hallwayPhysics(project.physics),
  slamBackend:'inertial',algorithm:await readFile(new URL('../models/Estimation/Inertial/ModelicaInertial.mo',import.meta.url),'utf8'),
  algorithmPreset:'Modelica inertial propagation',runtime:'modelica',cameraResolution:'424x240',
  seed:7,sceneDetail:'low',carsEnabled:false,peopleEnabled:false,lidarEnabled:false,depthCloudEnabled:false,
  sensorRates:{cameraHz:5,lidarHz:5,imuHz:10,gpsHz:1}});
delete project.algorithmArtifact;delete project.entryPoint;delete project.mainSourcePath;
const url=process.env.SCALE_CAPTURE_URL??'http://127.0.0.1:4198/';
let interrupted=false;process.once('SIGINT',()=>{interrupted=true;});process.once('SIGTERM',()=>{interrupted=true;});
const gpuSamples=[],monitorGpu=process.env.SCALE_CAPTURE_GPU_MONITOR==='1';
const sampleGpu=()=>{
 if(!monitorGpu)return;
 const values=execFileSync('nvidia-smi',['--query-gpu=memory.used,memory.free,utilization.gpu','--format=csv,noheader,nounits'],{encoding:'utf8',timeout:3000}).trim().split(',').map(Number);
 if(values.length!==3||!values.every(Number.isFinite))throw Error('GPU resource sample unavailable');
 const [usedMiB,freeMiB,utilizationPercent]=values;
 gpuSamples.push({elapsedMs:performance.now()-jobStarted,usedMiB,freeMiB,utilizationPercent});
 if(freeMiB<2048||usedMiB-gpuSamples[0].usedMiB>3072)throw Error('Shared GPU headroom guard reached');
};
const receipt={schema:1,wallBudgetSeconds:wallBudget,framesRequested:frames,fullMissionRequested:frames===3001,startedAt:new Date().toISOString(),cases:[],scope:'Hallway out-and-back reference (600s); capture may request a shorter diagnostic prefix. Modelica controller/motor dynamics retained; Three.js shared RGB-D plus recorded noisy IMU. Viewer estimator excluded from replay data.',
  projectSourceSha256:sha(projectBytes),nativeConfigurationSourceSha256:sha(initialBytes),
  captureScriptSha256:sha(captureScript),
  flightReference:'models/Benchmarks/HallwayProfile.mo; position/velocity/acceleration references in Modelica; no JavaScript trajectory integration',
  limitations:['Authored Modelica flight reference; achieved spatial coverage is measured from truth, never assumed.',
    'No collision model; route does not certify physical obstacle clearance.',
    'Capture timing is excluded from offline estimator latency.','Native replay uses RGB-D+IMU; ROS RGB-D modality remains explicit.']};
let count=0,positionPrevious,pathLength=0;const bins=new Set(),bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
const assets=[],pending=[],errors=[],archiveWarnings=[];let page,browser;
try{
 sampleGpu();
 browser=await chromium.launch({headless:true,handleSIGINT:false,handleSIGTERM:false,executablePath:process.env.CHROMIUM_PATH,
  args:['--enable-gpu','--use-gl=angle','--use-angle=vulkan','--enable-features=Vulkan','--disable-vulkan-surface','--ignore-gpu-blocklist','--disable-gpu-sandbox']});
 page=await browser.newPage({viewport:{width:1280,height:900}});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',response=>{
  if(!response.ok()||!response.url().startsWith(url))return;
  pending.push((async()=>{
    const bytes=await response.body(),digest=sha(bytes),name=digest+'.bin';
    await writeFile(join(output,'web-assets',name),bytes);
    assets.push({url:response.url(),sha256:digest,bytes:bytes.length,archive:'web-assets/'+name});
  })().catch(error=>archiveWarnings.push({url:response.url(),error:String(error)})));
 });
 await page.route('**/__environment_scale_seed__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Environment scale seed</title>'}));
 await page.goto(new URL('__environment_scale_seed__',url).href);
 await page.evaluate(project=>localStorage.setItem('slam-lab.project.v1',JSON.stringify(project)),project);
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__slamLab?.initialized&&window.__slamLab.ready&&!window.__slamLab.compiling,undefined,{timeout:120000});
 const preparation=await page.evaluate(async()=>{
  const lab=window.__slamLab,r=lab.runtime;r.pause();while(r.busy)await new Promise(done=>setTimeout(done,10));
  r.autopilot=false;
  lab.viewer?.worker?.postMessage({type:'visibility',visible:false});
  if(r.project.slamBackend!=='inertial')throw Error('Capture must exclude native SLAM from dataset generation');
  window.__scaleInitial={frame:await r.captureInitialFrame(),truth:structuredClone(r.world.truth)};
  return {project:structuredClone(r.project),graphics:r.world.graphics,calibration:r.world.calibration,
    physics:await r.physics.call('executionReceipt')};
 });
 if(preparation.graphics.acceleration==='software')throw Error('Capture requires declared native camera geometry; software fallback refused');
 if(preparation.calibration.width!==424||preparation.calibration.height!==240)throw Error('Unexpected capture dimensions');
 receipt.preparation={...preparation,project:undefined};
 await writeFile(join(output,'hallway/project.json'),JSON.stringify(preparation.project)+'\n');
 await writeFile(join(output,'hallway/native-profile.json'),nativeProfile);
 const start=performance.now();
 for(let index=0;index<frames;index++){
  if(index%20===0)sampleGpu();
  if(performance.now()-jobStarted>wallBudget*1000)throw Error('Coordinated capture wall budget exceeded; partial evidence retained');
  if(interrupted)throw Error('Capture interrupted; partial evidence retained');
  const sample=await page.evaluate(async({index})=>{
   const lab=window.__slamLab,r=lab.runtime;
   if(index){r.command={forward:0,left:0,up:0,yaw:0};await r.step();}
   const data=index?lab.latest:window.__scaleInitial;
   const {rgb,depth,...metadata}=data.frame;
   const b64=array=>{const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);let text='';
    for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text);};
   return {time:metadata.time,sequence:metadata.sequence,metadata,truth:structuredClone(data.truth),rgb:b64(rgb),depth:b64(depth)};
  },{index});
  if(sample.sequence!==index||Math.abs(sample.time-index/5)>1e-7)throw Error('Capture clock gap');
  const stem=String(index).padStart(4,'0'),image={};
  for(const field of ['rgb','depth']){
   const bytes=Buffer.from(sample[field],'base64');delete sample[field];
   const file='frames/'+stem+'-'+field+'.bin';await writeFile(join(output,'hallway',file),bytes);
   image[field]={file,bytes:bytes.length,sha256:sha(bytes)};
  }
  const position=[sample.truth.x,sample.truth.y,sample.truth.z];
  if(positionPrevious)pathLength+=Math.hypot(...position.map((x,i)=>x-positionPrevious[i]));
  positionPrevious=position;
  for(let axis=0;axis<3;axis++){bounds.min[axis]=Math.min(bounds.min[axis],position[axis]);bounds.max[axis]=Math.max(bounds.max[axis],position[axis]);}
  bins.add(position.slice(0,2).map(x=>Math.floor(x/2)).join(','));
  await writeFile(join(output,'hallway/frames',stem+'.json'),JSON.stringify({index,...sample,image,...(index?{}:{state:{parameters}})})+'\n');
  count++;
  if(index%100===0)console.log(JSON.stringify({index,time:sample.time,position,pathLength,spatialBins2m:bins.size,wallSeconds:(performance.now()-start)/1000}));
 }
 receipt.cases.push({environment:'hallway',frames:count,pathLength,bounds,spatialBins2m:bins.size});
}catch(error){receipt.failure=String(error);receipt.partialFrames=count;console.error(receipt.failure);process.exitCode=1;}
finally{
 await Promise.allSettled(pending);await browser?.close();
 receipt.webAssets=assets;receipt.pageErrors=errors;receipt.finishedAt=new Date().toISOString();
 receipt.assetArchiveWarnings=archiveWarnings;
 receipt.rendererArchiveComplete=archiveWarnings.length===0;
 if(monitorGpu)receipt.gpu={samples:gpuSamples,scope:'Whole-device samples, not process attribution. Other users continue. Guard: >=2048MiB free and <=3072MiB aggregate increase from baseline.'};
 await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({output,frames:count,pathLength,bounds,spatialBins2m:bins.size,failure:receipt.failure??null}));
}
