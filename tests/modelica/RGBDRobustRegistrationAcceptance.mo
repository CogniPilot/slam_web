// Independent geometric cases for the bounded Modelica consensus estimator.
// Sparse slots span the entire production-sized mask. Disabled values are NaN.
package RGBDRobustRegistrationReference
  // Deliberately independent of the SLAM package dependency closure.
  constant Integer capacity = 350;

  record Result
    Real accepted; Real reason; Real rotation[3,3]; Real translation[3];
    Real validCount; Real invalidCount; Real rank; Real cost; Real rms; Real eigenGap;
    Real sourceCentroid[3]; Real targetCentroid[3];
    Real mask[capacity]; Real rejected;
  end Result;

  function Evaluate
    input Real source[capacity,3]; input Real target[capacity,3]; input Real mask[capacity];
    input Real count; input Integer hypotheses; input Real fraction;
    output Result result;
  algorithm
    (result.accepted,result.reason,result.rotation,result.translation,result.validCount,result.invalidCount,
      result.rank,result.cost,result.rms,result.eigenGap,result.sourceCentroid,result.targetCentroid,
      result.mask,result.rejected) := FitRigidPointPairsRobust(source,target,mask,count,1e6,1e-8,0.02,hypotheses,fraction);
  end Evaluate;

  function CleanParity
    input Result result;
    input Real source[capacity,3]; input Real target[capacity,3]; input Real mask[capacity];
    output Boolean equal;
  protected
    Real accepted; Real reason; Real rotation[3,3]; Real translation[3];
    Real validCount; Real invalidCount; Real rank; Real cost; Real rms; Real eigenGap;
    Real sourceCentroid[3]; Real targetCentroid[3];
  algorithm
    (accepted,reason,rotation,translation,validCount,invalidCount,rank,cost,rms,eigenGap,sourceCentroid,targetCentroid)
      := FitRigidPointPairs(source,target,mask,capacity,1e6,1e-8,0.02);
    equal := result.accepted == accepted and result.reason == reason
      and result.validCount == validCount and result.invalidCount == invalidCount
      and result.rank == rank and result.cost == cost and result.rms == rms and result.eigenGap == eigenGap
      and result.rejected == 0;
    for axis in 1:3 loop
      equal := equal and result.translation[axis] == translation[axis]
        and result.sourceCentroid[axis] == sourceCentroid[axis]
        and result.targetCentroid[axis] == targetCentroid[axis];
      for column in 1:3 loop equal := equal and result.rotation[axis,column] == rotation[axis,column]; end for;
    end for;
    for slot in 1:capacity loop equal := equal and result.mask[slot] == mask[slot]; end for;
  end CleanParity;

  function Run
    input Real clock;
    output Boolean checks[24]; output Real raw[8,8];
  protected
    constant Integer slots[10] = {1,4,9,75,120,209,281,310,333,350};
    constant Real expectedRotation[3,3] = [0,-1,0;1,0,0;0,0,1];
    constant Real expectedTranslation[3] = {0.04,-0.01,0.02};
    Real source[capacity,3]; Real target[capacity,3]; Real mask[capacity]; Real expectedMask[capacity];
    Real nanValue; Real count; Real fraction; Real maskCount;
    Integer hypotheses; Integer expectedReason; Integer slot;
    Boolean maskCorrect; Boolean geometryCorrect;
    Result result;
  algorithm
    checks := fill(false,24); raw := zeros(8,8); nanValue := sin(exp(1000.0+clock));
    for caseId in 1:8 loop
      source := fill(nanValue,capacity,3); target := fill(nanValue,capacity,3);
      mask := zeros(capacity); expectedMask := zeros(capacity);
      count := capacity; fraction := 0.5; hypotheses := 64; expectedReason := 0;
      for point in 1:10 loop
        slot := slots[point]; mask[slot] := 1; expectedMask[slot] := 1;
        source[slot,:] := {0.3*point,0.2*mod(point*point,7),2.0+0.1*mod(point*point*point,11)};
        target[slot,:] := expectedRotation*source[slot,:]+expectedTranslation;
      end for;
      if caseId == 2 or caseId == 3 then
        target[slots[4],:] := target[slots[4],:]+{1.0,-0.8,0.5};
        target[slots[9],:] := target[slots[9],:]+{-0.7,1.1,-0.4};
        expectedMask[slots[4]] := 0; expectedMask[slots[9]] := 0;
        if caseId == 3 then fraction := 0.9; expectedReason := 7; end if;
      elseif caseId == 4 then
        source[slots[4],1] := nanValue; expectedReason := 2;
      elseif caseId == 5 then
        count := capacity+0.5; expectedReason := 1;
      elseif caseId == 6 then
        for point in 1:10 loop
          slot := slots[point]; source[slot,:] := {0.3*point,0,2};
          target[slot,:] := expectedRotation*source[slot,:]+expectedTranslation;
        end for;
        expectedReason := 4;
      elseif caseId == 7 then
        hypotheses := 0; expectedReason := 1;
      elseif caseId == 8 then
        fraction := nanValue; expectedReason := 1;
      end if;
      result := Evaluate(source,target,mask,count,hypotheses,fraction);
      checks[(caseId-1)*3+1] := clock >= 0 and clock <= 0.001
        and result.reason == expectedReason and result.accepted == (if expectedReason == 0 then 1 else 0);
      maskCorrect := true; maskCount := 0;
      for index in 1:capacity loop
        maskCorrect := maskCorrect and result.mask[index] == (if expectedReason == 0 then expectedMask[index] else 0);
        maskCount := maskCount+result.mask[index];
      end for;
      checks[(caseId-1)*3+2] := maskCorrect and (expectedReason <> 0
        or result.validCount == maskCount and result.rejected == (if caseId == 2 then 2 else 0));
      geometryCorrect := true;
      for axis in 1:3 loop
        geometryCorrect := geometryCorrect and abs(result.translation[axis]-expectedTranslation[axis]) < 1e-8;
        for column in 1:3 loop
          geometryCorrect := geometryCorrect and abs(result.rotation[axis,column]-expectedRotation[axis,column]) < 1e-8;
        end for;
      end for;
      checks[(caseId-1)*3+3] := if caseId == 1 then CleanParity(result,source,target,mask)
        elseif caseId == 2 then geometryCorrect and result.rms <= 0.02 and result.rank >= 2
        else result.accepted == 0 and maskCount == 0;
      raw[caseId,:] := {caseId,result.accepted,result.reason,result.validCount,result.invalidCount,
        result.rank,result.rms,maskCount};
    end for;
  end Run;
end RGBDRobustRegistrationReference;

model RGBDRobustRegistrationAcceptance
  output Boolean checks[24]; output Real raw[8,8];
equation
  (checks,raw) = RGBDRobustRegistrationReference.Run(time);
end RGBDRobustRegistrationAcceptance;
