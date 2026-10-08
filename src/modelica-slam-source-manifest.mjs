import {modelicaSourcePath} from './modelica-source-locations.mjs';
// Shared generated snapshot order for Node export and opt-in browser composition.
// This inventory selects source text only; Rumoca owns all compilation/math.
const names=['FastNativeFrame','FeatureSelection','RGBDFeatureMatching','RigidPointRegistration',
  'RGBDRelativePose','RGBDRegistrationUncertainty','RGBDVisualObservation','RGBDVisualRelativeObservation',
  'RGBDLandmarkProjection','SPD6Solve','ES15PoseCorrection','SchmidtRelativePoseCorrection',
  'ES15NominalPrediction','ES15Dynamics','ES15CovariancePrediction','SchmidtReferenceState',
  'RGBDInertialLocalizationStep','RGBDFastInertialLocalizationStep',
  'RGBDInertialLocalizationInitialize','RGBDFastInertialLocalizationInitialize',
  'RGBDKeyframes','RGBDBagOfWords','RGBDVisualVocabulary','RGBDKeyframeRetrieval','RGBDBodyRelativeEdge','RGBDLoopVerification',
  'ModelicaPoseGraph','RGBDCatalogLoopVerification','RGBDGraphMeasurements','RGBDCatalogGraphCapture',
  'RGBDSpatialIndex','RGBDLandmarkMap','RGBDMapAnchors','RGBDMapAnchorAssignment',
  'RGBDAnchoredLandmarkMap','RGBDLandmarkCatalog','RGBDCatalogMapping','RGBDKeyframeLandmarks',
  'RGBDKeyframePolicy','RGBDCatalogObservation','RGBDCatalogFrame','RGBDLocalizationFrame',
  'RGBDLocalizationCatalog','GraphGaugeUncertainty','SchmidtGraphPoseCorrection',
  'RGBDGraphEstimatorCommit','ModelicaPoseGraphCovariance','RGBDGraphCaptureLedger',
  'RGBDGraphAnchorBound','RGBDGraphSelectedGauge','RGBDGraphProcessing','RGBDLocalizationProcessing',
  'RGBDFastSLAMInterface','RGBDFastSLAMReset','RGBDFastSLAMInitialize','RGBDFastSLAMStep'];

export const rgbdSlamSourceManifest=Object.freeze({
  schemaVersion:1,
  modelNames:Object.freeze(['RGBDFastSLAMReset','RGBDFastSLAMInitialize','RGBDFastSLAMStep']),
  paths:Object.freeze(names.map(name=>modelicaSourcePath(name))),
  separator:'\n',
  composition:'exact generated compatibility files joined with one newline, in this order',
  scope:'Staged image-parameterized FAST/350 RGB-D + IMU acquisition (historical90x160 model defaults); full128/256/14400 mapping and graph correction with one persistent source-owned State, actual optimizer and typed selected bound. Reference composition gates do not qualify the camera producer, full covariance convergence, actual public model execution, Rumoca WASM admission or browser throughput.'
});

// Native camera composition shares every algorithm and State capacity above.
// Preserve the historical file order for saved workspaces; never silently upgrade
// a saved dependency by replacing it with a newer bundled file.
export const rgbdSlamNativeSourceManifest=Object.freeze({
  ...rgbdSlamSourceManifest,
  modelNames:Object.freeze(['RGBDFastSLAMReset','D435FastSLAMInitialize','D435FastSLAMStep','D435FastSLAMIntervals']),
  paths:Object.freeze([...rgbdSlamSourceManifest.paths,'models/SLAM/RGBDFastSLAMIntervals.mo',
    'models/Sensors/D435ImageProfile.mo','models/SLAM/D435FastSLAM.mo']),
  scope:rgbdSlamSourceManifest.scope+' Adds native D435 RGB3/Z16-code entrypoints with explicit source-owned depth units and full-capacity held-IMU batching; source availability does not establish typed input storage or browser execution.'
});

export function rgbdSlamManifest(profile='legacy'){
  if(profile==='legacy')return rgbdSlamSourceManifest;
  if(profile==='d435-native')return rgbdSlamNativeSourceManifest;
  throw new Error(`Unknown Modelica SLAM source profile: ${String(profile)}`);
}
