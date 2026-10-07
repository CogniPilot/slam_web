// Pinhole intrinsics from image size and horizontal/vertical field of view.
function RGBDNominalCalibration
  input Integer imageSize[2] "Height, width";
  input Real fieldOfViewDegrees[2] "Horizontal, vertical";
  output Real calibration[4] "fx, fy, cx, cy";
algorithm
  calibration := {imageSize[2]/(2.0*tan(fieldOfViewDegrees[1]*3.141592653589793/360.0)),
    imageSize[1]/(2.0*tan(fieldOfViewDegrees[2]*3.141592653589793/360.0)),
    (imageSize[2]-1)/2.0,(imageSize[1]-1)/2.0};
end RGBDNominalCalibration;

// Interpolate inverse depth between separate RGB and depth optical grids.
// Zero-weight neighbors are ignored, including invalid samples.
function RGBDCalibratedPoint
  input Real depth[:,:];
  input Real pixel[2];
  input Boolean enabled;
  input Real rgbCalibration[4];
  input Real depthCalibration[4];
  input Real nearDepth;
  input Real farDepth;
  input Real disparityNoise;
  input Real noiseReferenceFx;
  input Real baseline;
  output Real point[3] "Optical RDF: right, down, forward";
  output Boolean valid;
  input Real depthUnits = 1.0 "Meters per depth sample; 1 for metric depth, SDK scale for Z16";
protected
  Real mapped[2];
  Real bearing[2];
  Real nearest;
  Real low;
  Real part;
  Integer lower[2];
  Integer sampleX;
  Integer sampleY;
  Integer sampleIndex;
  Real fraction[2];
  Real weight[4];
  Real sample;
  Real inverseDepth;
  Real minimumDepth;
  Real maximumDepth;
  Real threshold;
  Real axialDepth;
  Boolean configuration;
  Boolean inside;
  Boolean usable;
algorithm
  nearest := 0.0;
  low := 0.0;
  part := 0.0;
  inside := false;
  sampleX := 0;
  sampleY := 0;
  sampleIndex := 1;
  sample := 0.0;
  usable := false;
  configuration := enabled and depthUnits > 0.0 and depthUnits <= 1e6 and size(depth,1) > 1 and size(depth,2) > 1 and
    pixel[1] >= 0.0 and pixel[1] < size(depth,2) and pixel[2] >= 0.0 and pixel[2] < size(depth,1) and
    rgbCalibration[1] >= 1e-6 and rgbCalibration[1] <= 1e6 and rgbCalibration[2] >= 1e-6 and rgbCalibration[2] <= 1e6 and
    depthCalibration[1] >= 1e-6 and depthCalibration[1] <= 1e6 and depthCalibration[2] >= 1e-6 and depthCalibration[2] <= 1e6 and
    abs(rgbCalibration[3]) <= 1e6 and abs(rgbCalibration[4]) <= 1e6 and
    abs(depthCalibration[3]) <= 1e6 and abs(depthCalibration[4]) <= 1e6 and
    nearDepth > 0.0 and farDepth > nearDepth+0.05 and farDepth <= 1e6 and
    disparityNoise >= 0.0 and disparityNoise <= 1.0 and noiseReferenceFx >= 1e-6 and noiseReferenceFx <= 1e6 and
    baseline >= 1e-6 and baseline <= 10.0;
  mapped := zeros(2);
  bearing := zeros(2);
  lower := fill(0,2);
  fraction := zeros(2);
  for k in 1:2 loop
    mapped[k] := if configuration then (pixel[k]-rgbCalibration[k+2])*depthCalibration[k]/rgbCalibration[k]+depthCalibration[k+2] else 0.0;
    low := floor(mapped[k]);
    part := mapped[k]-low;
    nearest := if part < 0.5 then low else if part > 0.5 then low+1.0 else if floor(low/2.0)*2.0 == low then low else low+1.0;
    bearing[k] := if abs(mapped[k]-nearest) <= 1e-9 then nearest else mapped[k];
    inside := configuration and bearing[k] >= 0.0 and bearing[k] <= (if k == 1 then size(depth,2)-1 else size(depth,1)-1);
    lower[k] := if inside then integer(floor(bearing[k])) else 0;
    fraction[k] := if inside then bearing[k]-lower[k] else 0.0;
    configuration := configuration and inside;
  end for;
  weight := {(1.0-fraction[1])*(1.0-fraction[2]),fraction[1]*(1.0-fraction[2]),
    (1.0-fraction[1])*fraction[2],fraction[1]*fraction[2]};
  valid := configuration;
  inverseDepth := 0.0;
  minimumDepth := farDepth;
  maximumDepth := 0.0;
  for row in 0:1 loop
    for column in 0:1 loop
      sampleIndex := 2*row+column+1;
      sampleX := lower[1]+column;
      sampleY := lower[2]+row;
      sample := if configuration and weight[sampleIndex] > 0.0
        and sampleX < size(depth,2) and sampleY < size(depth,1)
        then depth[sampleY+1,sampleX+1]*depthUnits else 0.0;
      usable := weight[sampleIndex] <= 0.0 or (sample > nearDepth and sample < farDepth-0.05);
      valid := valid and usable;
      minimumDepth := if weight[sampleIndex] > 0.0 and usable then min(minimumDepth,sample) else minimumDepth;
      maximumDepth := if weight[sampleIndex] > 0.0 and usable then max(maximumDepth,sample) else maximumDepth;
      inverseDepth := inverseDepth+(if weight[sampleIndex] > 0.0 and usable
        then weight[sampleIndex]/max(sample,1e-12) else 0.0);
    end for;
  end for;
  threshold := if configuration then 0.03+0.025*minimumDepth+3.0*minimumDepth^2*disparityNoise/(noiseReferenceFx*baseline) else 0.0;
  valid := valid and maximumDepth-minimumDepth <= threshold and inverseDepth > 0.0;
  axialDepth := if valid then 1.0/max(inverseDepth,1e-12) else 0.0;
  point := zeros(3);
  point[1] := if valid then (pixel[1]-rgbCalibration[3])*axialDepth/rgbCalibration[1] else 0.0;
  point[2] := if valid then (pixel[2]-rgbCalibration[4])*axialDepth/rgbCalibration[2] else 0.0;
  point[3] := axialDepth;
end RGBDCalibratedPoint;

// Reserve feature slots for pixels with valid calibrated depth.
function RGBDDepthQualifiedScores
  input Real depth[:,:];
  input Real scores[size(depth,1)*size(depth,2)];
  input Real rgbCalibration[4];
  input Real depthCalibration[4];
  input Real nearDepth;
  input Real farDepth;
  input Real disparityNoise;
  input Real noiseReferenceFx;
  input Real baseline;
  input Boolean enabled = true;
  output Real qualified[size(scores,1)];
  input Real depthUnits = 1.0 "Meters per depth sample; 1 for metric depth, SDK scale for Z16";
protected
  Real point[3];
  Boolean valid;
  Integer index;
algorithm
  qualified := zeros(size(scores,1));
  if enabled then
    qualified := scores;
    for row in 1:size(depth,1) loop
      for column in 1:size(depth,2) loop
        index := (row-1)*size(depth,2)+column;
        // Leave invalid scores untouched for the selector to refuse. Zero
        // scores need no depth work; disabled acquisitions read no depth.
        if scores[index] > 0.0 and scores[index] <= 1e8 then
          (point,valid) := RGBDCalibratedPoint(depth,{column-1.0,row-1.0},true,
            rgbCalibration,depthCalibration,nearDepth,farDepth,
            disparityNoise,noiseReferenceFx,baseline,depthUnits=depthUnits);
          if not valid then
            qualified[index] := 0.0;
          end if;
        end if;
      end for;
    end for;
  end if;
end RGBDDepthQualifiedScores;

// Shared patch admission and source-order normalization for gray and RGB inputs.
function RGBDDescriptorConfiguration
  input Integer imageSize[2];
  input Integer depthSize[2];
  input Real activeCount;
  input Integer capacity;
  input Real rgbCalibration[4];
  input Real nearDepth;
  input Real farDepth;
  input Real minimumContrast;
  output Boolean valid;
algorithm
  valid := imageSize[1] == depthSize[1] and imageSize[2] == depthSize[2] and
    activeCount >= 0.0 and activeCount <= capacity and floor(activeCount) == activeCount and
    rgbCalibration[1] >= 1e-6 and rgbCalibration[1] <= 1e6 and rgbCalibration[2] >= 1e-6 and rgbCalibration[2] <= 1e6 and
    abs(rgbCalibration[3]) <= 1e6 and abs(rgbCalibration[4]) <= 1e6 and
    nearDepth > 0.0 and farDepth >= nearDepth and farDepth <= 1e6 and
    minimumContrast > 0.0 and minimumContrast <= 1.0;
end RGBDDescriptorConfiguration;

function RGBDDescriptorPosition
  input Real pixel[2];
  input Integer imageSize[2];
  input Boolean requested;
  output Boolean valid;
  output Integer x;
  output Integer y;
algorithm
  valid := requested and pixel[1] >= 3.0 and pixel[1] <= imageSize[2]-4 and
    pixel[2] >= 3.0 and pixel[2] <= imageSize[1]-4 and
    floor(pixel[1]) == pixel[1] and floor(pixel[2]) == pixel[2];
  x := if valid then integer(pixel[1]) else 3;
  y := if valid then integer(pixel[2]) else 3;
end RGBDDescriptorPosition;

function RGBDNormalizeDescriptor
  input Real samples[patchSize];
  input Boolean eligible;
  input Real contrastThreshold;
  output Real descriptor[patchSize];
  output Boolean valid;
protected
  constant Integer patchWidth = 7;
  constant Integer patchSize = patchWidth*patchWidth;
  Real patch[patchSize];
  Real mean;
  Real energy;
  Real scale;
algorithm
  valid := eligible;
  mean := 0.0;
  energy := 0.0;
  for k in 1:patchSize loop
    patch[k] := if samples[k] >= 0.0 and samples[k] <= 1.0 then samples[k] else 0.0;
    valid := valid and samples[k] >= 0.0 and samples[k] <= 1.0;
    mean := mean+patch[k];
  end for;
  mean := mean/patchSize;
  for k in 1:patchSize loop
    patch[k] := patch[k]-mean;
    energy := energy+patch[k]*patch[k];
  end for;
  valid := valid and energy >= contrastThreshold;
  scale := if valid then sqrt(energy) else 1.0;
  for k in 1:patchSize loop
    descriptor[k] := if valid then patch[k]/scale else 0.0;
  end for;
end RGBDNormalizeDescriptor;

// Editable image-patch frontend. No pose truth or host matching enters here.
function DescribeRGBDFeatures
  input Real gray[:,:] "Measured grayscale intensity in [0,1]";
  input Real depth[:,:] "Measured axial samples; depthUnits converts to meters";
  input Real pixels[:,2] "Zero-based, integer image coordinates";
  input Real activeCount;
  input Real rgbCalibration[4] "RGB fx,fy,cx,cy";
  input Real depthCalibration[4] "Depth fx,fy,cx,cy";
  input Real disparityNoise;
  input Real noiseReferenceFx;
  input Real baseline;
  input Real nearDepth;
  input Real farDepth;
  input Real minimumContrast;
  output Real descriptor[size(pixels,1),49];
  output Real point[size(pixels,1),3] "Camera frame: right, down, forward";
  output Real enabled[size(pixels,1)];
  output Real invalidCount;
  input Real depthUnits = 1.0 "Meters per depth sample; 1 for metric depth, SDK scale for Z16";
protected
  constant Integer patchWidth = 7;
  constant Integer patchSize = patchWidth*patchWidth;
  Real optical[3];
  Boolean depthValid;
  Real patch[patchSize];
  Real contrastThreshold;
  Integer x;
  Integer y;
  Integer patchIndex;
  Boolean configuration;
  Boolean positionValid;
  Boolean valid;
algorithm
  optical := zeros(3);
  depthValid := false;
  positionValid := false;
  valid := false;
  x := 3;
  y := 3;
  patchIndex := 1;
  patch := zeros(patchSize);
  descriptor := zeros(size(pixels,1),patchSize);
  point := zeros(size(pixels,1),3);
  enabled := zeros(size(pixels,1));
  invalidCount := 0.0;
  configuration := RGBDDescriptorConfiguration({size(gray,1),size(gray,2)},{size(depth,1),size(depth,2)},
    activeCount,size(pixels,1),rgbCalibration,nearDepth,farDepth,minimumContrast);
  contrastThreshold := if configuration then patchSize*minimumContrast*minimumContrast else 0.0;
  for i in 1:size(pixels,1) loop
    (positionValid,x,y) := RGBDDescriptorPosition(pixels[i,:],{size(gray,1),size(gray,2)},configuration and i <= activeCount);
    (optical,depthValid) := RGBDCalibratedPoint(depth,pixels[i,:],positionValid,
      rgbCalibration,depthCalibration,nearDepth,farDepth,
      disparityNoise,noiseReferenceFx,baseline,depthUnits=depthUnits);
    for row in 0:patchWidth-1 loop
      for column in 0:patchWidth-1 loop
        patchIndex := row*patchWidth+column+1;
        patch[patchIndex] := if positionValid then gray[y+row-2,x+column-2] else 0.0;
      end for;
    end for;
    (descriptor[i,:],valid) := RGBDNormalizeDescriptor(patch,positionValid and depthValid,contrastThreshold);
    point[i,1] := if valid then optical[1] else 0.0;
    point[i,2] := if valid then optical[2] else 0.0;
    point[i,3] := if valid then optical[3] else 0.0;
    enabled[i] := if valid then 1.0 else 0.0;
    invalidCount := invalidCount+(if i <= activeCount and not valid then 1.0 else 0.0);
  end for;
end DescribeRGBDFeatures;

function RGBDDescriptorValid
  input Real descriptor[:];
  input Real point[3];
  input Boolean enabled;
  output Boolean valid;
protected
  Real energy;
algorithm
  valid := enabled;
  energy := 0.0;
  for k in 1:size(descriptor,1) loop
    valid := valid and abs(descriptor[k]) <= 1.0;
    energy := energy+(if enabled and abs(descriptor[k]) <= 1.0 then descriptor[k]*descriptor[k] else 0.0);
  end for;
  for k in 1:3 loop
    valid := valid and abs(point[k]) <= 1e6;
  end for;
  valid := valid and abs(energy-1.0) <= 1e-8;
end RGBDDescriptorValid;

function RGBDDescriptorDistance
  input Real first[:];
  input Real second[size(first,1)];
  output Real distance;
protected
  Real delta;
algorithm
  distance := 0.0;
  for k in 1:size(first,1) loop
    delta := first[k]-second[k];
    distance := distance+delta*delta;
  end for;
end RGBDDescriptorDistance;

function RGBDPredictedPoint
  input Real point[3];
  input Real rotation[3,3];
  input Real translation[3];
  input Boolean enabled;
  output Real predicted[3];
algorithm
  predicted := zeros(3);
  for a in 1:3 loop
    predicted[a] := if enabled then translation[a] else 0.0;
    for b in 1:3 loop
      predicted[a] := predicted[a]+(if enabled then rotation[a,b]*point[b] else 0.0);
    end for;
  end for;
end RGBDPredictedPoint;

function RGBDGeometricDistance
  input Real first[3];
  input Real second[3];
  output Real distance;
protected
  Real delta;
algorithm
  distance := 0.0;
  for k in 1:3 loop
    delta := first[k]-second[k];
    distance := distance+delta*delta;
  end for;
end RGBDGeometricDistance;

function MatchRGBDDescriptors
  input Real referenceDescriptor[:,49];
  input Real currentDescriptor[:,49];
  input Real referencePoint[:,3];
  input Real currentPoint[:,3];
  input Real referenceEnabled[:];
  input Real currentEnabled[:];
  input Real referenceCount;
  input Real currentCount;
  input Real ratio;
  input Real maximumDescriptorDistance;
  input Real usePrediction;
  input Real predictedRotation[3,3];
  input Real predictedTranslation[3];
  input Real maximumGeometricDistance;
  output Real currentIndex[size(referenceEnabled,1)] "One-based partner; zero means rejected";
  output Real pairEnabled[size(referenceEnabled,1)];
  output Real sourcePoint[size(referenceEnabled,1),3];
  output Real targetPoint[size(referenceEnabled,1),3];
  output Real count;
  output Real configurationValid;
  output Real invalidReference;
  output Real invalidCurrent;
  output Real nearestDistance[size(referenceEnabled,1)];
  output Real secondDistance[size(referenceEnabled,1)];
protected
  Boolean referenceValid[size(referenceEnabled,1)];
  Boolean currentValid[size(currentEnabled,1)];
  Integer activeReference[size(referenceEnabled,1)];
  Integer activeCurrent[size(currentEnabled,1)];
  Integer referenceSize;
  Integer currentSize;
  Integer i;
  Integer j;
  Integer descriptorSample;
  Integer nearest[size(referenceEnabled,1)];
  Integer reciprocal[size(currentEnabled,1)];
  Real reciprocalDistance[size(currentEnabled,1)];
  Real predicted[3];
  Real energy;
  Real distance;
  Real geometric;
  Real rotationCheck;
  Real determinant;
  Real geometricLimitSquared;
  Real distanceLimit;
  Real delta;
  Boolean configuration;
  Boolean predictionValid;
  Boolean eligible;
  Boolean accepted;
algorithm
  currentIndex := zeros(size(referenceEnabled,1));
  pairEnabled := zeros(size(referenceEnabled,1));
  sourcePoint := zeros(size(referenceEnabled,1),3);
  targetPoint := zeros(size(referenceEnabled,1),3);
  nearestDistance := fill(1e30,size(referenceEnabled,1));
  secondDistance := fill(1e30,size(referenceEnabled,1));
  reciprocalDistance := fill(1e30,size(currentEnabled,1));
  nearest := fill(0,size(referenceEnabled,1));
  reciprocal := fill(0,size(currentEnabled,1));
  referenceValid := fill(false,size(referenceEnabled,1));
  currentValid := fill(false,size(currentEnabled,1));
  activeReference := fill(0,size(referenceEnabled,1));
  activeCurrent := fill(0,size(currentEnabled,1));
  referenceSize := 0;
  currentSize := 0;
  count := 0.0;
  invalidReference := 0.0;
  invalidCurrent := 0.0;
  configuration := size(referenceDescriptor,1) == size(referenceEnabled,1) and size(currentDescriptor,1) == size(currentEnabled,1) and
    size(referencePoint,1) == size(referenceEnabled,1) and size(currentPoint,1) == size(currentEnabled,1) and
    referenceCount >= 0.0 and referenceCount <= size(referenceEnabled,1) and floor(referenceCount) == referenceCount and
    currentCount >= 0.0 and currentCount <= size(currentEnabled,1) and floor(currentCount) == currentCount and
    ratio > 0.0 and ratio < 1.0 and maximumDescriptorDistance >= 0.0 and maximumDescriptorDistance <= 2.0 and
    (usePrediction == 0.0 or usePrediction == 1.0) and maximumGeometricDistance >= 0.0 and maximumGeometricDistance <= 1e6;
  rotationCheck := 0.0;
  predictionValid := true;
  for a in 1:3 loop
    predictionValid := predictionValid and abs(predictedTranslation[a]) <= 1e6;
    for b in 1:3 loop
      predictionValid := predictionValid and abs(predictedRotation[a,b]) <= 1.0;
      energy := 0.0;
      for k in 1:3 loop
        energy := energy+(if usePrediction == 1.0
          and abs(predictedRotation[k,a]) <= 1.0 and abs(predictedRotation[k,b]) <= 1.0
          then predictedRotation[k,a]*predictedRotation[k,b] else 0.0);
      end for;
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
  for slot in 1:size(referenceEnabled,1) loop
    referenceValid[slot] := RGBDDescriptorValid(referenceDescriptor[slot,:],referencePoint[slot,:],
      configuration and slot <= referenceCount and referenceEnabled[slot] == 1.0);
    invalidReference := invalidReference+(if slot <= referenceCount and referenceEnabled[slot] <> 0.0 and not referenceValid[slot] then 1.0 else 0.0);
    if referenceValid[slot] then
      referenceSize := referenceSize+1;
      activeReference[referenceSize] := slot;
    end if;
  end for;
  for slot in 1:size(currentEnabled,1) loop
    currentValid[slot] := RGBDDescriptorValid(currentDescriptor[slot,:],currentPoint[slot,:],configuration and slot <= currentCount and currentEnabled[slot] == 1.0);
    invalidCurrent := invalidCurrent+(if slot <= currentCount and currentEnabled[slot] <> 0.0 and not currentValid[slot] then 1.0 else 0.0);
    if currentValid[slot] then
      currentSize := currentSize+1;
      activeCurrent[currentSize] := slot;
    end if;
  end for;
  // Visit valid slots in ascending order to preserve lowest-index ties.
  for referenceSlot in 1:referenceSize loop
    i := activeReference[referenceSlot];
    predicted := RGBDPredictedPoint(referencePoint[i,:],predictedRotation,predictedTranslation,usePrediction == 1.0);
    for currentSlot in 1:currentSize loop
      j := activeCurrent[currentSlot];
      eligible := true;
      geometric := if eligible and usePrediction == 1.0 then RGBDGeometricDistance(predicted,currentPoint[j,:]) else 0.0;
      eligible := eligible and (usePrediction == 0.0 or geometric <= geometricLimitSquared);
      distance := 1e30;
      if eligible then
        // Stop once neither nearest-neighbor search can improve.
        distanceLimit := max(secondDistance[i],reciprocalDistance[j]);
        distance := 0.0;
        descriptorSample := 1;
        while descriptorSample <= size(referenceDescriptor,2) and distance < distanceLimit loop
          delta := referenceDescriptor[i,descriptorSample]-currentDescriptor[j,descriptorSample];
          distance := distance+delta*delta;
          descriptorSample := descriptorSample+1;
        end while;
      end if;
      if distance < nearestDistance[i] then
        secondDistance[i] := nearestDistance[i];
        nearestDistance[i] := distance;
        nearest[i] := j;
      elseif distance < secondDistance[i] then
        secondDistance[i] := distance;
      end if;
      if distance < reciprocalDistance[j] then
        reciprocalDistance[j] := distance;
        reciprocal[j] := i;
      end if;
    end for;
  end for;
  for i in 1:size(referenceEnabled,1) loop
    accepted := if nearest[i] > 0 and secondDistance[i] < 1e30 then
      nearestDistance[i] <= maximumDescriptorDistance*maximumDescriptorDistance and
      nearestDistance[i] < ratio*ratio*secondDistance[i] and reciprocal[nearest[i]] == i else false;
    currentIndex[i] := if accepted then nearest[i] else 0.0;
    pairEnabled[i] := if accepted then 1.0 else 0.0;
    count := count+(if accepted then 1.0 else 0.0);
    for k in 1:3 loop
      sourcePoint[i,k] := if accepted then referencePoint[i,k] else 0.0;
      targetPoint[i,k] := if accepted then currentPoint[nearest[i],k] else 0.0;
    end for;
  end for;
end MatchRGBDDescriptors;

model RGBDFeatureMatching
  constant Integer featureCapacity = 350;
  constant Integer descriptorWidth = 7;
  constant Integer descriptorSize = descriptorWidth*descriptorWidth;
  parameter Real ratio = 0.8;
  parameter Real maximumDescriptorDistance = 0.8;
  parameter Real maximumGeometricDistance = 0.5;
  input Real referenceDescriptor[featureCapacity,descriptorSize];
  input Real currentDescriptor[featureCapacity,descriptorSize];
  input Real referencePoint[featureCapacity,3];
  input Real currentPoint[featureCapacity,3];
  input Real referenceEnabled[featureCapacity];
  input Real currentEnabled[featureCapacity];
  input Real referenceCount;
  input Real currentCount;
  input Real usePrediction = 0.0;
  input Real predictedRotation[3,3] = identity(3);
  input Real predictedTranslation[3] = zeros(3);
  output Real currentIndex[featureCapacity];
  output Real pairEnabled[featureCapacity];
  output Real sourcePoint[featureCapacity,3];
  output Real targetPoint[featureCapacity,3];
  output Real count;
  output Real configurationValid;
  output Real invalidReference;
  output Real invalidCurrent;
  output Real nearestDistance[featureCapacity];
  output Real secondDistance[featureCapacity];
equation
  (currentIndex,pairEnabled,sourcePoint,targetPoint,count,configurationValid,invalidReference,invalidCurrent,nearestDistance,secondDistance) =
    MatchRGBDDescriptors(referenceDescriptor,currentDescriptor,referencePoint,currentPoint,referenceEnabled,currentEnabled,
      referenceCount,currentCount,ratio,maximumDescriptorDistance,usePrediction,predictedRotation,predictedTranslation,maximumGeometricDistance);
end RGBDFeatureMatching;

// Held-IMU intervals return empty descriptors without reading either image.
function DescribeRGBDFrame
  input Real rgb[:,:,:];
  input Real depth[size(rgb,1),size(rgb,2)];
  input Real pixels[:,2];
  input Real activeCount;
  input Real rgbCalibration[4];
  input Real depthCalibration[4];
  input Real disparityNoise;
  input Real noiseReferenceFx;
  input Real baseline;
  input Real nearDepth;
  input Real farDepth;
  input Real minimumContrast;
  input Boolean imageEnabled = true;
  output Real descriptor[size(pixels,1),49];
  output Real point[size(pixels,1),3];
  output Real enabled[size(pixels,1)];
  output Real invalidCount;
  input Real depthUnits = 1.0 "Meters per depth sample; 1 for metric depth, SDK scale for Z16";
protected
  constant Integer colorChannelCount = 3;
  constant Integer descriptorWidth = 7;
  constant Integer descriptorSize = descriptorWidth*descriptorWidth;
  Real patch[descriptorSize];
  Real color[colorChannelCount];
  Real optical[3];
  Real contrastThreshold;
  Integer x;
  Integer y;
  Integer patchIndex;
  Boolean configuration;
  Boolean positionValid;
  Boolean depthValid;
  Boolean valid;
algorithm
  descriptor := zeros(size(pixels,1),descriptorSize);
  point := zeros(size(pixels,1),3);
  enabled := zeros(size(pixels,1));
  invalidCount := 0.0;
  if imageEnabled then
    assert(size(rgb,3) == 3 or size(rgb,3) == 4,"Descriptors expect RGB or RGBA channels");
    configuration := RGBDDescriptorConfiguration({size(rgb,1),size(rgb,2)},{size(depth,1),size(depth,2)},
      activeCount,size(pixels,1),rgbCalibration,nearDepth,farDepth,minimumContrast);
    contrastThreshold := if configuration then descriptorSize*minimumContrast*minimumContrast else 0.0;
    for i in 1:size(pixels,1) loop
      (positionValid,x,y) := RGBDDescriptorPosition(pixels[i,:],{size(rgb,1),size(rgb,2)},configuration and i <= activeCount);
      (optical,depthValid) := RGBDCalibratedPoint(depth,pixels[i,:],positionValid,rgbCalibration,
        depthCalibration,nearDepth,farDepth,disparityNoise,noiseReferenceFx,baseline,depthUnits=depthUnits);
      patch := zeros(descriptorSize);
      // Convert selected patches only; ignore alpha and the rest of the image.
      if positionValid then
        for row in 0:descriptorWidth-1 loop
          for column in 0:descriptorWidth-1 loop
            patchIndex := row*descriptorWidth+column+1;
            color := rgb[y+row-2,x+column-2,1:colorChannelCount];
            patch[patchIndex] := if color[1] >= 0.0 and color[1] <= 255.0
              and color[2] >= 0.0 and color[2] <= 255.0 and color[3] >= 0.0 and color[3] <= 255.0
              then (color[1]+color[2]+color[3])/(colorChannelCount*255.0) else -1.0;
          end for;
        end for;
      end if;
      (descriptor[i,:],valid) := RGBDNormalizeDescriptor(patch,positionValid and depthValid,contrastThreshold);
      point[i,:] := if valid then optical else zeros(3);
      enabled[i] := if valid then 1.0 else 0.0;
      invalidCount := invalidCount+(if i <= activeCount and not valid then 1.0 else 0.0);
    end for;
  end if;
end DescribeRGBDFrame;

model RGBDDescriptorFrame
  parameter Integer imageHeight(min=1) = 90;
  parameter Integer imageWidth(min=1) = 160;
  constant Integer featureCapacity = 350;
  constant Integer descriptorWidth = 7;
  constant Integer descriptorSize = descriptorWidth*descriptorWidth;
  parameter Real minimumContrast = 1e-6;
  parameter Real nearDepth = 0.28;
  parameter Real farDepth = 10.0;
  parameter Integer channelCount(min=3,max=4) = 4;
  constant Integer colorChannelCount = 3;
  input Boolean imageEnabled = true "Exactly the camera acquisition, not a held-IMU interval";
  input Real rgb[imageHeight,imageWidth,channelCount];
  input Real depth[imageHeight,imageWidth];
  input Real depthUnits = 1.0 "Meters per depth sample";
  input Real pixels[featureCapacity,2];
  input Real activeCount;
  input Real rgbCalibration[4] = {imageWidth/(2*tan(69*3.141592653589793/360)),imageHeight/(2*tan(42*3.141592653589793/360)),(imageWidth-1)/2.0,(imageHeight-1)/2.0};
  input Real depthCalibration[4] = {imageWidth/(2*tan(87*3.141592653589793/360)),imageHeight/(2*tan(58*3.141592653589793/360)),(imageWidth-1)/2.0,(imageHeight-1)/2.0};
  constant Integer noiseReferenceWidth = 848;
  input Real disparityNoise = 0.1;
  input Real noiseReferenceFx = noiseReferenceWidth/(2*tan(87*3.141592653589793/360));
  input Real baseline = 0.05;
  output Real descriptor[featureCapacity,descriptorSize];
  output Real point[featureCapacity,3];
  output Real enabled[featureCapacity];
  output Real invalidCount;
equation
  (descriptor,point,enabled,invalidCount) = DescribeRGBDFrame(rgb,depth,pixels,activeCount,
    rgbCalibration,depthCalibration,disparityNoise,noiseReferenceFx,baseline,
    nearDepth,farDepth,minimumContrast,imageEnabled,depthUnits=depthUnits);
end RGBDDescriptorFrame;
