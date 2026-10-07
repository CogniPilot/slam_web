// Exact Modelica composition only. Rumoca is the compiler and numerical owner.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {rgbdSlamSourceManifest as manifest,rgbdSlamNativeSourceManifest as nativeManifest} from '../src/modelica-slam-source-manifest.mjs';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(process.argv[2]??resolve(homedir(),'scratch/slam_web/tmp/rgbd-slam-source'));
const modes=process.argv.slice(3);
if(modes.some(mode=>!['--intervals','--native-profile'].includes(mode))
  ||new Set(modes).size!==modes.length)throw Error('Expected optional --intervals and/or --native-profile after output directory');
const nativeProfile=modes.includes('--native-profile');
const intervals=modes.includes('--intervals')||nativeProfile;
// Keep existing saved browser workspaces intact while the typed Rumoca State
// boundary is pending. The explicit compiler-review composition adds the
// source-owned camera transaction without silently changing their dependencies.
const paths=nativeProfile?nativeManifest.paths:[...manifest.paths,...(intervals?['models/SLAM/RGBDFastSLAMIntervals.mo']:[])];
const modelNames=nativeProfile?nativeManifest.modelNames
  :intervals?[...manifest.modelNames,'RGBDFastSLAMIntervals']:manifest.modelNames;
const sha=value=>createHash('sha256').update(value).digest('hex');
const files=paths.map(path=>({path,source:readFileSync(resolve(app,path),'utf8')}));
const source=files.map(file=>file.source).join(manifest.separator);
mkdirSync(output,{recursive:true});
writeFileSync(resolve(output,'source.mo'),source);
writeFileSync(resolve(output,'source-manifest.json'),JSON.stringify({schemaVersion:manifest.schemaVersion,
  modelNames,
  sourceSha256:sha(source),composition:manifest.composition,
  sources:files.map(file=>({path:file.path,sha256:sha(file.source),bytes:Buffer.byteLength(file.source)})),
  scope:manifest.scope+(intervals?' Adds full-capacity held-IMU batching with one final raw image and whole-State rollback; reference transaction qualification does not issue a Rumoca artifact.':'')
    +(nativeProfile?' Selects848x480 D435 entrypoints without resizing feature/keyframe/map capacities. Native source composition is not compiler/runtime/SLAM qualification.':''),
  compilerInvoked:false,nativeArtifactIssued:false,browserIntegrated:false,fullSlamAccepted:false},null,2)+'\n');
console.log(JSON.stringify({directory:output,sourceSha256:sha(source),sourceBytes:Buffer.byteLength(source),files:files.length}));
