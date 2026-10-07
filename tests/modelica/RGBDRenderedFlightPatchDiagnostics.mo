// Test-only inspection: no production call site, State mutation, oracle pose,
// uncertainty estimate, or acceptance claim for the measured flight sequence.
package RGBDRenderedFlightPatchReference
  constant Integer height = RGBDKeyframes.imageHeight;
  constant Integer width = RGBDKeyframes.imageWidth;
  constant Integer capacity = RGBDKeyframes.featureCapacity;
  constant Integer rowColumns = 25;
  constant Integer fitColumns = RGBDRenderedFlightPairReference.fitColumns;
  constant Integer traceColumns = 26;
  constant Integer selfColumns = 24;
  constant Integer cycleColumns = 12;

  function TraceRow
    input RGBDPatchTracking.Diagnostics value;
    output Real row[traceColumns];
  algorithm
    row := {value.stopDetail,if value.evaluated then 1 else 0,
      value.lastEvaluatedPixel[1],value.lastEvaluatedPixel[2],if value.acceptedTrial then 1 else 0,
      value.lastAcceptedTrialPixel[1],value.lastAcceptedTrialPixel[2],value.initialSsd,if value.stepValid then 1 else 0,
      value.lastRawStep[1],value.lastRawStep[2],value.lastRawStepNorm,value.lastBacktrack,value.lastTrialScale,
      value.lastTrialPixel[1],value.lastTrialPixel[2],if value.lastTrialInSearch then 1 else 0,
      if value.lastTrialValid then 1 else 0,value.lastTrialSsd,value.windowRejects,value.sampleRejects,
      value.nonDecreaseRejects,value.lastEnergy,value.maximumEigenvalue,value.lastGradient[1],value.lastGradient[2]};
  end TraceRow;

  function TemplateControls
    input Real referenceGray[height,width]; input Real currentGray[height,width];
    input Real retained[RGBDPatchTracking.patchSize]; input Real referencePixel[2];
    input Real seed[2]; input Boolean seedValid; input RGBDPatchTracking.Settings settings;
    output Real row[selfColumns]; output Real difference[RGBDPatchTracking.patchSize];
  protected
    Real descriptor[RGBDPatchTracking.patchSize]; Real jacobian[RGBDPatchTracking.patchSize,2];
    Real energy; Real residual[RGBDPatchTracking.patchSize]; Real pixel[2]; Real cost; Real eigenvalue;
    Real maximumDifference; Boolean valid; Boolean accepted; Integer reason; Integer iterations;
    RGBDPatchTracking.Diagnostics diagnostics;
  algorithm
    row := zeros(selfColumns); difference := zeros(RGBDPatchTracking.patchSize);
    // Match the captured descriptor owner's original 1e-6 contrast admission.
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(referenceGray,referencePixel,1e-6,settings.interpolationMethod);
    row[3] := if valid then 1 else 0; row[6] := energy;
    if valid then
      difference := descriptor-retained; maximumDifference := 0;
      for cell in 1:RGBDPatchTracking.patchSize loop maximumDifference := max(maximumDifference,abs(difference[cell])); end for;
      row[4] := maximumDifference; row[5] := difference*difference;
    end if;
    (accepted,pixel,reason,iterations,cost,eigenvalue,diagnostics)
      := RGBDPatchTracking.TrackDetailed(referenceGray,retained,referencePixel,true,settings);
    row[7:12] := {if accepted then 1 else 0,reason,iterations,cost,eigenvalue,diagnostics.stopDetail};
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(currentGray,referencePixel,settings.minimumContrast,settings.interpolationMethod);
    row[19] := if valid then 1 else 0; row[21] := energy;
    if valid then residual := descriptor-retained; row[20] := residual*residual; end if;
    if seedValid then
      (accepted,pixel,reason,iterations,cost,eigenvalue,diagnostics)
        := RGBDPatchTracking.TrackDetailed(referenceGray,retained,seed,true,settings);
      row[13:18] := {if accepted then 1 else 0,reason,iterations,cost,eigenvalue,diagnostics.stopDetail};
      (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(currentGray,seed,settings.minimumContrast,settings.interpolationMethod);
      row[22] := if valid then 1 else 0; row[24] := energy;
      if valid then residual := descriptor-retained; row[23] := residual*residual; end if;
    end if;
  end TemplateControls;

  function Evaluate
    input RGBDLocalizationCatalog.Estimator reference;
    input Real rgb[height,width,4]; input Real depth[height,width];
    input Real referenceRgb[height,width,4];
    input Real calibration[14]; input Real opticalToBody[3,3];
    input Real currentEpoch;
    input Boolean predictionAccepted;
    input Real predictedRotation[3,3] "Reference optical -> current optical, from actual estimated means";
    input Real predictedTranslation[3];
    input Boolean imageEnabled = true;
    input RGBDPatchTracking.Settings settings = RGBDPatchTracking.Settings();
    input Integer representationMode = 0 "0 raw retained template; 1 both images binomial-filtered, template rebuilt locally";
    input Real maximumCycleError = 0 "0 disables reverse qualification; positive pixel limit enables it";
    output Real summary[16] "pairValid,eligible,predictionAccepted,geometryCompatible,contextValid,referenceEnabled,invalidReference,seeds,tracks,depths,candidates,robustInliers,originalAccepted,originalRms,robustAccepted,robustRms";
    output Real tracks[capacity,rowColumns] "slot,referenceEnabled,referenceDomain,referenceUV(2),seedUV(2),trackAccepted,reason,iterations,ssd,minEigen,trackedUV(2),depthValid,targetXYZ(3),candidate,inlier,predictionResidual,sourceXYZ(3),seedValid";
    output Real fits[2,fitColumns] "Original then robust; original strict maximum RMS .02";
    output Real details[capacity,traceColumns]; output Real selfControls[capacity,selfColumns];
    output Real descriptorDifference[capacity,RGBDPatchTracking.patchSize];
    output Real templateInfo[capacity,3] "representation mode, template valid, Track invoked";
    output Real templateDifference[capacity,RGBDPatchTracking.patchSize] "Used template minus original retained descriptor";
    output Real cycleDetails[capacity,cycleColumns] "forwardAccepted,invoked,qualified,reason,reverseAccepted,reverseReason,iterations,returnedUV(2),cycleError,ssd,eigenvalue";
  protected
    Real gray[height,width]; Real referenceGray[height,width]; Real source[capacity,3]; Real target[capacity,3];
    Real mask[capacity]; Real predicted[3]; Real seed[2]; Real tracked[2]; Real measured[3];
    Real rms; Real eigenvalue; Real geometricResidual; Real pairValid; Real pairEligible; Real captureFresh;
    Real originalRow[fitColumns]; Real robustRow[fitColumns];
    Real fitRotation[3,3]; Real fitTranslation[3]; Real originalMask[capacity]; Real robustMask[capacity];
    Boolean compatible; Boolean contextValid; Boolean domainValid; Boolean seedValid;
    Boolean trackedAccepted; Boolean depthValid; Integer reason; Integer iterations;
    Integer referenceEnabledCount; Integer invalidReferenceCount; Integer seedCount;
    Integer trackedCount; Integer depthCount; Integer geometricCount;
    RGBDPatchTracking.Diagnostics diagnostics;
    Real detailRow[traceColumns]; Real selfRow[selfColumns]; Real difference[RGBDPatchTracking.patchSize];
    Real filtered[height,width]; Boolean filterValid[height,width];
    Real template[RGBDPatchTracking.patchSize]; Real templateJacobian[RGBDPatchTracking.patchSize,2]; Real templateEnergy;
    Boolean templateValid; Boolean cycleAccepted; Boolean reverseAccepted;
    Integer cycleReason; Integer reverseReason; Integer reverseIterations;
    Real returnedPixel[2]; Real cycleError; Real reverseSsd; Real reverseEigenvalue;
    RGBDPatchTracking.Diagnostics reverseDiagnostics;
  algorithm
    summary := zeros(16); tracks := zeros(capacity,rowColumns); fits := zeros(2,fitColumns);
    details := zeros(capacity,traceColumns); selfControls := zeros(capacity,selfColumns);
    descriptorDifference := zeros(capacity,RGBDPatchTracking.patchSize);
    templateInfo := zeros(capacity,3); templateDifference := zeros(capacity,RGBDPatchTracking.patchSize);
    cycleDetails := zeros(capacity,cycleColumns);
    for slot in 1:capacity loop templateInfo[slot,1] := representationMode; end for;
    source := zeros(capacity,3); target := zeros(capacity,3); mask := zeros(capacity);
    referenceEnabledCount := 0; invalidReferenceCount := 0; seedCount := 0;
    trackedCount := 0; depthCount := 0; geometricCount := 0;
    // The caller owns actual image chronology and three held-IMU predictions.
    // This helper independently retains the existing reference-use epoch gate.
    (pairValid,pairEligible,captureFresh) := SchmidtImagePairEligibility(reference.referenceAvailable,
      reference.referenceUsed,reference.referenceEpoch,currentEpoch,reference.lastUsedEpoch);
    compatible := RGBDProperRotationValue(opticalToBody) == 1.0
      and SLAMExactRealEqual(reference.referenceBaseline,calibration[7])
      and SLAMExactRealEqual(reference.referenceDisparityNoise,calibration[8])
      and SLAMExactRealEqual(reference.referenceNoiseReferenceFx,calibration[9]);
    for axis in 1:3 loop
      compatible := compatible and SLAMExactRealEqual(reference.referenceCameraOriginBody[axis],calibration[9+axis]);
      for column in 1:3 loop
        compatible := compatible and SLAMExactRealEqual(reference.referenceOpticalToBody[axis,column],opticalToBody[axis,column]);
      end for;
    end for;
    // This first-pair diagnostic requires unchanged camera calibration. No warp
    // model for changing focal lengths is silently inferred from a 7x7 template.
    for component in 1:4 loop
      compatible := compatible and SLAMExactRealEqual(reference.referenceDepthCalibration[component],calibration[component])
        and SLAMExactRealEqual(reference.referenceRgbCalibration[component],
          if component <= 2 then calibration[component+4] else calibration[component]);
    end for;
    contextValid := imageEnabled and pairValid == 1.0 and predictionAccepted and compatible
      and (representationMode == 0 or representationMode == 1)
      and (maximumCycleError == 0 or (maximumCycleError > 0 and maximumCycleError <= 16))
      and RGBDProperRotationValue(predictedRotation) == 1.0
      and reference.referenceCount >= 0 and reference.referenceCount <= capacity
      and SLAMExactRealEqual(reference.referenceCount,floor(reference.referenceCount))
      and calibration[5] > 0 and calibration[5] <= 1e6 and calibration[6] > 0 and calibration[6] <= 1e6
      and calibration[1] > 0 and calibration[1] <= 1e6 and calibration[2] > 0 and calibration[2] <= 1e6
      and abs(calibration[3]) <= 1e6 and abs(calibration[4]) <= 1e6
      and calibration[7] >= 1e-6 and calibration[7] <= 1
      and calibration[8] >= 0 and calibration[8] <= 2 and calibration[9] > 0 and calibration[9] <= 1e6;
    for axis in 1:3 loop contextValid := contextValid and abs(predictedTranslation[axis]) <= 1e6; end for;
    summary[1:5] := {pairValid,pairEligible,if predictionAccepted then 1 else 0,
      if compatible then 1 else 0,if contextValid then 1 else 0};
    if contextValid and pairEligible == 1.0 then
      for row in 1:height loop
        for column in 1:width loop
          gray[row,column] := if rgb[row,column,1] >= 0 and rgb[row,column,1] <= 255
            and rgb[row,column,2] >= 0 and rgb[row,column,2] <= 255
            and rgb[row,column,3] >= 0 and rgb[row,column,3] <= 255
            then (rgb[row,column,1]+rgb[row,column,2]+rgb[row,column,3])/(3*255.0) else -1;
          referenceGray[row,column] := if referenceRgb[row,column,1] >= 0 and referenceRgb[row,column,1] <= 255
            and referenceRgb[row,column,2] >= 0 and referenceRgb[row,column,2] <= 255
            and referenceRgb[row,column,3] >= 0 and referenceRgb[row,column,3] <= 255
            then (referenceRgb[row,column,1]+referenceRgb[row,column,2]+referenceRgb[row,column,3])/(3*255.0) else -1;
        end for;
      end for;
      if representationMode == 1 then
        (filtered,filterValid) := RGBDPatchTracking.SmoothBinomial(gray); gray := filtered;
        (filtered,filterValid) := RGBDPatchTracking.SmoothBinomial(referenceGray); referenceGray := filtered;
      end if;
      for slot in 1:capacity loop
        tracks[slot,1] := slot;
        selfControls[slot,1] := slot;
        // Unused slots remain opaque; do not sample their descriptor/point/seed.
        if slot <= reference.referenceCount and reference.referenceEnabled[slot] > 0.5 then
          referenceEnabledCount := referenceEnabledCount+1; tracks[slot,2] := reference.referenceEnabled[slot];
          selfControls[slot,2] := reference.referenceEnabled[slot];
          tracks[slot,4:5] := reference.referencePixels[slot,:];
          domainValid := SLAMExactRealEqual(reference.referenceEnabled[slot],1.0)
            and RGBDDescriptorValid(reference.referenceDescriptor[slot,:],reference.referencePoint[slot,:],true)
            and reference.referencePoint[slot,3] > 0
            and reference.referencePixels[slot,1] >= 3 and reference.referencePixels[slot,1] <= width-4
            and reference.referencePixels[slot,2] >= 3 and reference.referencePixels[slot,2] <= height-4
            and SLAMExactRealEqual(reference.referencePixels[slot,1],floor(reference.referencePixels[slot,1]))
            and SLAMExactRealEqual(reference.referencePixels[slot,2],floor(reference.referencePixels[slot,2]));
          tracks[slot,3] := if domainValid then 1 else 0;
          if domainValid then
            template := reference.referenceDescriptor[slot,:]; templateValid := true;
            if representationMode == 1 or settings.interpolationMethod == 1 then
              (templateValid,template,templateJacobian,templateEnergy) := RGBDPatchTracking.Sample(
                referenceGray,reference.referencePixels[slot,:],1e-6,settings.interpolationMethod);
            end if;
            templateInfo[slot,2] := if templateValid then 1 else 0;
            if templateValid then templateDifference[slot,:] := template-reference.referenceDescriptor[slot,:]; end if;
            source[slot,:] := reference.referencePoint[slot,:]; tracks[slot,22:24] := source[slot,:];
            predicted := predictedRotation*source[slot,:]+predictedTranslation;
            seed := zeros(2);
            seedValid := predicted[3] > 0.28 and predicted[3] <= 1e6
              and abs(predicted[1]) <= 1e6 and abs(predicted[2]) <= 1e6;
            if seedValid then
              seed := {calibration[5]*predicted[1]/predicted[3]+calibration[3],
                calibration[6]*predicted[2]/predicted[3]+calibration[4]};
              seedValid := seed[1] >= 3 and seed[1] < width-4 and seed[2] >= 3 and seed[2] < height-4;
              tracks[slot,6:7] := seed;
            end if;
            tracks[slot,25] := if seedValid then 1 else 0;
            if templateValid then
              (selfRow,difference) := TemplateControls(referenceGray,gray,template,
                reference.referencePixels[slot,:],seed,seedValid,settings);
              selfRow[1] := slot; selfRow[2] := reference.referenceEnabled[slot];
              selfControls[slot,:] := selfRow; descriptorDifference[slot,:] := difference;
            end if;
            if seedValid then seedCount := seedCount+1; end if;
            if seedValid and templateValid then
              templateInfo[slot,3] := 1;
              (trackedAccepted,tracked,reason,iterations,rms,eigenvalue,diagnostics) := RGBDPatchTracking.TrackDetailed(
                gray,template,seed,true,settings);
              detailRow := TraceRow(diagnostics); details[slot,:] := detailRow;
              tracks[slot,8:14] := {if trackedAccepted then 1 else 0,reason,iterations,rms,eigenvalue,tracked[1],tracked[2]};
              if trackedAccepted then
                trackedCount := trackedCount+1; cycleAccepted := true;
                cycleDetails[slot,1:3] := {1,0,1};
                if maximumCycleError > 0 then
                  (cycleAccepted,cycleReason,returnedPixel,cycleError,reverseAccepted,reverseReason,
                    reverseIterations,reverseSsd,reverseEigenvalue,reverseDiagnostics)
                    := RGBDPatchTracking.CheckReverse(referenceGray,gray,reference.referencePixels[slot,:],
                      tracked,true,settings,maximumCycleError);
                  cycleDetails[slot,:] := {1,1,if cycleAccepted then 1 else 0,cycleReason,
                    if reverseAccepted then 1 else 0,reverseReason,reverseIterations,
                    returnedPixel[1],returnedPixel[2],cycleError,reverseSsd,reverseEigenvalue};
                end if;
                if cycleAccepted then
                (measured,depthValid) := RGBDCalibratedPoint(depth,tracked,true,
                  {calibration[5],calibration[6],calibration[3],calibration[4]},calibration[1:4],
                  0.28,10.0,calibration[8],calibration[9],calibration[7]);
                tracks[slot,15] := if depthValid then 1 else 0;
                if depthValid then
                  depthCount := depthCount+1; target[slot,:] := measured; tracks[slot,16:18] := measured;
                  geometricResidual := sqrt((measured-predicted)*(measured-predicted));
                  tracks[slot,21] := geometricResidual;
                  // Explicit existing prediction-mode geometric gate, not a new
                  // relaxed registration threshold or an oracle correspondence.
                  if geometricResidual <= 0.5 then mask[slot] := 1; geometricCount := geometricCount+1; end if;
                  tracks[slot,19] := mask[slot];
                end if;
                end if;
              end if;
            else
              tracks[slot,9] := 3;
            end if;
          else
            invalidReferenceCount := invalidReferenceCount+1; tracks[slot,9] := 2;
          end if;
        elseif slot <= reference.referenceCount and not SLAMExactRealEqual(reference.referenceEnabled[slot],0.0) then
          invalidReferenceCount := invalidReferenceCount+1; tracks[slot,9] := 2;
        end if;
      end for;
    end if;
    (originalRow,fitRotation,fitTranslation,originalMask) := RGBDRenderedFlightPairReference.Fit(source,target,mask,false);
    (robustRow,fitRotation,fitTranslation,robustMask) := RGBDRenderedFlightPairReference.Fit(source,target,mask,true);
    for column in 1:fitColumns loop fits[1,column] := originalRow[column]; fits[2,column] := robustRow[column]; end for;
    for slot in 1:capacity loop tracks[slot,20] := robustMask[slot]; end for;
    summary[6:16] := {referenceEnabledCount,invalidReferenceCount,seedCount,trackedCount,depthCount,geometricCount,
      sum(robustMask),originalRow[1],originalRow[7],robustRow[1],robustRow[7]};
  end Evaluate;

  function Run
    input String datasetFile; input Real clock;
    input Integer representationMode = 0;
    input Integer interpolationMethod = 0;
    input Real maximumCycleError = 0;
    output Boolean checks[8]; output Real summary[25];
    output Real tracks[capacity,rowColumns]; output Real fits[2,fitColumns];
    output Real prediction[3,3]; output Real predictedRotation[3,3]; output Real predictedTranslation[3];
    output Real details[capacity,traceColumns]; output Real selfControls[capacity,selfColumns];
    output Real descriptorDifference[capacity,RGBDPatchTracking.patchSize];
    output Real templateInfo[capacity,3]; output Real templateDifference[capacity,RGBDPatchTracking.patchSize];
    output Real cycleDetails[capacity,cycleColumns];
  protected
    Real calibrationMatrix[1,14]; Real calibration[14]; Real opticalToBody[3,3];
    Real initialImu[1,6]; Real intervals[36,8]; Real acquisition[13,2];
    Real rgb[height,width,4]; Real referenceRgb[height,width,4]; Real depth[height,width];
    RGBDGraphProcessing.State fresh; RGBDFastSLAMRawCompositionReference.Outcome initialized;
    RGBDLocalizationCatalog.Estimator reference;
    Real position[3]; Real velocity[3]; Real rotation[3,3]; Real covariance[15,15]; Real crossCovariance[15,6];
    Real nextPosition[3]; Real nextVelocity[3]; Real nextRotation[3,3];
    Real nextCovariance[15,15]; Real nextCross[15,6]; Real transition[15,15]; Real noise[15,15];
    Real accepted; Real endTime; Real diagnosticSummary[16]; Integer substeps; Boolean running;
  algorithm
    checks := fill(false,8); summary := zeros(25); prediction := zeros(3,3);
    calibrationMatrix := Modelica.Utilities.Streams.readRealMatrix(datasetFile,"calibration",1,14,false);
    calibration := calibrationMatrix[1,:];
    opticalToBody := Modelica.Utilities.Streams.readRealMatrix(datasetFile,"opticalToBody",3,3,false);
    initialImu := Modelica.Utilities.Streams.readRealMatrix(datasetFile,"initialImu",1,6,false);
    intervals := Modelica.Utilities.Streams.readRealMatrix(datasetFile,"imuIntervals",36,8,false);
    acquisition := Modelica.Utilities.Streams.readRealMatrix(datasetFile,"acquisition",13,2,false);
    fresh := RGBDGraphProcessing.Empty(RGBDLocalizationCatalog.Empty(
      RGBDLocalizationCatalog.EmptyEstimator(zeros(3),zeros(3),identity(3),zeros(3),zeros(3),
        RGBDLocalizationInitializeTests.Covariance()),1,1,1,0));
    (rgb,depth) := RGBDRenderedFrameInput.Read(datasetFile,1);
    referenceRgb := rgb;
    initialized := RGBDRenderedFlightSLAMReference.Initialize(fresh,rgb,depth,calibration,opticalToBody,initialImu[1,:]);
    reference := initialized.next.estimator.localization.estimator;
    checks[1] := clock >= 0 and clock <= 0.001;
    checks[2] := initialized.accepted and initialized.initializationAccepted == 1 and initialized.captureAccepted == 1;
    checks[3] := reference.referenceAvailable == 1 and reference.referenceEpoch == 0
      and reference.referenceUsed == 0 and reference.lastUsedEpoch == -1;
    checks[4] := SLAMExactRealEqual(acquisition[1,1],0) and SLAMExactRealEqual(acquisition[1,2],0)
      and SLAMExactRealEqual(acquisition[2,1],1) and abs(acquisition[2,2]-1/30.0) < 1e-12;
    position := reference.position; velocity := reference.velocity; rotation := reference.rotation;
    covariance := reference.covariance; crossCovariance := reference.crossCovariance;
    running := true; endTime := acquisition[1,2]; checks[5] := true;
    for hold in 1:3 loop
      checks[5] := checks[5] and intervals[hold,2] > 0 and intervals[hold,2] <= 0.2
        and abs(intervals[hold,2]-1/90.0) < 1e-12
        and abs(intervals[hold,1]-endTime-intervals[hold,2]) < 1e-12;
      accepted := 0; substeps := 0;
      if running then
        (accepted,transition,noise,nextPosition,nextVelocity,nextRotation,nextCovariance,nextCross,substeps)
          := ES15PredictHeldInterval(position,velocity,rotation,reference.accelBias,reference.gyroBias,
            covariance,crossCovariance,reference.referenceCovariance,reference.referencePosition,
            reference.referenceRotation,reference.referenceAvailable,intervals[hold,3:5],intervals[hold,6:8],
            {0,0,-9.81},intervals[hold,2],fill(0.01,12));
        running := accepted == 1.0;
        if running then
          position := nextPosition; velocity := nextVelocity; rotation := nextRotation;
          covariance := nextCovariance; crossCovariance := nextCross;
        end if;
      end if;
      prediction[hold,:] := {accepted,substeps,intervals[hold,1]}; endTime := intervals[hold,1];
    end for;
    checks[5] := checks[5] and abs(endTime-acquisition[2,2]) < 1e-12; checks[6] := running;
    predictedRotation := transpose(opticalToBody)*transpose(rotation)*reference.referenceRotation*opticalToBody;
    predictedTranslation := transpose(opticalToBody)*transpose(rotation)*
      (reference.referencePosition+reference.referenceRotation*calibration[10:12]
        -position-rotation*calibration[10:12]);
    checks[7] := RGBDProperRotationValue(predictedRotation) == 1.0;
    for axis in 1:3 loop checks[7] := checks[7] and abs(predictedTranslation[axis]) <= 1e6; end for;
    (rgb,depth) := RGBDRenderedFrameInput.Read(datasetFile,2);
    (diagnosticSummary,tracks,fits,details,selfControls,descriptorDifference,templateInfo,templateDifference,cycleDetails)
      := Evaluate(reference,rgb,depth,referenceRgb,calibration,opticalToBody,
        acquisition[2,1],running,predictedRotation,predictedTranslation,
        settings=RGBDPatchTracking.Settings(interpolationMethod=interpolationMethod),representationMode=representationMode,
        maximumCycleError=maximumCycleError);
    summary[1:16] := diagnosticSummary;
    summary[17:24] := {if initialized.accepted then 1 else 0,reference.referenceCount,
      sum(reference.referenceEnabled),reference.referenceEpoch,if running then 1 else 0,position[1],position[2],position[3]};
    summary[25] := representationMode;
    // Execution/context checks intentionally impose no desired tracker/fit result.
    checks[8] := diagnosticSummary[1] == 1 and diagnosticSummary[2] == 1 and diagnosticSummary[5] == 1;
  end Run;

  impure function RunAndWrite
    input String datasetFile; input String diagnosticFile; input Real clock;
    input Integer representationMode = 0;
    input Integer interpolationMethod = 0;
    input Real maximumCycleError = 0;
    output Boolean checks[8]; output Real summary[25]; output Boolean writerSuccess;
  protected
    constant Integer diagnosticCells = capacity*(rowColumns+traceColumns+selfColumns+2*RGBDPatchTracking.patchSize+3)
      +2*fitColumns+3*3+3*3+3+25+8+capacity*cycleColumns+1;
    Real tracks[capacity,rowColumns]; Real fits[2,fitColumns]; Real prediction[3,3];
    Real details[capacity,traceColumns]; Real selfControls[capacity,selfColumns];
    Real descriptorDifference[capacity,RGBDPatchTracking.patchSize];
    Real templateInfo[capacity,3]; Real templateDifference[capacity,RGBDPatchTracking.patchSize];
    Real cycleDetails[capacity,cycleColumns];
    Real predictedRotation[3,3]; Real predictedTranslation[3]; Real matrix[1,diagnosticCells]; Integer cursor;
  algorithm
    (checks,summary,tracks,fits,prediction,predictedRotation,predictedTranslation,details,selfControls,descriptorDifference,templateInfo,templateDifference,cycleDetails)
      := Run(datasetFile,clock,representationMode,interpolationMethod,maximumCycleError);
    cursor := 0;
    // Sole MAT write; row-major logical sections in the order declared here.
    for slot in 1:capacity loop
      for column in 1:rowColumns loop cursor := cursor+1; matrix[1,cursor] := tracks[slot,column]; end for;
    end for;
    for slot in 1:capacity loop
      for column in 1:traceColumns loop cursor := cursor+1; matrix[1,cursor] := details[slot,column]; end for;
    end for;
    for slot in 1:capacity loop
      for column in 1:selfColumns loop cursor := cursor+1; matrix[1,cursor] := selfControls[slot,column]; end for;
    end for;
    for slot in 1:capacity loop
      for column in 1:RGBDPatchTracking.patchSize loop cursor := cursor+1; matrix[1,cursor] := descriptorDifference[slot,column]; end for;
    end for;
    for slot in 1:capacity loop
      for column in 1:3 loop cursor := cursor+1; matrix[1,cursor] := templateInfo[slot,column]; end for;
    end for;
    for slot in 1:capacity loop
      for column in 1:RGBDPatchTracking.patchSize loop cursor := cursor+1; matrix[1,cursor] := templateDifference[slot,column]; end for;
    end for;
    for method in 1:2 loop
      for column in 1:fitColumns loop cursor := cursor+1; matrix[1,cursor] := fits[method,column]; end for;
    end for;
    for hold in 1:3 loop
      for column in 1:3 loop cursor := cursor+1; matrix[1,cursor] := prediction[hold,column]; end for;
    end for;
    for row in 1:3 loop
      for column in 1:3 loop cursor := cursor+1; matrix[1,cursor] := predictedRotation[row,column]; end for;
    end for;
    for column in 1:3 loop cursor := cursor+1; matrix[1,cursor] := predictedTranslation[column]; end for;
    for column in 1:25 loop cursor := cursor+1; matrix[1,cursor] := summary[column]; end for;
    for column in 1:8 loop cursor := cursor+1; matrix[1,cursor] := if checks[column] then 1 else 0; end for;
    for slot in 1:capacity loop
      for column in 1:cycleColumns loop cursor := cursor+1; matrix[1,cursor] := cycleDetails[slot,column]; end for;
    end for;
    cursor := cursor+1; matrix[1,cursor] := maximumCycleError;
    writerSuccess := Modelica.Utilities.Streams.writeRealMatrix(diagnosticFile,"diagnostics",matrix,false,"4");
    writerSuccess := writerSuccess and cursor == diagnosticCells;
  end RunAndWrite;
end RGBDRenderedFlightPatchReference;

model RGBDRenderedFlightPatchDiagnostics
  parameter String datasetFile = "";
  parameter String diagnosticFile = "flight-patch-diagnostics.mat";
  parameter Integer representationMode = 0 "Explicit experiment: 0 raw, 1 binomial on both images";
  parameter Integer interpolationMethod = 0 "0 bilinear, 1 Catmull-Rom; same method for template and tracking";
  parameter Real maximumCycleError = 0 "0 disables, otherwise independent pixel-cycle limit";
  output Integer samplerMode; output Real cycleMode;
  output Boolean checks[8]; output Real summary[25]; output Boolean writerSuccess;
equation
  samplerMode = interpolationMethod; cycleMode = maximumCycleError;
  (checks,summary,writerSuccess) = RGBDRenderedFlightPatchReference.RunAndWrite(datasetFile,diagnosticFile,time,representationMode,interpolationMethod,maximumCycleError);
end RGBDRenderedFlightPatchDiagnostics;
