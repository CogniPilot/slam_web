// Publish compiler-exported native SLAM programs (Initialize and Step) as static
// site assets. The exports come from Rumoca `native_step ... EXPORT_DIR`; they are
// not derived from the browser compiler package. Missing exports leave the site
// without native SLAM, which the application reports at run time.
import {mkdir,readFile,writeFile,access,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {publishedAssets,readExport} from './slam-native-manifest.mjs';
import {rgbdSlamNativeSourceManifest as native} from '../src/modelica-slam-source-manifest.mjs';

const {values}=parseArgs({options:{exports:{type:'string'},destination:{type:'string'},require:{type:'boolean'}}});
const root=resolve(values.exports??process.env.SLAM_NATIVE_EXPORTS??join(homedir(),'scratch/slam_web/build/slam-native-exports'));
const destination=resolve(values.destination??'public/vendor/slam');
const directories={initialize:join(root,'init-named'),step:join(root,'step-named')};
try{for(const directory of Object.values(directories))await access(join(directory,'layout.json'));}
catch{
  await rm(destination,{recursive:true,force:true});
  const message=`Native SLAM exports not found under ${root}; the site will report native SLAM as unpublished.`;
  if(values.require)throw new Error(message);
  console.warn(message);process.exit(0);
}
const source=await Promise.all(native.paths.map(file=>readFile(file,'utf8')));
const sourceSha256=createHash('sha256').update(source.join(native.separator)).digest('hex');
const exports={
  initialize:await readExport('D435FastSLAMInitialize',directories.initialize),
  step:await readExport('D435FastSLAMStep',directories.step),
};
const {manifest,blobs}=publishedAssets(exports,{sourceSha256,exportedFrom:'rumoca native_step'});
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
