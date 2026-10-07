// Separate equation-model gate: all350 projection rows, independent closed form.
model RGBDCatalogMappingProjectionAcceptance
  function OpticalFixture
    output Real point[350,3];
  algorithm
    for feature in 1:350 loop
      point[feature,:] := {(mod(feature,7)-3)*0.22,(div(feature,7)-2)*0.18,2+mod(feature,5)*0.11};
    end for;
  end OpticalFixture;
  parameter Real optical[350,3] = OpticalFixture();
  output Boolean checks[2];
protected
  Real expected[350,3];
  RGBDLandmarkProjection projection(opticalPoint=optical,enabled=ones(350),activeCount=350,poseAccepted=1,
    bodyRotation=[0,-1,0;1,0,0;0,0,1],bodyPosition={2,3,4},
    opticalToBody=[0,0,1;-1,0,0;0,-1,0],cameraOriginBody={0.18,0,-0.04});
equation
  for feature in 1:350 loop
    expected[feature,:] = {optical[feature,1]+2,optical[feature,3]+3.18,3.96-optical[feature,2]};
  end for;
  checks[1] = projection.configurationValid > 0.5 and projection.poseValid > 0.5
    and projection.validCount > 349.5 and projection.invalidCount < 0.5 and min(projection.landmarkEnabled) > 0.5;
  checks[2] = max(abs(projection.worldPoint-expected)) < 1e-9;
end RGBDCatalogMappingProjectionAcceptance;
