// Independent raw-image/geometry/noise expectations. No production descriptor,
// registration, pose or sandwich helper supplies expected values.
package RGBDVisualRelativeReference
  constant Integer imageHeight=90; constant Integer imageWidth=160;
  constant Integer capacity=350; constant Integer descriptorSize=49;
  constant Integer scenarios=25; constant Integer observed=6;
  constant Integer slots[observed]={1,7,63,173,299,350};
  constant Integer referencePixels[observed,2]=[36,21;76,17;116,25;44,57;84,65;124,61];
  constant Integer currentPixels[observed,2]=[118,55;87,60;56,56;111,30;80,26;52,25];
  constant Real z[observed]={3,4.5,9,4.5,9,3};
  constant Real referenceRgb[4]={120,120,80,45};
  constant Real currentRgb[4]={90,90,82,43};
  constant Real referenceDepth[4]={80,90,79,44};
  constant Real currentDepth[4]={65,75,79,44};

  function Close
    input Real a[:,:]; input Real b[size(a,1),size(a,2)]; input Real tolerance;
    output Boolean equal;
  algorithm
    equal:=true;
    for i in 1:size(a,1) loop
      for j in 1:size(a,2) loop equal:=equal and abs(a[i,j]-b[i,j]) < tolerance*(1+abs(b[i,j])); end for;
    end for;
  end Close;

  function CloseVector
    input Real a[:]; input Real b[size(a,1)]; input Real tolerance;
    output Boolean equal;
  algorithm
    equal:=true;
    for i in 1:size(a,1) loop equal:=equal and abs(a[i]-b[i]) < tolerance*(1+abs(b[i])); end for;
  end CloseVector;

  function Point
    input Integer feature; input Boolean current; output Real point[3];
  algorithm
    point:=if current then {(currentPixels[feature,1]-82)*z[feature]/90,
      (currentPixels[feature,2]-43)*z[feature]/90,z[feature]}
      else {(referencePixels[feature,1]-80)*z[feature]/120,
      (referencePixels[feature,2]-45)*z[feature]/120,z[feature]};
  end Point;

  function Image
    input Boolean current;
    output Real rgba[imageHeight,imageWidth,4]; output Real depth[imageHeight,imageWidth];
    output Real pixels[capacity,2];
  protected
    Integer x; Integer y; Integer k; Integer dx; Integer dy;
    Real base; Real contrast; Real value; Real rgbCal[4]; Real depthCal[4];
  algorithm
    base:=if current then 96 else 128; contrast:=if current then 32 else 64;
    rgba:=fill(base,imageHeight,imageWidth,4); depth:=zeros(imageHeight,imageWidth);
    pixels:=fill(-1e101,capacity,2);
    rgbCal:=if current then currentRgb else referenceRgb;
    depthCal:=if current then currentDepth else referenceDepth;
    for yy in 1:imageHeight loop
      for xx in 1:imageWidth loop rgba[yy,xx,4]:=255; end for;
    end for;
    for feature in 1:observed loop
      x:=if current then currentPixels[feature,1] else referencePixels[feature,1];
      y:=if current then currentPixels[feature,2] else referencePixels[feature,2];
      pixels[slots[feature],:]:={x,y};
      for row in -3:3 loop
        for column in -3:3 loop
          k:=(row+3)*7+column+4;
          value:=base+(if k == feature then contrast else if k == descriptorSize then -contrast else 0);
          for channel in 1:3 loop rgba[y+row+1,x+column+1,channel]:=value; end for;
        end for;
      end for;
      // Independently place a frontoparallel measured patch at all participating
      // depth-neighbour samples, using separate depth and RGB intrinsics.
      dx:=integer(floor((x-rgbCal[3])*depthCal[1]/rgbCal[1]+depthCal[3]));
      dy:=integer(floor((y-rgbCal[4])*depthCal[2]/rgbCal[2]+depthCal[4]));
      for row in 0:1 loop
        for column in 0:1 loop
          assert(depth[dy+row+1,dx+column+1] == 0,"Independent depth patches must not overlap");
          depth[dy+row+1,dx+column+1]:=z[feature];
        end for;
      end for;
    end for;
  end Image;

  function Inverse
    input Real matrix[6,6]; output Real inverse[6,6];
  protected
    Real augmented[6,12]; Real pivot; Real multiplier; Real swap;
    Integer chosen;
  algorithm
    augmented:=zeros(6,12);
    for i in 1:6 loop
      for j in 1:6 loop augmented[i,j]:=matrix[i,j]; end for;
      augmented[i,i+6]:=1;
    end for;
    // Independent Gauss-Jordan partial pivoting, not production's LDL solve.
    for column in 1:6 loop
      chosen:=column;
      for row in column+1:6 loop
        if abs(augmented[row,column]) > abs(augmented[chosen,column]) then chosen:=row; end if;
      end for;
      assert(abs(augmented[chosen,column]) > 1e-12,"Independent full6x6 normal matrix must be invertible");
      for j in 1:12 loop swap:=augmented[column,j]; augmented[column,j]:=augmented[chosen,j]; augmented[chosen,j]:=swap; end for;
      pivot:=augmented[column,column];
      for j in 1:12 loop augmented[column,j]:=augmented[column,j]/pivot; end for;
      for row in 1:6 loop
        if row <> column then
          multiplier:=augmented[row,column];
          for j in 1:12 loop augmented[row,j]:=augmented[row,j]-multiplier*augmented[column,j]; end for;
        end if;
      end for;
    end for;
    inverse:=augmented[:,7:12];
  end Inverse;

  function Noise
    input Boolean matched[observed];
    output Real relative[6,6]; output Real conditionalBody[6,6];
  protected
    Real H[6,6]; Real N[6,6]; Real Hinv[6,6]; Real J[3,6]; Real Sigma[3,3];
    Real q[3]; Real p[3]; Real dr; Real dc;
    // Independently expanded calibrated observation chart for known pose/mount.
    Real G[6,6]=[1,0,0,0,-0.18,-0.27;0,0,-1,-0.27,-0.19,0;
      0,-1,0,-0.18,0,0.19;0,0,0,0,0,-1;0,0,0,1,0,0;0,0,0,0,1,0];
  algorithm
    H:=zeros(6,6); N:=zeros(6,6);
    for feature in 1:observed loop
      if matched[feature] then
        p:=Point(feature,false); q:={-p[1],-p[2],p[3]}; p:=Point(feature,true);
        J:=[1,0,0,0,q[3],-q[2];0,1,0,-q[3],0,q[1];0,0,1,q[2],-q[1],0];
        dr:=z[feature]^2*0.08/(500*0.05); dc:=z[feature]^2*0.08/(520*0.05);
        for a in 1:3 loop
          for b in 1:3 loop
            Sigma[a,b]:=(q[a]/z[feature])*(q[b]/z[feature])*dr^2
              +(p[a]/z[feature])*(p[b]/z[feature])*dc^2;
          end for;
        end for;
        Sigma[1,1]:=Sigma[1,1]+(z[feature]*0.5/120)^2+(z[feature]*0.5/90)^2;
        Sigma[2,2]:=Sigma[2,2]+(z[feature]*0.5/120)^2+(z[feature]*0.5/90)^2;
        for a in 1:6 loop
          for b in 1:6 loop
            for row in 1:3 loop
              H[a,b]:=H[a,b]+J[row,a]*J[row,b];
              for column in 1:3 loop N[a,b]:=N[a,b]+J[row,a]*Sigma[row,column]*J[column,b]; end for;
            end for;
          end for;
        end for;
      end if;
    end for;
    Hinv:=Inverse(H); relative:=zeros(6,6); conditionalBody:=zeros(6,6);
    for a in 1:6 loop
      for b in 1:6 loop
        for i in 1:6 loop
          for j in 1:6 loop relative[a,b]:=relative[a,b]+Hinv[a,i]*N[i,j]*Hinv[b,j]; end for;
        end for;
      end for;
    end for;
    for a in 1:6 loop
      for b in 1:6 loop
        for i in 1:6 loop
          for j in 1:6 loop conditionalBody[a,b]:=conditionalBody[a,b]+G[a,i]*relative[i,j]*G[b,j]; end for;
        end for;
      end for;
    end for;
  end Noise;

  function Run
    input Real clock;
    output Boolean checks[scenarios,12]; output Real raw[scenarios,21];
    output Real rawRelative[scenarios,6,6]; output Real rawConditional[scenarios,6,6];
    output Real rawLateDescriptor[scenarios,descriptorSize]; output Real rawLatePoint[scenarios,3];
    output Real rawRotation[scenarios,3,3]; output Real rawBodyRotation[scenarios,3,3];
  protected
    Real rgbReference[imageHeight,imageWidth,4]; Real rgbCurrent[imageHeight,imageWidth,4]; Real rgba[imageHeight,imageWidth,4];
    Real depthReference[imageHeight,imageWidth]; Real depthCurrent[imageHeight,imageWidth]; Real depth[imageHeight,imageWidth];
    Real pixelsReference[capacity,2]; Real pixelsCurrent[capacity,2]; Real pixels[capacity,2];
    Real describedReference[capacity,descriptorSize]; Real pointReference[capacity,3]; Real enabledReference[capacity]; Real unused;
    Real referenceDescriptor[capacity,descriptorSize]; Real referencePoint[capacity,3]; Real referenceEnabled[capacity];
    Real descriptor[capacity,descriptorSize]; Real point[capacity,3]; Real enabled[capacity]; Real index[capacity]; Real pair[capacity];
    Real R[3,3]; Real t[3]; Real bodyR[3,3]; Real bodyP[3]; Real covariance[6,6]; Real conditionalCovariance[6,6];
    Real valid; Real matches; Real rms; Real rejection; Real relativeValid; Real uncertaintyReason; Real uncertaintyCount; Real uncertaintyInvalid;
    Real invalidDescription; Real matchingValid; Real invalidReference; Real invalidCurrent;
    Real accepted; Real registrationCount; Real registrationInvalid; Real rank; Real uncertaintyValid;
    Real count; Real referenceCount; Real usePrediction; Real predictedR[3,3]; Real predictedT[3];
    Real focal[2]; Real referenceNoiseFx; Real sigma; Real pivot; Real contrast; Real baseline; Real disparity;
    Real ratio; Real geometricLimit; Real depthCalibration[4]; Real referenceR[3,3]; Real referenceP[3];
    Real expectedDescriptor; Real wantedPoint[3]; Real wantedInvalidDescription; Real wantedInvalidReference;
    Real expectedRelative[6,6]; Real expectedConditional[6,6]; Real wantedBodyR[3,3]; Real wantedBodyP[3];
    Real expectedMatches; Real expectedReason; Real expectedCurrentCount; Real infinity; Real poison;
    Boolean imageOn; Boolean currentGood[observed]; Boolean matched[observed]; Boolean wantedValid; Boolean wantedUncertainty;
    Boolean referenceOracle; Boolean expectedConfiguration; Integer marker;
  algorithm
    infinity:=exp(1000+clock); poison:=sin(infinity);
    (rgbReference,depthReference,pixelsReference):=Image(false);
    (rgbCurrent,depthCurrent,pixelsCurrent):=Image(true);
    (describedReference,pointReference,enabledReference,unused):=DescribeRGBDFrame(rgbReference,depthReference,pixelsReference,
      capacity,referenceRgb,referenceDepth,0.08,500,0.05,0.28,10,1e-6,true);
    referenceOracle:=unused == capacity-observed;
    for slot in 1:capacity loop
      marker:=0;
      for feature in 1:observed loop if slots[feature] == slot then marker:=feature; end if; end for;
      referenceOracle:=referenceOracle and enabledReference[slot] == (if marker > 0 then 1 else 0);
      for channel in 1:descriptorSize loop
        expectedDescriptor:=if marker > 0 then (if channel == marker then 1/sqrt(2.0) else if channel == descriptorSize then -1/sqrt(2.0) else 0) else 0;
        referenceOracle:=referenceOracle and abs(describedReference[slot,channel]-expectedDescriptor) < 1e-12;
      end for;
      wantedPoint:=if marker > 0 then Point(marker,false) else zeros(3);
      for axis in 1:3 loop referenceOracle:=referenceOracle and abs(pointReference[slot,axis]-wantedPoint[axis]) < 1e-12; end for;
    end for;
    checks:=fill(false,scenarios,12); raw:=zeros(scenarios,21); rawRelative:=zeros(scenarios,6,6);
    rawConditional:=zeros(scenarios,6,6); rawLateDescriptor:=zeros(scenarios,descriptorSize);
    rawLatePoint:=zeros(scenarios,3); rawRotation:=zeros(scenarios,3,3); rawBodyRotation:=zeros(scenarios,3,3);
    for scenario in 1:scenarios loop
      rgba:=rgbCurrent; depth:=depthCurrent; pixels:=pixelsCurrent;
      referenceDescriptor:=describedReference; referencePoint:=pointReference; referenceEnabled:=enabledReference;
      for slot in 1:capacity loop
        if referenceEnabled[slot] == 0 then referenceDescriptor[slot,:]:=fill(poison,descriptorSize); referencePoint[slot,:]:=fill(infinity,3); end if;
      end for;
      count:=capacity; referenceCount:=capacity; imageOn:=true; ratio:=0.8; geometricLimit:=0.5;
      usePrediction:=0; predictedR:=diagonal({-1,-1,1}); predictedT:={0.1,-0.2,0};
      focal:={120,120}; referenceNoiseFx:=500; sigma:=0.5; pivot:=1e-10; contrast:=1e-6;
      baseline:=0.05; disparity:=0.08; depthCalibration:=currentDepth;
      referenceR:=[0,-1,0;1,0,0;0,0,1]; referenceP:={1,-2,0.5};
      if scenario == 2 then usePrediction:=1; geometricLimit:=20;
      elseif scenario == 3 then count:=349;
      elseif scenario == 4 then referenceCount:=349;
      elseif scenario == 5 then
        // Reverse one measured patch's contrast: descriptor mismatch, not geometry.
        for row in -3:3 loop
          for column in -3:3 loop
            for channel in 1:3 loop rgba[currentPixels[6,2]+row+1,currentPixels[6,1]+column+1,channel]:=
              192-rgba[currentPixels[6,2]+row+1,currentPixels[6,1]+column+1,channel]; end for;
          end for;
        end for;
      elseif scenario == 6 then
        // Poison the complete measured depth field: only final marker becomes invalid.
        for row in 1:imageHeight loop
          for column in 1:imageWidth loop
            if depth[row,column] == 3 and row < 40 then depth[row,column]:=0; end if;
          end for;
        end for;
      elseif scenario == 7 then referenceEnabled[capacity]:=0.5;
      elseif scenario == 8 then referenceDescriptor[capacity,1]:=poison;
      elseif scenario == 9 then count:=350.5;
      elseif scenario == 10 then referenceCount:=350.5;
      elseif scenario == 11 then imageOn:=false; rgba:=fill(poison,imageHeight,imageWidth,4); depth:=fill(infinity,imageHeight,imageWidth); pixels:=fill(poison,capacity,2);
      elseif scenario == 12 then usePrediction:=1; predictedT:={40,40,40};
      elseif scenario == 13 then sigma:=0;
      elseif scenario == 14 then focal:={0,120};
      elseif scenario == 15 then pivot:=0.9;
      elseif scenario == 16 then depthCalibration[1]:=0;
      elseif scenario == 17 then referenceR:=diagonal({-1,1,1});
      elseif scenario == 18 then
        for slot in 1:capacity loop
          if slot <> 1 and slot <> capacity then referenceEnabled[slot]:=0; referenceDescriptor[slot,:]:=fill(poison,descriptorSize); referencePoint[slot,:]:=fill(poison,3); end if;
        end for;
      elseif scenario == 19 then ratio:=1;
      elseif scenario == 20 then disparity:=0;
      elseif scenario == 21 then contrast:=0.5;
      elseif scenario == 22 then referenceP[2]:=poison;
      elseif scenario == 23 then baseline:=0;
      elseif scenario == 24 then referenceNoiseFx:=0;
      elseif scenario == 25 then usePrediction:=1;
      end if;
      (bodyR,bodyP,valid,matches,rms,rejection,index,descriptor,point,enabled,R,t,covariance,conditionalCovariance,
        relativeValid,uncertaintyReason,uncertaintyCount,uncertaintyInvalid,invalidDescription,matchingValid,
        invalidReference,invalidCurrent,pair,accepted,registrationCount,registrationInvalid,rank,uncertaintyValid):=
        ObserveRGBDRelativeFrame(rgba,depth,pixels,count,currentRgb,depthCalibration,520,
          referenceDescriptor,referencePoint,referenceEnabled,referenceCount,focal,referenceNoiseFx,
          imageEnabled=imageOn,disparityNoise=disparity,baseline=baseline,referenceBodyRotation=referenceR,
          referenceBodyPosition=referenceP,cameraOriginBody={0.18,-0.09,0.07},usePrediction=usePrediction,
          predictedRotation=predictedR,predictedTranslation=predictedT,ratio=ratio,maximumGeometricDistance=geometricLimit,minimumContrast=contrast,
          // This oracle qualifies the historical fixed-metric baseline and
          // its separately refused noise configuration. Calibrated consensus
          // has dedicated covariance and native noisy-flight controls.
          localizationSigma=sigma,uncertaintyMinimumPivot=pivot,calibratedRegistration=false);
      expectedConfiguration:=not (scenario == 9 or scenario == 10 or scenario == 19);
      expectedMatches:=0; expectedCurrentCount:=0;
      for feature in 1:observed loop
        currentGood[feature]:=not (scenario == 9 or scenario == 11 or scenario == 16 or scenario == 21 or scenario == 23
          or ((scenario == 3 or scenario == 6) and feature == observed));
        matched[feature]:=currentGood[feature] and expectedConfiguration and scenario <> 12 and scenario <> 25
          and not ((scenario == 4 or scenario == 5 or scenario == 7 or scenario == 8) and feature == observed)
          and not (scenario == 18 and feature <> 1 and feature <> observed);
        expectedCurrentCount:=expectedCurrentCount+(if currentGood[feature] then 1 else 0);
        expectedMatches:=expectedMatches+(if matched[feature] then 1 else 0);
      end for;
      wantedValid:=expectedMatches >= 3 and scenario <> 17 and scenario <> 22;
      expectedReason:=if scenario == 13 or scenario == 14 or scenario == 20 or scenario == 23 or scenario == 24 then 1
        else if not wantedValid then 2 else if scenario == 15 then 5 else 0;
      wantedUncertainty:=expectedReason == 0;
      wantedInvalidDescription:=if scenario == 11 then 0 else (if scenario == 3 then 349 else 350)-expectedCurrentCount;
      wantedInvalidReference:=if scenario == 7 or scenario == 8 then 1 else if not expectedConfiguration then (if scenario == 18 then 2 else 6) else 0;
      checks[scenario,1]:=referenceOracle; checks[scenario,2]:=true; checks[scenario,3]:=true;
      for slot in 1:capacity loop
        marker:=0;
        for feature in 1:observed loop if slots[feature] == slot then marker:=feature; end if; end for;
        checks[scenario,2]:=checks[scenario,2] and enabled[slot] == (if marker > 0 then (if currentGood[marker] then 1 else 0) else 0);
        for channel in 1:descriptorSize loop
          expectedDescriptor:=if marker > 0 then (if currentGood[marker] then
            (if channel == marker then 1/sqrt(2.0) else if channel == descriptorSize then -1/sqrt(2.0) else 0)
            *(if scenario == 5 and marker == observed then -1 else 1) else 0) else 0;
          checks[scenario,2]:=checks[scenario,2] and abs(descriptor[slot,channel]-expectedDescriptor) < 1e-12;
        end for;
        wantedPoint:=if marker > 0 then (if currentGood[marker] then Point(marker,true) else zeros(3)) else zeros(3);
        for axis in 1:3 loop checks[scenario,2]:=checks[scenario,2] and abs(point[slot,axis]-wantedPoint[axis]) < 1e-12; end for;
        checks[scenario,3]:=checks[scenario,3] and index[slot] == (if marker > 0 then (if matched[marker] then slot else 0) else 0)
          and pair[slot] == (if marker > 0 then (if matched[marker] then 1 else 0) else 0);
      end for;
      checks[scenario,4]:=matches == expectedMatches and registrationCount == expectedMatches and registrationInvalid == 0
        and matchingValid == (if expectedConfiguration then 1 else 0) and invalidReference == wantedInvalidReference
        and invalidCurrent == (if expectedConfiguration then 0 else expectedCurrentCount) and invalidDescription == wantedInvalidDescription;
      checks[scenario,5]:=accepted == (if expectedMatches >= 3 then 1 else 0) and rejection == (if expectedMatches >= 3 then 0 else 3);
      checks[scenario,6]:=Close(R,if expectedMatches >= 3 then diagonal({-1,-1,1}) else identity(3),2e-10)
        and CloseVector(t,if expectedMatches >= 3 then {0.1,-0.2,0} else zeros(3),2e-10)
        and (if expectedMatches >= 3 then rms < 2e-11 and rank >= 2 else true);
      wantedBodyR:=if wantedValid then [0,1,0;1,0,0;0,0,-1] else identity(3);
      wantedBodyP:=if wantedValid then {1.28,-2,0.84} else zeros(3);
      checks[scenario,7]:=valid == (if wantedValid then 1 else 0) and Close(bodyR,wantedBodyR,2e-10)
        and CloseVector(bodyP,wantedBodyP,2e-10);
      checks[scenario,8]:=relativeValid == (if wantedUncertainty then 1 else 0)
        and uncertaintyValid == (if wantedUncertainty then 1 else 0) and uncertaintyReason == expectedReason;
      checks[scenario,9]:=uncertaintyCount == (if expectedReason == 1 then 0 else expectedMatches)
        and uncertaintyInvalid == (if expectedReason == 1 then expectedMatches else 0);
      expectedRelative:=zeros(6,6); expectedConditional:=zeros(6,6);
      if wantedUncertainty then (expectedRelative,expectedConditional):=Noise(matched); end if;
      checks[scenario,10]:=Close(covariance,expectedRelative,2e-9);
      checks[scenario,11]:=Close(conditionalCovariance,expectedConditional,2e-9);
      checks[scenario,12]:=if wantedUncertainty then covariance[1,1] > 0 and conditionalCovariance[1,1] > 0
        and abs(covariance[1,1]-conditionalCovariance[1,1]) > 1e-6 else Close(covariance,zeros(6,6),1e-30)
          and Close(conditionalCovariance,zeros(6,6),1e-30);
      raw[scenario,:]:={valid,relativeValid,matches,accepted,rejection,rms,uncertaintyValid,uncertaintyReason,
        uncertaintyCount,uncertaintyInvalid,invalidDescription,matchingValid,invalidReference,invalidCurrent,
        bodyP[1],bodyP[2],bodyP[3],t[1],t[2],t[3],index[capacity]};
      rawRelative[scenario,:,:]:=covariance; rawConditional[scenario,:,:]:=conditionalCovariance;
      rawLateDescriptor[scenario,:]:=descriptor[capacity,:]; rawLatePoint[scenario,:]:=point[capacity,:];
      rawRotation[scenario,:,:]:=R; rawBodyRotation[scenario,:,:]:=bodyR;
    end for;
  end Run;
end RGBDVisualRelativeReference;

model RGBDVisualRelativeFunctionAcceptance
  output Boolean checks[RGBDVisualRelativeReference.scenarios,12];
  output Real raw[RGBDVisualRelativeReference.scenarios,21];
  output Real rawRelative[RGBDVisualRelativeReference.scenarios,6,6];
  output Real rawConditional[RGBDVisualRelativeReference.scenarios,6,6];
  output Real rawLateDescriptor[RGBDVisualRelativeReference.scenarios,49];
  output Real rawLatePoint[RGBDVisualRelativeReference.scenarios,3];
  output Real rawRotation[RGBDVisualRelativeReference.scenarios,3,3];
  output Real rawBodyRotation[RGBDVisualRelativeReference.scenarios,3,3];
equation
  (checks,raw,rawRelative,rawConditional,rawLateDescriptor,rawLatePoint,rawRotation,rawBodyRotation)=
    RGBDVisualRelativeReference.Run(time);
end RGBDVisualRelativeFunctionAcceptance;
