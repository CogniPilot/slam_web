// Generated from CogniPilot/modelica_models 782a268bd05735e541e61efdf22c5ddf7dab55ff; edit the canonical packages there.
// Native-camera entrypoints for the complete authored SLAM processing graph.
// Native RGB8/Z16 shape and depth-scale bindings: math and State are shared
// with the parameterized entrypoints. These targets still require Rumoca WASM
// issuance and end-to-end browser qualification before runtime admission.
model D435FastSLAMInitialize

  extends RGBDFastSLAMInitialize(imageHeight=D435ImageProfile.height,
    imageWidth=D435ImageProfile.width,channelCount=D435ImageProfile.colorChannels,
    depthUnits=D435ImageProfile.depthUnits);
end D435FastSLAMInitialize;

model D435FastSLAMStep

  extends RGBDFastSLAMStep(imageHeight=D435ImageProfile.height,
    imageWidth=D435ImageProfile.width,channelCount=D435ImageProfile.colorChannels,
    depthUnits=D435ImageProfile.depthUnits);
end D435FastSLAMStep;

model D435FastSLAMIntervals

  extends RGBDFastSLAMIntervals(imageHeight=D435ImageProfile.height,
    imageWidth=D435ImageProfile.width,channelCount=D435ImageProfile.colorChannels,
    depthUnits=D435ImageProfile.depthUnits);
end D435FastSLAMIntervals;
