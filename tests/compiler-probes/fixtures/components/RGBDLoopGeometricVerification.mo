// Stateless browser-compilation surface for the complete geometric verifier.
// Record inputs are retained measurements, not ground-truth poses or images.
// A verified proposal still requires Modelica graph/correlation admission.
model RGBDLoopGeometricVerification
  parameter Integer trials = 96;
  parameter Integer refinements = 4;
  parameter Integer minimumInliers = 12;
  parameter Real minimumFraction = 0.5;
  parameter Real inlierDistance = 0.08;
  parameter Real maximumRms = 0.03;
  parameter Real minimumAge = 5.0;
  parameter Real descriptorRatio = 0.8;
  parameter Real maximumDescriptorDistance = 0.8;
  parameter Real coordinateLimit = 100.0;
  parameter Real rankTolerance = 1e-8;
  parameter Real localizationSigma = 0.5;
  parameter Real depthInflation = 1.0;
  parameter Real minimumPivot = 1e-10;
  input RGBDKeyframes.Frame reference = RGBDKeyframes.EmptyFrame();
  input RGBDKeyframes.Frame current = RGBDKeyframes.EmptyFrame();
  input Boolean requested = false;
  input Integer seed = 7;
  output RGBDLoopVerification.Proposal proposal;
equation
  proposal = RGBDLoopVerification.Verify(reference,current,requested,seed,trials,refinements,
    minimumInliers,minimumFraction,inlierDistance,maximumRms,minimumAge,descriptorRatio,
    maximumDescriptorDistance,coordinateLimit,rankTolerance,localizationSigma,depthInflation,minimumPivot);
end RGBDLoopGeometricVerification;
