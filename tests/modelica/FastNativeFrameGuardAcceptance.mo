model FastNativeFrameGuardAcceptance
  output Boolean frameEnabled;
  output Boolean checks[4];
protected
  parameter Real image[90,160,4] = FastNativeFrameGuardTests.Image(false);
  parameter Real poison[90,160,4] = FastNativeFrameGuardTests.Image(true);
  // One detector instance: disabled poison -> image -> disabled poison ->
  // identical restored image. All57600 RGBA cells and14400 scores remain.
  FastNativeFrame detector(height=90,width=160,enabled=frameEnabled,
    rgb=if frameEnabled then image else poison);
equation
  frameEnabled = (time >= 1 and time < 2) or time >= 3;
  checks = FastNativeFrameGuardTests.Check(detector.scores,detector.selection,frameEnabled);
end FastNativeFrameGuardAcceptance;
