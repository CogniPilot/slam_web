import {componentSourcePath} from './modelica-component-sources.mjs';
// Exact authored graph only; Rumoca owns compilation and numerical execution.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(process.argv[2]??resolve(homedir(),'scratch/slam_web/tmp/rgbd-catalog-mapping-source'));
const names=['RGBDRegistrationUncertainty','RGBDKeyframes','RGBDBagOfWords','RGBDKeyframeRetrieval',
  'RGBDFeatureMatching','RigidPointRegistration','RGBDBodyRelativeEdge','RGBDLoopVerification',
  'ModelicaPoseGraph','RGBDCatalogLoopVerification','RGBDGraphMeasurements','RGBDCatalogGraphCapture',
  'RGBDSpatialIndex','RGBDLandmarkMap','RGBDMapAnchors','RGBDMapAnchorAssignment',
  'RGBDAnchoredLandmarkMap','RGBDLandmarkCatalog','RGBDLandmarkProjection','RGBDCatalogMapping','RGBDCatalogMappingStep'];
const sha=source=>createHash('sha256').update(source).digest('hex');
const files=names.map(name=>{const file=componentSourcePath(name);
  return {path:file,source:readFileSync(resolve(app,file),'utf8')};});
const source=files.map(file=>file.source).join('\n');
mkdirSync(output,{recursive:true});writeFileSync(resolve(output,'source.mo'),source);
writeFileSync(resolve(output,'source-manifest.json'),JSON.stringify({model:'RGBDCatalogMappingStep',sourceSha256:sha(source),
  sources:files.map(file=>({path:file.path,sha256:sha(file.source)})),
  scope:'One source graph joins appearance, sequential/loop geometry, catalog/graph admission, projection and anchored map; no estimator or persistent publication',
  compiled:false,browserIntegrated:false,fullSlam:false},null,2)+'\n');
console.log(JSON.stringify({directory:output,model:'RGBDCatalogMappingStep',sourceSha256:sha(source)}));
