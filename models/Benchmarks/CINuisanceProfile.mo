// Diagnostic of the existing correction rule; this is not an estimator repair.
function ProbeNuisanceCI
  input Real weight;
  output Real accepted; output Real reason;
  output Real varianceRatio[9]; output Real nuisanceMeanDelta[9];
protected
  SchmidtGraphPoseCorrection.State previous;
  SchmidtGraphPoseCorrection.Policy policy;
  SchmidtGraphPoseCorrection.Attempt attempt;
  SchmidtGraphPoseCorrection.Result result;
  GraphGaugeUncertainty.Estimate graph;
  GraphGaugeUncertainty.Binding binding;
  Integer nuisance[9] = {4,5,6,10,11,12,13,14,15};
algorithm
  binding.generation := 1; binding.graphRevision := 1; binding.catalogPoseRevision := 0;
  binding.anchorId := 1; binding.anchorEpoch := 0; binding.anchorCaptureSequence := 1;
  binding.currentId := 3; binding.currentEpoch := 2; binding.currentCaptureSequence := 3;
  binding.referenceId := 2; binding.referenceEpoch := 1; binding.referenceCaptureSequence := 2;
  binding.chart := 1; binding.anchorTime := 0; binding.currentTime := 0.2; binding.referenceTime := 0.1;
  binding.sourceRevision := 1; binding.factorProvenance := 1; binding.anchorBoundProvenance := 1;
  previous.position := zeros(3); previous.velocity := {0.4,-0.3,0.2}; previous.rotation := identity(3);
  previous.accelBias := {0.01,0.02,0.03}; previous.gyroBias := {0.001,0.002,0.003};
  previous.covariance := 0.1*identity(15); previous.crossCovariance := zeros(15,6);
  previous.referenceCovariance := 0.1*identity(6); previous.referencePosition := zeros(3); previous.referenceRotation := identity(3);
  previous.referenceAvailable := true; previous.referenceUsed := true;
  previous.generation := 1; previous.sourceRevision := 1; previous.currentId := 3; previous.currentEpoch := 2;
  previous.currentCaptureSequence := 3; previous.referenceId := 2; previous.referenceEpoch := 1;
  previous.referenceCaptureSequence := 2; previous.lastUsedEpoch := 1; previous.predictionTime := 0.2; previous.referenceTime := 0.1;
  graph.binding := binding; graph.positions := {{0.01,0,0},{0.01,0,0}};
  graph.rotations[1,:,:] := identity(3); graph.rotations[2,:,:] := identity(3); graph.covariance := 0.1*identity(12);
  policy := SchmidtGraphPoseCorrection.DefaultPolicy(); policy.weight := weight; policy.constrainVelocityAndBias := true;
  attempt.generation := 1; attempt.graphRevision := 0; attempt.factorProvenance := 0;
  result := SchmidtGraphPoseCorrection.Correct(previous,graph,binding,attempt,policy,true);
  accepted := if result.accepted then 1.0 else 0.0; reason := result.reason;
  for i in 1:9 loop
    varianceRatio[i] := result.next.covariance[nuisance[i],nuisance[i]]/previous.covariance[nuisance[i],nuisance[i]];
    nuisanceMeanDelta[i] := result.correction[nuisance[i]];
  end for;
end ProbeNuisanceCI;

model CINuisanceProfile
  input Real weight = 0.5;
  output Real accepted; output Real reason;
  output Real varianceRatio[9]; output Real nuisanceMeanDelta[9];
equation
  (accepted,reason,varianceRatio,nuisanceMeanDelta) = ProbeNuisanceCI(weight);
end CINuisanceProfile;
