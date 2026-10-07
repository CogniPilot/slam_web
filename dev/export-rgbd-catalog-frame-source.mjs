import {componentSourcePath} from './modelica-component-sources.mjs';
// Authored sources only: Rumoca owns compilation, scheduling and execution.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(process.argv[2]??resolve(homedir(),'scratch/slam_web/tmp/rgbd-catalog-frame-source'));
const names=['RGBDRegistrationUncertainty','RGBDKeyframes','RGBDBagOfWords','RGBDKeyframeRetrieval',
  'RGBDFeatureMatching','RigidPointRegistration','RGBDBodyRelativeEdge','RGBDLoopVerification',
  'ModelicaPoseGraph','RGBDCatalogLoopVerification','RGBDGraphMeasurements','RGBDCatalogGraphCapture',
  'RGBDSpatialIndex','RGBDLandmarkMap','RGBDMapAnchors','RGBDMapAnchorAssignment',
  'RGBDAnchoredLandmarkMap','RGBDLandmarkCatalog','RGBDLandmarkProjection','RGBDCatalogMapping',
  'RGBDKeyframeLandmarks','RGBDKeyframePolicy','RGBDCatalogObservation','RGBDCatalogFrame','RGBDCatalogFrameStep'];
const sha=source=>createHash('sha256').update(source).digest('hex');
const files=names.map(name=>{const file=componentSourcePath(name);
  return {path:file,source:readFileSync(resolve(app,file),'utf8')};});
const source=files.map(file=>file.source).join('\n');
mkdirSync(output,{recursive:true});writeFileSync(resolve(output,'source.mo'),source);
writeFileSync(resolve(output,'source-manifest.json'),JSON.stringify({model:'RGBDCatalogFrameStep',sourceSha256:sha(source),
  sources:files.map(file=>({path:file.path,sha256:sha(file.source)})),
  scope:'Every-frame keyframe selection, conditional visual capture/graph, calibrated projection and noncapture anchored mapping; enclosing estimator publication pending',
  compiled:false,browserIntegrated:false,fullSlam:false},null,2)+'\n');
console.log(JSON.stringify({directory:output,model:'RGBDCatalogFrameStep',sourceSha256:sha(source)}));
