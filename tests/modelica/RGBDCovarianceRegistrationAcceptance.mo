// Native reference controls. Oracle constants are assertions only, never fit inputs.
package RGBDCovarianceRegistrationReference
  constant Integer capacity = 350;
  function Evaluate
    input Real source[capacity,3]; input Real target[capacity,3]; input Real mask[capacity];
    input Real sourceCovariance[capacity,3,3]; input Real targetCovariance[capacity,3,3];
    input Real fraction = 0.5;
    output RGBDRobustRegistrationReference.Result result;
  algorithm
    (result.accepted,result.reason,result.rotation,result.translation,result.validCount,result.invalidCount,
      result.rank,result.cost,result.rms,result.eigenGap,result.sourceCentroid,result.targetCentroid,
      result.mask,result.rejected) := FitRigidPointPairsRobust(source,target,mask,capacity,1e6,1e-8,0.02,64,fraction,
        useCovariance=true,sourceCovariance=sourceCovariance,targetCovariance=targetCovariance);
  end Evaluate;

  function Run
    input Real clock;
    output Boolean checks[24]; output Real raw[8,8];
  protected
    constant Integer slots[10] = {1,4,9,75,120,209,281,310,333,350};
    constant Real expectedRotation[3,3] = [0,-1,0;1,0,0;0,0,1];
    constant Real expectedTranslation[3] = {0.04,-0.01,0.02};
    Real source[capacity,3]; Real target[capacity,3]; Real mask[capacity];
    Real sourceCovariance[capacity,3,3]; Real targetCovariance[capacity,3,3];
    Real covariance[3,3]; Real bearing[3]; Real sigma; Real nanValue; Real score; Real fraction;
    Real rotationError; Real translationError; Real maximumScore;
    Boolean valid; Boolean maskCorrect; Boolean residualsCertified;
    Integer slot; Integer expectedReason;
    RGBDRobustRegistrationReference.Result result;
  algorithm
    checks := fill(false,24); raw := zeros(8,8); nanValue := sin(exp(1000.0+clock));
    (valid,score) := RegistrationWhitenedResidual3({2,1,3},[4,2,0;2,2,0;0,0,9]);
    checks[1] := valid and abs(score-2) < 1e-12;
    (valid,score) := RegistrationWhitenedResidual3({2e-9,1e-9,3e-9},1e-18*[4,2,0;2,2,0;0,0,9]);
    checks[2] := valid and abs(score-2) < 1e-12;
    (valid,score) := RegistrationWhitenedResidual3(zeros(3),[1,1,0;1,1,0;0,0,1]);
    checks[3] := not valid and score == 0;
    (valid,score) := RegistrationWhitenedResidual3(zeros(3),[1,0.1,0;0,1,0;0,0,1]);
    checks[4] := not valid and score == 0;
    (valid,score) := RegistrationWhitenedResidual3(zeros(3),fill(nanValue,3,3));
    checks[5] := not valid and score == 0;
    (valid,score) := RegistrationWhitenedResidual3({nanValue,0,0},identity(3));
    checks[6] := not valid and score == 0;
    for caseId in 3:8 loop
      source := fill(nanValue,capacity,3); target := fill(nanValue,capacity,3); mask := zeros(capacity);
      sourceCovariance := fill(nanValue,capacity,3,3); targetCovariance := fill(nanValue,capacity,3,3);
      fraction := 0.5; expectedReason := 0;
      for point in 1:10 loop
        slot := slots[point]; mask[slot] := 1;
        source[slot,:] := {0.3*point,0.2*mod(point*point,7),2.0+0.1*mod(point*point*point,11)};
        target[slot,:] := expectedRotation*source[slot,:]+expectedTranslation+{0,0,if mod(point,2) == 0 then 0.06 else -0.06};
        sourceCovariance[slot,:,:] := diagonal({1e-4,1e-4,0.01});
        targetCovariance[slot,:,:] := sourceCovariance[slot,:,:];
      end for;
      if caseId == 4 or caseId == 5 then
        target[slots[4],:] := target[slots[4],:]+{0.4,0,0};
        target[slots[9],:] := target[slots[9],:]+{0,-0.4,0};
        if caseId == 5 then fraction := 0.9; expectedReason := 7; end if;
      elseif caseId == 6 then
        sourceCovariance[slots[4],1,1] := -1; expectedReason := 1;
      elseif caseId == 7 then
        for point in 1:10 loop
          slot := slots[point]; target[slot,:] := expectedRotation*source[slot,:]+expectedTranslation;
        end for;
      elseif caseId == 8 then
        source := CapturedRegistrationPairs.pairs[:,1:3]; target := CapturedRegistrationPairs.pairs[:,4:6];
        mask := CapturedRegistrationPairs.pairs[:,7];
        for pair in 1:capacity loop
          if mask[pair] == 1 then
            // Independent Jacobian construction from the captured calibration.
            bearing := {source[pair,1]/source[pair,3],source[pair,2]/source[pair,3],1};
            sigma := source[pair,3]^2*CapturedRegistrationPairs.disparitySigma/(CapturedRegistrationPairs.noiseReferenceFx*CapturedRegistrationPairs.baseline);
            covariance := sigma^2*outerProduct(bearing,bearing)
              +diagonal({(source[pair,3]*0.5/CapturedRegistrationPairs.rgbFocal[1])^2,(source[pair,3]*0.5/CapturedRegistrationPairs.rgbFocal[2])^2,0});
            sourceCovariance[pair,:,:] := covariance;
            bearing := {target[pair,1]/target[pair,3],target[pair,2]/target[pair,3],1};
            sigma := target[pair,3]^2*CapturedRegistrationPairs.disparitySigma/(CapturedRegistrationPairs.noiseReferenceFx*CapturedRegistrationPairs.baseline);
            targetCovariance[pair,:,:] := sigma^2*outerProduct(bearing,bearing)
              +diagonal({(target[pair,3]*0.5/CapturedRegistrationPairs.rgbFocal[1])^2,(target[pair,3]*0.5/CapturedRegistrationPairs.rgbFocal[2])^2,0});
          end if;
        end for;
      end if;
      result := Evaluate(source,target,mask,sourceCovariance,targetCovariance,fraction);
      checks[(caseId-1)*3+1] := result.reason == expectedReason and result.accepted == (if expectedReason == 0 then 1 else 0);
      maskCorrect := true; residualsCertified := true; maximumScore := 0;
      for pair in 1:capacity loop
        if result.mask[pair] == 1 then
          (valid,score) := RegistrationPairResidual(source[pair,:],target[pair,:],result.rotation,result.translation,
            true,sourceCovariance[pair,:,:],targetCovariance[pair,:,:],1e-10);
          residualsCertified := residualsCertified and valid and score <= 9; maximumScore := max(maximumScore,score);
        end if;
        maskCorrect := maskCorrect and result.mask[pair] == (if expectedReason <> 0 then 0
          elseif caseId == 4 and (pair == slots[4] or pair == slots[9]) then 0
          elseif caseId == 8 then result.mask[pair] else mask[pair])
          and (result.mask[pair] == 0 or result.mask[pair] == 1) and result.mask[pair] <= mask[pair];
      end for;
      checks[(caseId-1)*3+2] := maskCorrect and residualsCertified and sum(result.mask) == (if expectedReason <> 0 then 0 else result.validCount)
        and (caseId <> 8 or result.validCount >= 92 and result.rejected >= 1);
      rotationError := 0; translationError := 0;
      for row in 1:3 loop
        translationError := max(translationError,abs(result.translation[row]-(if caseId == 8 then CapturedRegistrationPairs.oracleTranslation[row] else expectedTranslation[row])));
        for column in 1:3 loop
          rotationError := max(rotationError,abs(result.rotation[row,column]-(if caseId == 8 then CapturedRegistrationPairs.oracleRotation[row,column] else expectedRotation[row,column])));
        end for;
      end for;
      checks[(caseId-1)*3+3] := if expectedReason <> 0 then sum(abs(result.translation)) == 0 and sum(abs(result.rotation-identity(3))) == 0
        elseif caseId == 7 then RGBDRobustRegistrationReference.CleanParity(result,source,target,mask)
        else result.rms > 0.02 and translationError < 0.1 and rotationError < 0.03;
      raw[caseId,:] := {caseId,result.accepted,result.reason,result.validCount,result.rejected,result.rms,translationError,maximumScore};
    end for;
  end Run;
end RGBDCovarianceRegistrationReference;

model RGBDCovarianceRegistrationAcceptance
  output Boolean checks[24]; output Real raw[8,8];
equation
  (checks,raw) = RGBDCovarianceRegistrationReference.Run(time);
end RGBDCovarianceRegistrationAcceptance;
