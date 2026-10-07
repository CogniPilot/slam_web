import {componentSourcePath} from './modelica-component-sources.mjs';
// Exact authored Modelica composition. Rumoca owns all compilation and math.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(process.argv[2]??resolve(homedir(),'scratch/slam_web/tmp/rgbd-localization-catalog-source'));
const names=['FastNativeFrame','FeatureSelection','RGBDFeatureMatching','RigidPointRegistration',
  'RGBDRelativePose','RGBDRegistrationUncertainty','RGBDVisualObservation','RGBDVisualRelativeObservation',
  'RGBDLandmarkProjection','SPD6Solve','ES15PoseCorrection','SchmidtRelativePoseCorrection',
  'ES15NominalPrediction','ES15Dynamics','ES15CovariancePrediction','SchmidtReferenceState',
  'RGBDInertialLocalizationStep','RGBDFastInertialLocalizationStep',
  'RGBDInertialLocalizationInitialize','RGBDFastInertialLocalizationInitialize',
  'RGBDKeyframes','RGBDBagOfWords','RGBDKeyframeRetrieval','RGBDBodyRelativeEdge','RGBDLoopVerification',
  'ModelicaPoseGraph','RGBDCatalogLoopVerification','RGBDGraphMeasurements','RGBDCatalogGraphCapture',
  'RGBDSpatialIndex','RGBDLandmarkMap','RGBDMapAnchors','RGBDMapAnchorAssignment',
  'RGBDAnchoredLandmarkMap','RGBDLandmarkCatalog','RGBDCatalogMapping','RGBDKeyframeLandmarks',
  'RGBDKeyframePolicy','RGBDCatalogObservation','RGBDCatalogFrame','RGBDLocalizationFrame',
  'RGBDLocalizationCatalog','RGBDLocalizationCatalogInterface',
  'RGBDFastCatalogLocalizationInitialize','RGBDFastCatalogLocalizationStep'];
const sha=value=>createHash('sha256').update(value).digest('hex');
const files=names.map(name=>{const file=componentSourcePath(name);
  return {path:file,source:readFileSync(resolve(app,file),'utf8')};});
const source=files.map(file=>file.source).join('\n');
mkdirSync(output,{recursive:true});
writeFileSync(resolve(output,'source.mo'),source);
writeFileSync(resolve(output,'source-manifest.json'),JSON.stringify({schemaVersion:1,
  modelNames:['RGBDFastCatalogLocalizationInitialize','RGBDFastCatalogLocalizationStep'],
  sourceSha256:sha(source),composition:'exact authored files joined with one newline, in this order',
  sources:files.map(file=>({path:file.path,sha256:sha(file.source),bytes:Buffer.byteLength(file.source)})),
  scope:'Full90x160 FAST/350 localization, explicit initialization, frame bridge, image-attempt receipts and conditional128/256/14400 catalog/map publication; graph correction not implemented',
  compilerInvoked:false,nativeArtifactIssued:false,browserIntegrated:false,fullSlamAccepted:false},null,2)+'\n');
console.log(JSON.stringify({directory:output,sourceSha256:sha(source),sourceBytes:Buffer.byteLength(source),files:files.length}));
