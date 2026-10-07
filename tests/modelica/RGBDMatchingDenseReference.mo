// Frozen original pair traversal, for exact-output regression comparison.
// Original whole-file SHA256 1adc065bee50fcf583165daa015f3f0170b42a3c73ff2bd3260fafb40e71b59b
function MatchRGBDDescriptorsDenseReference
  input Real referenceDescriptor[:,49]; input Real currentDescriptor[:,49];
  input Real referencePoint[:,3]; input Real currentPoint[:,3];
  input Real referenceEnabled[:]; input Real currentEnabled[:];
  input Real referenceCount; input Real currentCount;
  input Real ratio; input Real maximumDescriptorDistance;
  input Real usePrediction; input Real predictedRotation[3,3]; input Real predictedTranslation[3];
  input Real maximumGeometricDistance;
  output Real currentIndex[size(referenceEnabled,1)] "One-based partner; zero means rejected";
  output Real pairEnabled[size(referenceEnabled,1)];
  output Real sourcePoint[size(referenceEnabled,1),3]; output Real targetPoint[size(referenceEnabled,1),3];
  output Real count; output Real configurationValid;
  output Real invalidReference; output Real invalidCurrent;
  output Real nearestDistance[size(referenceEnabled,1)]; output Real secondDistance[size(referenceEnabled,1)];
protected
  Boolean referenceValid[size(referenceEnabled,1)]; Boolean currentValid[size(currentEnabled,1)];
  Integer nearest[size(referenceEnabled,1)]; Integer reciprocal[size(currentEnabled,1)];
  Real reciprocalDistance[size(currentEnabled,1)];
  Real predicted[3]; Real energy; Real distance; Real geometric; Real rotationCheck; Real determinant;
  Real geometricLimitSquared;
  Boolean configuration; Boolean predictionValid; Boolean eligible; Boolean accepted;
algorithm
  currentIndex := zeros(size(referenceEnabled,1)); pairEnabled := zeros(size(referenceEnabled,1));
  sourcePoint := zeros(size(referenceEnabled,1),3); targetPoint := zeros(size(referenceEnabled,1),3);
  nearestDistance := fill(1e30,size(referenceEnabled,1)); secondDistance := fill(1e30,size(referenceEnabled,1));
  reciprocalDistance := fill(1e30,size(currentEnabled,1));
  nearest := fill(0,size(referenceEnabled,1)); reciprocal := fill(0,size(currentEnabled,1));
  referenceValid := fill(false,size(referenceEnabled,1)); currentValid := fill(false,size(currentEnabled,1));
  count := 0.0; invalidReference := 0.0; invalidCurrent := 0.0;
  configuration := size(referenceDescriptor,1) == size(referenceEnabled,1) and size(currentDescriptor,1) == size(currentEnabled,1) and
    size(referencePoint,1) == size(referenceEnabled,1) and size(currentPoint,1) == size(currentEnabled,1) and
    referenceCount >= 0.0 and referenceCount <= size(referenceEnabled,1) and floor(referenceCount) == referenceCount and
    currentCount >= 0.0 and currentCount <= size(currentEnabled,1) and floor(currentCount) == currentCount and
    ratio > 0.0 and ratio < 1.0 and maximumDescriptorDistance >= 0.0 and maximumDescriptorDistance <= 2.0 and
    (usePrediction == 0.0 or usePrediction == 1.0) and maximumGeometricDistance >= 0.0 and maximumGeometricDistance <= 1e6;
  rotationCheck := 0.0; predictionValid := true;
  for a in 1:3 loop
    predictionValid := predictionValid and abs(predictedTranslation[a]) <= 1e6;
    for b in 1:3 loop
      predictionValid := predictionValid and abs(predictedRotation[a,b]) <= 1.0;
      energy := 0.0;
      for k in 1:3 loop energy := energy+(if usePrediction == 1.0 and abs(predictedRotation[k,a]) <= 1.0 and abs(predictedRotation[k,b]) <= 1.0 then predictedRotation[k,a]*predictedRotation[k,b] else 0.0); end for;
      rotationCheck := rotationCheck+abs(energy-(if a == b then 1.0 else 0.0));
    end for;
  end for;
  determinant := if predictionValid and usePrediction == 1.0 then
    predictedRotation[1,1]*(predictedRotation[2,2]*predictedRotation[3,3]-predictedRotation[2,3]*predictedRotation[3,2])-
    predictedRotation[1,2]*(predictedRotation[2,1]*predictedRotation[3,3]-predictedRotation[2,3]*predictedRotation[3,1])+
    predictedRotation[1,3]*(predictedRotation[2,1]*predictedRotation[3,2]-predictedRotation[2,2]*predictedRotation[3,1]) else 1.0;
  configuration := configuration and (usePrediction == 0.0 or (predictionValid and rotationCheck <= 1e-8 and abs(determinant-1.0) <= 1e-8));
  configurationValid := if configuration then 1.0 else 0.0;
  geometricLimitSquared := if configuration then maximumGeometricDistance*maximumGeometricDistance else 0.0;
  for i in 1:size(referenceEnabled,1) loop
    referenceValid[i] := RGBDDescriptorValid(referenceDescriptor[i,:],referencePoint[i,:],configuration and i <= referenceCount and referenceEnabled[i] == 1.0);
    invalidReference := invalidReference+(if i <= referenceCount and referenceEnabled[i] <> 0.0 and not referenceValid[i] then 1.0 else 0.0);
  end for;
  for j in 1:size(currentEnabled,1) loop
    currentValid[j] := RGBDDescriptorValid(currentDescriptor[j,:],currentPoint[j,:],configuration and j <= currentCount and currentEnabled[j] == 1.0);
    invalidCurrent := invalidCurrent+(if j <= currentCount and currentEnabled[j] <> 0.0 and not currentValid[j] then 1.0 else 0.0);
  end for;
  // Ordered nearest/second search; strict comparisons keep lowest-index ties.
  for i in 1:size(referenceEnabled,1) loop
    predicted := RGBDPredictedPoint(referencePoint[i,:],predictedRotation,predictedTranslation,referenceValid[i] and usePrediction == 1.0);
    for j in 1:size(currentEnabled,1) loop
      eligible := referenceValid[i] and currentValid[j];
      geometric := if eligible and usePrediction == 1.0 then RGBDGeometricDistance(predicted,currentPoint[j,:]) else 0.0;
      eligible := eligible and (usePrediction == 0.0 or geometric <= geometricLimitSquared);
      distance := if eligible then RGBDDescriptorDistance(referenceDescriptor[i,:],currentDescriptor[j,:]) else 1e30;
      if distance < nearestDistance[i] then
        secondDistance[i] := nearestDistance[i]; nearestDistance[i] := distance; nearest[i] := j;
      elseif distance < secondDistance[i] then secondDistance[i] := distance;
      end if;
      if distance < reciprocalDistance[j] then reciprocalDistance[j] := distance; reciprocal[j] := i; end if;
    end for;
  end for;
  for i in 1:size(referenceEnabled,1) loop
    accepted := if nearest[i] > 0 and secondDistance[i] < 1e30 then
      nearestDistance[i] <= maximumDescriptorDistance*maximumDescriptorDistance and
      nearestDistance[i] < ratio*ratio*secondDistance[i] and reciprocal[nearest[i]] == i else false;
    currentIndex[i] := if accepted then nearest[i] else 0.0; pairEnabled[i] := if accepted then 1.0 else 0.0;
    count := count+(if accepted then 1.0 else 0.0);
    for k in 1:3 loop
      sourcePoint[i,k] := if accepted then referencePoint[i,k] else 0.0;
      targetPoint[i,k] := if accepted then currentPoint[nearest[i],k] else 0.0;
    end for;
  end for;
end MatchRGBDDescriptorsDenseReference;
