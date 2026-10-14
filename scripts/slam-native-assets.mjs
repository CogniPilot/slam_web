// Publish compiler-exported native SLAM programs (Initialize and Step) as static
// site assets. The exports come from Rumoca `native_step ... EXPORT_DIR`; they are
// not derived from the browser compiler package. Without local exports, install
// the pinned native delivery so ordinary static builds include the programs.
import {mkdir,readFile,writeFile,access,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {publishedAssets,readExport} from './slam-native-manifest.mjs';
import {rgbdSlamNativeSourceManifest as native} from '../src/modelica-slam-source-manifest.mjs';
import {D435_PAIRED_RESOLUTIONS} from '../src/camera-resolutions.mjs';
import {installPublishedNativeAssets} from './install-slam-native-package.mjs';

const {values}=parseArgs({options:{exports:{type:'string'},destination:{type:'string'},require:{type:'boolean'},package:{type:'boolean'}}});
const source=await Promise.all(native.paths.map(file=>readFile(file,'utf8')));
const sourceSha256=createHash('sha256').update(source.join(native.separator)).digest('hex');
const defaultRoot=join(homedir(),'scratch/slam_web/build/slam-native-profiles');
let root=resolve(values.exports??process.env.SLAM_NATIVE_EXPORTS??defaultRoot);
if(!values.exports&&!process.env.SLAM_NATIVE_EXPORTS){
  try{await access(join(root,'profiles/424x240/profile.json'));}
  catch{root=join(homedir(),'scratch/slam_web/build/slam-native-exports');}
}
const destination=resolve(values.destination??'public/vendor/slam');
if(values.package){
  if(values.exports||process.env.SLAM_NATIVE_EXPORTS)throw new Error('Choose either --package or local exports');
  await installPublishedNativeAssets(destination,sourceSha256);process.exit(0);
}
let directories={initialize:join(root,'init-named'),step:join(root,'step-named')};
let defaultModels={initialize:'D435FastSLAMInitialize',step:'D435FastSLAMStep'};
let defaultProfile;
try{
  try{for(const directory of Object.values(directories))await access(join(directory,'layout.json'));}
  catch{
    // A fresh profile-only export is sufficient; legacy root exports are optional.
    for(const mode of [...D435_PAIRED_RESOLUTIONS].sort((a,b)=>Number(b.id==='848x480')-Number(a.id==='848x480'))){
      try{
        const directory=join(root,'profiles',mode.id);
        defaultProfile=JSON.parse(await readFile(join(directory,'profile.json'),'utf8'));
        directories={initialize:join(directory,'init-named'),step:join(directory,'step-named')};
        defaultModels=defaultProfile.models;break;
      }catch(error){if(error.code!=='ENOENT')throw error;}
    }
    if(!defaultProfile)throw new Error('No complete native SLAM exports');
  }
}
catch{
  if(!values.exports&&!process.env.SLAM_NATIVE_EXPORTS){
    await installPublishedNativeAssets(destination,sourceSha256);
    process.exit(0);
  }
  await rm(destination,{recursive:true,force:true});
  const message=`Native SLAM exports not found under ${root}; the site will report native SLAM as unpublished.`;
  if(values.require)throw new Error(message);
  console.warn(message);process.exit(0);
}
const exports={
  initialize:await readExport(defaultModels.initialize,directories.initialize),
  step:await readExport(defaultModels.step,directories.step),
};
const {manifest,blobs}=publishedAssets(exports,{sourceSha256:defaultProfile?.sourceSha256??sourceSha256,baseSourceSha256:sourceSha256,exportedFrom:'rumoca native_step'});
for(const mode of D435_PAIRED_RESOLUTIONS){
  const directory=join(root,'profiles',mode.id);
  let profile;
  try{profile=JSON.parse(await readFile(join(directory,'profile.json'),'utf8'));}
  catch(error){if(error.code==='ENOENT')continue;throw error;}
  const actualSha=createHash('sha256').update(await readFile(join(directory,'source.mo'))).digest('hex');
  if(profile.resolution!==mode.id||profile.sourceSha256!==actualSha||profile.baseSourceSha256!==sourceSha256)throw new Error(`Stale native SLAM profile ${mode.id}; export the current source first`);
  const result=publishedAssets({
    initialize:await readExport(profile.models.initialize,join(directory,'init-named')),
    step:await readExport(profile.models.step,join(directory,'step-named')),
  },{sourceSha256:profile.sourceSha256});
  for(const layout of Object.values(result.manifest.models))
    if(layout.inputs.rgb?.count!==mode.width*mode.height*3||layout.inputs.depth?.count!==mode.width*mode.height)throw new Error(`Native profile ${mode.id} has mismatched image dimensions`);
  manifest.profiles??={};manifest.profiles[mode.id]={sourceSha256:profile.sourceSha256,models:result.manifest.models};
  for(const [name,blob] of result.blobs)if(!blobs.has(name))blobs.set(name,blob);
}
// The FMI-LS package is a plain download: keep it as the compiler published it.
let fmu;
try{
  const name='D435FastSLAMStep.fmu',bytes=await readFile(join(root,'package','published',name));
  const sha256=createHash('sha256').update(bytes).digest('hex');
  fmu={name,model:'D435FastSLAMStep',file:`${sha256.slice(0,16)}-${name}`,bytes:bytes.length,sha256,data:bytes};
  manifest.fmu={name,model:fmu.model,file:fmu.file,bytes:fmu.bytes,sha256};
}catch(error){if(error.code!=='ENOENT')throw error;console.warn(`No FMI-LS package under ${join(root,'package','published')}; the site offers no FMU download.`);}
await rm(destination,{recursive:true,force:true});
await mkdir(destination,{recursive:true});
let total=0;
for(const [name,{bytes}] of blobs){await writeFile(join(destination,name),bytes);total+=bytes.length;}
if(fmu){await writeFile(join(destination,fmu.file),fmu.data);total+=fmu.bytes;}
await writeFile(join(destination,'manifest.json'),JSON.stringify(manifest));
console.log(`Native SLAM assets ready: ${blobs.size} files, ${(total/1e6).toFixed(1)} MB compressed, source ${sourceSha256.slice(0,12)}.`);
