// Test-only measured first-pair inspection. No oracle pose matrix is read.
package RGBDRenderedFlightPairReference
  constant Integer height = RGBDKeyframes.imageHeight;
  constant Integer width = RGBDKeyframes.imageWidth;
  constant Integer capacity = RGBDKeyframes.featureCapacity;
  constant Integer descriptorSize = RGBDKeyframes.descriptorSize;
  constant Integer inventoryColumns = 12;
  constant Integer pairColumns = 24;
  constant Integer fitColumns = 26;

  function Inventory
    input Real rgb[height,width,4]; input Real depth[height,width];
    input Real selected[height*width,3]; input Real count;
    input Real enabled[capacity]; input Real point[capacity,3]; input Real calibration[14];
    output Real rows[capacity,inventoryColumns];
  protected
    Boolean positionValid; Boolean depthValid; Real optical[3];
    Integer x; Integer y; Integer index;
    Real patch[descriptorSize]; Real mean; Real energy; Real value;
  algorithm
    rows := zeros(capacity,inventoryColumns);
    for slot in 1:capacity loop
      rows[slot,1] := slot;
      rows[slot,2:3] := selected[slot,1:2]; rows[slot,4] := selected[slot,3];
      rows[slot,5] := enabled[slot]; rows[slot,6:8] := point[slot,:];
      positionValid := slot <= count and selected[slot,1] >= 3 and selected[slot,1] <= width-4
        and selected[slot,2] >= 3 and selected[slot,2] <= height-4
        and floor(selected[slot,1]) == selected[slot,1] and floor(selected[slot,2]) == selected[slot,2];
      (optical,depthValid) := RGBDCalibratedPoint(depth,selected[slot,1:2],positionValid,
        {calibration[5],calibration[6],calibration[3],calibration[4]},calibration[1:4],
        0.28,10.0,calibration[8],calibration[9],calibration[7]);
      rows[slot,9] := if depthValid then 1.0 else 0.0;
      patch := zeros(descriptorSize); mean := 0.0; energy := 0.0;
      x := if positionValid then integer(selected[slot,1]) else 3;
      y := if positionValid then integer(selected[slot,2]) else 3;
      if positionValid then
        for row in 0:6 loop
          for column in 0:6 loop
            index := row*7+column+1;
            value := (rgb[y+row-2,x+column-2,1]+rgb[y+row-2,x+column-2,2]
              +rgb[y+row-2,x+column-2,3])/(3.0*255.0);
            patch[index] := value; mean := mean+value;
          end for;
        end for;
        mean := mean/descriptorSize;
        for index in 1:descriptorSize loop energy := energy+(patch[index]-mean)^2; end for;
      end if;
      rows[slot,10] := mean; rows[slot,11] := sqrt(energy);
      rows[slot,12] := if positionValid and energy >= descriptorSize*1e-12 then 1.0 else 0.0;
    end for;
  end Inventory;

  function Fit
    input Real source[capacity,3]; input Real target[capacity,3]; input Real enabled[capacity];
    input Boolean robust;
    output Real row[fitColumns]; output Real rotation[3,3]; output Real translation[3];
    output Real inlier[capacity];
  protected
    Real accepted; Real reason; Real validCount; Real invalidCount; Real rank;
    Real cost; Real rms; Real eigenGap; Real sourceCentroid[3]; Real targetCentroid[3];
    Real rejectedCount;
  algorithm
    inlier := zeros(capacity); rejectedCount := 0.0;
    if robust then
      (accepted,reason,rotation,translation,validCount,invalidCount,rank,cost,rms,eigenGap,
        sourceCentroid,targetCentroid,inlier,rejectedCount) := FitRigidPointPairsRobust(
        source,target,enabled,capacity,1e6,1e-8,0.02,64,0.5);
    else
      (accepted,reason,rotation,translation,validCount,invalidCount,rank,cost,rms,eigenGap,
        sourceCentroid,targetCentroid) := FitRigidPointPairs(source,target,enabled,capacity,1e6,1e-8,0.02);
    end if;
    row := zeros(fitColumns);
    row[1:8] := {accepted,reason,validCount,invalidCount,rank,cost,rms,eigenGap};
    row[9:11] := sourceCentroid; row[12:14] := targetCentroid;
    for axis in 1:3 loop
      for column in 1:3 loop row[14+(axis-1)*3+column] := rotation[axis,column]; end for;
    end for;
    row[24:26] := translation;
  end Fit;

  function MatchAndFit
    input RGBDLocalizationCatalog.Estimator reference;
    input Real currentDescriptor[capacity,descriptorSize]; input Real currentPoint[capacity,3];
    input Real currentEnabled[capacity]; input Real selected[height*width,3]; input Real currentCount;
    input Real usePrediction; input Real predictedRotation[3,3]; input Real predictedTranslation[3];
    output Real pairs[capacity,pairColumns]; output Real fits[2,fitColumns]; output Real summary[5];
  protected
    Real currentIndex[capacity]; Real pairEnabled[capacity]; Real source[capacity,3]; Real target[capacity,3];
    Real count; Real configuration; Real invalidReference; Real invalidCurrent;
    Real nearest[capacity]; Real second[capacity]; Real row[fitColumns];
    Real originalRotation[3,3]; Real originalTranslation[3]; Real robustRotation[3,3]; Real robustTranslation[3];
    Real originalInlier[capacity]; Real robustInlier[capacity]; Integer partner;
  algorithm
    (currentIndex,pairEnabled,source,target,count,configuration,invalidReference,invalidCurrent,nearest,second)
      := MatchRGBDDescriptors(reference.referenceDescriptor,currentDescriptor,reference.referencePoint,currentPoint,
        reference.referenceEnabled,currentEnabled,reference.referenceCount,currentCount,
        0.8,0.8,usePrediction,predictedRotation,predictedTranslation,0.5);
    (row,originalRotation,originalTranslation,originalInlier) := Fit(source,target,pairEnabled,false);
    for column in 1:fitColumns loop fits[1,column] := row[column]; end for;
    (row,robustRotation,robustTranslation,robustInlier) := Fit(source,target,pairEnabled,true);
    for column in 1:fitColumns loop fits[2,column] := row[column]; end for;
    summary := {count,configuration,invalidReference,invalidCurrent,sum(robustInlier)};
    pairs := zeros(capacity,pairColumns);
    for slot in 1:capacity loop
      pairs[slot,1] := slot; pairs[slot,2] := reference.referenceEnabled[slot];
      pairs[slot,3:4] := reference.referencePixels[slot,:]; pairs[slot,5:7] := reference.referencePoint[slot,:];
      pairs[slot,8] := currentIndex[slot]; pairs[slot,14] := pairEnabled[slot];
      pairs[slot,15] := nearest[slot]; pairs[slot,16] := second[slot];
      if pairEnabled[slot] == 1.0 and currentIndex[slot] >= 1.0 and currentIndex[slot] <= capacity then
        partner := integer(currentIndex[slot]);
        pairs[slot,9:10] := selected[partner,1:2]; pairs[slot,11:13] := currentPoint[partner,:];
        pairs[slot,17] := RGBDDescriptorDistance(reference.referenceDescriptor[slot,:],currentDescriptor[partner,:]);
        pairs[slot,18:19] := selected[partner,1:2]-reference.referencePixels[slot,:];
        pairs[slot,20] := sqrt(sum((target[slot,:]-source[slot,:]).^2));
        // On refusal the fit returns canonical identity/zero; these are NOT candidate-fit residuals.
        pairs[slot,21] := sqrt(sum((target[slot,:]-originalRotation*source[slot,:]-originalTranslation).^2));
        pairs[slot,22] := sqrt(sum((target[slot,:]-robustRotation*source[slot,:]-robustTranslation).^2));
        pairs[slot,23] := robustInlier[slot];
        pairs[slot,24] := sqrt(sum((target[slot,:]-predictedRotation*source[slot,:]-predictedTranslation).^2));
      end if;
    end for;
  end MatchAndFit;

  impure function Run
    input String datasetFile; input Real clock;
    output Boolean checks[8]; output Real summary[16];
    output Real inventory[2,capacity,inventoryColumns]; output Real pairs[2,capacity,pairColumns];
    output Real fits[2,2,fitColumns]; output Real matching[2,5]; output Real prediction[3,3];
    output Real predictedRotation[3,3]; output Real predictedTranslation[3];
  protected
    Real calibrationMatrix[1,14]; Real calibration[14]; Real opticalToBody[3,3];
    Real initialImu[1,6]; Real intervals[36,8];
    Real rgb[height,width,4]; Real depth[height,width];
    Real scores[height*width]; Real selected[height*width,3]; Real selectedCount; Real selectionStatus;
    Real descriptor[capacity,descriptorSize]; Real point[capacity,3]; Real enabled[capacity]; Real invalidCount;
    Real inventoryRows[capacity,inventoryColumns]; Real pairRows[capacity,pairColumns];
    Real fitRows[2,fitColumns]; Real matchSummary[5];
    RGBDGraphProcessing.State fresh; RGBDFastSLAMRawCompositionReference.Outcome initialized;
    RGBDLocalizationCatalog.Estimator reference;
    Real position[3]; Real velocity[3]; Real rotation[3,3]; Real covariance[15,15]; Real crossCovariance[15,6];
    Real nextPosition[3]; Real nextVelocity[3]; Real nextRotation[3,3];
    Real nextCovariance[15,15]; Real nextCross[15,6]; Real transition[15,15]; Real noise[15,15];
    Real accepted; Integer substeps; Boolean running;
  algorithm
    checks := fill(true,8); summary := zeros(16); inventory := zeros(2,capacity,inventoryColumns);
    pairs := zeros(2,capacity,pairColumns); fits := zeros(2,2,fitColumns); matching := zeros(2,5); prediction := zeros(3,3);
    calibrationMatrix := Modelica.Utilities.Streams.readRealMatrix(datasetFile,"calibration",1,14,false);
    calibration := calibrationMatrix[1,:];
    opticalToBody := Modelica.Utilities.Streams.readRealMatrix(datasetFile,"opticalToBody",3,3,false);
    initialImu := Modelica.Utilities.Streams.readRealMatrix(datasetFile,"initialImu",1,6,false);
    intervals := Modelica.Utilities.Streams.readRealMatrix(datasetFile,"imuIntervals",36,8,false);
    fresh := RGBDGraphProcessing.Empty(RGBDLocalizationCatalog.Empty(
      RGBDLocalizationCatalog.EmptyEstimator(zeros(3),zeros(3),identity(3),zeros(3),zeros(3),
        RGBDLocalizationInitializeTests.Covariance()),1,1,1,0));
    (rgb,depth) := RGBDRenderedFrameInput.Read(datasetFile,1);
    initialized := RGBDRenderedFlightSLAMReference.Initialize(fresh,rgb,depth,calibration,opticalToBody,initialImu[1,:]);
    reference := initialized.next.estimator.localization.estimator;
    checks[1] := clock >= 0 and clock <= 0.001;
    checks[2] := initialized.accepted and initialized.initializationAccepted == 1 and initialized.captureAccepted == 1;
    checks[3] := reference.referenceAvailable == 1 and reference.referenceEpoch == 0;
    summary[1:4] := {if initialized.accepted then 1.0 else 0.0,reference.referenceCount,sum(reference.referenceEnabled),reference.referenceEpoch};
    for frame in 1:2 loop
      (rgb,depth) := RGBDRenderedFrameInput.Read(datasetFile,frame);
      scores := FastFrameScores(rgb,true);
      (selected,selectedCount,selectionStatus) := SelectRasterFeatures(scores,width,height,width*height,3,
        {18.0,0.0,1e8,3.0,capacity,1.0,3.0,3.0},false,true);
      (descriptor,point,enabled,invalidCount) := DescribeRGBDFrame(rgb,depth,selected[1:capacity,1:2],selectedCount,
        {calibration[5],calibration[6],calibration[3],calibration[4]},calibration[1:4],
        calibration[8],calibration[9],calibration[7],0.28,10.0,1e-6,true);
      checks[3+frame] := selectionStatus == 1 and selectedCount >= 0 and selectedCount <= capacity;
      inventoryRows := Inventory(rgb,depth,selected,selectedCount,enabled,point,calibration);
      for slot in 1:capacity loop
        for column in 1:inventoryColumns loop inventory[frame,slot,column] := inventoryRows[slot,column]; end for;
      end for;
      summary[4+(frame-1)*4+1:4+frame*4] := {selectedCount,selectionStatus,sum(enabled),invalidCount};
      if frame == 1 then
        checks[6] := selectedCount == reference.referenceCount;
        for slot in 1:capacity loop
          checks[6] := checks[6] and enabled[slot] == reference.referenceEnabled[slot];
          for column in 1:2 loop checks[6] := checks[6] and selected[slot,column] == reference.referencePixels[slot,column]; end for;
          for column in 1:3 loop checks[6] := checks[6] and point[slot,column] == reference.referencePoint[slot,column]; end for;
          for column in 1:descriptorSize loop checks[6] := checks[6] and descriptor[slot,column] == reference.referenceDescriptor[slot,column]; end for;
        end for;
      end if;
    end for;
    position := reference.position; velocity := reference.velocity; rotation := reference.rotation;
    covariance := reference.covariance; crossCovariance := reference.crossCovariance; running := true;
    for hold in 1:3 loop
      accepted := 0.0; substeps := 0;
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
      prediction[hold,:] := {accepted,substeps,intervals[hold,1]};
    end for;
    checks[7] := running;
    predictedRotation := transpose(opticalToBody)*transpose(rotation)*reference.referenceRotation*opticalToBody;
    predictedTranslation := transpose(opticalToBody)*transpose(rotation)*
      (reference.referencePosition+reference.referenceRotation*calibration[10:12]
        -position-rotation*calibration[10:12]);
    summary[13:16] := {if running then 1.0 else 0.0,position[1],position[2],position[3]};
    checks[8] := RGBDProperRotationValue(predictedRotation) == 1.0;
    for mode in 1:2 loop
      (pairRows,fitRows,matchSummary) := MatchAndFit(reference,descriptor,point,enabled,selected,selectedCount,
        if mode == 1 then 0.0 else 1.0,predictedRotation,predictedTranslation);
      for slot in 1:capacity loop
        for column in 1:pairColumns loop pairs[mode,slot,column] := pairRows[slot,column]; end for;
      end for;
      for fit in 1:2 loop
        for column in 1:fitColumns loop fits[mode,fit,column] := fitRows[fit,column]; end for;
      end for;
      for column in 1:5 loop matching[mode,column] := matchSummary[column]; end for;
    end for;
  end Run;

  // Test-only exact binary export. Run and all numerical owners above are unchanged.
  // Flatten in documented row-major logical order; the sole MAT matrix has one row.
  impure function RunAndWrite
    input String datasetFile; input String diagnosticFile; input Real clock;
    output Boolean checks[8]; output Real summary[16]; output Boolean writerSuccess;
  protected
    constant Integer diagnosticCells = 2*capacity*inventoryColumns+2*capacity*pairColumns
      +4*fitColumns+2*5+3*3+3*3+3+16+8;
    Real inventory[2,capacity,inventoryColumns]; Real pairs[2,capacity,pairColumns];
    Real fits[2,2,fitColumns]; Real matching[2,5]; Real prediction[3,3];
    Real predictedRotation[3,3]; Real predictedTranslation[3];
    Real matrix[1,diagnosticCells]; Integer cursor;
  algorithm
    (checks,summary,inventory,pairs,fits,matching,prediction,predictedRotation,predictedTranslation)
      := Run(datasetFile,clock);
    cursor := 0;
    for mode in 1:2 loop
      for slot in 1:capacity loop
        for column in 1:inventoryColumns loop
          cursor := cursor+1; matrix[1,cursor] := inventory[mode,slot,column];
        end for;
      end for;
    end for;
    for mode in 1:2 loop
      for slot in 1:capacity loop
        for column in 1:pairColumns loop
          cursor := cursor+1; matrix[1,cursor] := pairs[mode,slot,column];
        end for;
      end for;
    end for;
    for mode in 1:2 loop
      for method in 1:2 loop
        for column in 1:fitColumns loop
          cursor := cursor+1; matrix[1,cursor] := fits[mode,method,column];
        end for;
      end for;
    end for;
    for mode in 1:2 loop
      for column in 1:5 loop cursor := cursor+1; matrix[1,cursor] := matching[mode,column]; end for;
    end for;
    for hold in 1:3 loop
      for column in 1:3 loop cursor := cursor+1; matrix[1,cursor] := prediction[hold,column]; end for;
    end for;
    for row in 1:3 loop
      for column in 1:3 loop cursor := cursor+1; matrix[1,cursor] := predictedRotation[row,column]; end for;
    end for;
    for column in 1:3 loop cursor := cursor+1; matrix[1,cursor] := predictedTranslation[column]; end for;
    for column in 1:16 loop cursor := cursor+1; matrix[1,cursor] := summary[column]; end for;
    for column in 1:8 loop cursor := cursor+1; matrix[1,cursor] := if checks[column] then 1.0 else 0.0; end for;
    writerSuccess := Modelica.Utilities.Streams.writeRealMatrix(diagnosticFile,"diagnostics",matrix,false,"4");
  end RunAndWrite;
end RGBDRenderedFlightPairReference;

model RGBDRenderedFlightPairDiagnostics
  parameter String datasetFile = "";
  parameter String diagnosticFile = "flight-pair-diagnostics.mat";
  output Boolean checks[8]; output Real summary[16]; output Boolean writerSuccess;
equation
  (checks,summary,writerSuccess) = RGBDRenderedFlightPairReference.RunAndWrite(datasetFile,diagnosticFile,time);
end RGBDRenderedFlightPairDiagnostics;
