// Native reference controls for the optional test-only capture trace.
package RGBDRenderedCaptureDiagnosticsTests
  function Run
    output Boolean checks[2];
  protected
    RGBDGraphProcessing.State fresh;
    Real stages[26];
    Real calibration[14];
  algorithm
    fresh := RGBDGraphProcessing.Empty(RGBDLocalizationCatalog.Empty(
      RGBDLocalizationCatalog.EmptyEstimator()));
    calibration := {4.0,4.0,4.0,3.0,4.0,4.0,0.05,0.08,84.3,0.18,0.0,-0.04,0.28,10.0};
    // A valid empty measurement reaches the minimum-feature policy, but
    // retrieval and graph stages must remain unexecuted/canonical zero.
    stages := RGBDRenderedVisualDiagnostics.CaptureFailure(fresh,
      fresh.estimator.localization.estimator,fill(128.0,7,9,3),fill(1.0,7,9),
      zeros(RGBDKeyframes.featureCapacity,2),0.0,calibration,
      [0,0,1;-1,0,0;0,-1,0],0,0.0,{0.0,1.0});
    checks[1] := max(abs(stages[1:12]-{1,0,1,0,5,0,0,0,0,0,0,0})) == 0
      and max(abs(stages[13:25])) == 0 and stages[26] == 1;
    // Invalid acquisition metadata must stop at frame admission, without
    // turning the remaining zeros into successful policy/capture receipts.
    stages := RGBDRenderedVisualDiagnostics.CaptureFailure(fresh,
      fresh.estimator.localization.estimator,fill(128.0,7,9,3),fill(1.0,7,9),
      zeros(RGBDKeyframes.featureCapacity,2),0.0,calibration,
      [0,0,1;-1,0,0;0,-1,0],-1,0.0,{0.0,1.0});
    checks[2] := max(abs(stages[1:12]-{0,2,0,0,0,0,0,0,0,0,0,0})) == 0
      and max(abs(stages[13:26])) == 0;
  end Run;
end RGBDRenderedCaptureDiagnosticsTests;
