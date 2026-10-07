package RGBDLoopVerificationTests
  function Reference
    input Boolean dense;
    output RGBDKeyframes.Frame frame;
  protected
    Real patch[RGBDKeyframes.descriptorSize]; Real mean; Real norm;
  algorithm
    frame := RGBDKeyframes.EmptyFrame();
    frame.id := 1; frame.epoch := 1; frame.imageTime := 1.0;
    frame.count := RGBDKeyframes.featureCapacity;
    frame.bodyRotation := PGExp({0.2,-0.1,0.7}); frame.bodyPosition := {2.0,-3.0,1.0};
    frame.poseCovariance := 0.01*identity(RGBDKeyframes.poseDimension);
    frame.histogram[1] := 0.4; frame.histogram[RGBDKeyframes.wordCapacity] := 0.6;
    for slot in 1:RGBDKeyframes.featureCapacity loop
      if dense or slot <= 31 or slot == RGBDKeyframes.featureCapacity then
        frame.enabled[slot] := true;
        for sample in 1:RGBDKeyframes.descriptorSize loop
          patch[sample] := sin(0.011*slot*sample^2+cos(0.017*slot*sample));
        end for;
        mean := sum(patch)/RGBDKeyframes.descriptorSize;
        patch := patch-fill(mean,RGBDKeyframes.descriptorSize); norm := sqrt(patch*patch);
        frame.descriptor[slot,:] := patch/norm;
        frame.opticalPoint[slot,:] := {(mod(slot,7)-3)*0.22,(div(slot,7)-2)*0.18,2.0+mod(slot,5)*0.11};
        frame.pixels[slot,:] := {3+mod(slot*11,150),3+mod(slot*7,80)};
      else
        // Disabled payload must not become a measurement or enter products.
        frame.descriptor[slot,:] := fill(1e101,RGBDKeyframes.descriptorSize);
        frame.opticalPoint[slot,:] := fill(1e101,RGBDKeyframes.dimension);
      end if;
    end for;
  end Reference;

  function Current
    input RGBDKeyframes.Frame reference;
    input Real rotation[3,3]; input Real translation[3];
    input Integer outliers;
    input Boolean dense;
    output RGBDKeyframes.Frame frame;
  protected
    Integer destination;
  algorithm
    frame := RGBDKeyframes.EmptyFrame();
    frame.id := 7; frame.epoch := 901; frame.imageTime := 11.0;
    frame.count := RGBDKeyframes.featureCapacity;
    frame.histogram := reference.histogram;
    // An intentionally drifted estimated pose cannot decide the loop transform.
    frame.bodyRotation := PGExp({-0.6,0.4,-0.3}); frame.bodyPosition := {90.0,70.0,10.0};
    frame.poseCovariance := 0.2*identity(RGBDKeyframes.poseDimension);
    frame.opticalToBody := PGExp({0.1,0.2,-0.1})*reference.opticalToBody;
    frame.cameraOriginBody := {-0.08,0.03,0.04};
    for slot in 1:RGBDKeyframes.featureCapacity loop
      frame.descriptor[slot,:] := fill(1e101,RGBDKeyframes.descriptorSize);
      frame.opticalPoint[slot,:] := fill(1e101,RGBDKeyframes.dimension);
    end for;
    for slot in 1:RGBDKeyframes.featureCapacity loop
      if reference.enabled[slot] then
        destination := if dense then RGBDKeyframes.featureCapacity+1-slot
          else if slot <= 31 then 32-slot else RGBDKeyframes.featureCapacity-5;
        frame.enabled[destination] := true;
        frame.descriptor[destination,:] := reference.descriptor[slot,:];
        frame.opticalPoint[destination,:] := rotation*reference.opticalPoint[slot,:]+translation
          +(if slot <= outliers then {3.0,-4.0,1.0} else zeros(3));
        frame.pixels[destination,:] := {3+mod(destination*7,150),3+mod(destination*11,80)};
      end if;
    end for;
  end Current;

  // Separate component gate. It does not replace Run's complete proposal,
  // metadata, uncertainty and body-transport acceptance requirements.
  function RunConsensus
    input Integer trials;
    output Boolean passed[20];
  protected
    RGBDKeyframes.Frame reference; RGBDKeyframes.Frame current;
    Real C[3,3]; Real t[3]; Real referenceMask[350]; Real currentMask[350];
    Real partners[350]; Real pairs[350]; Real source[350,3]; Real target[350,3];
    Real nearest[350]; Real second[350]; Real count; Real matchingValid; Real invalidReference; Real invalidCurrent;
    Boolean valid; Integer reason; Real R[3,3]; Real translation[3]; Real mask[350];
    Integer matches; Integer inliers; Real rms; Integer nextSeed; Integer savedSeed; Boolean maskValid;
  algorithm
    passed := fill(false,20); C := PGExp({0.03,-0.04,0.12}); t := {0.3,-0.2,0.1};
    reference := Reference(false); current := Current(reference,C,t,0,false);
    for slot in 1:350 loop
      referenceMask[slot] := if reference.enabled[slot] then 1.0 else 0.0;
      currentMask[slot] := if current.enabled[slot] then 1.0 else 0.0;
    end for;
    (partners,pairs,source,target,count,matchingValid,invalidReference,invalidCurrent,nearest,second) :=
      MatchRGBDDescriptors(reference.descriptor,current.descriptor,reference.opticalPoint,current.opticalPoint,
        referenceMask,currentMask,350,350,0.8,0.8,0.0,identity(3),zeros(3),0.0);
    passed[1] := matchingValid == 1.0 and invalidReference == 0.0 and invalidCurrent == 0.0
      and count == 32 and partners[350] == 345;
    (valid,reason,R,translation,mask,matches,inliers,rms,nextSeed) := RGBDLoopVerification.Consensus(
      source,target,pairs,true,7,trials,4,12,0.5,0.08,0.03,100.0,1e-8);
    savedSeed := nextSeed;
    passed[2] := valid and reason == 0 and matches == 32 and inliers == 32;
    passed[3] := max(abs(R-C)) < 1e-9 and max(abs(translation-t)) < 1e-9;
    passed[4] := mask[350] == 1.0 and max(abs(mask-pairs)) == 0.0;
    (valid,reason,R,translation,mask,matches,inliers,rms,nextSeed) := RGBDLoopVerification.Consensus(
      source,target,pairs,true,7,trials,4,12,0.5,0.08,0.03,100.0,1e-8);
    passed[5] := valid and nextSeed == savedSeed and max(abs(R-C)) < 1e-9;
    for slot in 1:8 loop target[slot,:] := target[slot,:]+{3.0,-4.0,1.0}; end for;
    (valid,reason,R,translation,mask,matches,inliers,rms,nextSeed) := RGBDLoopVerification.Consensus(
      source,target,pairs,true,7,trials,4,12,0.5,0.08,0.03,100.0,1e-8);
    passed[6] := valid and matches == 32 and inliers == 24 and max(abs(R-C)) < 1e-9
      and max(abs(translation-t)) < 1e-9;
    maskValid := true;
    for slot in 1:350 loop
      maskValid := maskValid and mask[slot] == (if reference.enabled[slot] and slot > 8 then 1.0 else 0.0);
    end for;
    passed[7] := maskValid and mask[350] == 1.0;
    for slot in 9:20 loop target[slot,:] := target[slot,:]+{3.0,-4.0,1.0}; end for;
    (valid,reason,R,translation,mask,matches,inliers,rms,nextSeed) := RGBDLoopVerification.Consensus(
      source,target,pairs,true,7,trials,4,12,0.75,0.08,0.03,100.0,1e-8);
    passed[8] := not valid and reason == 5 and inliers == 0 and max(abs(mask)) == 0.0;
    for slot in 1:350 loop
      if pairs[slot] == 1.0 then source[slot,:] := {slot/100.0,0.0,3.0}; target[slot,:] := C*source[slot,:]+t; end if;
    end for;
    (valid,reason,R,translation,mask,matches,inliers,rms,nextSeed) := RGBDLoopVerification.Consensus(
      source,target,pairs,true,7,trials,4,12,0.5,0.08,0.03,100.0,1e-8);
    passed[9] := not valid and reason == 5 and max(abs(mask)) == 0.0;
    (valid,reason,R,translation,mask,matches,inliers,rms,nextSeed) := RGBDLoopVerification.Consensus(
      fill(1e101,350,3),fill(1e101,350,3),fill(1e101,350),false,0,0,0,0,0.0,0.0,0.0,0.0,0.0);
    passed[10] := not valid and reason == 1 and matches == 0 and nextSeed == 0;
    pairs[350] := 0.5;
    (valid,reason,R,translation,mask,matches,inliers,rms,nextSeed) := RGBDLoopVerification.Consensus(
      source,target,pairs,true,7,trials,4,12,0.5,0.08,0.03,100.0,1e-8);
    passed[11] := not valid and reason == 3;
    pairs[350] := 1.0; source[350,3] := 1e101;
    (valid,reason,R,translation,mask,matches,inliers,rms,nextSeed) := RGBDLoopVerification.Consensus(
      source,target,pairs,true,7,trials,4,12,0.5,0.08,0.03,100.0,1e-8);
    passed[12] := not valid and reason == 3;
    (valid,reason,R,translation,mask,matches,inliers,rms,nextSeed) := RGBDLoopVerification.Consensus(
      source,target,pairs,true,0,trials,4,12,0.5,0.08,0.03,100.0,1e-8);
    passed[13] := not valid and reason == 2 and matches == 0;
    pairs := zeros(350); pairs[1:7] := ones(7);
    (valid,reason,R,translation,mask,matches,inliers,rms,nextSeed) := RGBDLoopVerification.Consensus(
      source,target,pairs,true,7,trials,4,12,0.5,0.08,0.03,100.0,1e-8);
    passed[14] := not valid and reason == 4 and matches == 7;
    (valid,reason,R,translation,mask,matches,inliers,rms,nextSeed) := RGBDLoopVerification.Consensus(
      source,target,pairs,true,7,trials,4,12,0.5,0.08,1.0,100.0,1e-8);
    passed[15] := not valid and reason == 2;
    reference := Reference(true); current := Current(reference,C,t,0,true);
    (partners,pairs,source,target,count,matchingValid,invalidReference,invalidCurrent,nearest,second) :=
      MatchRGBDDescriptors(reference.descriptor,current.descriptor,reference.opticalPoint,current.opticalPoint,
        ones(350),ones(350),350,350,0.8,0.8,0.0,identity(3),zeros(3),0.0);
    passed[16] := matchingValid == 1.0 and count == 350 and partners[350] == 1;
    (valid,reason,R,translation,mask,matches,inliers,rms,nextSeed) := RGBDLoopVerification.Consensus(
      source,target,pairs,true,7,trials,4,12,0.5,0.08,0.03,100.0,1e-8);
    passed[17] := valid and matches == 350 and inliers == 350 and min(mask) == 1.0
      and max(abs(R-C)) < 1e-9 and max(abs(translation-t)) < 1e-9;
    (valid,reason,R,translation,mask,matches,inliers,rms,nextSeed) := RGBDLoopVerification.Consensus(
      source,target,pairs,true,7,trials,1,12,0.5,0.08,0.03,100.0,1e-8);
    passed[18] := valid and inliers == 350 and min(mask) == 1.0;
    passed[19] := RGBDLoopVerification.NextSample(1) == 16807
      and RGBDLoopVerification.NextSample(16807) == 282475249
      and RGBDLoopVerification.NextSample(2147483646) == 2147466840
      and RGBDLoopVerification.NextSample(0) == 0 and RGBDLoopVerification.NextSample(-2147483647-1) == 0;
    (valid,reason,R,translation,mask,matches,inliers,rms,nextSeed) := RGBDLoopVerification.Consensus(
      source,target,pairs,true,7,0,4,12,0.5,0.08,0.03,100.0,1e-8);
    passed[20] := not valid and reason == 2 and matches == 0;
  end RunConsensus;

  function Run
    input Integer trials;
    output Boolean passed[29];
  protected
    RGBDKeyframes.Frame reference; RGBDKeyframes.Frame current; RGBDKeyframes.Frame altered;
    RGBDLoopVerification.Proposal result; RGBDLoopVerification.Proposal original;
    Real C[3,3]; Real t[3]; Real qi[3]; Real qj[3];
    Boolean partnersValid; Boolean maskValid;
  algorithm
    passed := fill(false,29);
    C := PGExp({0.03,-0.04,0.12}); t := {0.3,-0.2,0.1};
    reference := Reference(false); current := Current(reference,C,t,0,false);
    passed[1] := RGBDKeyframes.ValidFrame(reference) and RGBDKeyframes.ValidFrame(current);
    result := RGBDLoopVerification.Verify(reference,current,true,trials=trials);
    original := result;
    passed[2] := result.verified and result.rejectionReason == 0 and result.matchedCount == 32
      and result.inlierCount == 32 and result.generation == 1 and result.referenceId == 1 and result.currentId == 7;
    partnersValid := true; maskValid := true;
    for slot in 1:RGBDKeyframes.featureCapacity loop
      maskValid := maskValid and result.inliers[slot] == reference.enabled[slot];
      if reference.enabled[slot] then
        partnersValid := partnersValid and result.partners[slot] == (if slot <= 31 then 32-slot else 345);
      else
        partnersValid := partnersValid and result.partners[slot] == 0;
      end if;
    end for;
    passed[3] := partnersValid and maskValid and result.inliers[350] and result.partners[350] == 345;
    passed[4] := max(abs(result.opticalRotation-C)) < 1e-9 and max(abs(result.opticalTranslation-t)) < 1e-9;
    qi := reference.opticalPoint[350,:]; qj := current.opticalPoint[345,:];
    passed[5] := max(abs(reference.cameraOriginBody+reference.opticalToBody*qi
      -(result.bodyTranslation+result.bodyRotation*(current.cameraOriginBody+current.opticalToBody*qj)))) < 1e-9;
    passed[6] := max(abs(result.covariance*result.information-identity(6))) < 1e-8
      and max(abs(result.covariance-transpose(result.covariance))) < 1e-14;
    result := RGBDLoopVerification.Verify(reference,current,true,trials=trials);
    passed[7] := result.nextSeed == original.nextSeed and max(abs(result.opticalRotation-original.opticalRotation)) == 0.0
      and max(abs(result.covariance-original.covariance)) == 0.0;
    altered := current; altered.bodyPosition := {-90.0,15.0,40.0}; altered.bodyRotation := identity(3);
    result := RGBDLoopVerification.Verify(reference,altered,true,trials=trials);
    passed[8] := result.verified and max(abs(result.bodyTranslation-original.bodyTranslation)) == 0.0
      and max(abs(result.covariance-original.covariance)) == 0.0;
    current := Current(reference,C,t,8,false);
    result := RGBDLoopVerification.Verify(reference,current,true,trials=trials);
    passed[9] := result.verified and result.matchedCount == 32 and result.inlierCount == 24
      and max(abs(result.opticalRotation-C)) < 1e-9 and max(abs(result.opticalTranslation-t)) < 1e-9;
    maskValid := true;
    for slot in 1:350 loop
      maskValid := maskValid and result.inliers[slot] == (reference.enabled[slot] and slot > 8);
    end for;
    passed[10] := maskValid and result.inliers[350] and result.partners[1] == 0;
    current := Current(reference,C,t,20,false);
    result := RGBDLoopVerification.Verify(reference,current,true,trials=trials,minimumFraction=0.75);
    passed[11] := not result.verified and result.rejectionReason == 7 and result.inlierCount == 0
      and max(abs(result.information)) == 0.0 and result.referenceId == 0;
    // An identical appearance histogram cannot overcome degenerate geometry.
    for slot in 1:350 loop
      if reference.enabled[slot] then reference.opticalPoint[slot,:] := {slot/100.0,0.0,3.0}; end if;
    end for;
    current := Current(reference,C,t,0,false);
    result := RGBDLoopVerification.Verify(reference,current,true,trials=trials);
    passed[12] := not result.verified and result.rejectionReason == 7 and max(abs(result.covariance)) == 0.0;
    reference := Reference(false); current := Current(reference,C,t,0,false);
    altered := current;
    for slot in 1:350 loop altered.descriptor[slot,:] := fill(1e101,49); end for;
    result := RGBDLoopVerification.Verify(reference,altered,false,seed=0,trials=trials);
    passed[13] := not result.verified and result.rejectionReason == 1 and result.nextSeed == 0
      and result.matchedCount == 0 and max(abs(result.information)) == 0.0;
    altered := current; altered.generation := 2;
    result := RGBDLoopVerification.Verify(reference,altered,true,trials=trials);
    passed[14] := not result.verified and result.rejectionReason == 3;
    altered := current; altered.id := reference.id;
    result := RGBDLoopVerification.Verify(reference,altered,true,trials=trials);
    passed[15] := not result.verified and result.rejectionReason == 3;
    altered := current; altered.epoch := reference.epoch;
    result := RGBDLoopVerification.Verify(reference,altered,true,trials=trials);
    passed[16] := not result.verified and result.rejectionReason == 3;
    altered := current; altered.imageTime := reference.imageTime+1.0;
    result := RGBDLoopVerification.Verify(reference,altered,true,trials=trials);
    passed[17] := not result.verified and result.rejectionReason == 3;
    altered := current; altered.vocabularyVersion := 2;
    result := RGBDLoopVerification.Verify(reference,altered,true,trials=trials);
    passed[18] := not result.verified and result.rejectionReason == 3;
    altered := current; altered.rgbCalibration[1] := 0.0;
    result := RGBDLoopVerification.Verify(reference,altered,true,trials=trials);
    passed[19] := not result.verified and result.rejectionReason == 4;
    altered := current; altered.disparityNoise := 0.1;
    result := RGBDLoopVerification.Verify(reference,altered,true,trials=trials);
    passed[20] := not result.verified and result.rejectionReason == 5;
    altered := current; altered.descriptor[345,:] := zeros(49);
    result := RGBDLoopVerification.Verify(reference,altered,true,trials=trials);
    passed[21] := not result.verified and result.rejectionReason == 4;
    altered := current; altered.poseCovariance[6,6] := 0.0;
    result := RGBDLoopVerification.Verify(reference,altered,true,trials=trials);
    passed[22] := not result.verified and result.rejectionReason == 4;
    altered := reference; altered.count := 349;
    result := RGBDLoopVerification.Verify(altered,current,true,trials=trials);
    passed[23] := not result.verified and result.rejectionReason == 4;
    result := RGBDLoopVerification.Verify(reference,current,true,seed=0,trials=trials);
    passed[24] := not result.verified and result.rejectionReason == 2 and result.matchedCount == 0;
    passed[25] := RGBDLoopVerification.NextSample(1) == 16807
      and RGBDLoopVerification.NextSample(16807) == 282475249
      and RGBDLoopVerification.NextSample(2147483646) == 2147466840
      and RGBDLoopVerification.NextSample(0) == 0 and RGBDLoopVerification.NextSample(-2147483647-1) == 0;
    // Execute the full dense domain too; sparse controls do not qualify it.
    reference := Reference(true); current := Current(reference,C,t,0,true);
    result := RGBDLoopVerification.Verify(reference,current,true,trials=trials);
    passed[26] := result.verified and result.matchedCount == 350 and result.inlierCount == 350
      and result.inliers[350] and result.partners[350] == 1;
    passed[27] := max(abs(result.opticalRotation-C)) < 1e-9 and max(abs(result.opticalTranslation-t)) < 1e-9;
    passed[28] := max(abs(result.covariance*result.information-identity(6))) < 1e-8;
    result := RGBDLoopVerification.Verify(reference,current,true,trials=0);
    passed[29] := not result.verified and result.rejectionReason == 2 and result.matchedCount == 0;
  end Run;
end RGBDLoopVerificationTests;
