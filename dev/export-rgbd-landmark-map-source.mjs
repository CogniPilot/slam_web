import {componentSourcePath} from './modelica-component-sources.mjs';
// Export exact Modelica source and dependency hashes; compilation belongs to Rumoca.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(process.argv[2]??resolve(homedir(),'scratch/slam_web/tmp/rgbd-landmark-map-source'));
const names=['RGBDSpatialIndex','RGBDLandmarkMap'];
const sha=value=>createHash('sha256').update(value).digest('hex');
const parts=names.map(name=>{const file=componentSourcePath(name);return {path:file,text:readFileSync(resolve(project,file),'utf8')};});
const source=parts.map(part=>part.text).join('\n');
const from='parameter Real confirmationObservations = 3.0;';
const to='parameter Real confirmationObservations = 2.0;';
if(source.split(from).length!==2)throw Error('Expected exactly one editable confirmation setting');
const edited=source.replace(from,to);
mkdirSync(output,{recursive:true});
writeFileSync(resolve(output,'source.mo'),source);
writeFileSync(resolve(output,'edited-source.mo'),edited);
const manifest={schemaVersion:1,model:'RGBDLandmarkMap',sourceSha256:sha(source),editedSourceSha256:sha(edited),
  composition:'exact source files joined with one newline, in this order',
  sources:parts.map(({path,text})=>({path,sha256:sha(text),bytes:Buffer.byteLength(text)})),
  compilerInvoked:false,nativeArtifactIssued:false,fullSlamAccepted:false};
writeFileSync(resolve(output,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({directory:output,...manifest}));
