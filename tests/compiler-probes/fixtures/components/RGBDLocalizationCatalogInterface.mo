// Raw data and complete carried state only. Numerical execution is Modelica.
// These public models remain staged until Rumoca issuance and browser acceptance.
partial model RGBDLocalizationCatalogInterface
  constant Integer imageHeight = 90;
  constant Integer imageWidth = 160;
  constant Integer featureCapacity = RGBDKeyframes.featureCapacity;
  constant Integer descriptorSize = RGBDKeyframes.descriptorSize;
  constant Real defaultRgbCalibration[4] = {imageWidth/(2.0*tan(69.0*3.141592653589793/360.0)),
    imageHeight/(2.0*tan(42.0*3.141592653589793/360.0)),(imageWidth-1)/2.0,(imageHeight-1)/2.0};
  constant Real defaultDepthCalibration[4] = {imageWidth/(2.0*tan(87.0*3.141592653589793/360.0)),
    imageHeight/(2.0*tan(58.0*3.141592653589793/360.0)),(imageWidth-1)/2.0,(imageHeight-1)/2.0};
  input RGBDLocalizationCatalog.State previous;
  input Real rgb[imageHeight,imageWidth,4];
  input Real depth[imageHeight,imageWidth];
  input Real rgbCalibration[4] = defaultRgbCalibration;
  input Real depthCalibration[4] = defaultDepthCalibration;
  input Real disparityNoise = 0.08;
  input Real noiseReferenceFx = 848.0/(2.0*tan(87.0*3.141592653589793/360.0));
  input Real baseline = 0.05;
  input Real opticalToBody[3,3] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[3] = {0.18,0.0,-0.04};
  input Real accel[3] = {0.0,0.0,9.81}; input Real gyro[3] = zeros(3);
  input Real gravity[3] = {0.0,0.0,-9.81};
  input Real density[12] = {0.06,0.06,0.06,0.006,0.006,0.006,0.002,0.002,0.002,0.0002,0.0002,0.0002};
  input Real h = 1.0/90.0;
  input Real intervalTime;
  input Integer imageEpoch;
  input Boolean imageRequested = true;
  input Boolean localCaptureRequested = true;
  input Boolean requested = true;
  input Real vocabulary[RGBDKeyframes.wordCapacity,descriptorSize];
  input Real vocabularyEnabled[RGBDKeyframes.wordCapacity];
  parameter Real selectedFeatureLimit = featureCapacity;
  parameter Real absoluteThreshold = 18.0;
  parameter Real minimumInterval = 0.5; parameter Real maximumInterval = 2.0;
  parameter Real translationThreshold = 0.6; parameter Real rotationThreshold = 0.25;
  parameter Integer minimumFeatures = 12;
  parameter Real voxelWidth = 0.25; parameter Real mergeRadius = 0.15;
  parameter Real maximumDistance = 80.0; parameter Real tentativeLifetime = 0.5;
  parameter Real confirmedLifetime = 5.0; parameter Real confirmationObservations = 3.0;
  parameter Real maximumConfidence = 8.0; parameter Real maximumTentative = 700.0;
  output RGBDLocalizationCatalog.Result result;
  output Real nextQuaternion[4];
  output Real selectionValid; output Real predictionAccepted; output Real initializationAccepted;
  output Real observationAccepted; output Real captureAccepted; output Real matchCount;
  output Real features[featureCapacity,3]; output Real featureEnabled[featureCapacity];
  output Real trackingCurrentPixel[featureCapacity,2]; output Real trackingReferencePixel[featureCapacity,2];
  output Real trackingEnabled[featureCapacity];
end RGBDLocalizationCatalogInterface;
