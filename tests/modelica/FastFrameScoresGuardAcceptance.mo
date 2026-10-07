// Full-raster function gate, separately labeled from FastNativeFrame model admission.
function FastFrameScoresGuardChecks
  input Boolean enabled;
  output Boolean checks[4];
protected
  Real rgba[90,160,4]; Real scores[90*160];
algorithm
  rgba := FastNativeFrameGuardTests.Image(not enabled);
  scores := FastFrameScores(rgba,enabled);
  checks := FastNativeFrameGuardTests.Check(scores,{18,0,1e8,3,240,1,3,3},enabled);
end FastFrameScoresGuardChecks;

model FastFrameScoresGuardAcceptance
  output Boolean frameEnabled;
  output Boolean checks[4];
equation
  frameEnabled = (time >= 1 and time < 2) or time >= 3;
  checks = FastFrameScoresGuardChecks(frameEnabled);
end FastFrameScoresGuardAcceptance;
