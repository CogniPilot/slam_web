import {componentSourcePath} from './modelica-component-sources.mjs';
// Export exact authored Modelica dependencies; compilation belongs to Rumoca.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.resolve(process.argv[2]??path.join(os.homedir(),'scratch/slam_web/tmp/rgbd-loop-verification-source'));
const names=['RGBDFeatureMatching','RigidPointRegistration','RGBDRegistrationUncertainty',
  'RGBDKeyframes','RGBDBodyRelativeEdge','RGBDLoopVerification','RGBDLoopGeometricVerification'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sources=names.map(name=>{const file=componentSourcePath(name);return {path:file,text:fs.readFileSync(path.join(app,file),'utf8')};});
const source=sources.map(part=>part.text).join('\n');
const manifest={model:'RGBDLoopGeometricVerification',sourceSha256:sha(source),
  composition:'Exact authored dependencies joined with one newline, in this order',
  sources:sources.map(({path,text})=>({path,sha256:sha(text),bytes:Buffer.byteLength(text)})),
  compilerInvoked:false,artifactIssued:false,fullSlamAccepted:false};
fs.mkdirSync(directory,{recursive:true});
fs.writeFileSync(path.join(directory,'source.mo'),source);
fs.writeFileSync(path.join(directory,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({directory,...manifest}));
