// Compiler probe surfaces are test fixtures. Application Modelica sources
// contain the current algorithms and runnable entrypoints only.
const componentFixtures=new Set([
  'ES15FilterStep','RGBDCatalogFrameStep','RGBDCatalogGraphStep',
  'RGBDCatalogLoopStep','RGBDCatalogMappingStep',
  'RGBDFastCatalogLocalizationInitialize','RGBDFastCatalogLocalizationStep',
  'RGBDGraphMeasurementStep','RGBDKeyframeLandmarkStep',
  'RGBDKeyframeRetrievalStep','RGBDLandmarkCatalogMap',
  'RGBDLocalizationCatalogInterface','RGBDLoopGeometricVerification'
]);

export function componentSourcePath(name){
  if(!/^[A-Za-z_]\w*$/.test(name))throw Error('Expected a Modelica component name');
  return componentFixtures.has(name)
    ?`tests/compiler-probes/fixtures/components/${name}.mo`:`models/${name}.mo`;
}
