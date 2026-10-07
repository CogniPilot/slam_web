import {componentSourcePath} from './modelica-component-sources.mjs';
// Exact authored sources only. Compilation and numerical execution belong to Rumoca.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(process.argv[2]??resolve(homedir(),'scratch/slam_web/tmp/rgbd-keyframe-landmark-source'));
const names=['RGBDRegistrationUncertainty','RGBDKeyframes','RGBDSpatialIndex','RGBDLandmarkMap','RGBDMapAnchors','RGBDMapAnchorAssignment','RGBDAnchoredLandmarkMap','RGBDLandmarkCatalog','RGBDKeyframeLandmarks','RGBDLandmarkProjection','RGBDKeyframeLandmarkStep'];
const sha=value=>createHash('sha256').update(value).digest('hex');
const parts=names.map(name=>{const file=componentSourcePath(name);return {path:file,text:readFileSync(resolve(project,file),'utf8')};});
const source=parts.map(part=>part.text).join('\n');
const from='parameter Real confirmationObservations = 3.0;';
const to='parameter Real confirmationObservations = 2.0;';
const wrapper=parts.at(-1);
if(wrapper.text.split(from).length!==2)throw Error('Expected one confirmation setting in the keyframe wrapper');
const edited=[...parts.slice(0,-1).map(part=>part.text),wrapper.text.replace(from,to)].join('\n');
mkdirSync(output,{recursive:true});
writeFileSync(resolve(output,'source.mo'),source);
writeFileSync(resolve(output,'edited-source.mo'),edited);
const manifest={schemaVersion:1,model:'RGBDKeyframeLandmarkStep',sourceSha256:sha(source),editedSourceSha256:sha(edited),
  composition:'exact authored files joined with one newline, in this order; edited source changes only the keyframe wrapper parameter',
  sources:parts.map(({path,text})=>({path,sha256:sha(text),bytes:Buffer.byteLength(text)})),
  compilerInvoked:false,nativeArtifactIssued:false,fullSlamAccepted:false};
writeFileSync(resolve(output,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({directory:output,...manifest}));
