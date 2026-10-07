import {componentSourcePath} from './modelica-component-sources.mjs';
// Export exact editable source; no compiler invocation or Modelica math here.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(process.argv[2]??resolve(process.env.HOME,'scratch/slam_web/tmp/rgbd-localization-source'));
const names=['FastNativeFrame','FeatureSelection','RGBDFeatureMatching','RigidPointRegistration',
  'RGBDRelativePose','RGBDRegistrationUncertainty','RGBDVisualObservation','RGBDVisualRelativeObservation',
  'RGBDLandmarkProjection','SPD6Solve','ES15PoseCorrection','SchmidtRelativePoseCorrection',
  'ES15NominalPrediction','ES15Dynamics','ES15CovariancePrediction','SchmidtReferenceState',
  'RGBDInertialLocalizationStep','RGBDFastInertialLocalizationStep'];
const sha=x=>createHash('sha256').update(x).digest('hex');
const parts=names.map(name=>{const file=componentSourcePath(name);return {path:file,text:readFileSync(resolve(project,file),'utf8')};});
const source=parts.map(p=>p.text).join('\n');
mkdirSync(output,{recursive:true});writeFileSync(resolve(output,'source.mo'),source);
writeFileSync(resolve(output,'source-manifest.json'),JSON.stringify({schemaVersion:1,
  modelNames:['RGBDInertialLocalizationStep','RGBDFastInertialLocalizationStep'],
  sourceSha256:sha(source),composition:'exact source files joined with one newline, in this order',
  sources:parts.map(({path,text})=>({path,sha256:sha(text),bytes:Buffer.byteLength(text)})),
  compilerInvoked:false,nativeArtifactIssued:false,fullSlamAccepted:false},null,2)+'\n');
console.log(JSON.stringify({directory:output,sourceSha256:sha(source),sourceBytes:Buffer.byteLength(source),files:parts.length}));
