// Ordered FAST-9 patch score. Strict comparisons select the second operand on ties.
function FastPatchScore
  input Real gray[7,7];
  output Real score;
protected
  constant Integer circleSize = 16;
  constant Integer kernelCenter = 4;
  // Row/column offsets, clockwise from the top of the radius-three circle.
  constant Integer circleOffsets[circleSize,2] = [
    -3,0; -3,1; -2,2; -1,3; 0,3; 1,3; 2,2; 3,1;
    3,0; 3,-1; 2,-2; 1,-3; 0,-3; -1,-3; -2,-2; -3,-1];
  Real differences[16];
  Real extended[24];
  Real low2[22]; Real high2[22];
  Real low4[20]; Real high4[20];
  Real low8[16]; Real high8[16];
  Real bright[16]; Real dark[16];
  Real arcs[16]; Real responses[17];
algorithm
  for i in 1:size(circleOffsets,1) loop
    differences[i] := gray[kernelCenter+circleOffsets[i,1],kernelCenter+circleOffsets[i,2]]-gray[kernelCenter,kernelCenter];
  end for;
  // Shared ordered windows:2,4,8 then9 circle samples. Static loop bounds
  // avoid modulo-binder lowering and keep the same bright/dark FAST-9 math.
  for i in 1:16 loop
    extended[i] := differences[i];
  end for;
  for i in 1:8 loop
    extended[i+16] := differences[i];
  end for;
  for i in 1:22 loop
    low2[i] := if noEvent(extended[i] < extended[i+1]) then extended[i] else extended[i+1];
    high2[i] := if noEvent(extended[i] > extended[i+1]) then extended[i] else extended[i+1];
  end for;
  for i in 1:20 loop
    low4[i] := if noEvent(low2[i] < low2[i+2]) then low2[i] else low2[i+2];
    high4[i] := if noEvent(high2[i] > high2[i+2]) then high2[i] else high2[i+2];
  end for;
  for i in 1:16 loop
    low8[i] := if noEvent(low4[i] < low4[i+4]) then low4[i] else low4[i+4];
    high8[i] := if noEvent(high4[i] > high4[i+4]) then high4[i] else high4[i+4];
    bright[i] := if noEvent(low8[i] < extended[i+8]) then low8[i] else extended[i+8];
    dark[i] := -(if noEvent(high8[i] > extended[i+8]) then high8[i] else extended[i+8]);
  end for;
  // NumPy maximum retains its second operand on ties, including signed zero.
  // Ordered comparisons keep that exact score behavior across all16 arcs.
  responses[1] := 0.0;
  for arc in 1:16 loop
    arcs[arc] := if noEvent(bright[arc] > dark[arc]) then bright[arc] else dark[arc];
    responses[arc+1] := if noEvent(responses[arc] > arcs[arc]) then responses[arc] else arcs[arc];
  end for;
  score := responses[17];
end FastPatchScore;

// Array-level acquisition guard: no grayscale or patch work on held-IMU calls.
function FastFrameScores
  input Real rgb[:,:,:];
  input Boolean enabled = true;
  output Real scores[size(rgb,1)*size(rgb,2)];
protected
  constant Integer radius = 3;
  Real gray[size(rgb,1),size(rgb,2)];
algorithm
  scores := zeros(size(rgb,1)*size(rgb,2));
  if enabled then
    assert(size(rgb,3) == 3 or size(rgb,3) == 4,"FAST expects RGB or RGBA channels");
    for row in 1:size(rgb,1) loop
      for column in 1:size(rgb,2) loop
        gray[row,column] := ((rgb[row,column,1]+rgb[row,column,2])+rgb[row,column,3])/3.0;
      end for;
    end for;
    for row in radius+1:size(rgb,1)-radius loop
      for column in radius+1:size(rgb,2)-radius loop
        scores[(row-1)*size(rgb,2)+column] := FastPatchScore(gray[row-radius:row+radius,column-radius:column+radius]);
      end for;
    end for;
  end if;
end FastFrameScores;

// Full-frame candidate: production FastRasterStages and presets remain separate.
// RGB/RGBA and scores are row-major; channels are contiguous in the native ABI.
// Optional historical alpha is never read by grayscale or FAST scoring.
model FastNativeFrame
  parameter Integer height = 90;
  parameter Integer width = 160;
  constant Integer radius = 3;
  parameter Integer channels(min=3,max=4) = 4;
  parameter Real absolute_threshold = 18;
  parameter Real relative_threshold = 0;
  parameter Real rank_scale = 1e8;
  parameter Real suppression_radius = 3;
  parameter Real feature_cap = 240;
  input Boolean enabled = true "False on held-IMU intervals without a camera acquisition";
  input Real rgb[height,width,channels] = fill(0.0,height,width,channels);
  output Real scores[height*width];
  output Real selection[8];
equation
  scores = FastFrameScores(rgb,enabled);
  selection = {absolute_threshold,relative_threshold,rank_scale,suppression_radius,feature_cap,1,3,3};
end FastNativeFrame;

// Full raster selection mathematics, including ranking and suppression. The
// host only transfers arrays, preserves source provenance and rejects valid=0.
// No algorithm is generated or executed by host selection code.
function SelectRasterFeatures
  input Real scores[:];
  input Integer width;
  input Integer height;
  input Integer capacity;
  input Integer minimumBorder;
  input Real settings[8]; // absolute,relative,rankScale,radius,cap,spacing,border,start
  input Boolean grid;
  input Boolean enabled = true "False between camera acquisitions";
  output Real features[capacity,3];
  output Real count;
  output Real valid;
protected
  Integer candidateIndex[size(scores,1)];
  Real candidateRank[size(scores,1)];
  Boolean occupied[size(scores,1)];
  Integer candidateCount;
  Integer radius; Integer cap; Integer spacing; Integer border; Integer start;
  Integer x; Integer y; Integer index; Integer position;
  Integer root; Integer child; Integer heapSize; Integer temporaryIndex;
  Real temporaryRank; Real scaled; Real low; Real fraction; Real rank;
  Real maximum; Real threshold; Real guard;
  Boolean active; Boolean descending;
algorithm
  features := zeros(capacity,3);
  count := 0.0;
  valid := if width > 0 and height > 0 and size(scores,1) == width*height and capacity > 0 and
    settings[1] >= 0.0 and settings[1] <= 255.0 and
    settings[2] >= 0.0 and settings[2] <= 1.0 and
    settings[3] >= 1.0 and settings[3] <= 1e12 and
    settings[4] >= 0.0 and settings[4] <= 16.0 and floor(settings[4]) == settings[4] and
    settings[5] >= 1.0 and settings[5] <= width*height and settings[5] <= capacity and floor(settings[5]) == settings[5] and
    settings[6] >= 1.0 and settings[6] <= width and floor(settings[6]) == settings[6] and
    settings[7] >= minimumBorder and settings[7] <= floor((height-1)/2.0) and floor(settings[7]) == settings[7] and
    settings[8] >= settings[7] and settings[8] < height-settings[7] and floor(settings[8]) == settings[8] and
    (not grid or (settings[1] == 0.0 and settings[2] == 0.0 and settings[3] == 1.0 and settings[4] == 0.0))
    then 1.0 else 0.0;
  // Protected conversion is needed even for rejected nonfinite settings.
  radius := if valid > 0.0 then integer(settings[4]) else 0;
  cap := if valid > 0.0 then integer(settings[5]) else 1;
  spacing := if valid > 0.0 then integer(settings[6]) else 1;
  border := if valid > 0.0 then integer(settings[7]) else 0;
  start := if valid > 0.0 then integer(settings[8]) else 0;
  candidateCount := 0;
  maximum := 0.0;
  threshold := 0.0;
  guard := 0.0;
  if valid > 0.0 and enabled then
    candidateIndex := fill(0,size(scores,1));
    candidateRank := zeros(size(scores,1));
    occupied := fill(false,size(scores,1));
    if grid then
      // Original grid traversal validates only visited scores, stopping at cap.
      y := start;
      while y < height-border and count < cap loop
        x := start;
        while x < width-border and count < cap loop
          index := y*width+x+1;
          if abs(scores[index]) <= 1.7976931348623157e308 then
            count := count+1.0;
            features[integer(count),1] := x;
            features[integer(count),2] := y;
            features[integer(count),3] := scores[index];
          else
            valid := 0.0;
          end if;
          x := x+spacing;
        end while;
        y := y+spacing;
      end while;
    else
      // Include the entire image in maximum/domain validation, even outside the
      // candidate border. The safe-integer rank domain is not silently widened.
      for i in 1:size(scores,1) loop
        if abs(scores[i]*settings[3]) <= 9007199254740991.0 then
          maximum := max(maximum,scores[i]);
        else
          valid := 0.0;
        end if;
      end for;
      threshold := max(settings[1],maximum*settings[2]);
      guard := floor(threshold*settings[3])-1.0;
      if valid > 0.0 then
        y := start;
        while y < height-border loop
          x := start;
          while x < width-border loop
            index := y*width+x+1;
            scaled := scores[index]*settings[3];
            low := floor(scaled);
            fraction := scaled-low;
            rank := if fraction < 0.5 then low else if fraction > 0.5 then low+1.0
              else if low-floor(low/2.0)*2.0 == 0.0 then low else low+1.0;
            if rank >= guard then
              candidateCount := candidateCount+1;
              candidateIndex[candidateCount] := index;
              candidateRank[candidateCount] := rank;
            end if;
            x := x+spacing;
          end while;
          y := y+spacing;
        end while;
        // In-place heap sort, O(N log N). Key is ascending rank, descending
        // raster index; reverse traversal gives exact descending-rank stable
        // raster ties without a quadratic full-frame comparison expansion.
        heapSize := candidateCount;
        for build in 1:candidateCount loop
          root := candidateCount-build+1;
          descending := true;
          while root <= div(heapSize,2) and descending loop
            child := 2*root;
            if child < heapSize then
              if candidateRank[child+1] > candidateRank[child] or
                (candidateRank[child+1] == candidateRank[child] and candidateIndex[child+1] < candidateIndex[child]) then
                child := child+1;
              end if;
            end if;
            if candidateRank[child] > candidateRank[root] or
              (candidateRank[child] == candidateRank[root] and candidateIndex[child] < candidateIndex[root]) then
              temporaryRank := candidateRank[root]; temporaryIndex := candidateIndex[root];
              candidateRank[root] := candidateRank[child]; candidateIndex[root] := candidateIndex[child];
              candidateRank[child] := temporaryRank; candidateIndex[child] := temporaryIndex;
              root := child;
            else
              descending := false;
            end if;
          end while;
        end for;
        for remove in 1:candidateCount loop
          heapSize := candidateCount-remove+1;
          temporaryRank := candidateRank[heapSize]; temporaryIndex := candidateIndex[heapSize];
          candidateRank[heapSize] := candidateRank[1]; candidateIndex[heapSize] := candidateIndex[1];
          candidateRank[1] := temporaryRank; candidateIndex[1] := temporaryIndex;
          heapSize := heapSize-1;
          root := 1;
          descending := true;
          while root <= div(heapSize,2) and descending loop
            child := 2*root;
            if child < heapSize then
              if candidateRank[child+1] > candidateRank[child] or
                (candidateRank[child+1] == candidateRank[child] and candidateIndex[child+1] < candidateIndex[child]) then
                child := child+1;
              end if;
            end if;
            if candidateRank[child] > candidateRank[root] or
              (candidateRank[child] == candidateRank[root] and candidateIndex[child] < candidateIndex[root]) then
              temporaryRank := candidateRank[root]; temporaryIndex := candidateIndex[root];
              candidateRank[root] := candidateRank[child]; candidateIndex[root] := candidateIndex[child];
              candidateRank[child] := temporaryRank; candidateIndex[child] := temporaryIndex;
              root := child;
            else
              descending := false;
            end if;
          end while;
        end for;
        active := true;
        for candidate in 1:candidateCount loop
          position := candidateCount-candidate+1;
          index := candidateIndex[position];
          // Preserve the original early stop on raw score, before occupancy.
          if scores[index] < threshold then
            active := false;
          end if;
          if active and count < cap and not occupied[index] then
            x := mod(index-1,width); y := div(index-1,width);
            count := count+1.0;
            features[integer(count),1] := x;
            features[integer(count),2] := y;
            features[integer(count),3] := scores[index];
            for yy in max(border,y-radius):min(height-border-1,y+radius) loop
              for xx in max(border,x-radius):min(width-border-1,x+radius) loop
                occupied[yy*width+xx+1] := true;
              end for;
            end for;
          end if;
        end for;
      end if;
    end if;
  end if;
  if valid <= 0.0 then
    features := zeros(capacity,3);
    count := 0.0;
  end if;
end SelectRasterFeatures;

model FeatureSelection
  parameter Integer width = 160;
  parameter Integer height = 90;
  // Existing editable cap accepts any1..14400; retain storage for that domain.
  parameter Integer capacity = 14400;
  parameter Integer minimumBorder = 0;
  parameter Boolean grid = false;
  input Boolean enabled = true;
  input Real scores[width*height] = zeros(width*height);
  input Real settings[8] = {1e-9,0.01,1e12,3.0,240.0,1.0,0.0,0.0};
  output Real features[capacity,3];
  output Real count;
  output Real valid;
equation
  (features,count,valid) = SelectRasterFeatures(scores,width,height,capacity,minimumBorder,settings,grid,enabled);
end FeatureSelection;

model GridFeatureSelection
  extends FeatureSelection(capacity=14400,grid=true,settings={0.0,0.0,1.0,0.0,14400.0,6.0,5.0,5.0});
end GridFeatureSelection;

model FastFeatureSelection
  extends FeatureSelection(minimumBorder=3,settings={18.0,0.0,1e8,3.0,240.0,1.0,3.0,3.0});
end FastFeatureSelection;

// Nominal pinhole intrinsics for a chosen image grid and horizontal/vertical
// fields of view. Real hardware supplies its measured calibration instead.
function RGBDNominalCalibration
  input Integer imageSize[2] "Height, width";
  input Real fieldOfViewDegrees[2] "Horizontal, vertical";
  output Real calibration[4] "fx, fy, cx, cy";
algorithm
  calibration := {imageSize[2]/(2.0*tan(fieldOfViewDegrees[1]*3.141592653589793/360.0)),
    imageSize[1]/(2.0*tan(fieldOfViewDegrees[2]*3.141592653589793/360.0)),
    (imageSize[2]-1)/2.0,(imageSize[1]-1)/2.0};
end RGBDNominalCalibration;

// Separate optical intrinsics. Only positive-weight depth samples participate;
// zero-weight neighbours (including invalid data) cannot poison interpolation.
function RGBDCalibratedPoint
  input Real depth[:,:]; input Real pixel[2]; input Boolean enabled;
  input Real rgbCalibration[4]; input Real depthCalibration[4];
  input Real nearDepth; input Real farDepth; input Real disparityNoise; input Real noiseReferenceFx; input Real baseline;
  output Real point[3] "Optical RDF: right, down, forward"; output Boolean valid;
  input Real depthUnits = 1.0 "Meters per depth sample; 1 for metric depth, SDK scale for Z16";
protected
  Real mapped[2]; Real bearing[2]; Real nearest; Real low; Real part;
  Integer lower[2]; Integer sampleX; Integer sampleY; Integer sampleIndex;
  Real fraction[2]; Real weight[4]; Real sample; Real inverseDepth;
  Real minimumDepth; Real maximumDepth; Real threshold; Real axialDepth;
  Boolean configuration; Boolean inside; Boolean usable;
algorithm
  nearest := 0.0; low := 0.0; part := 0.0; inside := false;
  sampleX := 0; sampleY := 0; sampleIndex := 1; sample := 0.0; usable := false;
  configuration := enabled and depthUnits > 0.0 and depthUnits <= 1e6 and size(depth,1) > 1 and size(depth,2) > 1 and
    pixel[1] >= 0.0 and pixel[1] < size(depth,2) and pixel[2] >= 0.0 and pixel[2] < size(depth,1) and
    rgbCalibration[1] >= 1e-6 and rgbCalibration[1] <= 1e6 and rgbCalibration[2] >= 1e-6 and rgbCalibration[2] <= 1e6 and
    depthCalibration[1] >= 1e-6 and depthCalibration[1] <= 1e6 and depthCalibration[2] >= 1e-6 and depthCalibration[2] <= 1e6 and
    abs(rgbCalibration[3]) <= 1e6 and abs(rgbCalibration[4]) <= 1e6 and
    abs(depthCalibration[3]) <= 1e6 and abs(depthCalibration[4]) <= 1e6 and
    nearDepth > 0.0 and farDepth > nearDepth+0.05 and farDepth <= 1e6 and
    disparityNoise >= 0.0 and disparityNoise <= 1.0 and noiseReferenceFx >= 1e-6 and noiseReferenceFx <= 1e6 and
    baseline >= 1e-6 and baseline <= 10.0;
  mapped := zeros(2); bearing := zeros(2); lower := fill(0,2); fraction := zeros(2);
  for k in 1:2 loop
    mapped[k] := if configuration then (pixel[k]-rgbCalibration[k+2])*depthCalibration[k]/rgbCalibration[k]+depthCalibration[k+2] else 0.0;
    low := floor(mapped[k]); part := mapped[k]-low;
    nearest := if part < 0.5 then low else if part > 0.5 then low+1.0 else if floor(low/2.0)*2.0 == low then low else low+1.0;
    bearing[k] := if abs(mapped[k]-nearest) <= 1e-9 then nearest else mapped[k];
    inside := configuration and bearing[k] >= 0.0 and bearing[k] <= (if k == 1 then size(depth,2)-1 else size(depth,1)-1);
    lower[k] := if inside then integer(floor(bearing[k])) else 0;
    fraction[k] := if inside then bearing[k]-lower[k] else 0.0;
    configuration := configuration and inside;
  end for;
  weight := {(1.0-fraction[1])*(1.0-fraction[2]),fraction[1]*(1.0-fraction[2]),
    (1.0-fraction[1])*fraction[2],fraction[1]*fraction[2]};
  valid := configuration; inverseDepth := 0.0; minimumDepth := farDepth; maximumDepth := 0.0;
  for row in 0:1 loop
   for column in 0:1 loop
    sampleIndex := 2*row+column+1;
    sampleX := lower[1]+column; sampleY := lower[2]+row;
    sample := if configuration and weight[sampleIndex] > 0.0 and sampleX < size(depth,2) and sampleY < size(depth,1)
      then depth[sampleY+1,sampleX+1]*depthUnits else 0.0;
    usable := weight[sampleIndex] <= 0.0 or (sample > nearDepth and sample < farDepth-0.05);
    valid := valid and usable;
    minimumDepth := if weight[sampleIndex] > 0.0 and usable then min(minimumDepth,sample) else minimumDepth;
    maximumDepth := if weight[sampleIndex] > 0.0 and usable then max(maximumDepth,sample) else maximumDepth;
    inverseDepth := inverseDepth+(if weight[sampleIndex] > 0.0 and usable then weight[sampleIndex]/max(sample,1e-12) else 0.0);
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

// RGB-D ranking must reserve its bounded feature budget for measured geometry.
// Use the same calibrated interpolation and depth-edge checks as description;
// a nearer RGB pixel need not correspond to the same depth-image pixel.
function RGBDDepthQualifiedScores
  input Real depth[:,:];
  input Real scores[size(depth,1)*size(depth,2)];
  input Real rgbCalibration[4]; input Real depthCalibration[4];
  input Real nearDepth; input Real farDepth;
  input Real disparityNoise; input Real noiseReferenceFx; input Real baseline;
  input Boolean enabled = true;
  output Real qualified[size(scores,1)];
  input Real depthUnits = 1.0 "Meters per depth sample; 1 for metric depth, SDK scale for Z16";
protected
  Real point[3]; Boolean valid; Integer index;
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
          if not valid then qualified[index] := 0.0; end if;
        end if;
      end for;
    end for;
  end if;
end RGBDDepthQualifiedScores;

// Editable image-patch frontend. No pose truth or host matching enters here.
function DescribeRGBDFeatures
  input Real gray[:,:] "Measured grayscale intensity in [0,1]";
  input Real depth[:,:] "Measured axial samples; depthUnits converts to meters";
  input Real pixels[:,2] "Zero-based, integer image coordinates";
  input Real activeCount;
  input Real rgbCalibration[4] "RGB fx,fy,cx,cy"; input Real depthCalibration[4] "Depth fx,fy,cx,cy";
  input Real disparityNoise; input Real noiseReferenceFx; input Real baseline;
  input Real nearDepth; input Real farDepth; input Real minimumContrast;
  output Real descriptor[size(pixels,1),49];
  output Real point[size(pixels,1),3] "Camera frame: right, down, forward";
  output Real enabled[size(pixels,1)]; output Real invalidCount;
  input Real depthUnits = 1.0 "Meters per depth sample; 1 for metric depth, SDK scale for Z16";
protected
  constant Integer patchWidth = 7; constant Integer patchSize = patchWidth*patchWidth;
  Real optical[3]; Boolean depthValid;
  Real patch[patchSize]; Real mean; Real energy; Real scale; Real sample; Real contrastThreshold;
  Integer x; Integer y; Integer patchIndex;
  Boolean configuration; Boolean positionValid; Boolean valid;
algorithm
  optical := zeros(3); depthValid := false; positionValid := false; valid := false;
  x := 3; y := 3; patchIndex := 1; sample := 0.0; scale := 1.0;
  patch := zeros(patchSize); mean := 0.0; energy := 0.0;
  descriptor := zeros(size(pixels,1),patchSize); point := zeros(size(pixels,1),3);
  enabled := zeros(size(pixels,1)); invalidCount := 0.0;
  configuration := size(gray,1) == size(depth,1) and size(gray,2) == size(depth,2) and
    activeCount >= 0.0 and activeCount <= size(pixels,1) and floor(activeCount) == activeCount and
    rgbCalibration[1] >= 1e-6 and rgbCalibration[1] <= 1e6 and rgbCalibration[2] >= 1e-6 and rgbCalibration[2] <= 1e6 and
    abs(rgbCalibration[3]) <= 1e6 and abs(rgbCalibration[4]) <= 1e6 and
    nearDepth > 0.0 and farDepth >= nearDepth and farDepth <= 1e6 and
    minimumContrast > 0.0 and minimumContrast <= 1.0;
  contrastThreshold := if configuration then patchSize*minimumContrast*minimumContrast else 0.0;
  for i in 1:size(pixels,1) loop
    patch := zeros(patchSize); mean := 0.0; energy := 0.0;
    positionValid := configuration and i <= activeCount and pixels[i,1] >= 3.0 and pixels[i,1] <= size(gray,2)-4 and
      pixels[i,2] >= 3.0 and pixels[i,2] <= size(gray,1)-4 and
      floor(pixels[i,1]) == pixels[i,1] and floor(pixels[i,2]) == pixels[i,2];
    x := if positionValid then integer(pixels[i,1]) else 3;
    y := if positionValid then integer(pixels[i,2]) else 3;
    (optical,depthValid) := RGBDCalibratedPoint(depth,pixels[i,:],positionValid,rgbCalibration,depthCalibration,nearDepth,farDepth,disparityNoise,noiseReferenceFx,baseline,depthUnits=depthUnits);
    valid := positionValid and depthValid;
    for row in 0:patchWidth-1 loop
     for column in 0:patchWidth-1 loop
      patchIndex := row*patchWidth+column+1;
      sample := if positionValid then gray[y+row-2,x+column-2] else 0.0;
      patch[patchIndex] := if sample >= 0.0 and sample <= 1.0 then sample else 0.0;
      valid := valid and sample >= 0.0 and sample <= 1.0;
      mean := mean+patch[patchIndex];
     end for;
    end for;
    mean := mean/patchSize;
    for k in 1:patchSize loop
      patch[k] := patch[k]-mean; energy := energy+patch[k]*patch[k];
    end for;
    valid := valid and energy >= contrastThreshold;
    scale := if valid then sqrt(energy) else 1.0;
    for k in 1:patchSize loop descriptor[i,k] := if valid then patch[k]/scale else 0.0; end for;
    point[i,1] := if valid then optical[1] else 0.0;
    point[i,2] := if valid then optical[2] else 0.0;
    point[i,3] := if valid then optical[3] else 0.0;
    enabled[i] := if valid then 1.0 else 0.0;
    invalidCount := invalidCount+(if i <= activeCount and not valid then 1.0 else 0.0);
  end for;
end DescribeRGBDFeatures;

function RGBDDescriptorValid
  input Real descriptor[:]; input Real point[3]; input Boolean enabled;
  output Boolean valid;
protected
  Real energy;
algorithm
  valid := enabled; energy := 0.0;
  for k in 1:size(descriptor,1) loop
    valid := valid and abs(descriptor[k]) <= 1.0;
    energy := energy+(if enabled and abs(descriptor[k]) <= 1.0 then descriptor[k]*descriptor[k] else 0.0);
  end for;
  for k in 1:3 loop valid := valid and abs(point[k]) <= 1e6; end for;
  valid := valid and abs(energy-1.0) <= 1e-8;
end RGBDDescriptorValid;

function RGBDDescriptorDistance
  input Real first[:]; input Real second[size(first,1)];
  output Real distance;
protected
  Real delta;
algorithm
  distance := 0.0;
  for k in 1:size(first,1) loop delta := first[k]-second[k]; distance := distance+delta*delta; end for;
end RGBDDescriptorDistance;

function RGBDPredictedPoint
  input Real point[3]; input Real rotation[3,3]; input Real translation[3]; input Boolean enabled;
  output Real predicted[3];
algorithm
  predicted := zeros(3);
  for a in 1:3 loop
    predicted[a] := if enabled then translation[a] else 0.0;
    for b in 1:3 loop predicted[a] := predicted[a]+(if enabled then rotation[a,b]*point[b] else 0.0); end for;
  end for;
end RGBDPredictedPoint;

function RGBDGeometricDistance
  input Real first[3]; input Real second[3];
  output Real distance;
protected
  Real delta;
algorithm
  distance := 0.0;
  for k in 1:3 loop delta := first[k]-second[k]; distance := distance+delta*delta; end for;
end RGBDGeometricDistance;

function MatchRGBDDescriptors
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
  Integer activeReference[size(referenceEnabled,1)]; Integer activeCurrent[size(currentEnabled,1)];
  Integer referenceSize; Integer currentSize; Integer i; Integer j;
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
  activeReference := fill(0,size(referenceEnabled,1)); activeCurrent := fill(0,size(currentEnabled,1));
  referenceSize := 0; currentSize := 0;
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
  for slot in 1:size(referenceEnabled,1) loop
    referenceValid[slot] := RGBDDescriptorValid(referenceDescriptor[slot,:],referencePoint[slot,:],configuration and slot <= referenceCount and referenceEnabled[slot] == 1.0);
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
  // Compact ascending slot lists preserve strict lowest-index tie behavior.
  // Invalid pairs formerly produced only the1e30 sentinel and could never
  // change nearest/second/reciprocal state. Do not traverse those pairs: in
  // particular an IMU-only call has zero current slots, hence zero pair work.
  for referenceSlot in 1:referenceSize loop
    i := activeReference[referenceSlot];
    predicted := RGBDPredictedPoint(referencePoint[i,:],predictedRotation,predictedTranslation,usePrediction == 1.0);
    for currentSlot in 1:currentSize loop
      j := activeCurrent[currentSlot];
      eligible := true;
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
end MatchRGBDDescriptors;

model RGBDFeatureMatching
  constant Integer featureCapacity = 350;
  constant Integer descriptorWidth = 7;
  constant Integer descriptorSize = descriptorWidth*descriptorWidth;
  parameter Real ratio = 0.8;
  parameter Real maximumDescriptorDistance = 0.8;
  parameter Real maximumGeometricDistance = 0.5;
  input Real referenceDescriptor[featureCapacity,descriptorSize]; input Real currentDescriptor[featureCapacity,descriptorSize];
  input Real referencePoint[featureCapacity,3]; input Real currentPoint[featureCapacity,3];
  input Real referenceEnabled[featureCapacity]; input Real currentEnabled[featureCapacity];
  input Real referenceCount; input Real currentCount;
  input Real usePrediction = 0.0;
  input Real predictedRotation[3,3] = identity(3); input Real predictedTranslation[3] = zeros(3);
  output Real currentIndex[featureCapacity]; output Real pairEnabled[featureCapacity];
  output Real sourcePoint[featureCapacity,3]; output Real targetPoint[featureCapacity,3];
  output Real count; output Real configurationValid; output Real invalidReference; output Real invalidCurrent;
  output Real nearestDistance[featureCapacity]; output Real secondDistance[featureCapacity];
equation
  (currentIndex,pairEnabled,sourcePoint,targetPoint,count,configurationValid,invalidReference,invalidCurrent,nearestDistance,secondDistance) =
    MatchRGBDDescriptors(referenceDescriptor,currentDescriptor,referencePoint,currentPoint,referenceEnabled,currentEnabled,
      referenceCount,currentCount,ratio,maximumDescriptorDistance,usePrediction,predictedRotation,predictedTranslation,maximumGeometricDistance);
end RGBDFeatureMatching;

// The image clock owns this entire array operation. On held-IMU intervals,
// return an empty frame without evaluating grayscale, patch or depth math.
function DescribeRGBDFrame
  input Real rgb[:,:,:]; input Real depth[size(rgb,1),size(rgb,2)];
  input Real pixels[:,2]; input Real activeCount;
  input Real rgbCalibration[4]; input Real depthCalibration[4];
  input Real disparityNoise; input Real noiseReferenceFx; input Real baseline;
  input Real nearDepth; input Real farDepth; input Real minimumContrast;
  input Boolean imageEnabled = true;
  output Real descriptor[size(pixels,1),49]; output Real point[size(pixels,1),3];
  output Real enabled[size(pixels,1)]; output Real invalidCount;
  input Real depthUnits = 1.0 "Meters per depth sample; 1 for metric depth, SDK scale for Z16";
protected
  constant Integer colorChannelCount = 3;
  constant Integer descriptorWidth = 7;
  constant Integer descriptorSize = descriptorWidth*descriptorWidth;
  Real gray[size(rgb,1),size(rgb,2)];
algorithm
  if imageEnabled then
    assert(size(rgb,3) == 3 or size(rgb,3) == 4,"Descriptors expect RGB or RGBA channels");
    for y in 1:size(rgb,1) loop
      for x in 1:size(rgb,2) loop
        gray[y,x] := if rgb[y,x,1] >= 0.0 and rgb[y,x,1] <= 255.0 and rgb[y,x,2] >= 0.0 and rgb[y,x,2] <= 255.0 and rgb[y,x,3] >= 0.0 and rgb[y,x,3] <= 255.0
          then (rgb[y,x,1]+rgb[y,x,2]+rgb[y,x,3])/(colorChannelCount*255.0) else -1.0;
      end for;
    end for;
    (descriptor,point,enabled,invalidCount) := DescribeRGBDFeatures(gray,depth,pixels,activeCount,
      rgbCalibration,depthCalibration,disparityNoise,noiseReferenceFx,baseline,nearDepth,farDepth,minimumContrast,depthUnits=depthUnits);
  else
    descriptor := zeros(size(pixels,1),descriptorSize); point := zeros(size(pixels,1),3);
    enabled := zeros(size(pixels,1)); invalidCount := 0.0;
  end if;
end DescribeRGBDFrame;

model RGBDDescriptorFrame
  parameter Integer imageHeight(min=1) = 90; parameter Integer imageWidth(min=1) = 160;
  constant Integer featureCapacity = 350; constant Integer descriptorWidth = 7;
  constant Integer descriptorSize = descriptorWidth*descriptorWidth;
  parameter Real minimumContrast = 1e-6;
  parameter Real nearDepth = 0.28; parameter Real farDepth = 10.0;
  parameter Integer channelCount(min=3,max=4) = 4; constant Integer colorChannelCount = 3;
  input Boolean imageEnabled = true "Exactly the camera acquisition, not a held-IMU interval";
  input Real rgb[imageHeight,imageWidth,channelCount]; input Real depth[imageHeight,imageWidth];
  input Real depthUnits = 1.0 "Meters per depth sample";
  input Real pixels[featureCapacity,2]; input Real activeCount;
  input Real rgbCalibration[4] = {imageWidth/(2*tan(69*3.141592653589793/360)),imageHeight/(2*tan(42*3.141592653589793/360)),(imageWidth-1)/2.0,(imageHeight-1)/2.0};
  input Real depthCalibration[4] = {imageWidth/(2*tan(87*3.141592653589793/360)),imageHeight/(2*tan(58*3.141592653589793/360)),(imageWidth-1)/2.0,(imageHeight-1)/2.0};
  constant Integer noiseReferenceWidth = 848;
  input Real disparityNoise = 0.1; input Real noiseReferenceFx = noiseReferenceWidth/(2*tan(87*3.141592653589793/360)); input Real baseline = 0.05;
  output Real descriptor[featureCapacity,descriptorSize]; output Real point[featureCapacity,3];
  output Real enabled[featureCapacity]; output Real invalidCount;
equation
  (descriptor,point,enabled,invalidCount) = DescribeRGBDFrame(rgb,depth,pixels,activeCount,
    rgbCalibration,depthCalibration,disparityNoise,noiseReferenceFx,baseline,
    nearDepth,farDepth,minimumContrast,imageEnabled,depthUnits=depthUnits);
end RGBDDescriptorFrame;

// Horn absolute orientation for matched 3D point pairs. No pose truth enters
// this component. Correspondence production and temporal pose composition are
// separate frontend/backend responsibilities.
function RegistrationEigen4
  input Real matrix[4,4];
  output Real values[4];
  output Real dominant[4];
  output Real gap;
  output Real offDiagonal;
protected
  Real work[4,4];
  Real vectors[4,4];
  Real scale;
  Real tau; Real tangent; Real cosine; Real sine;
  Real first; Real second; Real entry; Real active;
  Real largest; Real runnerUp;
  Integer index;
algorithm
  scale := 0.0;
  for i in 1:4 loop
    for j in 1:4 loop
      scale := max(scale,abs(matrix[i,j]));
    end for;
  end for;
  work := matrix/(if scale > 0.0 then scale else 1.0);
  vectors := identity(4);
  for sweep in 1:24 loop
    for p in 1:3 loop
      for q in 1:4 loop
        entry := work[p,q];
        active := if q > p and abs(entry) > 1e-14 then 1.0 else 0.0;
        tau := (work[q,q]-work[p,p])/(if active > 0.0 then 2.0*entry else 1.0);
        tangent := if active <= 0.0 then 0.0 else if tau >= 0.0 then
          1.0/(tau+sqrt(1.0+tau*tau)) else -1.0/(-tau+sqrt(1.0+tau*tau));
        cosine := 1.0/sqrt(1.0+tangent*tangent);
        sine := tangent*cosine;
        work[p,p] := work[p,p]-tangent*entry;
        work[q,q] := work[q,q]+tangent*entry;
        work[p,q] := if active > 0.0 then 0.0 else entry;
        work[q,p] := work[p,q];
        for k in 1:4 loop
          first := work[k,p]; second := work[k,q];
          work[k,p] := if k <> p and k <> q then cosine*first-sine*second else first;
          work[p,k] := if k <> p and k <> q then work[k,p] else work[p,k];
          work[k,q] := if k <> p and k <> q then sine*first+cosine*second else second;
          work[q,k] := if k <> p and k <> q then work[k,q] else work[q,k];
          first := vectors[k,p]; second := vectors[k,q];
          vectors[k,p] := cosine*first-sine*second;
          vectors[k,q] := sine*first+cosine*second;
        end for;
      end for;
    end for;
  end for;
  largest := work[1,1]; runnerUp := -1e100; index := 1;
  for i in 2:4 loop
    if work[i,i] > largest then
      runnerUp := largest; largest := work[i,i]; index := i;
    else
      runnerUp := max(runnerUp,work[i,i]);
    end if;
  end for;
  offDiagonal := 0.0;
  for i in 1:4 loop
    values[i] := work[i,i]*scale;
    dominant[i] := vectors[i,index];
    for j in 1:4 loop
      offDiagonal := if i <> j then max(offDiagonal,abs(work[i,j])) else offDiagonal;
    end for;
  end for;
  gap := (largest-runnerUp)*scale;
end RegistrationEigen4;

// Three ordered full-domain passes retain compact runtime loop ownership.
// Disabled or invalid pairs never enter multiplication, even with NaN inputs.
function FitRigidPointPairs
  input Real sourcePoint[:,:];
  input Real targetPoint[:,:];
  input Real pairEnabled[:];
  input Real activeCount;
  input Real coordinateLimit;
  input Real rankTolerance;
  input Real maximumRms;
  output Real accepted;
  output Real rejectionReason;
  output Real rotation[3,3];
  output Real translation[3];
  output Real validCount;
  output Real invalidCount;
  output Real rank;
  output Real cost;
  output Real rms;
  output Real eigenGap;
  output Real sourceCentroid[3];
  output Real targetCentroid[3];
protected
  Boolean mask[size(pairEnabled,1)];
  Boolean domainValid;
  Real crossCovariance[3,3]; Real sourceCovariance[4,4];
  Real horn[4,4]; Real hornValues[4]; Real sourceValues[4];
  Real quaternion[4]; Real unusedVector[4];
  Real unusedGap; Real hornResidual; Real sourceResidual;
  Real sourceScale; Real hornScale;
  Real candidateRotation[3,3]; Real candidateTranslation[3];
  Real error;
algorithm
  domainValid := activeCount >= 0.0 and activeCount <= size(pairEnabled,1) and floor(activeCount) >= activeCount and
    size(pairEnabled,1) >= 3 and size(sourcePoint,1) == size(pairEnabled,1) and size(targetPoint,1) == size(pairEnabled,1) and
    size(sourcePoint,2) == 3 and size(targetPoint,2) == 3 and
    coordinateLimit > 0.0 and coordinateLimit <= 1e6 and rankTolerance >= 1e-12 and rankTolerance <= 1e-2 and
    maximumRms >= 0.0 and maximumRms <= 1e6;
  mask := fill(false,size(pairEnabled,1));
  validCount := 0.0; invalidCount := 0.0;
  sourceCentroid := zeros(3); targetCentroid := zeros(3);
  for i in 1:size(pairEnabled,1) loop
    if domainValid and i <= activeCount then
      if pairEnabled[i] >= 1.0 and pairEnabled[i] <= 1.0 and
        abs(sourcePoint[i,1]) <= coordinateLimit and abs(sourcePoint[i,2]) <= coordinateLimit and abs(sourcePoint[i,3]) <= coordinateLimit and
        abs(targetPoint[i,1]) <= coordinateLimit and abs(targetPoint[i,2]) <= coordinateLimit and abs(targetPoint[i,3]) <= coordinateLimit then
        mask[i] := true;
        validCount := validCount+1.0;
        for a in 1:3 loop
          sourceCentroid[a] := sourceCentroid[a]+sourcePoint[i,a];
          targetCentroid[a] := targetCentroid[a]+targetPoint[i,a];
        end for;
      elseif not (pairEnabled[i] >= 0.0 and pairEnabled[i] <= 0.0) then
        invalidCount := invalidCount+1.0;
      end if;
    end if;
  end for;
  sourceCentroid := sourceCentroid/max(validCount,1.0);
  targetCentroid := targetCentroid/max(validCount,1.0);
  crossCovariance := zeros(3,3); sourceCovariance := zeros(4,4);
  for i in 1:size(pairEnabled,1) loop
    if mask[i] then
      for a in 1:3 loop
        for b in 1:3 loop
          crossCovariance[a,b] := crossCovariance[a,b]+(sourcePoint[i,a]-sourceCentroid[a])*(targetPoint[i,b]-targetCentroid[b]);
          sourceCovariance[a,b] := sourceCovariance[a,b]+(sourcePoint[i,a]-sourceCentroid[a])*(sourcePoint[i,b]-sourceCentroid[b]);
        end for;
      end for;
    end if;
  end for;
  crossCovariance := crossCovariance/max(validCount,1.0);
  sourceCovariance := sourceCovariance/max(validCount,1.0);
  horn := {{crossCovariance[1,1]+crossCovariance[2,2]+crossCovariance[3,3],crossCovariance[2,3]-crossCovariance[3,2],crossCovariance[3,1]-crossCovariance[1,3],crossCovariance[1,2]-crossCovariance[2,1]},
    {crossCovariance[2,3]-crossCovariance[3,2],crossCovariance[1,1]-crossCovariance[2,2]-crossCovariance[3,3],crossCovariance[1,2]+crossCovariance[2,1],crossCovariance[1,3]+crossCovariance[3,1]},
    {crossCovariance[3,1]-crossCovariance[1,3],crossCovariance[1,2]+crossCovariance[2,1],-crossCovariance[1,1]+crossCovariance[2,2]-crossCovariance[3,3],crossCovariance[2,3]+crossCovariance[3,2]},
    {crossCovariance[1,2]-crossCovariance[2,1],crossCovariance[1,3]+crossCovariance[3,1],crossCovariance[2,3]+crossCovariance[3,2],-crossCovariance[1,1]-crossCovariance[2,2]+crossCovariance[3,3]}};
  (hornValues,quaternion,eigenGap,hornResidual) := RegistrationEigen4(horn);
  (sourceValues,unusedVector,unusedGap,sourceResidual) := RegistrationEigen4(sourceCovariance);
  sourceScale := 0.0; hornScale := 0.0;
  for i in 1:4 loop
    sourceScale := max(sourceScale,abs(sourceValues[i]));
    hornScale := max(hornScale,abs(hornValues[i]));
  end for;
  rank := 0.0;
  for i in 1:4 loop
    rank := rank+(if sourceValues[i] > rankTolerance*sourceScale then 1.0 else 0.0);
  end for;
  candidateRotation := {{1.0-2.0*(quaternion[3]^2+quaternion[4]^2),2.0*(quaternion[2]*quaternion[3]-quaternion[1]*quaternion[4]),2.0*(quaternion[2]*quaternion[4]+quaternion[1]*quaternion[3])},
    {2.0*(quaternion[2]*quaternion[3]+quaternion[1]*quaternion[4]),1.0-2.0*(quaternion[2]^2+quaternion[4]^2),2.0*(quaternion[3]*quaternion[4]-quaternion[1]*quaternion[2])},
    {2.0*(quaternion[2]*quaternion[4]-quaternion[1]*quaternion[3]),2.0*(quaternion[3]*quaternion[4]+quaternion[1]*quaternion[2]),1.0-2.0*(quaternion[2]^2+quaternion[3]^2)}};
  candidateTranslation := zeros(3);
  for a in 1:3 loop
    candidateTranslation[a] := targetCentroid[a];
    for b in 1:3 loop
      candidateTranslation[a] := candidateTranslation[a]-candidateRotation[a,b]*sourceCentroid[b];
    end for;
  end for;
  cost := 0.0;
  for i in 1:size(pairEnabled,1) loop
    if mask[i] then
      for a in 1:3 loop
        error := candidateTranslation[a]-targetPoint[i,a];
        for b in 1:3 loop
          error := error+candidateRotation[a,b]*sourcePoint[i,b];
        end for;
        cost := cost+error*error;
      end for;
    end if;
  end for;
  rms := sqrt(max(cost,0.0)/max(validCount,1.0));
  rejectionReason := if not domainValid then 1.0 else if invalidCount > 0.0 then 2.0 else if validCount < 3.0 then 3.0
    else if rank < 2.0 or eigenGap <= rankTolerance*max(sourceScale,hornScale) then 4.0
    else if hornResidual > 1e-10 or sourceResidual > 1e-10 then 5.0
    else if not (rms >= 0.0 and rms <= maximumRms) then 6.0 else 0.0;
  accepted := if rejectionReason <= 0.0 then 1.0 else 0.0;
  rotation := if accepted > 0.0 then candidateRotation else identity(3);
  translation := if accepted > 0.0 then candidateTranslation else zeros(3);
end FitRigidPointPairs;

model RigidPointRegistration
  parameter Integer capacity = 14400;
  parameter Real coordinateLimit = 1e6;
  parameter Real rankTolerance = 1e-8;
  parameter Real maximumRms = 0.02;
  input Real activeCount = 0.0;
  input Real sourcePoint[capacity,3] = zeros(capacity,3);
  input Real targetPoint[capacity,3] = zeros(capacity,3);
  // Exactly 0 disables a pair; exactly 1 requests a finite matched pair.
  input Real pairEnabled[capacity] = ones(capacity);
  output Real accepted;
  // 0 accepted; 1 domain; 2 invalid pair; 3 insufficient; 4 degeneracy;
  // 5 eigensolver convergence; 6 fitted RMS gate. Rejection is identity/zero.
  output Real rejectionReason;
  output Real rotation[3,3];
  output Real translation[3];
  output Real validCount;
  output Real invalidCount;
  output Real rank;
  output Real cost;
  output Real rms;
  output Real eigenGap;
  output Real sourceCentroid[3];
  output Real targetCentroid[3];
equation
  (accepted,rejectionReason,rotation,translation,validCount,invalidCount,rank,cost,rms,eigenGap,sourceCentroid,targetCentroid) =
    FitRigidPointPairs(sourcePoint,targetPoint,pairEnabled,activeCount,coordinateLimit,rankTolerance,maximumRms);
end RigidPointRegistration;

// Deterministic bounded consensus is considered only after the original fit's
// strict residual refusal. Domain, invalid-pair, rank and eigensolver refusals
// are never rescued. Clean fits retain the exact original fit and operation order.
// Added configuration: hypotheses1..1024 and consensus fraction in(0,1].
// Reason7 means no admissible stable consensus within the declared work bounds.
function FitRigidPointPairsRobust
  input Real sourcePoint[:,:];
  input Real targetPoint[:,:];
  input Real pairEnabled[:];
  input Real activeCount;
  input Real coordinateLimit;
  input Real rankTolerance;
  input Real maximumRms;
  input Integer maximumHypotheses = 64;
  input Real minimumConsensusFraction = 0.5;
  output Real accepted;
  output Real rejectionReason;
  output Real rotation[3,3];
  output Real translation[3];
  output Real validCount;
  output Real invalidCount;
  output Real rank;
  output Real cost;
  output Real rms;
  output Real eigenGap;
  output Real sourceCentroid[3];
  output Real targetCentroid[3];
  output Real finalInlierMask[size(pairEnabled,1)];
  output Real rejectedCount;
protected
  constant Integer dimension = 3;
  constant Integer maximumRefinements = 4;
  constant Integer stateModulus = 2147483647;
  constant Integer stateMultiplier = 16807;
  constant Integer stateQuotient = 127773;
  constant Integer stateRemainder = 2836;
  Boolean configurationValid; Boolean searching; Boolean stable;
  Integer enabledIndices[size(pairEnabled,1)]; Integer enabledCount;
  Integer sampleIndices[dimension]; Integer lowIndex; Integer highIndex;
  Integer state; Integer candidateCount; Integer bestCount; Integer retainedCount;
  Integer minimumConsensus; Integer index;
  Real originalValidCount; Real squaredLimit; Real residual; Real squaredResidual;
  Real candidateCost; Real bestCost;
  Real candidateMask[size(pairEnabled,1)]; Real bestMask[size(pairEnabled,1)];
  Real sampleSource[dimension,dimension]; Real sampleTarget[dimension,dimension];
  Real fitAccepted; Real fitReason; Real fitRotation[dimension,dimension]; Real fitTranslation[dimension];
  Real fitValidCount; Real fitInvalidCount; Real fitRank; Real fitCost; Real fitRms; Real fitEigenGap;
  Real fitSourceCentroid[dimension]; Real fitTargetCentroid[dimension];
algorithm
  (accepted,rejectionReason,rotation,translation,validCount,invalidCount,rank,cost,rms,
    eigenGap,sourceCentroid,targetCentroid) := FitRigidPointPairs(
      sourcePoint,targetPoint,pairEnabled,activeCount,coordinateLimit,rankTolerance,maximumRms);
  finalInlierMask := zeros(size(pairEnabled,1)); rejectedCount := 0.0;
  configurationValid := maximumHypotheses >= 1 and maximumHypotheses <= 1024
    and minimumConsensusFraction > 0.0 and minimumConsensusFraction <= 1.0;
  if not configurationValid then
    accepted := 0.0; rejectionReason := 1.0; rotation := identity(dimension); translation := zeros(dimension);
  elseif accepted > 0.5 then
    for pair in 1:size(pairEnabled,1) loop
      finalInlierMask[pair] := if pair <= activeCount and pairEnabled[pair] >= 1.0 and pairEnabled[pair] <= 1.0 then 1.0 else 0.0;
    end for;
  elseif rejectionReason >= 6.0 and rejectionReason <= 6.0 then
    // The original reason6 proves all active requested pairs valid and finite.
    originalValidCount := validCount; enabledCount := 0;
    enabledIndices := fill(0,size(pairEnabled,1));
    for pair in 1:size(pairEnabled,1) loop
      if pair <= activeCount and pairEnabled[pair] >= 1.0 and pairEnabled[pair] <= 1.0 then
        enabledCount := enabledCount+1; enabledIndices[enabledCount] := pair;
      end if;
    end for;
    minimumConsensus := max(dimension,integer(ceil(minimumConsensusFraction*originalValidCount)));
    squaredLimit := maximumRms*maximumRms;
    candidateMask := zeros(size(pairEnabled,1)); bestMask := zeros(size(pairEnabled,1));
    bestCount := 0; bestCost := 0.0; state := 1;
    sampleSource := zeros(dimension,dimension); sampleTarget := zeros(dimension,dimension);
    for hypothesis in 1:maximumHypotheses loop
      // Schrage's form of the31-bit Park-Miller state keeps every intermediate
      // inside signed32-bit range; no host RNG or unbounded duplicate retry.
      state := stateMultiplier*mod(state,stateQuotient)-stateRemainder*div(state,stateQuotient);
      if state <= 0 then state := state+stateModulus; end if;
      sampleIndices[1] := 1+mod(state,enabledCount);
      state := stateMultiplier*mod(state,stateQuotient)-stateRemainder*div(state,stateQuotient);
      if state <= 0 then state := state+stateModulus; end if;
      sampleIndices[2] := 1+mod(state,enabledCount-1);
      if sampleIndices[2] >= sampleIndices[1] then sampleIndices[2] := sampleIndices[2]+1; end if;
      lowIndex := min(sampleIndices[1],sampleIndices[2]); highIndex := max(sampleIndices[1],sampleIndices[2]);
      state := stateMultiplier*mod(state,stateQuotient)-stateRemainder*div(state,stateQuotient);
      if state <= 0 then state := state+stateModulus; end if;
      sampleIndices[3] := 1+mod(state,enabledCount-2);
      if sampleIndices[3] >= lowIndex then sampleIndices[3] := sampleIndices[3]+1; end if;
      if sampleIndices[3] >= highIndex then sampleIndices[3] := sampleIndices[3]+1; end if;
      for sample in 1:dimension loop
        index := enabledIndices[sampleIndices[sample]];
        for axis in 1:dimension loop
          sampleSource[sample,axis] := sourcePoint[index,axis];
          sampleTarget[sample,axis] := targetPoint[index,axis];
        end for;
      end for;
      (fitAccepted,fitReason,fitRotation,fitTranslation,fitValidCount,fitInvalidCount,fitRank,
        fitCost,fitRms,fitEigenGap,fitSourceCentroid,fitTargetCentroid) := FitRigidPointPairs(
          sampleSource,sampleTarget,ones(dimension),dimension,coordinateLimit,rankTolerance,maximumRms);
      if fitAccepted > 0.5 then
        candidateCount := 0; candidateCost := 0.0;
        for compact in 1:enabledCount loop
          index := enabledIndices[compact]; squaredResidual := 0.0;
          for axis in 1:dimension loop
            residual := fitTranslation[axis]-targetPoint[index,axis];
            for column in 1:dimension loop
              residual := residual+fitRotation[axis,column]*sourcePoint[index,column];
            end for;
            squaredResidual := squaredResidual+residual*residual;
          end for;
          candidateMask[index] := if squaredResidual >= 0.0 and squaredResidual <= squaredLimit then 1.0 else 0.0;
          if candidateMask[index] > 0.5 then
            candidateCount := candidateCount+1; candidateCost := candidateCost+squaredResidual;
          end if;
        end for;
        if candidateCount > bestCount or (candidateCount == bestCount and candidateCost < bestCost) then
          bestCount := candidateCount; bestCost := candidateCost; bestMask := candidateMask;
        end if;
      end if;
    end for;
    searching := bestCount >= minimumConsensus; stable := false;
    for refinement in 1:maximumRefinements loop
      if searching then
        (fitAccepted,fitReason,fitRotation,fitTranslation,fitValidCount,fitInvalidCount,fitRank,
          fitCost,fitRms,fitEigenGap,fitSourceCentroid,fitTargetCentroid) := FitRigidPointPairs(
            sourcePoint,targetPoint,bestMask,activeCount,coordinateLimit,rankTolerance,maximumRms);
        if fitAccepted > 0.5 then
          retainedCount := 0;
          for compact in 1:enabledCount loop
            index := enabledIndices[compact]; candidateMask[index] := 0.0;
            if bestMask[index] > 0.5 then
              squaredResidual := 0.0;
              for axis in 1:dimension loop
                residual := fitTranslation[axis]-targetPoint[index,axis];
                for column in 1:dimension loop
                  residual := residual+fitRotation[axis,column]*sourcePoint[index,column];
                end for;
                squaredResidual := squaredResidual+residual*residual;
              end for;
              if squaredResidual >= 0.0 and squaredResidual <= squaredLimit then
                candidateMask[index] := 1.0; retainedCount := retainedCount+1;
              end if;
            end if;
          end for;
          stable := retainedCount == bestCount and retainedCount >= minimumConsensus;
          if stable then
            accepted := fitAccepted; rejectionReason := fitReason;
            rotation := fitRotation; translation := fitTranslation;
            validCount := fitValidCount; invalidCount := fitInvalidCount; rank := fitRank;
            cost := fitCost; rms := fitRms; eigenGap := fitEigenGap;
            sourceCentroid := fitSourceCentroid; targetCentroid := fitTargetCentroid;
            finalInlierMask := bestMask; rejectedCount := originalValidCount-fitValidCount;
            searching := false;
          else
            bestMask := candidateMask; bestCount := retainedCount;
            searching := retainedCount >= minimumConsensus;
          end if;
        else
          searching := false;
        end if;
      end if;
    end for;
    if not stable then
      accepted := 0.0; rejectionReason := 7.0;
      rotation := identity(dimension); translation := zeros(dimension);
      // Retain original full-fit diagnostics, but never publish an unproved mask.
      finalInlierMask := zeros(size(pairEnabled,1)); rejectedCount := 0.0;
    end if;
  end if;
end FitRigidPointPairsRobust;

// Finite proper rotation gate shared by models and held-IMU functions.
function RGBDProperRotationValue
  input Real rotation[3,3] = identity(3);
  output Real valid;
protected
  constant Integer dimension = 3;
  constant Real tolerance = 1e-6;
  Real gram[dimension,dimension];
  Real checks[dimension,dimension];
  Real determinant;
algorithm
  gram := transpose(rotation)*rotation;
  determinant := rotation[1,1]*(rotation[2,2]*rotation[3,3]-rotation[2,3]*rotation[3,2])
    - rotation[1,2]*(rotation[2,1]*rotation[3,3]-rotation[2,3]*rotation[3,1])
    + rotation[1,3]*(rotation[2,1]*rotation[3,2]-rotation[2,2]*rotation[3,1]);
  for i in 1:dimension loop
    for j in 1:dimension loop
      checks[i,j] := if abs(rotation[i,j]) <= 1.0+tolerance
        and abs(gram[i,j]-(if i == j then 1.0 else 0.0)) <= tolerance then 0.0 else 1.0;
    end for;
  end for;
  valid := if sum(checks) < 0.5 and abs(determinant-1.0) <= tolerance then 1.0 else 0.0;
end RGBDProperRotationValue;

model RGBDProperRotation
  constant Integer dimension = 3;
  input Real rotation[dimension,dimension] = identity(dimension);
  constant Real tolerance = 1e-6;
  output Real valid;
equation
  valid = RGBDProperRotationValue(rotation);
end RGBDProperRotation;

// Convert accepted camera-frame registration to a map-frame BODY observation.
// The reference pose is the retained estimator/keyframe pose, never truth.
// Registration convention: currentPoint = currentFromReference * referencePoint
// + currentFromReferenceTranslation. Both point clouds use optical RDF axes.
// Camera extrinsics map optical coordinates into body FLU coordinates.
// This component composes a measurement; it does not estimate covariance,
// persist keyframes, reject dynamic objects, or implement loop closure.
model RGBDRelativePose
  constant Integer dimension = 3;
  input Real referenceBodyRotation[dimension,dimension] = identity(dimension);
  input Real referenceBodyPosition[dimension] = zeros(dimension);
  input Real currentFromReference[dimension,dimension] = identity(dimension);
  input Real currentFromReferenceTranslation[dimension] = zeros(dimension);
  input Real opticalToBody[dimension,dimension] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[dimension] = {0.18,0.0,-0.04};
  input Real registrationAccepted = 0.0;
  output Real valid;
  output Real observedBodyRotation[dimension,dimension];
  output Real observedBodyPosition[dimension];
protected
  parameter Real coordinateLimit = 1e6;
  RGBDProperRotation referenceCheck(rotation=referenceBodyRotation);
  RGBDProperRotation registrationCheck(rotation=currentFromReference);
  RGBDProperRotation extrinsicsCheck(rotation=opticalToBody);
  Real positionChecks[dimension];
  Real referenceCameraRotation[dimension,dimension];
  Real referenceCameraPosition[dimension];
  Real currentCameraRotation[dimension,dimension];
  Real currentCameraPosition[dimension];
  Real proposedBodyRotation[dimension,dimension];
  Real proposedBodyPosition[dimension];
equation
  referenceCameraRotation = referenceBodyRotation*opticalToBody;
  referenceCameraPosition = referenceBodyPosition+referenceBodyRotation*cameraOriginBody;
  currentCameraRotation = referenceCameraRotation*transpose(currentFromReference);
  currentCameraPosition = referenceCameraPosition-currentCameraRotation*currentFromReferenceTranslation;
  proposedBodyRotation = currentCameraRotation*transpose(opticalToBody);
  proposedBodyPosition = currentCameraPosition-proposedBodyRotation*cameraOriginBody;
  for i in 1:dimension loop
    positionChecks[i] = if noEvent(abs(referenceBodyPosition[i]) <= coordinateLimit
      and abs(currentFromReferenceTranslation[i]) <= coordinateLimit
      and abs(cameraOriginBody[i]) <= coordinateLimit
      and abs(proposedBodyPosition[i]) <= coordinateLimit) then 0.0 else 1.0;
  end for;
  valid = if noEvent(registrationAccepted >= 1.0 and registrationAccepted <= 1.0
    and referenceCheck.valid > 0.5 and registrationCheck.valid > 0.5
    and extrinsicsCheck.valid > 0.5 and sum(positionChecks) < 0.5) then 1.0 else 0.0;
  observedBodyRotation = if noEvent(valid > 0.5) then proposedBodyRotation else identity(dimension);
  observedBodyPosition = if noEvent(valid > 0.5) then proposedBodyPosition else zeros(dimension);
end RGBDRelativePose;

// Ordered callable equivalent of the unchanged equation model above.
// This preserves its optical reference->current transform and covariance chart.
function RGBDRelativeBodyPose
  input Real referenceBodyRotation[3,3] = identity(3);
  input Real referenceBodyPosition[3] = zeros(3);
  input Real currentFromReference[3,3] = identity(3);
  input Real currentFromReferenceTranslation[3] = zeros(3);
  input Real opticalToBody[3,3] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[3] = {0.18,0.0,-0.04};
  input Real registrationAccepted = 0.0;
  output Real valid;
  output Real observedBodyRotation[3,3];
  output Real observedBodyPosition[3];
protected
  constant Real coordinateLimit = 1e6;
  Real referenceCameraRotation[3,3]; Real referenceCameraPosition[3];
  Real currentCameraRotation[3,3]; Real currentCameraPosition[3];
  Real proposedBodyRotation[3,3]; Real proposedBodyPosition[3];
  Real positionChecks;
algorithm
  referenceCameraRotation := referenceBodyRotation*opticalToBody;
  referenceCameraPosition := referenceBodyPosition+referenceBodyRotation*cameraOriginBody;
  currentCameraRotation := referenceCameraRotation*transpose(currentFromReference);
  currentCameraPosition := referenceCameraPosition-currentCameraRotation*currentFromReferenceTranslation;
  proposedBodyRotation := currentCameraRotation*transpose(opticalToBody);
  proposedBodyPosition := currentCameraPosition-proposedBodyRotation*cameraOriginBody;
  positionChecks := 0.0;
  for i in 1:3 loop
    if not (abs(referenceBodyPosition[i]) <= coordinateLimit
      and abs(currentFromReferenceTranslation[i]) <= coordinateLimit
      and abs(cameraOriginBody[i]) <= coordinateLimit
      and abs(proposedBodyPosition[i]) <= coordinateLimit) then
      positionChecks := positionChecks+1.0;
    end if;
  end for;
  valid := if registrationAccepted >= 1.0 and registrationAccepted <= 1.0
    and RGBDProperRotationValue(referenceBodyRotation) > 0.5
    and RGBDProperRotationValue(currentFromReference) > 0.5
    and RGBDProperRotationValue(opticalToBody) > 0.5 and positionChecks < 0.5 then 1.0 else 0.0;
  observedBodyRotation := if valid > 0.5 then proposedBodyRotation else identity(3);
  observedBodyPosition := if valid > 0.5 then proposedBodyPosition else zeros(3);
end RGBDRelativeBodyPose;

// Conditional first-order uncertainty of the UNWEIGHTED point-to-point fit.
// Optical RDF perturbation: delta y = delta t - skew(R*p_ref)*delta theta.
// No correspondence changes, reference-pose uncertainty or cross-pair covariance
// are modeled. See docs/registration-uncertainty.md before filter composition.
function RGBDUncertaintySkew
  input Real v[3];
  output Real S[3,3];
algorithm
  S := {{0.0,-v[3],v[2]},{v[3],0.0,-v[1]},{-v[2],v[1],0.0}};
end RGBDUncertaintySkew;

function RGBDUncertaintyProper
  input Real R[3,3];
  output Boolean valid;
protected
  Real gram[3,3]; Real determinant;
algorithm
  valid := true;
  for a in 1:3 loop
    for b in 1:3 loop
      valid := valid and abs(R[a,b]) <= 1.000001;
    end for;
  end for;
  if valid then
    gram := transpose(R)*R;
    for a in 1:3 loop
      for b in 1:3 loop
        valid := valid and abs(gram[a,b]-(if a == b then 1.0 else 0.0)) <= 1e-6;
      end for;
    end for;
    determinant := R[1,1]*(R[2,2]*R[3,3]-R[2,3]*R[3,2])
      -R[1,2]*(R[2,1]*R[3,3]-R[2,3]*R[3,1])
      +R[1,3]*(R[2,1]*R[3,2]-R[2,2]*R[3,1]);
    valid := valid and abs(determinant-1.0) <= 1e-6;
  end if;
end RGBDUncertaintyProper;

// SPD solve with dimensionless diagonal equilibration, no damping/floor added
// to the matrix. A small or nonfinite pivot is a refusal, not invented noise.
function RGBDUncertaintyInverse6
  input Real A[6,6];
  input Real minimumPivot;
  output Real inverseA[6,6];
  output Boolean valid;
  output Real minimumScaledPivot;
protected
  Real scale[6]; Real L[6,6]; Real v; Real z[6]; Real x[6];
algorithm
  inverseA := zeros(6,6); L := zeros(6,6); scale := ones(6);
  minimumScaledPivot := 1.0; valid := true;
  for i in 1:6 loop
    valid := valid and A[i,i] > 0.0 and A[i,i] <= 1e100;
    scale[i] := sqrt(if A[i,i] > 0.0 and A[i,i] <= 1e100 then A[i,i] else 1.0);
    for j in 1:6 loop
      valid := valid and abs(A[i,j]) <= 1e100
        and abs(A[i,j]-A[j,i]) <= 1e-10*max(1.0,abs(A[i,j]));
    end for;
  end for;
  for i in 1:6 loop
    for j in 1:6 loop
      if j <= i then
        v := if valid then A[i,j]/scale[i]/scale[j] else 0.0;
        for k in 1:6 loop
          v := v-(if k < j then L[i,k]*L[j,k] else 0.0);
        end for;
        if j == i then
          minimumScaledPivot := min(minimumScaledPivot,v);
          valid := valid and v > minimumPivot and v <= 1e100;
          L[i,j] := sqrt(if valid then v else 1.0);
        else
          L[i,j] := if valid then v/L[j,j] else 0.0;
        end if;
      end if;
    end for;
  end for;
  for column in 1:6 loop
    z := zeros(6); x := zeros(6);
    for i in 1:6 loop
      v := if i == column then 1.0/scale[column] else 0.0;
      for k in 1:6 loop
        v := v-(if k < i then L[i,k]*z[k] else 0.0);
      end for;
      z[i] := if valid then v/L[i,i] else 0.0;
    end for;
    for index in 1:6 loop
      v := z[7-index];
      for k in 1:6 loop
        v := v-(if k > 7-index then L[k,7-index]*x[k] else 0.0);
      end for;
      x[7-index] := if valid then v/L[7-index,7-index] else 0.0;
    end for;
    for i in 1:6 loop
      inverseA[i,column] := if valid then x[i]/scale[i] else 0.0;
    end for;
  end for;
  inverseA := if valid then inverseA else zeros(6,6);
end RGBDUncertaintyInverse6;

function RGBDOpticalPointCovariance
  input Real p[3];
  input Real rgbFx; input Real rgbFy;
  input Real localizationSigma; input Real disparitySigma;
  input Real noiseReferenceFx; input Real baseline;
  input Real depthInflation;
  output Real covariance[3,3];
protected
  Real bearing[3]; Real depthSigma;
algorithm
  bearing := {p[1]/p[3],p[2]/p[3],1.0};
  // No reduction by interpolation neighbor count: correlated disparity bound.
  depthSigma := depthInflation*p[3]*p[3]*disparitySigma/noiseReferenceFx/baseline;
  for a in 1:3 loop
    for b in 1:3 loop
      covariance[a,b] := bearing[a]*bearing[b]*depthSigma*depthSigma;
    end for;
  end for;
  covariance[1,1] := covariance[1,1]+(p[3]*localizationSigma/rgbFx)^2;
  covariance[2,2] := covariance[2,2]+(p[3]*localizationSigma/rgbFy)^2;
end RGBDOpticalPointCovariance;

function RGBDRegistrationSandwich
  input Real referencePoint[:,:]; input Real currentPoint[:,:];
  input Real pairEnabled[:]; input Real activeCount; input Real registrationAccepted;
  input Real currentFromReference[3,3]; input Real translation[3];
  input Real referenceBodyRotation[3,3]; input Real opticalToBody[3,3];
  input Real cameraOriginBody[3];
  input Real referenceRgbFocal[2]; input Real currentRgbFocal[2];
  input Real referenceNoiseFx; input Real currentNoiseFx; input Real baseline;
  input Real localizationSigma; input Real disparitySigma; input Real depthInflation;
  input Real coordinateLimit; input Real minimumPivot;
  output Real valid; output Real rejectionReason;
  output Real validCount; output Real invalidCount;
  output Real relativeCovariance[6,6]; output Real observationCovariance[6,6];
  output Real normalMatrix[6,6]; output Real noiseMatrix[6,6];
  output Real observationJacobian[6,6]; output Real minimumScaledPivot;
protected
  Boolean configuration; Boolean pose; Boolean pointValid; Boolean hValid; Boolean cValid;
  Real q[3]; Real J[3,6]; Real Sigma[3,3]; Real Cref[3,3]; Real Ccur[3,3];
  Real Hinv[6,6]; Real unusedInverse[6,6]; Real unusedPivot;
  Real cameraRotation[3,3]; Real arm[3]; Real skewArm[3,3]; Real rotationBlock[3,3];
  Real candidateRelative[6,6]; Real candidateObservation[6,6];
algorithm
  valid := 0.0; validCount := 0.0; invalidCount := 0.0;
  normalMatrix := zeros(6,6); noiseMatrix := zeros(6,6);
  relativeCovariance := zeros(6,6); observationCovariance := zeros(6,6);
  observationJacobian := zeros(6,6); minimumScaledPivot := 0.0;
  configuration := activeCount >= 0.0 and activeCount <= size(pairEnabled,1)
    and floor(activeCount) == activeCount and size(referencePoint,1) == size(pairEnabled,1)
    and size(currentPoint,1) == size(pairEnabled,1) and size(referencePoint,2) == 3 and size(currentPoint,2) == 3
    and baseline > 0.0 and baseline <= 1.0 and localizationSigma > 0.0 and localizationSigma <= 10.0
    and disparitySigma > 0.0 and disparitySigma <= 10.0 and depthInflation >= 1.0 and depthInflation <= 100.0
    and referenceNoiseFx > 0.0 and referenceNoiseFx <= 1e6 and currentNoiseFx > 0.0 and currentNoiseFx <= 1e6
    and coordinateLimit > 0.0 and coordinateLimit <= 1e4 and minimumPivot > 0.0 and minimumPivot < 1.0;
  for k in 1:2 loop
    configuration := configuration and referenceRgbFocal[k] > 0.0 and referenceRgbFocal[k] <= 1e6
      and currentRgbFocal[k] > 0.0 and currentRgbFocal[k] <= 1e6;
  end for;
  pose := registrationAccepted == 1.0 and RGBDUncertaintyProper(currentFromReference)
    and RGBDUncertaintyProper(referenceBodyRotation) and RGBDUncertaintyProper(opticalToBody);
  for k in 1:3 loop
    pose := pose and abs(translation[k]) <= coordinateLimit and abs(cameraOriginBody[k]) <= coordinateLimit;
  end for;
  for i in 1:size(pairEnabled,1) loop
    pointValid := configuration and i <= activeCount and pairEnabled[i] == 1.0;
    for k in 1:3 loop
      pointValid := pointValid and abs(referencePoint[i,k]) <= coordinateLimit and abs(currentPoint[i,k]) <= coordinateLimit;
    end for;
    pointValid := pointValid and referencePoint[i,3] > 0.0 and currentPoint[i,3] > 0.0;
    invalidCount := invalidCount+(if i <= activeCount and pairEnabled[i] <> 0.0 and not pointValid then 1.0 else 0.0);
    validCount := validCount+(if pointValid then 1.0 else 0.0);
    if pointValid and pose then
      q := currentFromReference*referencePoint[i,:];
      J := zeros(3,6);
      J[:,1:3] := identity(3); J[:,4:6] := -RGBDUncertaintySkew(q);
      Cref := RGBDOpticalPointCovariance(referencePoint[i,:],referenceRgbFocal[1],referenceRgbFocal[2],
        localizationSigma,disparitySigma,referenceNoiseFx,baseline,depthInflation);
      Ccur := RGBDOpticalPointCovariance(currentPoint[i,:],currentRgbFocal[1],currentRgbFocal[2],
        localizationSigma,disparitySigma,currentNoiseFx,baseline,depthInflation);
      Sigma := Ccur+currentFromReference*Cref*transpose(currentFromReference);
      normalMatrix := normalMatrix+transpose(J)*J;
      noiseMatrix := noiseMatrix+transpose(J)*Sigma*J;
    end if;
  end for;
  (Hinv,hValid,minimumScaledPivot) := RGBDUncertaintyInverse6(normalMatrix,minimumPivot);
  candidateRelative := Hinv*noiseMatrix*transpose(Hinv);
  cameraRotation := if pose then referenceBodyRotation*opticalToBody*transpose(currentFromReference) else identity(3);
  arm := if pose then translation+transpose(opticalToBody)*cameraOriginBody else zeros(3);
  skewArm := RGBDUncertaintySkew(arm); rotationBlock := -cameraRotation*skewArm;
  for a in 1:3 loop
    for b in 1:3 loop
      observationJacobian[a,b] := -cameraRotation[a,b];
      observationJacobian[a,b+3] := rotationBlock[a,b];
      observationJacobian[a+3,b+3] := if pose then -opticalToBody[a,b] else 0.0;
    end for;
  end for;
  candidateObservation := observationJacobian*candidateRelative*transpose(observationJacobian);
  (unusedInverse,cValid,unusedPivot) := RGBDUncertaintyInverse6(candidateObservation,minimumPivot);
  rejectionReason := if not configuration then 1.0 else if not pose then 2.0 else if invalidCount > 0.0 then 3.0
    else if validCount < 3.0 then 4.0 else if not hValid then 5.0 else if not cValid then 6.0 else 0.0;
  valid := if rejectionReason == 0.0 then 1.0 else 0.0;
  relativeCovariance := if valid > 0.5 then candidateRelative else zeros(6,6);
  observationCovariance := if valid > 0.5 then candidateObservation else zeros(6,6);
end RGBDRegistrationSandwich;

model RGBDRegistrationUncertainty
  parameter Integer capacity = 350;
  parameter Real coordinateLimit = 100.0;
  parameter Real minimumPivot = 1e-10;
  parameter Real localizationSigma = 0.5;
  parameter Real disparitySigma = 0.1;
  parameter Real depthInflation = 1.0;
  input Real referencePoint[capacity,3] = zeros(capacity,3);
  input Real currentPoint[capacity,3] = zeros(capacity,3);
  input Real pairEnabled[capacity] = zeros(capacity);
  input Real activeCount = 0.0;
  input Real registrationAccepted = 0.0;
  input Real currentFromReference[3,3] = identity(3);
  input Real translation[3] = zeros(3);
  input Real referenceBodyRotation[3,3] = identity(3);
  input Real opticalToBody[3,3] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[3] = {0.18,0.0,-0.04};
  input Real referenceRgbFocal[2] = {116.4,116.4};
  input Real currentRgbFocal[2] = {116.4,116.4};
  input Real referenceNoiseFx = 848.0/(2.0*tan(87.0*3.141592653589793/360.0));
  input Real currentNoiseFx = 848.0/(2.0*tan(87.0*3.141592653589793/360.0));
  input Real baseline = 0.05;
  output Real valid; output Real rejectionReason; output Real validCount; output Real invalidCount;
  output Real relativeCovariance[6,6]; output Real observationCovariance[6,6];
  output Real normalMatrix[6,6]; output Real noiseMatrix[6,6];
  output Real observationJacobian[6,6]; output Real minimumScaledPivot;
equation
  (valid,rejectionReason,validCount,invalidCount,relativeCovariance,observationCovariance,
    normalMatrix,noiseMatrix,observationJacobian,minimumScaledPivot) = RGBDRegistrationSandwich(
    referencePoint,currentPoint,pairEnabled,activeCount,registrationAccepted,currentFromReference,translation,
    referenceBodyRotation,opticalToBody,cameraOriginBody,referenceRgbFocal,currentRgbFocal,
    referenceNoiseFx,currentNoiseFx,baseline,localizationSigma,disparitySigma,depthInflation,coordinateLimit,minimumPivot);
end RGBDRegistrationUncertainty;

// Review graph: raw RGB/depth -> descriptors -> matches -> rigid registration
// -> map-frame body pose. Compile with RGBDFeatureMatching,
// RigidPointRegistration and RGBDRelativePose source files.
// The reference descriptors, optical points and body pose are retained estimated
// keyframe data. No ground-truth pose or host feature matching enters this graph.
// This is a visual observation frontend, not a persistent SLAM estimator.
model RGBDVisualObservation
  parameter Integer imageWidth(min=1) = 160;
  parameter Integer imageHeight(min=1) = 90;
  // RGB8 uses three channels; historical RGBA recordings may retain alpha.
  parameter Integer channelCount(min=3,max=4) = 4;
  constant Integer featureCapacity = 350;
  constant Integer descriptorWidth = 7;
  constant Integer descriptorSize = descriptorWidth*descriptorWidth;
  input Boolean imageEnabled = true;
  input Real rgb[imageHeight,imageWidth,channelCount];
  input Real depth[imageHeight,imageWidth];
  input Real depthUnits = 1.0 "Meters per depth sample";
  input Real pixels[featureCapacity,2];
  input Real activeCount;
  input Real rgbCalibration[4];
  input Real depthCalibration[4];
  input Real disparityNoise = 0.08;
  input Real noiseReferenceFx;
  input Real baseline = 0.05;
  input Real referenceDescriptor[featureCapacity,descriptorSize];
  input Real referencePoint[featureCapacity,3];
  input Real referenceEnabled[featureCapacity];
  input Real referenceCount;
  input Real referenceBodyRotation[3,3] = identity(3);
  input Real referenceBodyPosition[3] = zeros(3);
  input Real opticalToBody[3,3] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[3] = {0.18,0.0,-0.04};
  // Optional predicted optical reference->current transform for association.
  input Real usePrediction = 0.0;
  input Real predictedRotation[3,3] = identity(3);
  input Real predictedTranslation[3] = zeros(3);
  output Real observedBodyRotation[3,3];
  output Real observedBodyPosition[3];
  output Real valid;
  output Real matchCount;
  output Real registrationRms;
  output Real registrationRejectionReason;
  output Real currentIndex[featureCapacity];
  // Complete current frame data for retaining a future reference keyframe.
  output Real currentDescriptor[featureCapacity,descriptorSize];
  output Real currentPoint[featureCapacity,3];
  output Real currentEnabled[featureCapacity];
protected
  RGBDDescriptorFrame description(imageHeight=imageHeight,imageWidth=imageWidth,
    channelCount=channelCount,imageEnabled=imageEnabled,rgb=rgb,depth=depth,depthUnits=depthUnits,pixels=pixels,
    activeCount=activeCount,rgbCalibration=rgbCalibration,depthCalibration=depthCalibration,
    disparityNoise=disparityNoise,noiseReferenceFx=noiseReferenceFx,baseline=baseline);
  RGBDFeatureMatching matching(referenceDescriptor=referenceDescriptor,
    currentDescriptor=description.descriptor,referencePoint=referencePoint,
    currentPoint=description.point,referenceEnabled=referenceEnabled,
    currentEnabled=description.enabled,referenceCount=referenceCount,currentCount=activeCount,
    usePrediction=usePrediction,predictedRotation=predictedRotation,
    predictedTranslation=predictedTranslation);
  // Pair masks can have holes anywhere in the full reference domain. Using
  // matching.count as activeCount would silently discard matches in later slots.
  RigidPointRegistration registration(capacity=featureCapacity,
    activeCount=featureCapacity,sourcePoint=matching.sourcePoint,
    targetPoint=matching.targetPoint,pairEnabled=matching.pairEnabled);
  RGBDRelativePose pose(referenceBodyRotation=referenceBodyRotation,
    referenceBodyPosition=referenceBodyPosition,currentFromReference=registration.rotation,
    currentFromReferenceTranslation=registration.translation,opticalToBody=opticalToBody,
    cameraOriginBody=cameraOriginBody,registrationAccepted=registration.accepted);
equation
  observedBodyRotation = pose.observedBodyRotation;
  observedBodyPosition = pose.observedBodyPosition;
  valid = if noEvent(matching.configurationValid > 0.5) then pose.valid else 0.0;
  matchCount = matching.count;
  registrationRms = registration.rms;
  registrationRejectionReason = registration.rejectionReason;
  currentIndex = matching.currentIndex;
  currentDescriptor = description.descriptor;
  currentPoint = description.point;
  currentEnabled = description.enabled;
end RGBDVisualObservation;

// Review composition: full calibrated visual frontend plus its registration
// noise model. Compile together with RGBDVisualObservation, RGBDFeatureMatching,
// RigidPointRegistration, RGBDRelativePose and RGBDRegistrationUncertainty.
// This source has not yet passed a connected source-issued numerical gate.
model RGBDVisualRelativeObservation
  extends RGBDVisualObservation;
  // Retain these with the reference image rather than substituting the current
  // image calibration. The noise model assumes a common stereo baseline and
  // disparity sigma for the pair; changing those requires a new noise model.
  input Real referenceRgbFocal[2];
  input Real referenceNoiseReferenceFx;
  parameter Real localizationSigma = 0.5;
  parameter Real depthInflation = 1.0;
  parameter Real uncertaintyCoordinateLimit = 100.0;
  parameter Real uncertaintyMinimumPivot = 1e-10;
  output Real currentFromReference[3,3];
  output Real currentFromReferenceTranslation[3];
  output Real relativeCovariance[6,6]
    "Optical translation and optical left-angle perturbation; use with Schmidt update";
  output Real conditionalObservationCovariance[6,6]
    "Conditional on retained reference pose; not independent absolute noise";
  output Real relativeValid;
  output Real uncertaintyRejectionReason;
  output Real uncertaintyValidCount;
  output Real uncertaintyInvalidCount;
protected
  // Registration and uncertainty consume exactly the same complete sparse
  // pair domain. matching.count is not a prefix extent.
  Real uncertaintyValid;
  Real normalMatrix[6,6];
  Real noiseMatrix[6,6];
  Real observationJacobian[6,6];
  Real minimumScaledPivot;
equation
  // Call the existing function so per-frame calibrated noise remains a runtime
  // input; it must not initialize a parameter from a varying input binding.
  (uncertaintyValid,uncertaintyRejectionReason,uncertaintyValidCount,
    uncertaintyInvalidCount,relativeCovariance,conditionalObservationCovariance,
    normalMatrix,noiseMatrix,observationJacobian,minimumScaledPivot) =
    RGBDRegistrationSandwich(matching.sourcePoint,matching.targetPoint,
      matching.pairEnabled,featureCapacity,valid,registration.rotation,
      registration.translation,referenceBodyRotation,opticalToBody,
      cameraOriginBody,referenceRgbFocal,{rgbCalibration[1],rgbCalibration[2]},
      referenceNoiseReferenceFx,noiseReferenceFx,baseline,localizationSigma,
      disparityNoise,depthInflation,uncertaintyCoordinateLimit,uncertaintyMinimumPivot);
  currentFromReference = registration.rotation;
  currentFromReferenceTranslation = registration.translation;
  relativeValid = if noEvent(valid > 0.5 and uncertaintyValid > 0.5) then 1.0 else 0.0;
end RGBDVisualRelativeObservation;

// Ordered full raw-camera composition. The equation models above retain the
// unweighted baseline; robustRegistration=false selects that same fit here.
// The bounded consensus fallback preserves clean fits and their operation order.
// imageEnabled retains its existing meaning
// (only description is bypassed, matching/registration still report refusals).
function ObserveRGBDRelativeFrame
  input Real rgb[:,:,:]; input Real depth[size(rgb,1),size(rgb,2)];
  input Real pixels[featureCapacity,2]; input Real activeCount;
  input Real rgbCalibration[4]; input Real depthCalibration[4]; input Real noiseReferenceFx;
  input Real referenceDescriptor[featureCapacity,descriptorSize]; input Real referencePoint[featureCapacity,3];
  input Real referenceEnabled[featureCapacity]; input Real referenceCount;
  input Real referenceRgbFocal[2]; input Real referenceNoiseReferenceFx;
  input Boolean imageEnabled = true;
  input Real disparityNoise = 0.08; input Real baseline = 0.05;
  input Real referenceBodyRotation[3,3] = identity(3);
  input Real referenceBodyPosition[3] = zeros(3);
  input Real opticalToBody[3,3] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[3] = {0.18,0.0,-0.04};
  input Real usePrediction = 0.0;
  input Real predictedRotation[3,3] = identity(3); input Real predictedTranslation[3] = zeros(3);
  input Real nearDepth = 0.28; input Real farDepth = 10.0; input Real minimumContrast = 1e-6;
  input Real ratio = 0.8; input Real maximumDescriptorDistance = 0.8; input Real maximumGeometricDistance = 0.5;
  input Real registrationCoordinateLimit = 1e6; input Real rankTolerance = 1e-8; input Real maximumRms = 0.02;
  input Real localizationSigma = 0.5; input Real depthInflation = 1.0;
  input Real uncertaintyCoordinateLimit = 100.0; input Real uncertaintyMinimumPivot = 1e-10;
  input Boolean robustRegistration = true;
  input Integer maximumRegistrationHypotheses = 64;
  input Real minimumRegistrationConsensusFraction = 0.5;
  output Real observedBodyRotation[3,3]; output Real observedBodyPosition[3];
  output Real valid; output Real matchCount; output Real registrationRms; output Real registrationRejectionReason;
  output Real currentIndex[featureCapacity]; output Real currentDescriptor[featureCapacity,descriptorSize];
  output Real currentPoint[featureCapacity,3]; output Real currentEnabled[featureCapacity];
  output Real currentFromReference[3,3]; output Real currentFromReferenceTranslation[3];
  output Real relativeCovariance[6,6] "Optical translation/left-angle runtime relative noise";
  output Real conditionalObservationCovariance[6,6] "Conditional on retained reference pose; not independent absolute noise";
  output Real relativeValid; output Real uncertaintyRejectionReason;
  output Real uncertaintyValidCount; output Real uncertaintyInvalidCount;
  output Real descriptionInvalidCount; output Real matchingConfigurationValid;
  output Real invalidReference; output Real invalidCurrent; output Real pairEnabled[featureCapacity];
  output Real registrationAccepted; output Real registrationValidCount; output Real registrationInvalidCount;
  output Real registrationRank; output Real uncertaintyValid;
  input Real depthUnits = 1.0 "Meters per depth sample; 1 for metric depth, SDK scale for Z16";
protected
  constant Integer featureCapacity = 350;
  constant Integer descriptorWidth = 7; constant Integer descriptorSize = descriptorWidth*descriptorWidth;
  Real sourcePoint[featureCapacity,3]; Real targetPoint[featureCapacity,3];
  Real nearestDistance[featureCapacity]; Real secondDistance[featureCapacity];
  Real candidatePairEnabled[featureCapacity]; Real registrationInlierMask[featureCapacity];
  Real registrationRejectedCount;
  Real registrationCost; Real eigenGap; Real sourceCentroid[3]; Real targetCentroid[3];
  Real poseValid; Real normalMatrix[6,6]; Real noiseMatrix[6,6]; Real observationJacobian[6,6]; Real minimumScaledPivot;
algorithm
  (currentDescriptor,currentPoint,currentEnabled,descriptionInvalidCount) :=
    DescribeRGBDFrame(rgb,depth,pixels,activeCount,rgbCalibration,depthCalibration,
      disparityNoise,noiseReferenceFx,baseline,nearDepth,farDepth,minimumContrast,imageEnabled,depthUnits=depthUnits);
  (currentIndex,candidatePairEnabled,sourcePoint,targetPoint,matchCount,matchingConfigurationValid,
    invalidReference,invalidCurrent,nearestDistance,secondDistance) :=
    MatchRGBDDescriptors(referenceDescriptor,currentDescriptor,referencePoint,currentPoint,
      referenceEnabled,currentEnabled,referenceCount,activeCount,ratio,maximumDescriptorDistance,
      usePrediction,predictedRotation,predictedTranslation,maximumGeometricDistance);
  // Sparse masks span the complete reference domain, never the match prefix.
  if robustRegistration then
    (registrationAccepted,registrationRejectionReason,currentFromReference,currentFromReferenceTranslation,
      registrationValidCount,registrationInvalidCount,registrationRank,registrationCost,registrationRms,
      eigenGap,sourceCentroid,targetCentroid,registrationInlierMask,registrationRejectedCount) :=
      FitRigidPointPairsRobust(sourcePoint,targetPoint,candidatePairEnabled,
        featureCapacity,registrationCoordinateLimit,rankTolerance,maximumRms,
        maximumRegistrationHypotheses,minimumRegistrationConsensusFraction);
  else
    (registrationAccepted,registrationRejectionReason,currentFromReference,currentFromReferenceTranslation,
      registrationValidCount,registrationInvalidCount,registrationRank,registrationCost,registrationRms,
      eigenGap,sourceCentroid,targetCentroid) := FitRigidPointPairs(sourcePoint,targetPoint,candidatePairEnabled,
        featureCapacity,registrationCoordinateLimit,rankTolerance,maximumRms);
    registrationInlierMask := candidatePairEnabled; registrationRejectedCount := 0.0;
  end if;
  // Descriptor candidates remain observable in matchCount. Accepted registration,
  // uncertainty and tracking consume the same certified sparse inlier inventory.
  // On refusal retain candidate diagnostics; valid=0 prevents a filter update.
  pairEnabled := if registrationAccepted > 0.5 then registrationInlierMask else candidatePairEnabled;
  if registrationAccepted > 0.5 then
    for pair in 1:featureCapacity loop
      if registrationInlierMask[pair] < 0.5 then currentIndex[pair] := 0.0; end if;
    end for;
  end if;
  (poseValid,observedBodyRotation,observedBodyPosition) := RGBDRelativeBodyPose(referenceBodyRotation,
    referenceBodyPosition,currentFromReference,currentFromReferenceTranslation,opticalToBody,
    cameraOriginBody,registrationAccepted);
  valid := if matchingConfigurationValid > 0.5 then poseValid else 0.0;
  (uncertaintyValid,uncertaintyRejectionReason,uncertaintyValidCount,uncertaintyInvalidCount,
    relativeCovariance,conditionalObservationCovariance,normalMatrix,noiseMatrix,observationJacobian,minimumScaledPivot) :=
    RGBDRegistrationSandwich(sourcePoint,targetPoint,pairEnabled,featureCapacity,valid,currentFromReference,
      currentFromReferenceTranslation,referenceBodyRotation,opticalToBody,cameraOriginBody,
      referenceRgbFocal,{rgbCalibration[1],rgbCalibration[2]},referenceNoiseReferenceFx,noiseReferenceFx,
      baseline,localizationSigma,disparityNoise,depthInflation,uncertaintyCoordinateLimit,uncertaintyMinimumPivot);
  relativeValid := if valid > 0.5 and uncertaintyValid > 0.5 then 1.0 else 0.0;
end ObserveRGBDRelativeFrame;

// Finite proper rotation gate. Invalid entries never enter matrix arithmetic.
model RGBDLandmarkRotationCheck
  constant Integer dimension = 3;
  constant Real tolerance = 1e-6;
  input Real rotation[dimension,dimension] = identity(dimension);
  output Real valid;
protected
  Real safeRotation[dimension,dimension];
  Real entryChecks[dimension,dimension];
  Real gram[dimension,dimension];
  Real gramChecks[dimension,dimension];
  Real determinant;
equation
  for i in 1:dimension loop
    for j in 1:dimension loop
      entryChecks[i,j] = if noEvent(abs(rotation[i,j]) <= 1.0+tolerance) then 0.0 else 1.0;
      safeRotation[i,j] = if noEvent(entryChecks[i,j] < 0.5) then rotation[i,j] else 0.0;
      gramChecks[i,j] = if noEvent(abs(gram[i,j]-(if i == j then 1.0 else 0.0)) <= tolerance) then 0.0 else 1.0;
    end for;
  end for;
  gram = transpose(safeRotation)*safeRotation;
  determinant = safeRotation[1,1]*(safeRotation[2,2]*safeRotation[3,3]-safeRotation[2,3]*safeRotation[3,2])
    -safeRotation[1,2]*(safeRotation[2,1]*safeRotation[3,3]-safeRotation[2,3]*safeRotation[3,1])
    +safeRotation[1,3]*(safeRotation[2,1]*safeRotation[3,2]-safeRotation[2,2]*safeRotation[3,1]);
  valid = if noEvent(sum(entryChecks)+sum(gramChecks) < 0.5 and abs(determinant-1.0) <= tolerance) then 1.0 else 0.0;
end RGBDLandmarkRotationCheck;

// Candidate coordinates only: no map persistence, pruning or SLAM lifecycle.
// Points are already calibrated optical RDF (right/down/forward). The supplied
// estimated body pose maps body FLU into world ENU; there is no truth input.
model RGBDLandmarkProjection
  constant Integer featureCapacity = 350;
  constant Integer dimension = 3;
  parameter Real coordinateLimit = 1e6;
  input Real opticalPoint[featureCapacity,dimension];
  input Real enabled[featureCapacity];
  input Real activeCount = 0.0;
  input Real poseAccepted = 0.0;
  input Real bodyRotation[dimension,dimension] = identity(dimension);
  input Real bodyPosition[dimension] = zeros(dimension);
  input Real opticalToBody[dimension,dimension] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[dimension] = {0.18,0.0,-0.04};
  output Real worldPoint[featureCapacity,dimension];
  output Real landmarkEnabled[featureCapacity];
  output Real validCount;
  output Real invalidCount;
  output Real configurationValid;
  output Real poseValid;
protected
  RGBDLandmarkRotationCheck bodyCheck(rotation=bodyRotation);
  RGBDLandmarkRotationCheck cameraCheck(rotation=opticalToBody);
  Real poseChecks[dimension];
  Real pointChecks[featureCapacity,dimension];
  Real pointValid[featureCapacity];
  Real invalidChecks[featureCapacity];
  Real safeOptical[featureCapacity,dimension];
  Real safeBodyRotation[dimension,dimension];
  Real safeOpticalToBody[dimension,dimension];
  Real safeBodyPosition[dimension];
  Real safeCameraOrigin[dimension];
  Real cameraInBody[featureCapacity,dimension];
  Real proposedWorld[featureCapacity,dimension];
  Real outputChecks[featureCapacity,dimension];
equation
  configurationValid = if noEvent(activeCount >= 0.0 and activeCount <= featureCapacity
    and floor(activeCount) <= activeCount and floor(activeCount) >= activeCount
    and coordinateLimit > 0.0 and coordinateLimit <= 1e6) then 1.0 else 0.0;
  for k in 1:dimension loop
    poseChecks[k] = if noEvent(abs(bodyPosition[k]) <= coordinateLimit
      and abs(cameraOriginBody[k]) <= coordinateLimit) then 0.0 else 1.0;
  end for;
  poseValid = if noEvent(configurationValid > 0.5 and poseAccepted >= 1.0 and poseAccepted <= 1.0
    and bodyCheck.valid > 0.5 and cameraCheck.valid > 0.5 and sum(poseChecks) < 0.5) then 1.0 else 0.0;
  safeBodyRotation = if noEvent(poseValid > 0.5) then bodyRotation else identity(dimension);
  safeOpticalToBody = if noEvent(poseValid > 0.5) then opticalToBody else identity(dimension);
  safeBodyPosition = if noEvent(poseValid > 0.5) then bodyPosition else zeros(dimension);
  safeCameraOrigin = if noEvent(poseValid > 0.5) then cameraOriginBody else zeros(dimension);
  for i in 1:featureCapacity loop
    for k in 1:dimension loop
      pointChecks[i,k] = if noEvent(abs(opticalPoint[i,k]) <= coordinateLimit) then 0.0 else 1.0;
      safeOptical[i,k] = if noEvent(poseValid > 0.5 and pointValid[i] > 0.5) then opticalPoint[i,k] else 0.0;
      outputChecks[i,k] = if noEvent(abs(proposedWorld[i,k]) <= coordinateLimit) then 0.0 else 1.0;
      worldPoint[i,k] = if noEvent(landmarkEnabled[i] > 0.5) then proposedWorld[i,k] else 0.0;
    end for;
    pointValid[i] = if noEvent(configurationValid > 0.5 and i <= activeCount
      and enabled[i] >= 1.0 and enabled[i] <= 1.0 and sum(pointChecks[i,:]) < 0.5
      and opticalPoint[i,3] > 0.0) then 1.0 else 0.0;
    cameraInBody[i,:] = safeOpticalToBody*safeOptical[i,:]+safeCameraOrigin;
    proposedWorld[i,:] = safeBodyRotation*cameraInBody[i,:]+safeBodyPosition;
    landmarkEnabled[i] = if noEvent(poseValid > 0.5 and pointValid[i] > 0.5
      and sum(outputChecks[i,:]) < 0.5) then 1.0 else 0.0;
    invalidChecks[i] = if noEvent(i <= activeCount and not (enabled[i] >= 0.0 and enabled[i] <= 0.0)
      and pointValid[i] < 0.5) then 1.0 else 0.0;
  end for;
  validCount = sum(landmarkEnabled);
  invalidCount = sum(invalidChecks);
end RGBDLandmarkProjection;

// Pure ordered equivalent of the equation rotation gate above. Invalid entries
// are replaced before Gram/determinant arithmetic; its tolerance is unchanged.
function RGBDLandmarkRotationValid
  input Real rotation[3,3];
  output Real valid;
protected
  constant Real tolerance = 1e-6;
  Real safeRotation[3,3]; Real gram[3,3]; Real determinant;
  Real entryCount; Real gramCount;
algorithm
  safeRotation := zeros(3,3); entryCount := 0.0; gramCount := 0.0;
  for i in 1:3 loop
    for j in 1:3 loop
      if abs(rotation[i,j]) <= 1.0+tolerance then
        safeRotation[i,j] := rotation[i,j];
      else
        entryCount := entryCount+1.0;
      end if;
    end for;
  end for;
  gram := transpose(safeRotation)*safeRotation;
  for i in 1:3 loop
    for j in 1:3 loop
      if not (abs(gram[i,j]-(if i == j then 1.0 else 0.0)) <= tolerance) then
        gramCount := gramCount+1.0;
      end if;
    end for;
  end for;
  determinant := safeRotation[1,1]*(safeRotation[2,2]*safeRotation[3,3]-safeRotation[2,3]*safeRotation[3,2])
    -safeRotation[1,2]*(safeRotation[2,1]*safeRotation[3,3]-safeRotation[2,3]*safeRotation[3,1])
    +safeRotation[1,3]*(safeRotation[2,1]*safeRotation[3,2]-safeRotation[2,2]*safeRotation[3,1]);
  valid := if entryCount+gramCount < 0.5 and abs(determinant-1.0) <= tolerance then 1.0 else 0.0;
end RGBDLandmarkRotationValid;

// Source-owned reusable projection; the unchanged equation model is its oracle.
// Counts and masks retain the model's exact Real-domain checks. Disabled or
// unavailable point payloads never enter transforms. World-output overflow is
// excluded from validCount but is not an optical-input invalidCount event.
function RGBDProjectLandmarks
  input Real opticalPoint[:,3];
  input Real enabled[size(opticalPoint,1)];
  input Real activeCount = 0.0;
  input Real poseAccepted = 0.0;
  input Real bodyRotation[3,3] = identity(3);
  input Real bodyPosition[3] = zeros(3);
  input Real opticalToBody[3,3] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[3] = {0.18,0.0,-0.04};
  input Real coordinateLimit = 1e6;
  output Real worldPoint[size(opticalPoint,1),3];
  output Real landmarkEnabled[size(opticalPoint,1)];
  output Real validCount;
  output Real invalidCount;
  output Real configurationValid;
  output Real poseValid;
protected
  Real bodyValid; Real cameraValid; Real poseChecks;
  Real pointChecks; Real pointValid; Real outputChecks;
  Real cameraInBody[3]; Real proposedWorld[3];
algorithm
  worldPoint := zeros(size(opticalPoint,1),3);
  landmarkEnabled := zeros(size(opticalPoint,1)); validCount := 0.0; invalidCount := 0.0;
  configurationValid := if activeCount >= 0.0 and activeCount <= size(opticalPoint,1)
    and floor(activeCount) <= activeCount and floor(activeCount) >= activeCount
    and coordinateLimit > 0.0 and coordinateLimit <= 1e6 then 1.0 else 0.0;
  bodyValid := RGBDLandmarkRotationValid(bodyRotation);
  cameraValid := RGBDLandmarkRotationValid(opticalToBody);
  poseChecks := 0.0;
  for k in 1:3 loop
    if not (abs(bodyPosition[k]) <= coordinateLimit and abs(cameraOriginBody[k]) <= coordinateLimit) then
      poseChecks := poseChecks+1.0;
    end if;
  end for;
  poseValid := if configurationValid > 0.5 and poseAccepted >= 1.0 and poseAccepted <= 1.0
    and bodyValid > 0.5 and cameraValid > 0.5 and poseChecks < 0.5 then 1.0 else 0.0;
  pointChecks := 0.0; pointValid := 0.0; outputChecks := 0.0;
  cameraInBody := zeros(3); proposedWorld := zeros(3);
  for i in 1:size(opticalPoint,1) loop
    pointChecks := 0.0;
    for k in 1:3 loop
      if not (abs(opticalPoint[i,k]) <= coordinateLimit) then pointChecks := pointChecks+1.0; end if;
    end for;
    pointValid := if configurationValid > 0.5 and i <= activeCount
      and enabled[i] >= 1.0 and enabled[i] <= 1.0 and pointChecks < 0.5
      and opticalPoint[i,3] > 0.0 then 1.0 else 0.0;
    if i <= activeCount and not (enabled[i] >= 0.0 and enabled[i] <= 0.0)
      and pointValid < 0.5 then invalidCount := invalidCount+1.0; end if;
    if poseValid > 0.5 and pointValid > 0.5 then
      cameraInBody := opticalToBody*opticalPoint[i,:]+cameraOriginBody;
      proposedWorld := bodyRotation*cameraInBody+bodyPosition;
      outputChecks := 0.0;
      for k in 1:3 loop
        if not (abs(proposedWorld[k]) <= coordinateLimit) then outputChecks := outputChecks+1.0; end if;
      end for;
      if outputChecks < 0.5 then
        worldPoint[i,:] := proposedWorld; landmarkEnabled[i] := 1.0; validCount := validCount+1.0;
      end if;
    end if;
  end for;
end RGBDProjectLandmarks;

// Shared Cholesky factorization of a 6×6 geometric innovation covariance.
// Sixteen RHS carry cross-covariance transpose plus innovation; inputs are finite.
// valid=0 rejects nonsymmetric/nonpositive covariance and returns zero solutions.
// Invalid diagonal factors use a unit value to keep following arithmetic bounded.
// Fixed six-row formulas avoid a dependent reduction-domain compiler limitation.
// Regenerate with scripts/generate-spd6-model.mjs; students can edit this source.
model SPD6Solve
  parameter Real pivot_floor = 1e-12;
  parameter Real symmetry_absolute = 1e-12;
  parameter Real symmetry_relative = 1e-8;
  input Real A[6,6] = identity(6);
  input Real B[6,16] = fill(0.0,6,16);
  output Real X[6,16];
  output Real valid;
protected
  Real L[6,6]; Real pivot[6]; Real Z[6,16]; Real solution[6,16];
  Real symmetryChecks[6,6]; Real symmetry_errors;
equation
  for i in 1:6 loop
    for j in 1:6 loop
      symmetryChecks[i,j] = if noEvent(abs(A[i,j]-A[j,i]) <=
        symmetry_absolute+symmetry_relative*abs(A[j,i])) then 0.0 else 1.0;
    end for;
  end for;
  symmetry_errors = sum(symmetryChecks[i,j] for i in 1:6, j in 1:6);
  pivot[1] = A[1,1]-(0.0);
  L[1,1] = sqrt(if noEvent(pivot[1] > pivot_floor) then pivot[1] else 1.0);
  L[1,2] = 0.0;
  L[1,3] = 0.0;
  L[1,4] = 0.0;
  L[1,5] = 0.0;
  L[1,6] = 0.0;
  L[2,1] = (A[2,1]-(0.0))/L[1,1];
  pivot[2] = A[2,2]-(L[2,1]*L[2,1]);
  L[2,2] = sqrt(if noEvent(pivot[2] > pivot_floor) then pivot[2] else 1.0);
  L[2,3] = 0.0;
  L[2,4] = 0.0;
  L[2,5] = 0.0;
  L[2,6] = 0.0;
  L[3,1] = (A[3,1]-(0.0))/L[1,1];
  L[3,2] = (A[3,2]-(L[3,1]*L[2,1]))/L[2,2];
  pivot[3] = A[3,3]-(L[3,1]*L[3,1]+L[3,2]*L[3,2]);
  L[3,3] = sqrt(if noEvent(pivot[3] > pivot_floor) then pivot[3] else 1.0);
  L[3,4] = 0.0;
  L[3,5] = 0.0;
  L[3,6] = 0.0;
  L[4,1] = (A[4,1]-(0.0))/L[1,1];
  L[4,2] = (A[4,2]-(L[4,1]*L[2,1]))/L[2,2];
  L[4,3] = (A[4,3]-(L[4,1]*L[3,1]+L[4,2]*L[3,2]))/L[3,3];
  pivot[4] = A[4,4]-(L[4,1]*L[4,1]+L[4,2]*L[4,2]+L[4,3]*L[4,3]);
  L[4,4] = sqrt(if noEvent(pivot[4] > pivot_floor) then pivot[4] else 1.0);
  L[4,5] = 0.0;
  L[4,6] = 0.0;
  L[5,1] = (A[5,1]-(0.0))/L[1,1];
  L[5,2] = (A[5,2]-(L[5,1]*L[2,1]))/L[2,2];
  L[5,3] = (A[5,3]-(L[5,1]*L[3,1]+L[5,2]*L[3,2]))/L[3,3];
  L[5,4] = (A[5,4]-(L[5,1]*L[4,1]+L[5,2]*L[4,2]+L[5,3]*L[4,3]))/L[4,4];
  pivot[5] = A[5,5]-(L[5,1]*L[5,1]+L[5,2]*L[5,2]+L[5,3]*L[5,3]+L[5,4]*L[5,4]);
  L[5,5] = sqrt(if noEvent(pivot[5] > pivot_floor) then pivot[5] else 1.0);
  L[5,6] = 0.0;
  L[6,1] = (A[6,1]-(0.0))/L[1,1];
  L[6,2] = (A[6,2]-(L[6,1]*L[2,1]))/L[2,2];
  L[6,3] = (A[6,3]-(L[6,1]*L[3,1]+L[6,2]*L[3,2]))/L[3,3];
  L[6,4] = (A[6,4]-(L[6,1]*L[4,1]+L[6,2]*L[4,2]+L[6,3]*L[4,3]))/L[4,4];
  L[6,5] = (A[6,5]-(L[6,1]*L[5,1]+L[6,2]*L[5,2]+L[6,3]*L[5,3]+L[6,4]*L[5,4]))/L[5,5];
  pivot[6] = A[6,6]-(L[6,1]*L[6,1]+L[6,2]*L[6,2]+L[6,3]*L[6,3]+L[6,4]*L[6,4]+L[6,5]*L[6,5]);
  L[6,6] = sqrt(if noEvent(pivot[6] > pivot_floor) then pivot[6] else 1.0);
  valid = if noEvent(symmetry_errors < 0.5 and
    pivot[1] > pivot_floor and pivot[2] > pivot_floor and pivot[3] > pivot_floor and pivot[4] > pivot_floor and pivot[5] > pivot_floor and pivot[6] > pivot_floor) then 1.0 else 0.0;
  for column in 1:16 loop
    Z[1,column] = (B[1,column]-(0.0))/L[1,1];
    Z[2,column] = (B[2,column]-(L[2,1]*Z[1,column]))/L[2,2];
    Z[3,column] = (B[3,column]-(L[3,1]*Z[1,column]+L[3,2]*Z[2,column]))/L[3,3];
    Z[4,column] = (B[4,column]-(L[4,1]*Z[1,column]+L[4,2]*Z[2,column]+L[4,3]*Z[3,column]))/L[4,4];
    Z[5,column] = (B[5,column]-(L[5,1]*Z[1,column]+L[5,2]*Z[2,column]+L[5,3]*Z[3,column]+L[5,4]*Z[4,column]))/L[5,5];
    Z[6,column] = (B[6,column]-(L[6,1]*Z[1,column]+L[6,2]*Z[2,column]+L[6,3]*Z[3,column]+L[6,4]*Z[4,column]+L[6,5]*Z[5,column]))/L[6,6];
    solution[6,column] = (Z[6,column]-(0.0))/L[6,6];
    solution[5,column] = (Z[5,column]-(L[6,5]*solution[6,column]))/L[5,5];
    solution[4,column] = (Z[4,column]-(L[5,4]*solution[5,column]+L[6,4]*solution[6,column]))/L[4,4];
    solution[3,column] = (Z[3,column]-(L[4,3]*solution[4,column]+L[5,3]*solution[5,column]+L[6,3]*solution[6,column]))/L[3,3];
    solution[2,column] = (Z[2,column]-(L[3,2]*solution[3,column]+L[4,2]*solution[4,column]+L[5,2]*solution[5,column]+L[6,2]*solution[6,column]))/L[2,2];
    solution[1,column] = (Z[1,column]-(L[2,1]*solution[2,column]+L[3,1]*solution[3,column]+L[4,1]*solution[4,column]+L[5,1]*solution[5,column]+L[6,1]*solution[6,column]))/L[1,1];
    for i in 1:6 loop
      X[i,column] = if noEvent(valid > 0.5) then solution[i,column] else 0.0;
    end for;
  end for;
end SPD6Solve;

// One complete ES15 pose-observation correction, matching ErrorStateFilter.correct_pose.
// World-additive p/v, right-local theta, body accel/gyro biases; Hamilton wxyz output.
// Compile this source together with SPD6Solve.mo for ES15CorrectionSolve below.
// Same-frame Modelica composition (no host numerical solve):
// 1. ES15CorrectionSolve(A=observation_covariance,B=zeros) supplies its valid flag.
// 2. Evaluate this component's innovation_covariance/solve_rhs from the prior state.
// 3. ES15CorrectionSolve(A=innovation_covariance,B=solve_rhs) supplies solved/solve_valid.
// 4. Reevaluate this component with those results; commit only its final next outputs.
// The preview uses solve_valid=0; never feed its diagnostics back as another observation.
// The caller supplies a finite valid nominal state and symmetric positive-definite P.
// Covariance inputs have no replacement/default covariance. Feed every entry per frame.
// WASM's finite-value input boundary rejects NaN/Infinity before this numerical component.
// Outputs are a proposed next frame: rejection preserves every nominal/P entry.
model ES15PoseCorrection
  input Real rotation[3,3] = identity(3);
  input Real position[3] = {0.0,0.0,0.0};
  input Real velocity[3] = {0.0,0.0,0.0};
  input Real accel_bias[3] = {0.0,0.0,0.0};
  input Real gyro_bias[3] = {0.0,0.0,0.0};
  input Real covariance[15,15];
  input Real observed_rotation[3,3] = identity(3);
  input Real observed_position[3] = {0.0,0.0,0.0};
  input Real observation_covariance[6,6];
  input Real solved[6,16];
  input Real solve_valid = 0.0;
  input Real observation_covariance_valid = 0.0;
  input Real accepted_count = 0.0;
  input Real rejected_count = 0.0;
  input Real last_nis = 0.0;
  output Real accepted;
  output Real next_accepted_count; output Real next_rejected_count; output Real next_last_nis;
  output Real next_position[3]; output Real next_velocity[3];
  output Real next_accel_bias[3]; output Real next_gyro_bias[3];
  output Real next_rotation[3,3]; output Real next_quaternion[4];
  output Real next_covariance[15,15];
  output Real H[6,15]; output Real cross_covariance[15,6];
  output Real innovation_covariance[6,6]; output Real solve_rhs[6,16];
  output Real innovation[6]; output Real gain[15,6]; output Real correction[15];
  output Real joseph_covariance[15,15];
protected
  Real gram[3,3]; Real rotation_checks[3,3]; Real determinant;
  Real admissible; Real raw_nis; Real correction_checks[15];
  Real relative[3,3]; Real angle; Real antisymmetric[3]; Real log_scale;
  Real relative_raw_q[4]; Real relative_q[4]; Real relative_q_norm;
  Real relative_q_sine; Real relative_q_scale;
  Real qr; Real qx; Real qy; Real qz;
  Real delta_angle; Real a; Real b; Real W[3,3]; Real increment[3,3];
  Real proposed_rotation[3,3]; Real proposed_accel_bias[3]; Real proposed_gyro_bias[3];
  Real residual_map[15,15]; Real left[15,15]; Real noise_left[15,6];
  Real reset_a; Real reset_b; Real reset_jacobian[3,3];
  Real reset_left[15,15]; Real reset_proposed[15,15];
  Real output_raw_q[4]; Real output_q_norm; Real ow; Real ox; Real oy; Real oz;
equation
  gram = transpose(observed_rotation)*observed_rotation;
  determinant = observed_rotation[1,1]*(observed_rotation[2,2]*observed_rotation[3,3]-observed_rotation[2,3]*observed_rotation[3,2])
              - observed_rotation[1,2]*(observed_rotation[2,1]*observed_rotation[3,3]-observed_rotation[2,3]*observed_rotation[3,1])
              + observed_rotation[1,3]*(observed_rotation[2,1]*observed_rotation[3,2]-observed_rotation[2,2]*observed_rotation[3,1]);
  for i in 1:3 loop
    for j in 1:3 loop
      rotation_checks[i,j] = if noEvent(abs(gram[i,j]-(if i == j then 1.0 else 0.0)) <= 1e-6) then 0.0 else 1.0;
    end for;
  end for;
  admissible = if noEvent(sum(rotation_checks[i,j] for i in 1:3, j in 1:3) < 0.5 and abs(determinant-1.0) <= 1e-6 and observation_covariance_valid > 0.5) then 1.0 else 0.0;
  relative = transpose(rotation)*observed_rotation;
  angle = acos(min(1.0,max(-1.0,(relative[1,1]+relative[2,2]+relative[3,3]-1.0)/2.0)));
  antisymmetric = {relative[3,2]-relative[2,3],relative[1,3]-relative[3,1],relative[2,1]-relative[1,2]};
  // Stable dominant-component Hamilton quaternion, including the pi branch.
  qr = 2.0*sqrt(max(0.0,1.0+relative[1,1]+relative[2,2]+relative[3,3]));
  qx = 2.0*sqrt(max(0.0,1.0+relative[1,1]-relative[2,2]-relative[3,3]));
  qy = 2.0*sqrt(max(0.0,1.0-relative[1,1]+relative[2,2]-relative[3,3]));
  qz = 2.0*sqrt(max(0.0,1.0-relative[1,1]-relative[2,2]+relative[3,3]));
  relative_raw_q = if noEvent(relative[1,1]+relative[2,2]+relative[3,3] > 0.0) then
      {qr/4.0,antisymmetric[1]/max(qr,1e-12),antisymmetric[2]/max(qr,1e-12),antisymmetric[3]/max(qr,1e-12)}
    elseif noEvent(relative[1,1] > relative[2,2] and relative[1,1] > relative[3,3]) then
      {antisymmetric[1]/max(qx,1e-12),qx/4.0,(relative[1,2]+relative[2,1])/max(qx,1e-12),(relative[1,3]+relative[3,1])/max(qx,1e-12)}
    elseif noEvent(relative[2,2] > relative[3,3]) then
      {antisymmetric[2]/max(qy,1e-12),(relative[1,2]+relative[2,1])/max(qy,1e-12),qy/4.0,(relative[2,3]+relative[3,2])/max(qy,1e-12)}
    else {antisymmetric[3]/max(qz,1e-12),(relative[1,3]+relative[3,1])/max(qz,1e-12),(relative[2,3]+relative[3,2])/max(qz,1e-12),qz/4.0};
  relative_q_norm = sqrt(sum(relative_raw_q[k]^2 for k in 1:4));
  relative_q = (if noEvent(relative_raw_q[1] < 0.0) then -1.0 else 1.0)*relative_raw_q/max(relative_q_norm,1e-12);
  relative_q_sine = sqrt(relative_q[2]^2+relative_q[3]^2+relative_q[4]^2);
  relative_q_scale = 2.0*atan2(relative_q_sine,relative_q[1])/max(relative_q_sine,1e-12);
  log_scale = if noEvent(angle < 1e-7) then 0.5 else angle/(2.0*max(sin(angle),1e-12));
  for i in 1:3 loop
    innovation[i] = observed_position[i]-position[i];
    innovation[i+3] = if noEvent(angle < 3.141592653589793-1e-5) then log_scale*antisymmetric[i] else relative_q_scale*relative_q[i+1];
  end for;
  for i in 1:6 loop
    for j in 1:15 loop
      H[i,j] = if i <= 3 and j == i or i > 3 and j == i+3 then 1.0 else 0.0;
      solve_rhs[i,j] = cross_covariance[j,i];
    end for;
    solve_rhs[i,16] = innovation[i];
  end for;
  cross_covariance = covariance*transpose(H);
  innovation_covariance = H*cross_covariance+observation_covariance;
  for i in 1:15 loop
    for j in 1:6 loop
      gain[i,j] = solved[j,i];
    end for;
    correction[i] = sum(gain[i,j]*innovation[j] for j in 1:6);
    correction_checks[i] = if noEvent(abs(correction[i]) <= 1.7976931348623157e308) then 0.0 else 1.0;
  end for;
  raw_nis = sum(innovation[i]*solved[i,16] for i in 1:6);
  next_last_nis = if noEvent(admissible > 0.5) then (if noEvent(abs(raw_nis) <= 1.7976931348623157e308) then raw_nis else 0.0) else last_nis;
  proposed_accel_bias = accel_bias+{correction[10],correction[11],correction[12]};
  proposed_gyro_bias = gyro_bias+{correction[13],correction[14],correction[15]};
  accepted = if noEvent(admissible > 0.5 and solve_valid > 0.5 and raw_nis >= 0.0 and raw_nis <= 22.46 and
    innovation[4]^2+innovation[5]^2+innovation[6]^2 <= 0.35^2 and sum(correction_checks[i] for i in 1:15) < 0.5 and
    sum(proposed_accel_bias[i]^2 for i in 1:3) <= 2.0^2 and sum(proposed_gyro_bias[i]^2 for i in 1:3) <= 0.3^2) then 1.0 else 0.0;
  next_accepted_count = accepted_count+accepted;
  next_rejected_count = rejected_count+1.0-accepted;
  residual_map = identity(15)-gain*H;
  left = residual_map*covariance;
  noise_left = gain*observation_covariance;
  joseph_covariance = left*transpose(residual_map)+noise_left*transpose(gain);
  delta_angle = sqrt(correction[7]^2+correction[8]^2+correction[9]^2);
  a = if noEvent(delta_angle < 1e-7) then 1.0 else sin(delta_angle)/max(delta_angle,1e-7);
  b = if noEvent(delta_angle < 1e-7) then 0.5 else (1.0-cos(delta_angle))/max(delta_angle^2,1e-14);
  W = [0.0,-correction[9],correction[8];correction[9],0.0,-correction[7];-correction[8],correction[7],0.0];
  increment = identity(3)+a*W+b*(W*W);
  proposed_rotation = rotation*increment;
  // Exact right-local reset, including every p/v/bias-attitude cross term.
  reset_a = if noEvent(delta_angle < 1e-6) then 0.5 else (1.0-cos(delta_angle))/max(delta_angle^2,1e-12);
  reset_b = if noEvent(delta_angle < 1e-6) then 1.0/6.0 else (delta_angle-sin(delta_angle))/max(delta_angle^3,1e-18);
  reset_jacobian = identity(3)-reset_a*W+reset_b*(W*W);
  for j in 1:15 loop
    for i in 1:6 loop
      reset_left[i,j] = joseph_covariance[i,j];
    end for;
    for i in 1:3 loop
      reset_left[i+6,j] = sum(reset_jacobian[i,k]*joseph_covariance[k+6,j] for k in 1:3);
    end for;
    for i in 10:15 loop
      reset_left[i,j] = joseph_covariance[i,j];
    end for;
  end for;
  for i in 1:15 loop
    for j in 1:6 loop
      reset_proposed[i,j] = reset_left[i,j];
    end for;
    for j in 1:3 loop
      reset_proposed[i,j+6] = sum(reset_left[i,k+6]*reset_jacobian[j,k] for k in 1:3);
    end for;
    for j in 10:15 loop
      reset_proposed[i,j] = reset_left[i,j];
    end for;
  end for;
  for i in 1:3 loop
    next_position[i] = if noEvent(accepted > 0.5) then position[i]+correction[i] else position[i];
    next_velocity[i] = if noEvent(accepted > 0.5) then velocity[i]+correction[i+3] else velocity[i];
    next_accel_bias[i] = if noEvent(accepted > 0.5) then proposed_accel_bias[i] else accel_bias[i];
    next_gyro_bias[i] = if noEvent(accepted > 0.5) then proposed_gyro_bias[i] else gyro_bias[i];
    for j in 1:3 loop
      next_rotation[i,j] = if noEvent(accepted > 0.5) then proposed_rotation[i,j] else rotation[i,j];
    end for;
  end for;
  for i in 1:15 loop
    for j in 1:15 loop
      next_covariance[i,j] = if noEvent(accepted > 0.5) then 0.5*(reset_proposed[i,j]+reset_proposed[j,i]) else covariance[i,j];
    end for;
  end for;
  ow = 2.0*sqrt(max(0.0,1.0+next_rotation[1,1]+next_rotation[2,2]+next_rotation[3,3]));
  ox = 2.0*sqrt(max(0.0,1.0+next_rotation[1,1]-next_rotation[2,2]-next_rotation[3,3]));
  oy = 2.0*sqrt(max(0.0,1.0-next_rotation[1,1]+next_rotation[2,2]-next_rotation[3,3]));
  oz = 2.0*sqrt(max(0.0,1.0-next_rotation[1,1]-next_rotation[2,2]+next_rotation[3,3]));
  output_raw_q = if noEvent(next_rotation[1,1]+next_rotation[2,2]+next_rotation[3,3] > 0.0) then
      {ow/4.0,(next_rotation[3,2]-next_rotation[2,3])/max(ow,1e-12),(next_rotation[1,3]-next_rotation[3,1])/max(ow,1e-12),(next_rotation[2,1]-next_rotation[1,2])/max(ow,1e-12)}
    elseif noEvent(next_rotation[1,1] > next_rotation[2,2] and next_rotation[1,1] > next_rotation[3,3]) then
      {(next_rotation[3,2]-next_rotation[2,3])/max(ox,1e-12),ox/4.0,(next_rotation[1,2]+next_rotation[2,1])/max(ox,1e-12),(next_rotation[1,3]+next_rotation[3,1])/max(ox,1e-12)}
    elseif noEvent(next_rotation[2,2] > next_rotation[3,3]) then
      {(next_rotation[1,3]-next_rotation[3,1])/max(oy,1e-12),(next_rotation[1,2]+next_rotation[2,1])/max(oy,1e-12),oy/4.0,(next_rotation[2,3]+next_rotation[3,2])/max(oy,1e-12)}
    else {(next_rotation[2,1]-next_rotation[1,2])/max(oz,1e-12),(next_rotation[1,3]+next_rotation[3,1])/max(oz,1e-12),(next_rotation[2,3]+next_rotation[3,2])/max(oz,1e-12),oz/4.0};
  output_q_norm = sqrt(sum(output_raw_q[k]^2 for k in 1:4));
  next_quaternion = (if noEvent(output_raw_q[1] < 0.0) then -1.0 else 1.0)*output_raw_q/max(output_q_norm,1e-12);
end ES15PoseCorrection;

// The reference uses strict positive definiteness, without a teaching pivot floor.
// All symmetry checks, rejected solves, and sixteen RHS stay in SPD6Solve.
model ES15CorrectionSolve
  extends SPD6Solve(pivot_floor=0.0);
end ES15CorrectionSolve;

// A correlated, frozen reference pose is a Schmidt state, not pose truth.
// World-additive p/v; right-local body attitude; current state order p,v,theta,ba,bg.
// Registration maps reference optical points to current optical coordinates.
// Compile with RGBDRelativePose.mo, ES15PoseCorrection.mo and SPD6Solve.mo.
// These components are under numerical review; the production preset is unchanged.
// Sequential validation only: tolerance jitter never enters retained covariance.
// The function owns factor ordering instead of a cyclic equation-form factor graph.
function SLAMCovariancePSDCheck
  input Real covariance[:,:];
  input Real relativeTolerance;
  output Real valid;
protected
  Real scale;
  Real pivot;
  Real diagonalScale;
  Real diagonalSum;
  Real offDiagonalSum;
  Real lower[size(covariance,1),size(covariance,1)];
algorithm
  diagonalScale := 0.0;
  diagonalSum := 0.0;
  offDiagonalSum := 0.0;
  for i in 1:size(covariance,1) loop
    diagonalScale := diagonalScale+abs(covariance[i,i]);
  end for;
  scale := max(1.0,diagonalScale);
  lower := zeros(size(covariance,1),size(covariance,1));
  pivot := 0.0;
  valid := if size(covariance,1) == size(covariance,2) then 1.0 else 0.0;
  for i in 1:size(covariance,1) loop
    for j in 1:size(covariance,1) loop
      offDiagonalSum := 0.0;
      diagonalSum := 0.0;
      // Ordered finite accumulation; no array-valued comprehension temporary.
      for k in 1:size(covariance,1) loop
        offDiagonalSum := offDiagonalSum+(if k < j then lower[i,k]*lower[j,k] else 0.0);
        diagonalSum := diagonalSum+(if k < i then lower[i,k]^2 else 0.0);
      end for;
      if not (abs(covariance[i,j]) <= 1e12 and
          abs(covariance[i,j]-covariance[j,i]) <= relativeTolerance*scale) then
        valid := 0.0;
      end if;
      if j < i then
        lower[i,j] := (covariance[i,j]-offDiagonalSum)
          /max(lower[j,j],1e-150);
      elseif j == i then
        pivot := covariance[i,i]+relativeTolerance*scale
          -diagonalSum;
        if not (pivot > 0.0 and pivot <= 1e12) then valid := 0.0; end if;
        lower[i,j] := sqrt(if pivot > 0.0 then pivot else 1.0);
      end if;
    end for;
  end for;
end SLAMCovariancePSDCheck;

model SLAMCovariancePSD
  parameter Integer dimension = 21;
  parameter Real relativeTolerance = 1e-12;
  input Real covariance[dimension,dimension];
  output Real valid;
equation
  valid = SLAMCovariancePSDCheck(covariance,relativeTolerance);
end SLAMCovariancePSD;

// Signed wxyz coordinates of the existing rotation logarithm. The raw-normalized
// quaternion remains observable even when valid is zero; callers own its fallback.
function SLAMRotationCoordinates
  input Real rotation[3,3];
  output Real vector[3];
  output Real angle;
  output Real valid;
  output Real quaternion[4];
protected
  Real candidate[4];
  Real raw[4];
  Real norm;
  Real sine;
  Real scale;
algorithm
  candidate := {2.0*sqrt(max(0.0,1.0+rotation[1,1]+rotation[2,2]+rotation[3,3])),
    2.0*sqrt(max(0.0,1.0+rotation[1,1]-rotation[2,2]-rotation[3,3])),
    2.0*sqrt(max(0.0,1.0-rotation[1,1]+rotation[2,2]-rotation[3,3])),
    2.0*sqrt(max(0.0,1.0-rotation[1,1]-rotation[2,2]+rotation[3,3]))};
  raw := if noEvent(rotation[1,1]+rotation[2,2]+rotation[3,3] > 0.0) then
      {candidate[1]/4.0,(rotation[3,2]-rotation[2,3])/max(candidate[1],1e-12),
       (rotation[1,3]-rotation[3,1])/max(candidate[1],1e-12),
       (rotation[2,1]-rotation[1,2])/max(candidate[1],1e-12)}
    elseif noEvent(rotation[1,1] > rotation[2,2] and rotation[1,1] > rotation[3,3]) then
      {(rotation[3,2]-rotation[2,3])/max(candidate[2],1e-12),candidate[2]/4.0,
       (rotation[1,2]+rotation[2,1])/max(candidate[2],1e-12),
       (rotation[1,3]+rotation[3,1])/max(candidate[2],1e-12)}
    elseif noEvent(rotation[2,2] > rotation[3,3]) then
      {(rotation[1,3]-rotation[3,1])/max(candidate[3],1e-12),
       (rotation[1,2]+rotation[2,1])/max(candidate[3],1e-12),candidate[3]/4.0,
       (rotation[2,3]+rotation[3,2])/max(candidate[3],1e-12)}
    else {(rotation[2,1]-rotation[1,2])/max(candidate[4],1e-12),
       (rotation[1,3]+rotation[3,1])/max(candidate[4],1e-12),
       (rotation[2,3]+rotation[3,2])/max(candidate[4],1e-12),candidate[4]/4.0};
  norm := sqrt(sum(raw.^2));
  quaternion := (if noEvent(raw[1] < 0.0) then -1.0 else 1.0)*raw/max(norm,1e-12);
  sine := sqrt(sum(quaternion[i]^2 for i in 2:4));
  angle := 2.0*atan2(sine,quaternion[1]);
  scale := if noEvent(sine < 1e-8) then 2.0 else angle/max(sine,1e-12);
  valid := RGBDProperRotationValue(rotation);
  for i in 1:3 loop
    vector[i] := if noEvent(valid > 0.5) then scale*quaternion[i+1] else 0.0;
  end for;
end SLAMRotationCoordinates;

model SLAMRotationLog
  constant Integer spaceDimension = 3;
  constant Integer quaternionDimension = 4;
  input Real rotation[spaceDimension,spaceDimension] = identity(spaceDimension);
  output Real vector[spaceDimension];
  output Real angle;
  output Real valid;
protected
  RGBDProperRotation rotationCheck(rotation=rotation);
  Real candidate[quaternionDimension];
  Real raw[quaternionDimension];
  Real quaternion[quaternionDimension];
  Real norm;
  Real sine;
  Real scale;
equation
  candidate = {2.0*sqrt(max(0.0,1.0+rotation[1,1]+rotation[2,2]+rotation[3,3])),
    2.0*sqrt(max(0.0,1.0+rotation[1,1]-rotation[2,2]-rotation[3,3])),
    2.0*sqrt(max(0.0,1.0-rotation[1,1]+rotation[2,2]-rotation[3,3])),
    2.0*sqrt(max(0.0,1.0-rotation[1,1]-rotation[2,2]+rotation[3,3]))};
  raw = if noEvent(rotation[1,1]+rotation[2,2]+rotation[3,3] > 0.0) then
      {candidate[1]/4.0,(rotation[3,2]-rotation[2,3])/max(candidate[1],1e-12),
       (rotation[1,3]-rotation[3,1])/max(candidate[1],1e-12),
       (rotation[2,1]-rotation[1,2])/max(candidate[1],1e-12)}
    elseif noEvent(rotation[1,1] > rotation[2,2] and rotation[1,1] > rotation[3,3]) then
      {(rotation[3,2]-rotation[2,3])/max(candidate[2],1e-12),candidate[2]/4.0,
       (rotation[1,2]+rotation[2,1])/max(candidate[2],1e-12),
       (rotation[1,3]+rotation[3,1])/max(candidate[2],1e-12)}
    elseif noEvent(rotation[2,2] > rotation[3,3]) then
      {(rotation[1,3]-rotation[3,1])/max(candidate[3],1e-12),
       (rotation[1,2]+rotation[2,1])/max(candidate[3],1e-12),candidate[3]/4.0,
       (rotation[2,3]+rotation[3,2])/max(candidate[3],1e-12)}
    else {(rotation[2,1]-rotation[1,2])/max(candidate[4],1e-12),
       (rotation[1,3]+rotation[3,1])/max(candidate[4],1e-12),
       (rotation[2,3]+rotation[3,2])/max(candidate[4],1e-12),candidate[4]/4.0};
  norm = sqrt(sum(raw.^2));
  quaternion = (if noEvent(raw[1] < 0.0) then -1.0 else 1.0)*raw/max(norm,1e-12);
  sine = sqrt(sum(quaternion[i]^2 for i in 2:quaternionDimension));
  angle = 2.0*atan2(sine,quaternion[1]);
  scale = if noEvent(sine < 1e-8) then 2.0 else angle/max(sine,1e-12);
  valid = rotationCheck.valid;
  for i in 1:spaceDimension loop
    vector[i] = if noEvent(valid > 0.5) then scale*quaternion[i+1] else 0.0;
  end for;
end SLAMRotationLog;

model SchmidtRelativePoseCorrection
  constant Integer spaceDimension = 3;
  constant Integer errorDimension = 15;
  constant Integer poseDimension = 2*spaceDimension;
  constant Integer augmentedDimension = errorDimension+poseDimension;
  parameter Real maximumNis = 22.46;
  parameter Real maximumAngularInnovation = 0.35;
  input Real position[spaceDimension] = zeros(spaceDimension);
  input Real velocity[spaceDimension] = zeros(spaceDimension);
  input Real rotation[spaceDimension,spaceDimension] = identity(spaceDimension);
  input Real accelBias[spaceDimension] = zeros(spaceDimension);
  input Real gyroBias[spaceDimension] = zeros(spaceDimension);
  input Real covariance[errorDimension,errorDimension] = identity(errorDimension);
  input Real referencePosition[spaceDimension] = zeros(spaceDimension);
  input Real referenceRotation[spaceDimension,spaceDimension] = identity(spaceDimension);
  input Real referenceCovariance[poseDimension,poseDimension] = identity(poseDimension);
  input Real crossCovariance[errorDimension,poseDimension] = zeros(errorDimension,poseDimension);
  input Real opticalToBody[spaceDimension,spaceDimension] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[spaceDimension] = {0.18,0.0,-0.04};
  input Real measuredRotation[spaceDimension,spaceDimension] = identity(spaceDimension);
  input Real measuredTranslation[spaceDimension] = zeros(spaceDimension);
  // Covariance of independent translation / left-current-optical rotation errors.
  input Real relativeCovariance[poseDimension,poseDimension] = identity(poseDimension);
  input Real measurementEnabled = 0.0;
  output Real accepted;
  output Real nis;
  output Real innovation[poseDimension];
  output Real measurementJacobian[poseDimension,augmentedDimension];
  output Real innovationCovariance[poseDimension,poseDimension];
  output Real nextPosition[spaceDimension];
  output Real nextVelocity[spaceDimension];
  output Real nextRotation[spaceDimension,spaceDimension];
  output Real nextAccelBias[spaceDimension];
  output Real nextGyroBias[spaceDimension];
  output Real nextCovariance[errorDimension,errorDimension];
  output Real nextCrossCovariance[errorDimension,poseDimension];
  output Real nextReferenceCovariance[poseDimension,poseDimension];
protected
  RGBDProperRotation currentCheck(rotation=rotation);
  RGBDProperRotation referenceCheck(rotation=referenceRotation);
  RGBDProperRotation extrinsicsCheck(rotation=opticalToBody);
  RGBDProperRotation measuredCheck(rotation=measuredRotation);
  Real currentCameraTranspose[spaceDimension,spaceDimension];
  Real displacementBody[spaceDimension];
  Real predictedRotation[spaceDimension,spaceDimension];
  Real predictedTranslation[spaceDimension];
  SLAMRotationLog logarithm(rotation=transpose(predictedRotation)*measuredRotation);
  Real skewDisplacement[spaceDimension,spaceDimension];
  Real skewOrigin[spaceDimension,spaceDimension];
  Real skewInnovation[spaceDimension,spaceDimension];
  Real inverseLeft[spaceDimension,spaceDimension];
  Real inverseRight[spaceDimension,spaceDimension];
  Real jacobianCoefficient;
  Real currentTranslationAngle[spaceDimension,spaceDimension];
  Real referenceTranslationAngle[spaceDimension,spaceDimension];
  Real currentRotationAngle[spaceDimension,spaceDimension];
  Real referenceRotationAngle[spaceDimension,spaceDimension];
  Real noiseMap[poseDimension,poseDimension];
  Real noiseRotation[spaceDimension,spaceDimension];
  Real noise[poseDimension,poseDimension];
  Real prior[augmentedDimension,augmentedDimension];
  // The component's default dimension is exactly21. Rebinding it to an equal
  // constant would introduce an unnecessary parameter-initialization owner.
  SLAMCovariancePSD priorCheck(covariance=prior);
  ES15CorrectionSolve noiseCheck(A=relativeCovariance,B=zeros(poseDimension,errorDimension+1));
  Real cross[augmentedDimension,poseDimension];
  Real rhs[poseDimension,errorDimension+1];
  ES15CorrectionSolve solve(A=innovationCovariance,B=rhs);
  Real gain[augmentedDimension,poseDimension];
  Real correction[errorDimension];
  Real residualMap[augmentedDimension,augmentedDimension];
  Real joseph[augmentedDimension,augmentedDimension];
  Real reset[augmentedDimension,augmentedDimension];
  Real resetCovariance[augmentedDimension,augmentedDimension];
  Real injectedRotation[spaceDimension,spaceDimension];
  Real increment[spaceDimension,spaceDimension];
  Real skewCorrection[spaceDimension,spaceDimension];
  Real correctionAngle;
  Real sineCoefficient;
  Real cosineCoefficient;
  Real resetCoefficient;
  Real skewCorrectionSquared[spaceDimension,spaceDimension];
  Real finiteChecks[augmentedDimension,augmentedDimension];
  Real geometryChecks[spaceDimension];
equation
  currentCameraTranspose = transpose(opticalToBody)*transpose(rotation);
  displacementBody = transpose(rotation)*(referencePosition-position+referenceRotation*cameraOriginBody);
  predictedRotation = currentCameraTranspose*referenceRotation*opticalToBody;
  predictedTranslation = transpose(opticalToBody)*(displacementBody-cameraOriginBody);
  innovation = cat(1,measuredTranslation-predictedTranslation,logarithm.vector);
  skewDisplacement = [0.0,-displacementBody[3],displacementBody[2];displacementBody[3],0.0,-displacementBody[1];-displacementBody[2],displacementBody[1],0.0];
  skewOrigin = [0.0,-cameraOriginBody[3],cameraOriginBody[2];cameraOriginBody[3],0.0,-cameraOriginBody[1];-cameraOriginBody[2],cameraOriginBody[1],0.0];
  skewInnovation = [0.0,-innovation[6],innovation[5];innovation[6],0.0,-innovation[4];-innovation[5],innovation[4],0.0];
  jacobianCoefficient = if noEvent(logarithm.angle < 1e-4) then
      1.0/12.0+logarithm.angle^2/720.0
    else (1.0-0.5*logarithm.angle*cos(0.5*logarithm.angle)/max(sin(0.5*logarithm.angle),1e-12))/max(logarithm.angle^2,1e-12);
  inverseLeft = identity(spaceDimension)-0.5*skewInnovation+jacobianCoefficient*(skewInnovation*skewInnovation);
  inverseRight = identity(spaceDimension)+0.5*skewInnovation+jacobianCoefficient*(skewInnovation*skewInnovation);
  currentTranslationAngle = transpose(opticalToBody)*skewDisplacement;
  referenceTranslationAngle = -currentCameraTranspose*referenceRotation*skewOrigin;
  currentRotationAngle = -inverseLeft*transpose(predictedRotation)*transpose(opticalToBody);
  referenceRotationAngle = inverseLeft*transpose(opticalToBody);
  noiseRotation = inverseRight*transpose(measuredRotation);
  // Explicit blocks keep every coordinate valid even during structural projection.
  // H = -d(innovation)/d(error); columns are p,v,theta,ba,bg,p_ref,theta_ref.
  measurementJacobian = cat(1,
    cat(2,-currentCameraTranspose,zeros(3,3),currentTranslationAngle,
      zeros(3,6),currentCameraTranspose,referenceTranslationAngle),
    cat(2,zeros(3,6),currentRotationAngle,zeros(3,9),referenceRotationAngle));
  noiseMap = cat(1,cat(2,identity(3),zeros(3,3)),
    cat(2,zeros(3,3),noiseRotation));
  prior = cat(1,cat(2,covariance,crossCovariance),cat(2,transpose(crossCovariance),referenceCovariance));
  cross = prior*transpose(measurementJacobian);
  noise = noiseMap*relativeCovariance*transpose(noiseMap);
  innovationCovariance = measurementJacobian*cross+noise;
  for i in 1:poseDimension loop
    for j in 1:errorDimension loop
      rhs[i,j] = cross[j,i];
    end for;
    rhs[i,errorDimension+1] = innovation[i];
  end for;
  // Schmidt gain: reference uncertainty enters S, but reference gain is zero.
  gain = cat(1,transpose(solve.X[:,1:errorDimension]),zeros(poseDimension,poseDimension));
  correction = gain[1:errorDimension,:]*innovation;
  nis = sum(innovation[i]*solve.X[i,errorDimension+1] for i in 1:poseDimension);
  residualMap = identity(augmentedDimension)-gain*measurementJacobian;
  joseph = residualMap*prior*transpose(residualMap)+gain*noise*transpose(gain);
  skewCorrection = [0.0,-correction[9],correction[8];correction[9],0.0,-correction[7];-correction[8],correction[7],0.0];
  correctionAngle = sqrt(sum(correction[i]^2 for i in 7:9));
  sineCoefficient = if noEvent(correctionAngle < 1e-7) then 1.0 else sin(correctionAngle)/max(correctionAngle,1e-12);
  cosineCoefficient = if noEvent(correctionAngle < 1e-7) then 0.5 else (1.0-cos(correctionAngle))/max(correctionAngle^2,1e-12);
  resetCoefficient = if noEvent(correctionAngle < 1e-6) then 1.0/6.0 else (correctionAngle-sin(correctionAngle))/max(correctionAngle^3,1e-18);
  skewCorrectionSquared = skewCorrection*skewCorrection;
  increment = identity(spaceDimension)+sineCoefficient*skewCorrection+cosineCoefficient*skewCorrectionSquared;
  injectedRotation = rotation*increment;
  // Only current right-local attitude is reset; frozen reference tangent is unchanged.
  reset = cat(1,
    cat(2,identity(6),zeros(6,15)),
    cat(2,zeros(3,6),identity(3)-cosineCoefficient*skewCorrection
      +resetCoefficient*skewCorrectionSquared,zeros(3,12)),
    cat(2,zeros(12,9),identity(12)));
  resetCovariance = reset*joseph*transpose(reset);
  for i in 1:augmentedDimension loop
    for j in 1:augmentedDimension loop
      finiteChecks[i,j] = if noEvent(abs(resetCovariance[i,j]) <= 1e12) then 0.0 else 1.0;
    end for;
  end for;
  for i in 1:spaceDimension loop
    geometryChecks[i] = if noEvent(abs(position[i]) <= 1e6 and abs(referencePosition[i]) <= 1e6
      and abs(velocity[i]) <= 1e6 and abs(cameraOriginBody[i]) <= 10.0
      and abs(measuredTranslation[i]) <= 1e6 and abs(correction[i]) <= 1e6
      and abs(correction[i+3]) <= 1e6
      and abs(accelBias[i]+correction[i+9]) <= 2.0
      and abs(gyroBias[i]+correction[i+12]) <= 0.3) then 0.0 else 1.0;
  end for;
  accepted = if noEvent(measurementEnabled >= 1.0 and measurementEnabled <= 1.0
    and maximumNis > 0.0 and maximumNis <= 1e6
    and maximumAngularInnovation > 0.0 and maximumAngularInnovation <= 1.0
    and currentCheck.valid > 0.5 and referenceCheck.valid > 0.5
    and extrinsicsCheck.valid > 0.5 and measuredCheck.valid > 0.5 and logarithm.valid > 0.5
    and priorCheck.valid > 0.5 and noiseCheck.valid > 0.5 and solve.valid > 0.5
    and nis >= 0.0 and nis <= maximumNis and logarithm.angle <= maximumAngularInnovation
    and sum(finiteChecks) < 0.5 and sum(geometryChecks) < 0.5) then 1.0 else 0.0;
  nextPosition = if noEvent(accepted > 0.5) then position+correction[1:3] else position;
  nextVelocity = if noEvent(accepted > 0.5) then velocity+correction[4:6] else velocity;
  nextRotation = if noEvent(accepted > 0.5) then injectedRotation else rotation;
  nextAccelBias = if noEvent(accepted > 0.5) then accelBias+correction[10:12] else accelBias;
  nextGyroBias = if noEvent(accepted > 0.5) then gyroBias+correction[13:15] else gyroBias;
  for i in 1:errorDimension loop
    for j in 1:errorDimension loop
      nextCovariance[i,j] = if noEvent(accepted > 0.5) then
        0.5*(resetCovariance[i,j]+resetCovariance[j,i]) else covariance[i,j];
    end for;
    for j in 1:poseDimension loop
      nextCrossCovariance[i,j] = if noEvent(accepted > 0.5) then
        resetCovariance[i,errorDimension+j] else crossCovariance[i,j];
    end for;
  end for;
  // Schmidt gain/reset leave this block and the retained reference pose unchanged.
  nextReferenceCovariance = referenceCovariance;
end SchmidtRelativePoseCorrection;

// Exact ES15CorrectionSolve (SPD6Solve with pivot_floor=0) algorithm form.
// All original row formulas and RHS solve association are retained.
function SchmidtCorrectionSolve
  input Real pivot_floor = 0.0;
  input Real symmetry_absolute = 1e-12;
  input Real symmetry_relative = 1e-8;
  input Real A[poseDimension,poseDimension] = identity(poseDimension);
  input Real B[poseDimension,rhsDimension] = fill(0.0,poseDimension,rhsDimension);
  output Real X[poseDimension,rhsDimension];
  output Real valid;
protected
  constant Integer poseDimension = 6;
  constant Integer rhsDimension = 16;
  Real L[poseDimension,poseDimension]; Real pivot[poseDimension]; Real Z[poseDimension,rhsDimension]; Real solution[poseDimension,rhsDimension];
  Real symmetryChecks[poseDimension,poseDimension]; Real symmetry_errors;
algorithm
  for i in 1:poseDimension loop
    for j in 1:poseDimension loop
      symmetryChecks[i,j] := if noEvent(abs(A[i,j]-A[j,i]) <=
        symmetry_absolute+symmetry_relative*abs(A[j,i])) then 0.0 else 1.0;
    end for;
  end for;
  symmetry_errors := sum(symmetryChecks[i,j] for i in 1:poseDimension, j in 1:poseDimension);
  pivot[1] := A[1,1]-(0.0);
  L[1,1] := sqrt(if noEvent(pivot[1] > pivot_floor) then pivot[1] else 1.0);
  L[1,2] := 0.0;
  L[1,3] := 0.0;
  L[1,4] := 0.0;
  L[1,5] := 0.0;
  L[1,6] := 0.0;
  L[2,1] := (A[2,1]-(0.0))/L[1,1];
  pivot[2] := A[2,2]-(L[2,1]*L[2,1]);
  L[2,2] := sqrt(if noEvent(pivot[2] > pivot_floor) then pivot[2] else 1.0);
  L[2,3] := 0.0;
  L[2,4] := 0.0;
  L[2,5] := 0.0;
  L[2,6] := 0.0;
  L[3,1] := (A[3,1]-(0.0))/L[1,1];
  L[3,2] := (A[3,2]-(L[3,1]*L[2,1]))/L[2,2];
  pivot[3] := A[3,3]-(L[3,1]*L[3,1]+L[3,2]*L[3,2]);
  L[3,3] := sqrt(if noEvent(pivot[3] > pivot_floor) then pivot[3] else 1.0);
  L[3,4] := 0.0;
  L[3,5] := 0.0;
  L[3,6] := 0.0;
  L[4,1] := (A[4,1]-(0.0))/L[1,1];
  L[4,2] := (A[4,2]-(L[4,1]*L[2,1]))/L[2,2];
  L[4,3] := (A[4,3]-(L[4,1]*L[3,1]+L[4,2]*L[3,2]))/L[3,3];
  pivot[4] := A[4,4]-(L[4,1]*L[4,1]+L[4,2]*L[4,2]+L[4,3]*L[4,3]);
  L[4,4] := sqrt(if noEvent(pivot[4] > pivot_floor) then pivot[4] else 1.0);
  L[4,5] := 0.0;
  L[4,6] := 0.0;
  L[5,1] := (A[5,1]-(0.0))/L[1,1];
  L[5,2] := (A[5,2]-(L[5,1]*L[2,1]))/L[2,2];
  L[5,3] := (A[5,3]-(L[5,1]*L[3,1]+L[5,2]*L[3,2]))/L[3,3];
  L[5,4] := (A[5,4]-(L[5,1]*L[4,1]+L[5,2]*L[4,2]+L[5,3]*L[4,3]))/L[4,4];
  pivot[5] := A[5,5]-(L[5,1]*L[5,1]+L[5,2]*L[5,2]+L[5,3]*L[5,3]+L[5,4]*L[5,4]);
  L[5,5] := sqrt(if noEvent(pivot[5] > pivot_floor) then pivot[5] else 1.0);
  L[5,6] := 0.0;
  L[6,1] := (A[6,1]-(0.0))/L[1,1];
  L[6,2] := (A[6,2]-(L[6,1]*L[2,1]))/L[2,2];
  L[6,3] := (A[6,3]-(L[6,1]*L[3,1]+L[6,2]*L[3,2]))/L[3,3];
  L[6,4] := (A[6,4]-(L[6,1]*L[4,1]+L[6,2]*L[4,2]+L[6,3]*L[4,3]))/L[4,4];
  L[6,5] := (A[6,5]-(L[6,1]*L[5,1]+L[6,2]*L[5,2]+L[6,3]*L[5,3]+L[6,4]*L[5,4]))/L[5,5];
  pivot[6] := A[6,6]-(L[6,1]*L[6,1]+L[6,2]*L[6,2]+L[6,3]*L[6,3]+L[6,4]*L[6,4]+L[6,5]*L[6,5]);
  L[6,6] := sqrt(if noEvent(pivot[6] > pivot_floor) then pivot[6] else 1.0);
  valid := if noEvent(symmetry_errors < 0.5 and
    pivot[1] > pivot_floor and pivot[2] > pivot_floor and pivot[3] > pivot_floor and pivot[4] > pivot_floor and pivot[5] > pivot_floor and pivot[6] > pivot_floor) then 1.0 else 0.0;
  for column in 1:rhsDimension loop
    Z[1,column] := (B[1,column]-(0.0))/L[1,1];
    Z[2,column] := (B[2,column]-(L[2,1]*Z[1,column]))/L[2,2];
    Z[3,column] := (B[3,column]-(L[3,1]*Z[1,column]+L[3,2]*Z[2,column]))/L[3,3];
    Z[4,column] := (B[4,column]-(L[4,1]*Z[1,column]+L[4,2]*Z[2,column]+L[4,3]*Z[3,column]))/L[4,4];
    Z[5,column] := (B[5,column]-(L[5,1]*Z[1,column]+L[5,2]*Z[2,column]+L[5,3]*Z[3,column]+L[5,4]*Z[4,column]))/L[5,5];
    Z[6,column] := (B[6,column]-(L[6,1]*Z[1,column]+L[6,2]*Z[2,column]+L[6,3]*Z[3,column]+L[6,4]*Z[4,column]+L[6,5]*Z[5,column]))/L[6,6];
    solution[6,column] := (Z[6,column]-(0.0))/L[6,6];
    solution[5,column] := (Z[5,column]-(L[6,5]*solution[6,column]))/L[5,5];
    solution[4,column] := (Z[4,column]-(L[5,4]*solution[5,column]+L[6,4]*solution[6,column]))/L[4,4];
    solution[3,column] := (Z[3,column]-(L[4,3]*solution[4,column]+L[5,3]*solution[5,column]+L[6,3]*solution[6,column]))/L[3,3];
    solution[2,column] := (Z[2,column]-(L[3,2]*solution[3,column]+L[4,2]*solution[4,column]+L[5,2]*solution[5,column]+L[6,2]*solution[6,column]))/L[2,2];
    solution[1,column] := (Z[1,column]-(L[2,1]*solution[2,column]+L[3,1]*solution[3,column]+L[4,1]*solution[4,column]+L[5,1]*solution[5,column]+L[6,1]*solution[6,column]))/L[1,1];
    for i in 1:poseDimension loop
      X[i,column] := if noEvent(valid > 0.5) then solution[i,column] else 0.0;
    end for;
  end for;
end SchmidtCorrectionSolve;

// Pure full15+6 Schmidt correction. Rejection preserves the complete input state;
// diagnostic arithmetic and all original gates remain observable on rejection.
function SchmidtCorrectRelativePose
  input Real position[spaceDimension] = zeros(spaceDimension);
  input Real velocity[spaceDimension] = zeros(spaceDimension);
  input Real rotation[spaceDimension,spaceDimension] = identity(spaceDimension);
  input Real accelBias[spaceDimension] = zeros(spaceDimension);
  input Real gyroBias[spaceDimension] = zeros(spaceDimension);
  input Real covariance[errorDimension,errorDimension] = identity(errorDimension);
  input Real referencePosition[spaceDimension] = zeros(spaceDimension);
  input Real referenceRotation[spaceDimension,spaceDimension] = identity(spaceDimension);
  input Real referenceCovariance[poseDimension,poseDimension] = identity(poseDimension);
  input Real crossCovariance[errorDimension,poseDimension] = zeros(errorDimension,poseDimension);
  input Real opticalToBody[spaceDimension,spaceDimension] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[spaceDimension] = {0.18,0.0,-0.04};
  input Real measuredRotation[spaceDimension,spaceDimension] = identity(spaceDimension);
  input Real measuredTranslation[spaceDimension] = zeros(spaceDimension);
  input Real relativeCovariance[poseDimension,poseDimension] = identity(poseDimension);
  input Real measurementEnabled = 0.0;
  input Real maximumNis = 22.46;
  input Real maximumAngularInnovation = 0.35;
  output Real accepted;
  output Real nis;
  output Real innovation[poseDimension];
  output Real measurementJacobian[poseDimension,augmentedDimension];
  output Real innovationCovariance[poseDimension,poseDimension];
  output Real nextPosition[spaceDimension];
  output Real nextVelocity[spaceDimension];
  output Real nextRotation[spaceDimension,spaceDimension];
  output Real nextAccelBias[spaceDimension];
  output Real nextGyroBias[spaceDimension];
  output Real nextCovariance[errorDimension,errorDimension];
  output Real nextCrossCovariance[errorDimension,poseDimension];
  output Real nextReferenceCovariance[poseDimension,poseDimension];
protected
  constant Integer spaceDimension = 3;
  constant Integer errorDimension = 15;
  constant Integer poseDimension = 2*spaceDimension;
  constant Integer augmentedDimension = errorDimension+poseDimension;
  Real currentCameraTranspose[spaceDimension,spaceDimension];
  Real displacementBody[spaceDimension];
  Real predictedRotation[spaceDimension,spaceDimension];
  Real predictedTranslation[spaceDimension];
  Real logarithmVector[spaceDimension]; Real logarithmAngle; Real logarithmValid; Real logarithmQuaternion[4];
  Real skewDisplacement[spaceDimension,spaceDimension];
  Real skewOrigin[spaceDimension,spaceDimension];
  Real skewInnovation[spaceDimension,spaceDimension];
  Real inverseLeft[spaceDimension,spaceDimension];
  Real inverseRight[spaceDimension,spaceDimension];
  Real jacobianCoefficient;
  Real currentTranslationAngle[spaceDimension,spaceDimension];
  Real referenceTranslationAngle[spaceDimension,spaceDimension];
  Real currentRotationAngle[spaceDimension,spaceDimension];
  Real referenceRotationAngle[spaceDimension,spaceDimension];
  Real noiseMap[poseDimension,poseDimension];
  Real noiseRotation[spaceDimension,spaceDimension];
  Real noise[poseDimension,poseDimension];
  Real prior[augmentedDimension,augmentedDimension];
  // The component's default dimension is exactly21. Rebinding it to an equal
  // constant would introduce an unnecessary parameter-initialization owner.
  Real priorCheckValid;
  Real noiseCheckValid; Real noiseSolution[poseDimension,errorDimension+1];
  Real cross[augmentedDimension,poseDimension];
  Real rhs[poseDimension,errorDimension+1];
  Real solveValid; Real solved[poseDimension,errorDimension+1];
  Real gain[augmentedDimension,poseDimension];
  Real correction[errorDimension];
  Real residualMap[augmentedDimension,augmentedDimension];
  Real joseph[augmentedDimension,augmentedDimension];
  Real reset[augmentedDimension,augmentedDimension];
  Real resetCovariance[augmentedDimension,augmentedDimension];
  Real injectedRotation[spaceDimension,spaceDimension];
  Real increment[spaceDimension,spaceDimension];
  Real skewCorrection[spaceDimension,spaceDimension];
  Real correctionAngle;
  Real sineCoefficient;
  Real cosineCoefficient;
  Real resetCoefficient;
  Real skewCorrectionSquared[spaceDimension,spaceDimension];
  Real finiteChecks[augmentedDimension,augmentedDimension];
  Real geometryChecks[spaceDimension];
  Real currentValid; Real referenceValid; Real extrinsicsValid; Real measuredValid;
algorithm
  currentValid := RGBDProperRotationValue(rotation);
  referenceValid := RGBDProperRotationValue(referenceRotation);
  extrinsicsValid := RGBDProperRotationValue(opticalToBody);
  measuredValid := RGBDProperRotationValue(measuredRotation);
  (noiseSolution,noiseCheckValid) := SchmidtCorrectionSolve(A=relativeCovariance,B=zeros(poseDimension,errorDimension+1));
  currentCameraTranspose := transpose(opticalToBody)*transpose(rotation);
  displacementBody := transpose(rotation)*(referencePosition-position+referenceRotation*cameraOriginBody);
  predictedRotation := currentCameraTranspose*referenceRotation*opticalToBody;
  predictedTranslation := transpose(opticalToBody)*(displacementBody-cameraOriginBody);
  (logarithmVector,logarithmAngle,logarithmValid,logarithmQuaternion) := SLAMRotationCoordinates(transpose(predictedRotation)*measuredRotation);
  innovation := cat(1,measuredTranslation-predictedTranslation,logarithmVector);
  skewDisplacement := [0.0,-displacementBody[3],displacementBody[2];displacementBody[3],0.0,-displacementBody[1];-displacementBody[2],displacementBody[1],0.0];
  skewOrigin := [0.0,-cameraOriginBody[3],cameraOriginBody[2];cameraOriginBody[3],0.0,-cameraOriginBody[1];-cameraOriginBody[2],cameraOriginBody[1],0.0];
  skewInnovation := [0.0,-innovation[6],innovation[5];innovation[6],0.0,-innovation[4];-innovation[5],innovation[4],0.0];
  jacobianCoefficient := if noEvent(logarithmAngle < 1e-4) then
      1.0/12.0+logarithmAngle^2/720.0
    else (1.0-0.5*logarithmAngle*cos(0.5*logarithmAngle)/max(sin(0.5*logarithmAngle),1e-12))/max(logarithmAngle^2,1e-12);
  inverseLeft := identity(spaceDimension)-0.5*skewInnovation+jacobianCoefficient*(skewInnovation*skewInnovation);
  inverseRight := identity(spaceDimension)+0.5*skewInnovation+jacobianCoefficient*(skewInnovation*skewInnovation);
  currentTranslationAngle := transpose(opticalToBody)*skewDisplacement;
  referenceTranslationAngle := -currentCameraTranspose*referenceRotation*skewOrigin;
  currentRotationAngle := -inverseLeft*transpose(predictedRotation)*transpose(opticalToBody);
  referenceRotationAngle := inverseLeft*transpose(opticalToBody);
  noiseRotation := inverseRight*transpose(measuredRotation);
  // Explicit blocks keep every coordinate valid even during structural projection.
  // H := -d(innovation)/d(error); columns are p,v,theta,ba,bg,p_ref,theta_ref.
  measurementJacobian := cat(1,
    cat(2,-currentCameraTranspose,zeros(3,3),currentTranslationAngle,
      zeros(3,6),currentCameraTranspose,referenceTranslationAngle),
    cat(2,zeros(3,6),currentRotationAngle,zeros(3,9),referenceRotationAngle));
  noiseMap := cat(1,cat(2,identity(3),zeros(3,3)),
    cat(2,zeros(3,3),noiseRotation));
  prior := cat(1,cat(2,covariance,crossCovariance),cat(2,transpose(crossCovariance),referenceCovariance));
  priorCheckValid := SLAMCovariancePSDCheck(prior,1e-12);
  cross := prior*transpose(measurementJacobian);
  noise := noiseMap*relativeCovariance*transpose(noiseMap);
  innovationCovariance := measurementJacobian*cross+noise;
  for i in 1:poseDimension loop
    for j in 1:errorDimension loop
      rhs[i,j] := cross[j,i];
    end for;
    rhs[i,errorDimension+1] := innovation[i];
  end for;
  (solved,solveValid) := SchmidtCorrectionSolve(A=innovationCovariance,B=rhs);
  // Schmidt gain: reference uncertainty enters S, but reference gain is zero.
  gain := cat(1,transpose(solved[:,1:errorDimension]),zeros(poseDimension,poseDimension));
  correction := gain[1:errorDimension,:]*innovation;
  nis := sum(innovation[i]*solved[i,errorDimension+1] for i in 1:poseDimension);
  residualMap := identity(augmentedDimension)-gain*measurementJacobian;
  joseph := residualMap*prior*transpose(residualMap)+gain*noise*transpose(gain);
  skewCorrection := [0.0,-correction[9],correction[8];correction[9],0.0,-correction[7];-correction[8],correction[7],0.0];
  correctionAngle := sqrt(sum(correction[i]^2 for i in 7:9));
  sineCoefficient := if noEvent(correctionAngle < 1e-7) then 1.0 else sin(correctionAngle)/max(correctionAngle,1e-12);
  cosineCoefficient := if noEvent(correctionAngle < 1e-7) then 0.5 else (1.0-cos(correctionAngle))/max(correctionAngle^2,1e-12);
  resetCoefficient := if noEvent(correctionAngle < 1e-6) then 1.0/6.0 else (correctionAngle-sin(correctionAngle))/max(correctionAngle^3,1e-18);
  skewCorrectionSquared := skewCorrection*skewCorrection;
  increment := identity(spaceDimension)+sineCoefficient*skewCorrection+cosineCoefficient*skewCorrectionSquared;
  injectedRotation := rotation*increment;
  // Only current right-local attitude is reset; frozen reference tangent is unchanged.
  reset := cat(1,
    cat(2,identity(6),zeros(6,15)),
    cat(2,zeros(3,6),identity(3)-cosineCoefficient*skewCorrection
      +resetCoefficient*skewCorrectionSquared,zeros(3,12)),
    cat(2,zeros(12,9),identity(12)));
  resetCovariance := reset*joseph*transpose(reset);
  for i in 1:augmentedDimension loop
    for j in 1:augmentedDimension loop
      finiteChecks[i,j] := if noEvent(abs(resetCovariance[i,j]) <= 1e12) then 0.0 else 1.0;
    end for;
  end for;
  for i in 1:spaceDimension loop
    geometryChecks[i] := if noEvent(abs(position[i]) <= 1e6 and abs(referencePosition[i]) <= 1e6
      and abs(velocity[i]) <= 1e6 and abs(cameraOriginBody[i]) <= 10.0
      and abs(measuredTranslation[i]) <= 1e6 and abs(correction[i]) <= 1e6
      and abs(correction[i+3]) <= 1e6
      and abs(accelBias[i]+correction[i+9]) <= 2.0
      and abs(gyroBias[i]+correction[i+12]) <= 0.3) then 0.0 else 1.0;
  end for;
  accepted := if noEvent(measurementEnabled >= 1.0 and measurementEnabled <= 1.0
    and maximumNis > 0.0 and maximumNis <= 1e6
    and maximumAngularInnovation > 0.0 and maximumAngularInnovation <= 1.0
    and currentValid > 0.5 and referenceValid > 0.5
    and extrinsicsValid > 0.5 and measuredValid > 0.5 and logarithmValid > 0.5
    and priorCheckValid > 0.5 and noiseCheckValid > 0.5 and solveValid > 0.5
    and nis >= 0.0 and nis <= maximumNis and logarithmAngle <= maximumAngularInnovation
    and sum(finiteChecks) < 0.5 and sum(geometryChecks) < 0.5) then 1.0 else 0.0;
  nextPosition := if noEvent(accepted > 0.5) then position+correction[1:3] else position;
  nextVelocity := if noEvent(accepted > 0.5) then velocity+correction[4:6] else velocity;
  nextRotation := if noEvent(accepted > 0.5) then injectedRotation else rotation;
  nextAccelBias := if noEvent(accepted > 0.5) then accelBias+correction[10:12] else accelBias;
  nextGyroBias := if noEvent(accepted > 0.5) then gyroBias+correction[13:15] else gyroBias;
  for i in 1:errorDimension loop
    for j in 1:errorDimension loop
      nextCovariance[i,j] := if noEvent(accepted > 0.5) then
        0.5*(resetCovariance[i,j]+resetCovariance[j,i]) else covariance[i,j];
    end for;
    for j in 1:poseDimension loop
      nextCrossCovariance[i,j] := if noEvent(accepted > 0.5) then
        resetCovariance[i,errorDimension+j] else crossCovariance[i,j];
    end for;
  end for;
  // Schmidt gain/reset leave this block and the retained reference pose unchanged.
  nextReferenceCovariance := referenceCovariance;
end SchmidtCorrectRelativePose;

// One held-IMU substep for the existing ES15 filter convention.
// Rotation maps body FLU into the gravity-aligned map frame. Biases stay body-local.
// The caller subdivides a frame to h <= 20 ms and |omega|*h <= 0.1 rad.
// Pure Modelica mathematics; this component is not yet a production estimator.
model ES15NominalPrediction
  pure function Predict
    input Real rotation[3,3] = identity(3);
    input Real position[3] = {0.0,0.0,0.0};
    input Real velocity[3] = {0.0,0.0,0.0};
    input Real accel[3] = {0.0,0.0,9.81};
    input Real gyro[3] = {0.0,0.0,0.0};
    input Real accel_bias[3] = {0.0,0.0,0.0};
    input Real gyro_bias[3] = {0.0,0.0,0.0};
    input Real gravity[3] = {0.0,0.0,-9.81};
    input Real h = 1.0/90.0;
    output Real force[3]; output Real omega[3];
    output Real middle_rotation[3,3]; output Real next_rotation[3,3];
    output Real next_position[3]; output Real next_velocity[3];
    output Real valid;
  protected
    Real angle; Real a; Real b; Real middle_a; Real middle_b;
    Real W[3,3]; Real W2[3,3];
    Real increment[3,3]; Real middle_increment[3,3]; Real proposed_rotation[3,3];
    Real acceleration[3];
  algorithm
    force := accel-accel_bias;
    omega := gyro-gyro_bias;
    angle := sqrt(omega[1]^2+omega[2]^2+omega[3]^2)*h;
    valid := if noEvent(h > 0.0 and h <= 0.02 and angle <= 0.1) then 1.0 else 0.0;
    // Protected denominators also keep unselected small-angle branches finite.
    a := if noEvent(angle < 1e-7) then 1.0 else sin(angle)/max(angle,1e-7);
    b := if noEvent(angle < 1e-7) then 0.5 else (1.0-cos(angle))/max(angle^2,1e-14);
    middle_a := if noEvent(angle*0.5 < 1e-7) then 1.0 else sin(angle*0.5)/max(angle*0.5,1e-7);
    middle_b := if noEvent(angle*0.5 < 1e-7) then 0.5 else (1.0-cos(angle*0.5))/max(angle^2*0.25,1e-14);
    W := [0.0,-omega[3]*h,omega[2]*h;
         omega[3]*h,0.0,-omega[1]*h;
         -omega[2]*h,omega[1]*h,0.0];
    W2 := W*W;
    increment := identity(3)+a*W+b*W2;
    middle_increment := identity(3)+middle_a*0.5*W+middle_b*0.25*W2;
    middle_rotation := rotation*middle_increment;
    proposed_rotation := rotation*increment;
    acceleration := middle_rotation*force+gravity;
    for i in 1:3 loop
      next_position[i] := if noEvent(valid > 0.5) then position[i]+velocity[i]*h+0.5*acceleration[i]*h^2 else position[i];
      next_velocity[i] := if noEvent(valid > 0.5) then velocity[i]+acceleration[i]*h else velocity[i];
      for j in 1:3 loop
        next_rotation[i,j] := if noEvent(valid > 0.5) then proposed_rotation[i,j] else rotation[i,j];
      end for;
    end for;
  end Predict;

  input Real rotation[3,3] = identity(3);
  input Real position[3] = {0.0,0.0,0.0};
  input Real velocity[3] = {0.0,0.0,0.0};
  input Real accel[3] = {0.0,0.0,9.81};
  input Real gyro[3] = {0.0,0.0,0.0};
  input Real accel_bias[3] = {0.0,0.0,0.0};
  input Real gyro_bias[3] = {0.0,0.0,0.0};
  input Real gravity[3] = {0.0,0.0,-9.81};
  input Real h = 1.0/90.0;
  output Real force[3]; output Real omega[3];
  output Real middle_rotation[3,3]; output Real next_rotation[3,3];
  output Real next_position[3]; output Real next_velocity[3];
  output Real valid;
algorithm
  (force,omega,middle_rotation,next_rotation,next_position,next_velocity,valid) :=
    Predict(rotation,position,velocity,accel,gyro,accel_bias,gyro_bias,gravity,h);
end ES15NominalPrediction;

// Continuous error dynamics for the RGB-D / airframe IMU teaching filter.
// Error order: world dp, world dv, right-local dtheta, body dba, body dbg.
// R_true = R * Exp(dtheta); measurements are true body values + bias + noise.
// Noise order: acceleration white, gyro white, acceleration bias walk,
// gyro bias walk. These conventions differ from a right SE_2(3) filter.
// A host retains the filter state; all F/G mathematics below is Modelica.
model ES15Dynamics
  pure function Matrices
    input Real rotation[3,3] = identity(3);
    input Real force[3] = {0.0,0.0,9.81};
    input Real omega[3] = {0.0,0.0,0.0};
    output Real F[15,15];
    output Real G[15,12];
  protected
    Real forceSkew[3,3];
    Real omegaSkew[3,3];
  algorithm
    forceSkew := [0.0,-force[3],force[2];
                  force[3],0.0,-force[1];
                  -force[2],force[1],0.0];
    omegaSkew := [0.0,-omega[3],omega[2];
                  omega[3],0.0,-omega[1];
                  -omega[2],omega[1],0.0];
    F := fill(0.0,15,15);
    G := fill(0.0,15,12);
    F[1:3,4:6] := identity(3);
    // Keep the original three-term contraction order.
    for i in 1:3 loop
      for j in 1:3 loop
        F[i+3,j+6] := -(rotation[i,1]*forceSkew[1,j]
                         +rotation[i,2]*forceSkew[2,j]
                         +rotation[i,3]*forceSkew[3,j]);
      end for;
    end for;
    F[4:6,10:12] := -rotation;
    F[7:9,7:9] := -omegaSkew;
    F[7:9,13:15] := -identity(3);
    G[4:6,1:3] := -rotation;
    G[7:9,4:6] := -identity(3);
    G[10:12,7:9] := identity(3);
    G[13:15,10:12] := identity(3);
  end Matrices;

  input Real rotation[3,3] = identity(3);
  input Real force[3] = {0.0,0.0,9.81};
  input Real omega[3] = {0.0,0.0,0.0};
  output Real F[15,15];
  output Real G[15,12];
algorithm
  (F,G) := Matrices(rotation,force,omega);
end ES15Dynamics;

// World-additive p/v, right-local theta, body ba/bg: ES15Dynamics convention.
// Caller owns dt admission. This function does not extend the supported interval.
function ES15TransitionNoise
  input Real F[15,15];
  input Real G[15,12];
  input Real dt;
  input Real density[12];
  output Real Phi[15,15];
  output Real Q[15,15];
protected
  constant Real fraction[3] = {0.5-sqrt(15.0)/10.0,0.5,0.5+sqrt(15.0)/10.0};
  constant Real weight[3] = {5.0/18.0,4.0/9.0,5.0/18.0};
  Real A[15,15]; Real A2[15,15]; Real A3[15,15];
  Real noiseTransition[3,15,15]; Real B[3,15,12];
  Real nodeNoise[3,15,15];
algorithm
  A := F*dt;
  A2 := A*A;
  A3 := A2*A;
  Phi := identity(15)+A+0.5*A2+A3/6.0;
  for node in 1:3 loop
    for i in 1:15 loop
      for j in 1:15 loop
        noiseTransition[node,i,j] := (if i == j then 1.0 else 0.0)
          +fraction[node]*A[i,j]+0.5*fraction[node]^2*A2[i,j]
          +fraction[node]^3*A3[i,j]/6.0;
      end for;
      for j in 1:12 loop
        B[node,i,j] := (noiseTransition[node,i,1]*G[1,j]+noiseTransition[node,i,2]*G[2,j]+noiseTransition[node,i,3]*G[3,j]+noiseTransition[node,i,4]*G[4,j]+noiseTransition[node,i,5]*G[5,j]+noiseTransition[node,i,6]*G[6,j]+noiseTransition[node,i,7]*G[7,j]+noiseTransition[node,i,8]*G[8,j]+noiseTransition[node,i,9]*G[9,j]+noiseTransition[node,i,10]*G[10,j]+noiseTransition[node,i,11]*G[11,j]+noiseTransition[node,i,12]*G[12,j]+noiseTransition[node,i,13]*G[13,j]+noiseTransition[node,i,14]*G[14,j]+noiseTransition[node,i,15]*G[15,j])*density[j];
      end for;
    end for;
    // Complete every B row before the Gram matrix reads B[node,j,:].
    for i in 1:15 loop
      for j in 1:15 loop
        nodeNoise[node,i,j] := (B[node,i,1]*B[node,j,1]+B[node,i,2]*B[node,j,2]+B[node,i,3]*B[node,j,3]+B[node,i,4]*B[node,j,4]+B[node,i,5]*B[node,j,5]+B[node,i,6]*B[node,j,6]+B[node,i,7]*B[node,j,7]+B[node,i,8]*B[node,j,8]+B[node,i,9]*B[node,j,9]+B[node,i,10]*B[node,j,10]+B[node,i,11]*B[node,j,11]+B[node,i,12]*B[node,j,12]);
      end for;
    end for;
  end for;
  for i in 1:15 loop
    for j in 1:15 loop
      Q[i,j] := dt*(weight[1]*nodeNoise[1,i,j]+weight[2]*nodeNoise[2,i,j]+weight[3]*nodeNoise[3,i,j]);
    end for;
  end for;
end ES15TransitionNoise;

// Convenience propagation for callers that need only the current-state block.
// Joint-state callers use ES15TransitionNoise and propagate covariance once.
function ES15CovarianceStep
  input Real F[15,15];
  input Real G[15,12];
  input Real P[15,15];
  input Real dt;
  input Real density[12];
  output Real Phi[15,15];
  output Real Q[15,15];
  output Real predicted[15,15];
protected
  Real propagated[15,15]; Real raw[15,15];
algorithm
  (Phi,Q) := ES15TransitionNoise(F,G,dt,density);
  propagated := Phi*P*transpose(Phi);
  raw := propagated+Q;
  predicted := 0.5*(raw+transpose(raw));
end ES15CovarianceStep;

// Equation adapter preserving the existing model interface and input defaults.
model ES15CovariancePrediction
  input Real F[15,15] = fill(0.0,15,15);
  input Real G[15,12] = fill(0.0,15,12);
  input Real P[15,15] = identity(15);
  input Real dt = 1.0/90.0;
  input Real density[12] = {0.06,0.06,0.06,0.006,0.006,0.006,
                           0.002,0.002,0.002,0.0002,0.0002,0.0002};
  output Real Phi[15,15];
  output Real Q[15,15];
  output Real predicted[15,15];
equation
  (Phi,Q,predicted) = ES15CovarianceStep(F,G,P,dt,density);
end ES15CovariancePrediction;

// MLS 3.5 permits exact Real equality inside functions. This helper preserves
// IEEE equality: signed zeros compare equal; NaN compares unequal to every value.
function SLAMExactRealEqual
  input Real left;
  input Real right;
  output Boolean equal;
algorithm
  equal := left == right;
end SLAMExactRealEqual;

// An acquisition interval is a held measurement, not an integration substep.
// This bound covers the supported sensor rates without fabricating samples.
function ES15HeldIntervalValid
  input Real h;
  output Boolean valid;
algorithm
  valid := h > 0.0 and h <= 0.2;
end ES15HeldIntervalValid;

function SchmidtPredictCovariance
  input Real covariance[15,15];
  input Real crossCovariance[15,6];
  input Real referenceCovariance[6,6];
  input Real transition[15,15];
  input Real processCovariance[15,15];
  input Real referenceAvailable;
  input Real predictionEnabled;
  output Real accepted;
  output Real nextCovariance[15,15];
  output Real nextCrossCovariance[15,6];
  output Real nextReferenceCovariance[6,6];
protected
  Real raw[15,15]; Real proposed[15,15]; Real proposedCross[15,6];
  Real priorJoint[21,21]; Real proposedJoint[21,21];
  Real currentValid; Real processValid; Real proposedCurrentValid;
  Real priorJointValid; Real proposedJointValid;
  Real finiteTransition[15,15];
algorithm
  raw := transition*covariance*transpose(transition)+processCovariance;
  proposed := 0.5*(raw+transpose(raw));
  proposedCross := transition*crossCovariance;
  priorJoint := cat(1,cat(2,covariance,crossCovariance),
    cat(2,transpose(crossCovariance),referenceCovariance));
  proposedJoint := cat(1,cat(2,proposed,proposedCross),
    cat(2,transpose(proposedCross),referenceCovariance));
  currentValid := SLAMCovariancePSDCheck(covariance,1e-12);
  processValid := SLAMCovariancePSDCheck(processCovariance,1e-12);
  proposedCurrentValid := SLAMCovariancePSDCheck(proposed,1e-12);
  priorJointValid := SLAMCovariancePSDCheck(priorJoint,1e-12);
  proposedJointValid := SLAMCovariancePSDCheck(proposedJoint,1e-12);
  for i in 1:15 loop
    for j in 1:15 loop
      finiteTransition[i,j] := if abs(transition[i,j]) <= 1e6 then 0.0 else 1.0;
    end for;
  end for;
  accepted := if SLAMExactRealEqual(predictionEnabled,1.0)
    and (SLAMExactRealEqual(referenceAvailable,0.0) or SLAMExactRealEqual(referenceAvailable,1.0))
    and currentValid > 0.5 and processValid > 0.5 and proposedCurrentValid > 0.5
    and sum(finiteTransition) < 0.5
    and (SLAMExactRealEqual(referenceAvailable,0.0) or (priorJointValid > 0.5 and proposedJointValid > 0.5))
    then 1.0 else 0.0;
  nextCovariance := if accepted > 0.5 then proposed else covariance;
  nextCrossCovariance := if accepted > 0.5 and SLAMExactRealEqual(referenceAvailable,1.0)
    then proposedCross else crossCovariance;
  nextReferenceCovariance := referenceCovariance;
end SchmidtPredictCovariance;

// Modelica owns numerical subdivision of one unchanged held IMU measurement.
// Each substep uses the current midpoint rotation and propagates the full joint
// covariance. A failed substep rolls back the whole acquisition interval.
function ES15PredictHeldInterval
  input Real position[3]; input Real velocity[3]; input Real rotation[3,3];
  input Real accelBias[3]; input Real gyroBias[3];
  input Real covariance[15,15]; input Real crossCovariance[15,6];
  input Real referenceCovariance[6,6]; input Real referencePosition[3];
  input Real referenceRotation[3,3]; input Real referenceAvailable;
  input Real accel[3]; input Real gyro[3]; input Real gravity[3];
  input Real h; input Real density[12];
  output Real accepted;
  output Real transition[15,15]; output Real processCovariance[15,15];
  output Real nextPosition[3]; output Real nextVelocity[3]; output Real nextRotation[3,3];
  output Real nextCovariance[15,15]; output Real nextCrossCovariance[15,6];
  output Integer substeps;
protected
  constant Integer maximumSubsteps = 64;
  Real rate; Real requestedSteps; Real dt;
  Real force[3]; Real omega[3]; Real middleRotation[3,3];
  Real proposedPosition[3]; Real proposedVelocity[3]; Real proposedRotation[3,3];
  Real F[15,15]; Real G[15,12]; Real Phi[15,15]; Real Q[15,15];
  Real proposedCovariance[15,15]; Real proposedCross[15,6]; Real retainedReference[6,6];
  Real rawNoise[15,15]; Real nominalValid; Real jointAccepted;
  Boolean geometryValid; Boolean densityValid; Boolean running;
algorithm
  accepted := 0.0; substeps := 0;
  transition := identity(15); processCovariance := zeros(15,15);
  nextPosition := position; nextVelocity := velocity; nextRotation := rotation;
  nextCovariance := covariance; nextCrossCovariance := crossCovariance;
  rate := sqrt(sum((gyro-gyroBias).^2));
  requestedSteps := max(h/0.02,rate*h/0.1);
  running := ES15HeldIntervalValid(h) and requestedSteps >= 0.0
    and requestedSteps <= maximumSubsteps;
  if running then
    substeps := max(1,integer(ceil(requestedSteps)));
    // Division rounding must not place a substep just beyond either limit.
    if h/substeps > 0.02 or rate*(h/substeps) > 0.1 then substeps := substeps+1; end if;
    running := substeps <= maximumSubsteps;
    if running then
      dt := h/substeps;
      densityValid := true;
      for channel in 1:12 loop
        densityValid := densityValid and density[channel] >= 0.0 and density[channel] <= 1e6;
      end for;
      for step in 1:substeps loop
        if running then
          (force,omega,middleRotation,proposedRotation,proposedPosition,proposedVelocity,nominalValid)
            := ES15NominalPrediction.Predict(nextRotation,nextPosition,nextVelocity,
              accel,gyro,accelBias,gyroBias,gravity,dt);
          (F,G) := ES15Dynamics.Matrices(middleRotation,force,omega);
          // The joint propagator below owns Phi*P*Phi'; compute it only once.
          (Phi,Q) := ES15TransitionNoise(F,G,
            if nominalValid > 0.5 then dt else 0.0,density);
          geometryValid := RGBDProperRotationValue(nextRotation) > 0.5
            and RGBDProperRotationValue(proposedRotation) > 0.5;
          for axis in 1:3 loop
            geometryValid := geometryValid and abs(proposedPosition[axis]) <= 1e6
              and abs(proposedVelocity[axis]) <= 1e6 and abs(accelBias[axis]) <= 2.0
              and abs(gyroBias[axis]) <= 0.3 and abs(gravity[axis]) <= 1e3
              and (SLAMExactRealEqual(referenceAvailable,0.0) or abs(referencePosition[axis]) <= 1e6);
          end for;
          geometryValid := geometryValid and (SLAMExactRealEqual(referenceAvailable,0.0)
            or RGBDProperRotationValue(referenceRotation) > 0.5);
          (jointAccepted,proposedCovariance,proposedCross,retainedReference)
            := SchmidtPredictCovariance(nextCovariance,nextCrossCovariance,referenceCovariance,
              Phi,Q,referenceAvailable,if nominalValid > 0.5 and geometryValid and densityValid then 1.0 else 0.0);
          // The first step preserves the original one-step diagnostics exactly.
          if step == 1 then
            transition := Phi; processCovariance := Q;
          else
            transition := Phi*transition;
            rawNoise := Phi*processCovariance*transpose(Phi)+Q;
            processCovariance := 0.5*(rawNoise+transpose(rawNoise));
          end if;
          running := jointAccepted > 0.5;
          if running then
            nextPosition := proposedPosition; nextVelocity := proposedVelocity; nextRotation := proposedRotation;
            nextCovariance := proposedCovariance; nextCrossCovariance := proposedCross;
          end if;
        end if;
      end for;
    end if;
    if running then
      accepted := 1.0;
    else
      nextPosition := position; nextVelocity := velocity; nextRotation := rotation;
      nextCovariance := covariance; nextCrossCovariance := crossCovariance;
    end if;
  end if;
end ES15PredictHeldInterval;

// Correlated reference lifecycle, composed with the existing ES15/Schmidt models.
// All numerical work is Modelica; the host only retains and copies returned state.
// Current errors: world dp,dv; right-local dtheta; body dba,dbg. Reference: dp,dtheta.
// This source is not yet compiler-admitted or integrated into the production node.
model SchmidtReferencePrediction
  constant Integer currentDimension = 15;
  constant Integer referenceDimension = 6;
  input Real covariance[currentDimension,currentDimension];
  input Real crossCovariance[currentDimension,referenceDimension];
  input Real referenceCovariance[referenceDimension,referenceDimension];
  input Real transition[currentDimension,currentDimension] = identity(currentDimension);
  input Real processCovariance[currentDimension,currentDimension] = zeros(currentDimension,currentDimension);
  input Real referenceAvailable = 0.0;
  input Real predictionEnabled = 1.0;
  output Real accepted;
  output Real nextCovariance[currentDimension,currentDimension];
  output Real nextCrossCovariance[currentDimension,referenceDimension];
  output Real nextReferenceCovariance[referenceDimension,referenceDimension];
algorithm
  (accepted,nextCovariance,nextCrossCovariance,nextReferenceCovariance)
    := SchmidtPredictCovariance(covariance,crossCovariance,referenceCovariance,
      transition,processCovariance,referenceAvailable,predictionEnabled);
end SchmidtReferencePrediction;

// Pure capture counterpart of the unchanged equation model below.
// Keep the shared rotation gates, PSD checks and selection contractions identical.
pure function SchmidtCaptureReference
  input Real position[3] = zeros(3);
  input Real rotation[3,3] = identity(3);
  input Real covariance[currentDimension,currentDimension];
  input Real referencePosition[3] = zeros(3);
  input Real referenceRotation[3,3] = identity(3);
  input Real crossCovariance[currentDimension,referenceDimension];
  input Real referenceCovariance[referenceDimension,referenceDimension];
  input Real referenceAvailable = 0.0;
  input Real captureRequested = 0.0;
  input Real currentValid = 1.0;
  output Real accepted;
  output Real rejected;
  output Real nextReferenceAvailable;
  output Real nextReferencePosition[3];
  output Real nextReferenceRotation[3,3];
  output Real nextCovariance[currentDimension,currentDimension];
  output Real nextCrossCovariance[currentDimension,referenceDimension];
  output Real nextReferenceCovariance[referenceDimension,referenceDimension];
protected
  constant Integer currentDimension = 15;
  constant Integer referenceDimension = 6;
  Real currentRotationValid; Real referenceRotationValid;
  Real selection[referenceDimension,currentDimension];
  Real proposedCross[currentDimension,referenceDimension];
  Real proposedReference[referenceDimension,referenceDimension];
  Real priorJoint[21,21];
  Real proposedJoint[21,21];
  Real currentCovarianceValid;
  Real priorJointValid;
  Real proposedJointValid;
  Real currentPositionChecks[3];
  Real referencePositionChecks[3];
algorithm
  currentRotationValid := RGBDProperRotationValue(rotation);
  referenceRotationValid := RGBDProperRotationValue(referenceRotation);
  // Reference nominal equals current nominal at capture, so both right-local
  // attitude errors share exactly the same body tangent; no guessed heading.
  selection := cat(1,cat(2,identity(3),zeros(3,12)),
    cat(2,zeros(3,6),identity(3),zeros(3,6)));
  proposedCross := covariance*transpose(selection);
  proposedReference := selection*proposedCross;
  priorJoint := cat(1,cat(2,covariance,crossCovariance),
    cat(2,transpose(crossCovariance),referenceCovariance));
  proposedJoint := cat(1,cat(2,covariance,proposedCross),
    cat(2,transpose(proposedCross),proposedReference));
  currentCovarianceValid := SLAMCovariancePSDCheck(covariance,1e-12);
  priorJointValid := SLAMCovariancePSDCheck(priorJoint,1e-12);
  proposedJointValid := SLAMCovariancePSDCheck(proposedJoint,1e-12);
  for i in 1:3 loop
    currentPositionChecks[i] := if noEvent(abs(position[i]) <= 1e6) then 0.0 else 1.0;
    referencePositionChecks[i] := if noEvent(abs(referencePosition[i]) <= 1e6) then 0.0 else 1.0;
  end for;
  accepted := if noEvent(SLAMExactRealEqual(captureRequested,1.0) and SLAMExactRealEqual(currentValid,1.0)
    and (SLAMExactRealEqual(referenceAvailable,0.0) or SLAMExactRealEqual(referenceAvailable,1.0))
    and currentRotationValid > 0.5 and sum(currentPositionChecks) < 0.5
    and currentCovarianceValid > 0.5 and proposedJointValid > 0.5
    and (SLAMExactRealEqual(referenceAvailable,0.0) or (priorJointValid > 0.5
      and referenceRotationValid > 0.5 and sum(referencePositionChecks) < 0.5)))
    then 1.0 else 0.0;
  rejected := if noEvent(SLAMExactRealEqual(captureRequested,0.0) or accepted > 0.5) then 0.0 else 1.0;
  nextReferenceAvailable := if noEvent(accepted > 0.5) then 1.0 else referenceAvailable;
  nextReferencePosition := if noEvent(accepted > 0.5) then position else referencePosition;
  nextReferenceRotation := if noEvent(accepted > 0.5) then rotation else referenceRotation;
  nextCovariance := covariance;
  nextCrossCovariance := if noEvent(accepted > 0.5) then proposedCross else crossCovariance;
  nextReferenceCovariance := if noEvent(accepted > 0.5) then proposedReference else referenceCovariance;
end SchmidtCaptureReference;

model SchmidtReferenceCapture
  constant Integer currentDimension = 15;
  constant Integer referenceDimension = 6;
  input Real position[3] = zeros(3);
  input Real rotation[3,3] = identity(3);
  input Real covariance[currentDimension,currentDimension];
  input Real referencePosition[3] = zeros(3);
  input Real referenceRotation[3,3] = identity(3);
  input Real crossCovariance[currentDimension,referenceDimension];
  input Real referenceCovariance[referenceDimension,referenceDimension];
  input Real referenceAvailable = 0.0;
  input Real captureRequested = 0.0;
  input Real currentValid = 1.0;
  output Real accepted;
  output Real rejected;
  output Real nextReferenceAvailable;
  output Real nextReferencePosition[3];
  output Real nextReferenceRotation[3,3];
  output Real nextCovariance[currentDimension,currentDimension];
  output Real nextCrossCovariance[currentDimension,referenceDimension];
  output Real nextReferenceCovariance[referenceDimension,referenceDimension];
protected
  RGBDProperRotation currentRotationCheck(rotation=rotation);
  RGBDProperRotation referenceRotationCheck(rotation=referenceRotation);
  Real selection[referenceDimension,currentDimension];
  Real proposedCross[currentDimension,referenceDimension];
  Real proposedReference[referenceDimension,referenceDimension];
  Real priorJoint[21,21];
  Real proposedJoint[21,21];
  Real currentCovarianceValid;
  Real priorJointValid;
  Real proposedJointValid;
  Real currentPositionChecks[3];
  Real referencePositionChecks[3];
equation
  // Reference nominal equals current nominal at capture, so both right-local
  // attitude errors share exactly the same body tangent; no guessed heading.
  selection = cat(1,cat(2,identity(3),zeros(3,12)),
    cat(2,zeros(3,6),identity(3),zeros(3,6)));
  proposedCross = covariance*transpose(selection);
  proposedReference = selection*proposedCross;
  priorJoint = cat(1,cat(2,covariance,crossCovariance),
    cat(2,transpose(crossCovariance),referenceCovariance));
  proposedJoint = cat(1,cat(2,covariance,proposedCross),
    cat(2,transpose(proposedCross),proposedReference));
  currentCovarianceValid = SLAMCovariancePSDCheck(covariance,1e-12);
  priorJointValid = SLAMCovariancePSDCheck(priorJoint,1e-12);
  proposedJointValid = SLAMCovariancePSDCheck(proposedJoint,1e-12);
  for i in 1:3 loop
    currentPositionChecks[i] = if noEvent(abs(position[i]) <= 1e6) then 0.0 else 1.0;
    referencePositionChecks[i] = if noEvent(abs(referencePosition[i]) <= 1e6) then 0.0 else 1.0;
  end for;
  accepted = if noEvent(SLAMExactRealEqual(captureRequested,1.0) and SLAMExactRealEqual(currentValid,1.0)
    and (SLAMExactRealEqual(referenceAvailable,0.0) or SLAMExactRealEqual(referenceAvailable,1.0))
    and currentRotationCheck.valid > 0.5 and sum(currentPositionChecks) < 0.5
    and currentCovarianceValid > 0.5 and proposedJointValid > 0.5
    and (SLAMExactRealEqual(referenceAvailable,0.0) or (priorJointValid > 0.5
      and referenceRotationCheck.valid > 0.5 and sum(referencePositionChecks) < 0.5)))
    then 1.0 else 0.0;
  rejected = if noEvent(SLAMExactRealEqual(captureRequested,0.0) or accepted > 0.5) then 0.0 else 1.0;
  nextReferenceAvailable = if noEvent(accepted > 0.5) then 1.0 else referenceAvailable;
  nextReferencePosition = if noEvent(accepted > 0.5) then position else referencePosition;
  nextReferenceRotation = if noEvent(accepted > 0.5) then rotation else referenceRotation;
  nextCovariance = covariance;
  nextCrossCovariance = if noEvent(accepted > 0.5) then proposedCross else crossCovariance;
  nextReferenceCovariance = if noEvent(accepted > 0.5) then proposedReference else referenceCovariance;
end SchmidtReferenceCapture;

// Predict a complete current/reference state using the actual ES15 transition.
model ES15SchmidtPrediction
  input Real position[3] = zeros(3);
  input Real velocity[3] = zeros(3);
  input Real rotation[3,3] = identity(3);
  input Real accelBias[3] = zeros(3);
  input Real gyroBias[3] = zeros(3);
  input Real covariance[15,15];
  input Real crossCovariance[15,6];
  input Real referenceCovariance[6,6];
  input Real referencePosition[3] = zeros(3);
  input Real referenceRotation[3,3] = identity(3);
  input Real referenceAvailable = 0.0;
  input Real accel[3] = {0.0,0.0,9.81};
  input Real gyro[3] = zeros(3);
  input Real gravity[3] = {0.0,0.0,-9.81};
  input Real h = 1.0/90.0;
  input Real density[12] = {0.06,0.06,0.06,0.006,0.006,0.006,0.002,0.002,0.002,0.0002,0.0002,0.0002};
  output Real accepted;
  output Real transition[15,15];
  output Real processCovariance[15,15];
  output Real nextPosition[3];
  output Real nextVelocity[3];
  output Real nextRotation[3,3];
  output Real nextAccelBias[3];
  output Real nextGyroBias[3];
  output Real nextCovariance[15,15];
  output Real nextCrossCovariance[15,6];
  output Real nextReferenceCovariance[6,6];
  output Real nextReferencePosition[3];
  output Real nextReferenceRotation[3,3];
  output Real nextReferenceAvailable;
  output Integer substeps "Numerical substeps within this unchanged held measurement";
algorithm
  (accepted,transition,processCovariance,nextPosition,nextVelocity,nextRotation,
    nextCovariance,nextCrossCovariance,substeps) := ES15PredictHeldInterval(
      position,velocity,rotation,accelBias,gyroBias,covariance,crossCovariance,
      referenceCovariance,referencePosition,referenceRotation,referenceAvailable,
      accel,gyro,gravity,h,density);
  nextAccelBias := accelBias;
  nextGyroBias := gyroBias;
  nextReferenceCovariance := referenceCovariance;
  nextReferencePosition := referencePosition;
  nextReferenceRotation := referenceRotation;
  nextReferenceAvailable := referenceAvailable;
end ES15SchmidtPrediction;

// Raw-image reuse policy: no image may participate in two visual updates.
// Epochs are exact nonnegative integer-valued Real IDs, <=2^53-1; -1 is the
// last-used sentinel. This gate caches no measurement or numerical result.
// Pure image-ledger eligibility counterpart of the unchanged equation model below.
pure function SchmidtImagePairEligibility
  input Real referenceAvailable = 0.0;
  input Real referenceUsed = 0.0;
  input Real referenceEpoch = 0.0;
  input Real currentEpoch = 0.0;
  input Real lastUsedEpoch = -1.0;
  output Real valid;
  output Real eligible;
  output Real captureFresh;
algorithm
  valid := if noEvent((SLAMExactRealEqual(referenceAvailable,0.0) or SLAMExactRealEqual(referenceAvailable,1.0))
    and (SLAMExactRealEqual(referenceUsed,0.0) or SLAMExactRealEqual(referenceUsed,1.0))
    and currentEpoch >= 0.0 and currentEpoch <= 9007199254740991.0
    and SLAMExactRealEqual(currentEpoch,floor(currentEpoch))
    and lastUsedEpoch >= -1.0 and lastUsedEpoch <= 9007199254740991.0
    and SLAMExactRealEqual(lastUsedEpoch,floor(lastUsedEpoch))
    and (SLAMExactRealEqual(referenceAvailable,0.0) and SLAMExactRealEqual(referenceUsed,0.0)
      or SLAMExactRealEqual(referenceAvailable,1.0) and referenceEpoch >= 0.0
        and referenceEpoch <= 9007199254740991.0 and SLAMExactRealEqual(referenceEpoch,floor(referenceEpoch))
        and (SLAMExactRealEqual(referenceUsed,0.0) and referenceEpoch > lastUsedEpoch
          or SLAMExactRealEqual(referenceUsed,1.0) and referenceEpoch <= lastUsedEpoch))) then 1.0 else 0.0;
  eligible := if noEvent(valid > 0.5 and SLAMExactRealEqual(referenceAvailable,1.0)
    and SLAMExactRealEqual(referenceUsed,0.0) and currentEpoch > referenceEpoch) then 1.0 else 0.0;
  captureFresh := if noEvent(valid > 0.5 and currentEpoch > lastUsedEpoch
    and (SLAMExactRealEqual(referenceAvailable,0.0) or currentEpoch > referenceEpoch)) then 1.0 else 0.0;
end SchmidtImagePairEligibility;

model SchmidtImagePairGate
  input Real referenceAvailable = 0.0;
  input Real referenceUsed = 0.0;
  input Real referenceEpoch = 0.0;
  input Real currentEpoch = 0.0;
  input Real lastUsedEpoch = -1.0;
  output Real valid;
  output Real eligible;
  output Real captureFresh;
equation
  valid = if noEvent((SLAMExactRealEqual(referenceAvailable,0.0) or SLAMExactRealEqual(referenceAvailable,1.0))
    and (SLAMExactRealEqual(referenceUsed,0.0) or SLAMExactRealEqual(referenceUsed,1.0))
    and currentEpoch >= 0.0 and currentEpoch <= 9007199254740991.0
    and SLAMExactRealEqual(currentEpoch,floor(currentEpoch))
    and lastUsedEpoch >= -1.0 and lastUsedEpoch <= 9007199254740991.0
    and SLAMExactRealEqual(lastUsedEpoch,floor(lastUsedEpoch))
    and (SLAMExactRealEqual(referenceAvailable,0.0) and SLAMExactRealEqual(referenceUsed,0.0)
      or SLAMExactRealEqual(referenceAvailable,1.0) and referenceEpoch >= 0.0
        and referenceEpoch <= 9007199254740991.0 and SLAMExactRealEqual(referenceEpoch,floor(referenceEpoch))
        and (SLAMExactRealEqual(referenceUsed,0.0) and referenceEpoch > lastUsedEpoch
          or SLAMExactRealEqual(referenceUsed,1.0) and referenceEpoch <= lastUsedEpoch))) then 1.0 else 0.0;
  eligible = if noEvent(valid > 0.5 and SLAMExactRealEqual(referenceAvailable,1.0)
    and SLAMExactRealEqual(referenceUsed,0.0) and currentEpoch > referenceEpoch) then 1.0 else 0.0;
  captureFresh = if noEvent(valid > 0.5 and currentEpoch > lastUsedEpoch
    and (SLAMExactRealEqual(referenceAvailable,0.0) or currentEpoch > referenceEpoch)) then 1.0 else 0.0;
end SchmidtImagePairGate;

// One complete ordering transaction: IMU -> relative correction -> reference capture.
// Each rejected substep preserves its incoming state. A valid IMU prediction
// still advances when a visual observation or reference replacement is rejected.
// The host persists these outputs together; it never rebuilds covariance blocks.
model ES15SchmidtReferenceStep
  input Real position[3] = zeros(3);
  input Real velocity[3] = zeros(3);
  input Real rotation[3,3] = identity(3);
  input Real accelBias[3] = zeros(3);
  input Real gyroBias[3] = zeros(3);
  input Real covariance[15,15];
  input Real crossCovariance[15,6];
  input Real referenceCovariance[6,6];
  input Real referencePosition[3] = zeros(3);
  input Real referenceRotation[3,3] = identity(3);
  input Real referenceAvailable = 0.0;
  input Real accel[3] = {0.0,0.0,9.81};
  input Real gyro[3] = zeros(3);
  input Real gravity[3] = {0.0,0.0,-9.81};
  input Real h = 1.0/90.0;
  input Real density[12] = {0.06,0.06,0.06,0.006,0.006,0.006,0.002,0.002,0.002,0.0002,0.0002,0.0002};
  input Real opticalToBody[3,3] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[3] = {0.18,0.0,-0.04};
  input Real measuredRotation[3,3] = identity(3);
  input Real measuredTranslation[3] = zeros(3);
  input Real relativeCovariance[6,6] = identity(6);
  input Real measurementEnabled = 0.0;
  input Real captureRequested = 0.0;
  input Real referenceEpoch = 0.0;
  input Real currentEpoch = 0.0;
  input Real referenceUsed = 0.0;
  input Real lastUsedEpoch = -1.0;
  output Real predictionAccepted;
  output Real observationAccepted;
  output Real observationRejected;
  output Real captureAccepted;
  output Real captureRejected;
  output Real nextPosition[3];
  output Real nextVelocity[3];
  output Real nextRotation[3,3];
  output Real nextAccelBias[3];
  output Real nextGyroBias[3];
  output Real nextCovariance[15,15];
  output Real nextCrossCovariance[15,6];
  output Real nextReferenceCovariance[6,6];
  output Real nextReferencePosition[3];
  output Real nextReferenceRotation[3,3];
  output Real nextReferenceAvailable;
  output Real nextReferenceEpoch;
  output Real nextReferenceUsed;
  output Real nextLastUsedEpoch;
  output Real imagePairEligible;
  output Real imageReuseRejected;
protected
  SchmidtImagePairGate imageGate(referenceAvailable=referenceAvailable,referenceUsed=referenceUsed,
    referenceEpoch=referenceEpoch,currentEpoch=currentEpoch,lastUsedEpoch=lastUsedEpoch);
  Real pairAttempted;
  Real usedEpochAfterAttempt;
  ES15SchmidtPrediction prediction(position=position,velocity=velocity,rotation=rotation,
    accelBias=accelBias,gyroBias=gyroBias,covariance=covariance,crossCovariance=crossCovariance,
    referenceCovariance=referenceCovariance,referencePosition=referencePosition,
    referenceRotation=referenceRotation,referenceAvailable=referenceAvailable,
    accel=accel,gyro=gyro,gravity=gravity,h=h,density=density);
  SchmidtRelativePoseCorrection correction(position=prediction.nextPosition,
    velocity=prediction.nextVelocity,rotation=prediction.nextRotation,
    accelBias=accelBias,gyroBias=gyroBias,covariance=prediction.nextCovariance,
    crossCovariance=prediction.nextCrossCovariance,referenceCovariance=referenceCovariance,
    referencePosition=referencePosition,referenceRotation=referenceRotation,
    opticalToBody=opticalToBody,cameraOriginBody=cameraOriginBody,
    measuredRotation=measuredRotation,measuredTranslation=measuredTranslation,
    relativeCovariance=relativeCovariance,
    measurementEnabled=if noEvent(prediction.accepted > 0.5 and imageGate.eligible > 0.5)
      then measurementEnabled else 0.0);
  SchmidtReferenceCapture capture(position=correction.nextPosition,rotation=correction.nextRotation,
    covariance=correction.nextCovariance,crossCovariance=correction.nextCrossCovariance,
    referenceCovariance=correction.nextReferenceCovariance,
    referencePosition=referencePosition,referenceRotation=referenceRotation,
    referenceAvailable=referenceAvailable,captureRequested=captureRequested,
    currentValid=if noEvent(prediction.accepted > 0.5 and imageGate.captureFresh > 0.5
      and currentEpoch > usedEpochAfterAttempt) then 1.0 else 0.0);
equation
  // Consume an eligible evaluated pair even when its innovation is rejected.
  // This prevents conditioning on repeated trials of the same raw sensor noise.
  pairAttempted = if noEvent(prediction.accepted > 0.5 and imageGate.eligible > 0.5
    and SLAMExactRealEqual(measurementEnabled,1.0)) then 1.0 else 0.0;
  usedEpochAfterAttempt = if noEvent(pairAttempted > 0.5) then currentEpoch else lastUsedEpoch;
  imagePairEligible = imageGate.eligible;
  imageReuseRejected = if noEvent(prediction.accepted > 0.5 and SLAMExactRealEqual(measurementEnabled,1.0)
    and imageGate.eligible < 0.5) then 1.0 else 0.0;
  nextReferenceEpoch = if noEvent(capture.accepted > 0.5) then currentEpoch else referenceEpoch;
  nextReferenceUsed = if noEvent(capture.accepted > 0.5) then 0.0
    else if noEvent(pairAttempted > 0.5) then 1.0 else referenceUsed;
  nextLastUsedEpoch = usedEpochAfterAttempt;
  predictionAccepted = prediction.accepted;
  observationAccepted = correction.accepted;
  observationRejected = if noEvent(prediction.accepted > 0.5
    and not (SLAMExactRealEqual(measurementEnabled,0.0)) and correction.accepted < 0.5) then 1.0 else 0.0;
  captureAccepted = capture.accepted;
  captureRejected = capture.rejected;
  nextPosition = correction.nextPosition;
  nextVelocity = correction.nextVelocity;
  nextRotation = correction.nextRotation;
  nextAccelBias = correction.nextAccelBias;
  nextGyroBias = correction.nextGyroBias;
  nextCovariance = capture.nextCovariance;
  nextCrossCovariance = capture.nextCrossCovariance;
  nextReferenceCovariance = capture.nextReferenceCovariance;
  nextReferencePosition = capture.nextReferencePosition;
  nextReferenceRotation = capture.nextReferenceRotation;
  nextReferenceAvailable = capture.nextReferenceAvailable;
end ES15SchmidtReferenceStep;

// Concrete carried-state localization transaction. Persistence copies these
// inputs/outputs verbatim; all image, pose, covariance and commit math is Modelica.
// Image dimensions are structural parameters;350 selected slots remain bounded.
// Pixel selection is a source-owned
// upstream stage (see RGBDFastInertialLocalizationStep). No loop closure here.
partial model RGBDInertialLocalizationInterface
  parameter Integer imageHeight(min=1) = 90;
  parameter Integer imageWidth(min=1) = 160;
  constant Integer featureCapacity = 350;
  constant Integer descriptorSize = 49;
  parameter Real initialPositionVariance = 0.25;
  parameter Real initialVelocityVariance = 0.04;
  parameter Real initialAttitudeVariance = 0.01;
  parameter Real initialAccelBiasVariance = 0.0004;
  parameter Real initialGyroBiasVariance = 0.000025;
  final parameter Real defaultRgbCalibration[4] = RGBDNominalCalibration({imageHeight,imageWidth},{69.0,42.0});
  final parameter Real defaultDepthCalibration[4] = RGBDNominalCalibration({imageHeight,imageWidth},{87.0,58.0});
  constant Real defaultNoiseReferenceFx = 848.0/(2.0*tan(87.0*3.141592653589793/360.0));
  parameter Integer channelCount(min=3,max=4) = 4 "RGB or historical RGBA storage";
  input Real rgb[imageHeight,imageWidth,channelCount];
  input Real depth[imageHeight,imageWidth];
  input Real depthUnits = 1.0 "Meters per depth sample";
  input Real rgbCalibration[4] = defaultRgbCalibration;
  input Real depthCalibration[4] = defaultDepthCalibration;
  input Real disparityNoise = 0.08;
  input Real noiseReferenceFx = defaultNoiseReferenceFx;
  input Real baseline = 0.05;
  input Real opticalToBody[3,3] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[3] = {0.18,0.0,-0.04};
  input Real frameEnabled = 0.0 "Exactly1 only on final held-IMU interval for this image";
  input Real imageCaptureRequested = 0.0;
  input Real position[3] = zeros(3);
  input Real velocity[3] = zeros(3);
  input Real rotation[3,3] = identity(3);
  input Real accelBias[3] = zeros(3);
  input Real gyroBias[3] = zeros(3);
  // Estimated level origin, zero velocity/bias, gravity as declared below.
  // These tunable prior variances are initialization hypotheses, not truth or
  // registration noise. Relative corrections use the actual sandwich output.
  input Real covariance[15,15] = diagonal({initialPositionVariance,initialPositionVariance,initialPositionVariance,
    initialVelocityVariance,initialVelocityVariance,initialVelocityVariance,
    initialAttitudeVariance,initialAttitudeVariance,initialAttitudeVariance,
    initialAccelBiasVariance,initialAccelBiasVariance,initialAccelBiasVariance,
    initialGyroBiasVariance,initialGyroBiasVariance,initialGyroBiasVariance});
  input Real crossCovariance[15,6] = zeros(15,6);
  input Real referenceCovariance[6,6] = zeros(6,6);
  input Real referencePosition[3] = zeros(3);
  input Real referenceRotation[3,3] = identity(3);
  input Real referenceAvailable = 0.0;
  input Real referenceEpoch = 0.0;
  input Real currentEpoch = 0.0;
  input Real referenceUsed = 0.0;
  input Real lastUsedEpoch = -1.0;
  input Real referenceDescriptor[featureCapacity,descriptorSize] = zeros(featureCapacity,descriptorSize);
  input Real referencePoint[featureCapacity,3] = zeros(featureCapacity,3);
  input Real referenceEnabled[featureCapacity] = zeros(featureCapacity);
  input Real referencePixels[featureCapacity,2] = zeros(featureCapacity,2);
  input Real referenceCount = 0.0;
  input Real referenceRgbCalibration[4] = defaultRgbCalibration;
  input Real referenceDepthCalibration[4] = defaultDepthCalibration;
  input Real referenceNoiseReferenceFx = defaultNoiseReferenceFx;
  input Real referenceDisparityNoise = 0.08;
  input Real referenceBaseline = 0.05;
  input Real referenceOpticalToBody[3,3] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real referenceCameraOriginBody[3] = {0.18,0.0,-0.04};
  input Real accel[3] = {0.0,0.0,9.81};
  input Real gyro[3] = zeros(3);
  input Real gravity[3] = {0.0,0.0,-9.81};
  input Real h = 1.0/90.0;
  input Real density[12] = {0.06,0.06,0.06,0.006,0.006,0.006,0.002,0.002,0.002,0.0002,0.0002,0.0002};
  output Real nextPosition[3]; output Real nextVelocity[3];
  output Real nextRotation[3,3]; output Real nextAccelBias[3]; output Real nextGyroBias[3];
  output Real nextCovariance[15,15]; output Real nextCrossCovariance[15,6];
  output Real nextReferenceCovariance[6,6]; output Real nextReferencePosition[3];
  output Real nextReferenceRotation[3,3]; output Real nextReferenceAvailable;
  output Real nextReferenceEpoch; output Real nextReferenceUsed; output Real nextLastUsedEpoch;
  output Real nextReferenceDescriptor[featureCapacity,descriptorSize];
  output Real nextReferencePoint[featureCapacity,3]; output Real nextReferenceEnabled[featureCapacity];
  output Real nextReferencePixels[featureCapacity,2];
  output Real nextReferenceCount; output Real nextReferenceRgbCalibration[4];
  output Real nextReferenceDepthCalibration[4]; output Real nextReferenceNoiseReferenceFx;
  output Real nextReferenceDisparityNoise; output Real nextReferenceBaseline;
  output Real nextReferenceOpticalToBody[3,3]; output Real nextReferenceCameraOriginBody[3];
  output Real predictionAccepted; output Real observationAccepted; output Real observationRejected;
  output Real captureAccepted; output Real captureRejected; output Real imageReuseRejected;
  output Real imagePairEligible; output Real frameValid; output Real referenceGeometryCompatible;
  output Real visualValid; output Real matchCount; output Real uncertaintyRejectionReason;
  output Real currentDescriptor[featureCapacity,descriptorSize];
  output Real currentPoint[featureCapacity,3]; output Real currentEnabled[featureCapacity];
  output Real currentCount "Selected feature domain extent, including disabled slots; not a valid-point count";
  output Real currentFromReference[3,3]; output Real currentFromReferenceTranslation[3];
  output Real relativeCovariance[6,6];
  output Real mapCandidatePoint[featureCapacity,3]; output Real mapCandidateEnabled[featureCapacity];
  output Real mapCandidateCount;
  output Real nextQuaternion[4] "Normalized w,x,y,z; body FLU to world ENU";
  output Real positionCovariance[3,3]; output Real attitudeCovariance[3,3];
  output Real confidence "Binary accepted relative correction indicator; not posterior probability";
  output Real features[featureCapacity,3]; output Real featureEnabled[featureCapacity];
  output Real trackingCurrentPixel[featureCapacity,2];
  output Real trackingReferencePixel[featureCapacity,2]; output Real trackingEnabled[featureCapacity];
end RGBDInertialLocalizationInterface;

model RGBDLocalizationOrientation
  extends SLAMRotationLog;
  output Real unitQuaternion[4];
equation
  unitQuaternion = if noEvent(valid > 0.5) then quaternion else {1.0,0.0,0.0,0.0};
end RGBDLocalizationOrientation;

function RGBDLocalizationTracking
  input Real index[:]; input Real currentPixels[:,2]; input Real oldPixels[size(index,1),2];
  input Real oldEnabled[size(index,1)]; input Real currentEnabled[size(currentPixels,1)];
  input Integer imageSize[2] "Shared reference/current RGB grid: height, width";
  output Real currentPixel[size(index,1),2]; output Real referencePixel[size(index,1),2];
  output Real enabled[size(index,1)];
protected
  Integer partner;
  Boolean valid;
algorithm
  currentPixel := zeros(size(index,1),2); referencePixel := zeros(size(index,1),2);
  enabled := zeros(size(index,1)); partner := 1; valid := false;
  for i in 1:size(index,1) loop
    valid := imageSize[1] > 0 and imageSize[2] > 0
      and index[i] >= 1.0 and index[i] <= size(currentPixels,1)
      and SLAMExactRealEqual(index[i],floor(index[i])) and SLAMExactRealEqual(oldEnabled[i],1.0);
    partner := if valid then integer(index[i]) else 1;
    if valid then
      valid := SLAMExactRealEqual(currentEnabled[partner],1.0);
      for coordinate in 1:2 loop
        valid := valid and oldPixels[i,coordinate] >= 0.0
          and oldPixels[i,coordinate] <= imageSize[3-coordinate]-1
          and SLAMExactRealEqual(oldPixels[i,coordinate],floor(oldPixels[i,coordinate]))
          and currentPixels[partner,coordinate] >= 0.0
          and currentPixels[partner,coordinate] <= imageSize[3-coordinate]-1
          and SLAMExactRealEqual(currentPixels[partner,coordinate],floor(currentPixels[partner,coordinate]));
      end for;
      if valid then
        currentPixel[i,:] := currentPixels[partner,:];
        referencePixel[i,:] := oldPixels[i,:]; enabled[i] := 1.0;
      end if;
    end if;
  end for;
end RGBDLocalizationTracking;

model RGBDInertialLocalizationStep
  extends RGBDInertialLocalizationInterface;
  input Real pixels[featureCapacity,2];
  input Real activeCount;
  input Real featureScore[featureCapacity] = zeros(featureCapacity);
algorithm
  (nextPosition,
    nextVelocity,
    nextRotation,
    nextAccelBias,
    nextGyroBias,
    nextCovariance,
    nextCrossCovariance,
    nextReferenceCovariance,
    nextReferencePosition,
    nextReferenceRotation,
    nextReferenceAvailable,
    nextReferenceEpoch,
    nextReferenceUsed,
    nextLastUsedEpoch,
    nextReferenceDescriptor,
    nextReferencePoint,
    nextReferenceEnabled,
    nextReferencePixels,
    nextReferenceCount,
    nextReferenceRgbCalibration,
    nextReferenceDepthCalibration,
    nextReferenceNoiseReferenceFx,
    nextReferenceDisparityNoise,
    nextReferenceBaseline,
    nextReferenceOpticalToBody,
    nextReferenceCameraOriginBody,
    predictionAccepted,
    observationAccepted,
    observationRejected,
    captureAccepted,
    captureRejected,
    imageReuseRejected,
    imagePairEligible,
    frameValid,
    referenceGeometryCompatible,
    visualValid,
    matchCount,
    uncertaintyRejectionReason,
    currentDescriptor,
    currentPoint,
    currentEnabled,
    currentCount,
    currentFromReference,
    currentFromReferenceTranslation,
    relativeCovariance,
    mapCandidatePoint,
    mapCandidateEnabled,
    mapCandidateCount,
    nextQuaternion,
    positionCovariance,
    attitudeCovariance,
    confidence,
    features,
    featureEnabled,
    trackingCurrentPixel,
    trackingReferencePixel,
    trackingEnabled) := AdvanceRGBDLocalization(
    rgb=rgb,
    depth=depth,
    rgbCalibration=rgbCalibration,
    depthCalibration=depthCalibration,
    disparityNoise=disparityNoise,
    noiseReferenceFx=noiseReferenceFx,
    baseline=baseline,
    opticalToBody=opticalToBody,
    cameraOriginBody=cameraOriginBody,
    frameEnabled=frameEnabled,
    imageCaptureRequested=imageCaptureRequested,
    position=position,
    velocity=velocity,
    rotation=rotation,
    accelBias=accelBias,
    gyroBias=gyroBias,
    covariance=covariance,
    crossCovariance=crossCovariance,
    referenceCovariance=referenceCovariance,
    referencePosition=referencePosition,
    referenceRotation=referenceRotation,
    referenceAvailable=referenceAvailable,
    referenceEpoch=referenceEpoch,
    currentEpoch=currentEpoch,
    referenceUsed=referenceUsed,
    lastUsedEpoch=lastUsedEpoch,
    referenceDescriptor=referenceDescriptor,
    referencePoint=referencePoint,
    referenceEnabled=referenceEnabled,
    referencePixels=referencePixels,
    referenceCount=referenceCount,
    referenceRgbCalibration=referenceRgbCalibration,
    referenceDepthCalibration=referenceDepthCalibration,
    referenceNoiseReferenceFx=referenceNoiseReferenceFx,
    referenceDisparityNoise=referenceDisparityNoise,
    referenceBaseline=referenceBaseline,
    referenceOpticalToBody=referenceOpticalToBody,
    referenceCameraOriginBody=referenceCameraOriginBody,
    accel=accel,
    gyro=gyro,
    gravity=gravity,
    h=h,
    density=density,
    pixels=pixels,
    activeCount=activeCount,
    featureScore=featureScore,depthUnits=depthUnits);
end RGBDInertialLocalizationStep;

// Ordered reusable full-domain step. Both original equation models above/in
// SchmidtReferenceState remain unchanged reference owners. Explicit covariance
// inputs carry tuned priors; these defaults match the existing public interface.
pure function AdvanceRGBDLocalization
  input Real rgb[:,:,:];
  input Real depth[size(rgb,1),size(rgb,2)];
  input Real rgbCalibration[4] = RGBDNominalCalibration({size(rgb,1),size(rgb,2)},{69.0,42.0});
  input Real depthCalibration[4] = RGBDNominalCalibration({size(rgb,1),size(rgb,2)},{87.0,58.0});
  input Real disparityNoise = 0.08;
  input Real noiseReferenceFx = defaultNoiseReferenceFx;
  input Real baseline = 0.05;
  input Real opticalToBody[3,3] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[3] = {0.18,0.0,-0.04};
  input Real frameEnabled = 0.0;
  input Real imageCaptureRequested = 0.0;
  input Real position[3] = zeros(3);
  input Real velocity[3] = zeros(3);
  input Real rotation[3,3] = identity(3);
  input Real accelBias[3] = zeros(3);
  input Real gyroBias[3] = zeros(3);
  input Real covariance[15,15] = diagonal({initialPositionVariance,initialPositionVariance,initialPositionVariance,
    initialVelocityVariance,initialVelocityVariance,initialVelocityVariance,
    initialAttitudeVariance,initialAttitudeVariance,initialAttitudeVariance,
    initialAccelBiasVariance,initialAccelBiasVariance,initialAccelBiasVariance,
    initialGyroBiasVariance,initialGyroBiasVariance,initialGyroBiasVariance});
  input Real crossCovariance[15,6] = zeros(15,6);
  input Real referenceCovariance[6,6] = zeros(6,6);
  input Real referencePosition[3] = zeros(3);
  input Real referenceRotation[3,3] = identity(3);
  input Real referenceAvailable = 0.0;
  input Real referenceEpoch = 0.0;
  input Real currentEpoch = 0.0;
  input Real referenceUsed = 0.0;
  input Real lastUsedEpoch = -1.0;
  input Real referenceDescriptor[featureCapacity,descriptorSize] = zeros(featureCapacity,descriptorSize);
  input Real referencePoint[featureCapacity,3] = zeros(featureCapacity,3);
  input Real referenceEnabled[featureCapacity] = zeros(featureCapacity);
  input Real referencePixels[featureCapacity,2] = zeros(featureCapacity,2);
  input Real referenceCount = 0.0;
  input Real referenceRgbCalibration[4] = RGBDNominalCalibration({size(rgb,1),size(rgb,2)},{69.0,42.0});
  input Real referenceDepthCalibration[4] = RGBDNominalCalibration({size(rgb,1),size(rgb,2)},{87.0,58.0});
  input Real referenceNoiseReferenceFx = defaultNoiseReferenceFx;
  input Real referenceDisparityNoise = 0.08;
  input Real referenceBaseline = 0.05;
  input Real referenceOpticalToBody[3,3] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real referenceCameraOriginBody[3] = {0.18,0.0,-0.04};
  input Real accel[3] = {0.0,0.0,9.81};
  input Real gyro[3] = zeros(3);
  input Real gravity[3] = {0.0,0.0,-9.81};
  input Real h = 1.0/90.0;
  input Real density[12] = {0.06,0.06,0.06,0.006,0.006,0.006,0.002,0.002,0.002,0.0002,0.0002,0.0002};
  input Real pixels[featureCapacity,2];
  input Real activeCount;
  input Real featureScore[featureCapacity] = zeros(featureCapacity);
  output Real nextPosition[3];
  output Real nextVelocity[3];
  output Real nextRotation[3,3];
  output Real nextAccelBias[3];
  output Real nextGyroBias[3];
  output Real nextCovariance[15,15];
  output Real nextCrossCovariance[15,6];
  output Real nextReferenceCovariance[6,6];
  output Real nextReferencePosition[3];
  output Real nextReferenceRotation[3,3];
  output Real nextReferenceAvailable;
  output Real nextReferenceEpoch;
  output Real nextReferenceUsed;
  output Real nextLastUsedEpoch;
  output Real nextReferenceDescriptor[featureCapacity,descriptorSize];
  output Real nextReferencePoint[featureCapacity,3];
  output Real nextReferenceEnabled[featureCapacity];
  output Real nextReferencePixels[featureCapacity,2];
  output Real nextReferenceCount;
  output Real nextReferenceRgbCalibration[4];
  output Real nextReferenceDepthCalibration[4];
  output Real nextReferenceNoiseReferenceFx;
  output Real nextReferenceDisparityNoise;
  output Real nextReferenceBaseline;
  output Real nextReferenceOpticalToBody[3,3];
  output Real nextReferenceCameraOriginBody[3];
  output Real predictionAccepted;
  output Real observationAccepted;
  output Real observationRejected;
  output Real captureAccepted;
  output Real captureRejected;
  output Real imageReuseRejected;
  output Real imagePairEligible;
  output Real frameValid;
  output Real referenceGeometryCompatible;
  output Real visualValid;
  output Real matchCount;
  output Real uncertaintyRejectionReason;
  output Real currentDescriptor[featureCapacity,descriptorSize];
  output Real currentPoint[featureCapacity,3];
  output Real currentEnabled[featureCapacity];
  output Real currentCount;
  output Real currentFromReference[3,3];
  output Real currentFromReferenceTranslation[3];
  output Real relativeCovariance[6,6];
  output Real mapCandidatePoint[featureCapacity,3];
  output Real mapCandidateEnabled[featureCapacity];
  output Real mapCandidateCount;
  output Real nextQuaternion[4];
  output Real positionCovariance[3,3];
  output Real attitudeCovariance[3,3];
  output Real confidence;
  output Real features[featureCapacity,3];
  output Real featureEnabled[featureCapacity];
  output Real trackingCurrentPixel[featureCapacity,2];
  output Real trackingReferencePixel[featureCapacity,2];
  output Real trackingEnabled[featureCapacity];
  input Real depthUnits = 1.0 "Meters per depth sample; 1 for metric depth, SDK scale for Z16";
protected
  constant Integer featureCapacity = 350;
  constant Integer descriptorSize = 49;
  constant Real initialPositionVariance = 0.25;
  constant Real initialVelocityVariance = 0.04;
  constant Real initialAttitudeVariance = 0.01;
  constant Real initialAccelBiasVariance = 0.0004;
  constant Real initialGyroBiasVariance = 0.000025;
  constant Real defaultNoiseReferenceFx = 848.0/(2.0*tan(87.0*3.141592653589793/360.0));
  constant Integer errorDimension = 15;
  constant Integer poseDimension = 6;
  Boolean imageOn; Boolean sameGeometry; Boolean currentOriginValid;
  Real usableReferenceCount; Real pairValid; Real pairEligible; Real captureFresh;
  Real predictedPosition[3]; Real predictedVelocity[3]; Real predictedRotation[3,3];
  Real predictedCovariance[errorDimension,errorDimension]; Real predictedCross[errorDimension,poseDimension];
  Real transition[errorDimension,errorDimension]; Real processCovariance[errorDimension,errorDimension];
  Integer substeps;
  Real correctedCovariance[errorDimension,errorDimension]; Real correctedCross[errorDimension,poseDimension];
  Real correctedReferenceCovariance[poseDimension,poseDimension];
  Real correctionNis; Real correctionInnovation[poseDimension];
  Real correctionJacobian[poseDimension,errorDimension+poseDimension]; Real innovationCovariance[poseDimension,poseDimension];
  Real measurementEnabled; Real captureRequest; Real pairAttempted; Real usedEpochAfterAttempt;
  Real projectionInvalidCount; Real projectionConfigurationValid; Real projectionPoseValid;
  Real orientationVector[3]; Real orientationAngle; Real orientationValid; Real orientationQuaternion[4];
  Real visual_observedBodyRotation[3,3];
  Real visual_observedBodyPosition[3];
  Real visual_valid;
  Real visual_registrationRms;
  Real visual_registrationRejectionReason;
  Real visual_currentIndex[featureCapacity];
  Real visual_conditionalObservationCovariance[6,6];
  Real visual_uncertaintyValidCount;
  Real visual_uncertaintyInvalidCount;
  Real visual_descriptionInvalidCount;
  Real visual_matchingConfigurationValid;
  Real visual_invalidReference;
  Real visual_invalidCurrent;
  Real visual_pairEnabled[featureCapacity];
  Real visual_registrationAccepted;
  Real visual_registrationValidCount;
  Real visual_registrationInvalidCount;
  Real visual_registrationRank;
  Real visual_uncertaintyValid;
algorithm
  imageOn := SLAMExactRealEqual(frameEnabled,1.0);
  sameGeometry := SLAMExactRealEqual(referenceBaseline,baseline)
    and SLAMExactRealEqual(referenceDisparityNoise,disparityNoise);
  currentOriginValid := true;
  for axis in 1:3 loop
    currentOriginValid := currentOriginValid and abs(cameraOriginBody[axis]) <= 10.0;
    sameGeometry := sameGeometry and SLAMExactRealEqual(referenceCameraOriginBody[axis],cameraOriginBody[axis]);
    for column in 1:3 loop
      sameGeometry := sameGeometry and SLAMExactRealEqual(referenceOpticalToBody[axis,column],opticalToBody[axis,column]);
    end for;
  end for;
  referenceGeometryCompatible := if sameGeometry then 1.0 else 0.0;
  usableReferenceCount := if SLAMExactRealEqual(referenceAvailable,1.0) and sameGeometry then referenceCount else 0.0;
  (pairValid,pairEligible,captureFresh) := SchmidtImagePairEligibility(
    referenceAvailable,referenceUsed,referenceEpoch,currentEpoch,lastUsedEpoch);
  (predictionAccepted,transition,processCovariance,predictedPosition,predictedVelocity,predictedRotation,
    predictedCovariance,predictedCross,substeps) := ES15PredictHeldInterval(
      position,velocity,rotation,accelBias,gyroBias,covariance,crossCovariance,referenceCovariance,
      referencePosition,referenceRotation,referenceAvailable,accel,gyro,gravity,h,density);
  // Visual diagnostics stay observable even when prediction refuses this interval.
  (visual_observedBodyRotation,
    visual_observedBodyPosition,
    visual_valid,
    matchCount,
    visual_registrationRms,
    visual_registrationRejectionReason,
    visual_currentIndex,
    currentDescriptor,
    currentPoint,
    currentEnabled,
    currentFromReference,
    currentFromReferenceTranslation,
    relativeCovariance,
    visual_conditionalObservationCovariance,
    visualValid,
    uncertaintyRejectionReason,
    visual_uncertaintyValidCount,
    visual_uncertaintyInvalidCount,
    visual_descriptionInvalidCount,
    visual_matchingConfigurationValid,
    visual_invalidReference,
    visual_invalidCurrent,
    visual_pairEnabled,
    visual_registrationAccepted,
    visual_registrationValidCount,
    visual_registrationInvalidCount,
    visual_registrationRank,
    visual_uncertaintyValid) := ObserveRGBDRelativeFrame(
    rgb=rgb,depth=depth,pixels=pixels,activeCount=if imageOn then activeCount else 0.0,
    rgbCalibration=rgbCalibration,depthCalibration=depthCalibration,noiseReferenceFx=noiseReferenceFx,
    referenceDescriptor=referenceDescriptor,referencePoint=referencePoint,referenceEnabled=referenceEnabled,
    referenceCount=usableReferenceCount,referenceRgbFocal={referenceRgbCalibration[1],referenceRgbCalibration[2]},
    referenceNoiseReferenceFx=referenceNoiseReferenceFx,imageEnabled=imageOn,disparityNoise=disparityNoise,baseline=baseline,
    referenceBodyPosition=referencePosition,referenceBodyRotation=referenceRotation,
    opticalToBody=opticalToBody,cameraOriginBody=cameraOriginBody,depthUnits=depthUnits);
  frameValid := if imageOn and activeCount >= 0.0 and activeCount <= featureCapacity
    and SLAMExactRealEqual(activeCount,floor(activeCount)) and sum(currentEnabled) >= 3.0
    and disparityNoise > 0.0 and disparityNoise <= 1.0 and noiseReferenceFx >= 1e-6 and noiseReferenceFx <= 1e6
    and baseline >= 1e-6 and baseline <= 1.0 and RGBDProperRotationValue(opticalToBody) > 0.5
    and currentOriginValid then 1.0 else 0.0;
  measurementEnabled := if frameValid > 0.5 and sameGeometry and visualValid > 0.5 then 1.0 else 0.0;
  captureRequest := if frameValid > 0.5 then imageCaptureRequested else 0.0;
  (observationAccepted,correctionNis,correctionInnovation,correctionJacobian,innovationCovariance,
    nextPosition,nextVelocity,nextRotation,nextAccelBias,nextGyroBias,correctedCovariance,correctedCross,
    correctedReferenceCovariance) := SchmidtCorrectRelativePose(
      position=predictedPosition,velocity=predictedVelocity,rotation=predictedRotation,accelBias=accelBias,gyroBias=gyroBias,
      covariance=predictedCovariance,crossCovariance=predictedCross,referenceCovariance=referenceCovariance,
      referencePosition=referencePosition,referenceRotation=referenceRotation,opticalToBody=opticalToBody,
      cameraOriginBody=cameraOriginBody,measuredRotation=currentFromReference,measuredTranslation=currentFromReferenceTranslation,
      relativeCovariance=relativeCovariance,measurementEnabled=if predictionAccepted > 0.5 and pairEligible > 0.5 then measurementEnabled else 0.0);
  // An eligible attempted pair consumes its epoch even when correction rejects.
  pairAttempted := if predictionAccepted > 0.5 and pairEligible > 0.5
    and SLAMExactRealEqual(measurementEnabled,1.0) then 1.0 else 0.0;
  usedEpochAfterAttempt := if pairAttempted > 0.5 then currentEpoch else lastUsedEpoch;
  imagePairEligible := pairEligible;
  imageReuseRejected := if predictionAccepted > 0.5 and SLAMExactRealEqual(measurementEnabled,1.0)
    and pairEligible < 0.5 then 1.0 else 0.0;
  observationRejected := if predictionAccepted > 0.5 and not SLAMExactRealEqual(measurementEnabled,0.0)
    and observationAccepted < 0.5 then 1.0 else 0.0;
  (captureAccepted,captureRejected,nextReferenceAvailable,nextReferencePosition,nextReferenceRotation,
    nextCovariance,nextCrossCovariance,nextReferenceCovariance) := SchmidtCaptureReference(
      nextPosition,nextRotation,correctedCovariance,referencePosition,referenceRotation,
      correctedCross,correctedReferenceCovariance,referenceAvailable,captureRequest,
      if predictionAccepted > 0.5 and captureFresh > 0.5 and currentEpoch > usedEpochAfterAttempt then 1.0 else 0.0);
  if imageOn and SLAMExactRealEqual(imageCaptureRequested,1.0) and frameValid < 0.5 then captureRejected := 1.0; end if;
  nextReferenceEpoch := if captureAccepted > 0.5 then currentEpoch else referenceEpoch;
  nextReferenceUsed := if captureAccepted > 0.5 then 0.0 else if pairAttempted > 0.5 then 1.0 else referenceUsed;
  nextLastUsedEpoch := usedEpochAfterAttempt;
  nextReferenceDescriptor := if captureAccepted > 0.5 then currentDescriptor else referenceDescriptor;
  nextReferencePoint := if captureAccepted > 0.5 then currentPoint else referencePoint;
  nextReferenceEnabled := if captureAccepted > 0.5 then currentEnabled else referenceEnabled;
  nextReferencePixels := if captureAccepted > 0.5 then pixels else referencePixels;
  nextReferenceCount := if captureAccepted > 0.5 then activeCount else referenceCount;
  nextReferenceRgbCalibration := if captureAccepted > 0.5 then rgbCalibration else referenceRgbCalibration;
  nextReferenceDepthCalibration := if captureAccepted > 0.5 then depthCalibration else referenceDepthCalibration;
  nextReferenceNoiseReferenceFx := if captureAccepted > 0.5 then noiseReferenceFx else referenceNoiseReferenceFx;
  nextReferenceDisparityNoise := if captureAccepted > 0.5 then disparityNoise else referenceDisparityNoise;
  nextReferenceBaseline := if captureAccepted > 0.5 then baseline else referenceBaseline;
  nextReferenceOpticalToBody := if captureAccepted > 0.5 then opticalToBody else referenceOpticalToBody;
  nextReferenceCameraOriginBody := if captureAccepted > 0.5 then cameraOriginBody else referenceCameraOriginBody;
  (mapCandidatePoint,mapCandidateEnabled,mapCandidateCount,projectionInvalidCount,projectionConfigurationValid,projectionPoseValid)
    := RGBDProjectLandmarks(currentPoint,currentEnabled,if imageOn then activeCount else 0.0,
      if imageOn and (observationAccepted > 0.5 or captureAccepted > 0.5) then 1.0 else 0.0,
      nextRotation,nextPosition,opticalToBody,cameraOriginBody);
  (orientationVector,orientationAngle,orientationValid,orientationQuaternion) := SLAMRotationCoordinates(nextRotation);
  nextQuaternion := if orientationValid > 0.5 then orientationQuaternion else {1.0,0.0,0.0,0.0};
  positionCovariance := nextCovariance[1:3,1:3]; attitudeCovariance := nextCovariance[7:9,7:9];
  confidence := observationAccepted; featureEnabled := currentEnabled;
  currentCount := if imageOn then activeCount else 0.0;
  for feature in 1:featureCapacity loop
    features[feature,1] := if currentEnabled[feature] > 0.5 then pixels[feature,1] else 0.0;
    features[feature,2] := if currentEnabled[feature] > 0.5 then pixels[feature,2] else 0.0;
    features[feature,3] := if currentEnabled[feature] > 0.5 and abs(featureScore[feature]) <= 1e30 then featureScore[feature] else 0.0;
  end for;
  (trackingCurrentPixel,trackingReferencePixel,trackingEnabled) := RGBDLocalizationTracking(
    visual_currentIndex,pixels,referencePixels,referenceEnabled,currentEnabled,
    {size(rgb,1),size(rgb,2)});
end AdvanceRGBDLocalization;

// Full-raster source-owned FAST selection composed with the qualified core.
// The host transports the complete state and does no selection or filter math.
pure function AdvanceFastRGBDLocalization
  input Real rgb[:,:,:];
  input Real depth[size(rgb,1),size(rgb,2)];
  input Real rgbCalibration[4] = RGBDNominalCalibration({size(rgb,1),size(rgb,2)},{69.0,42.0});
  input Real depthCalibration[4] = RGBDNominalCalibration({size(rgb,1),size(rgb,2)},{87.0,58.0});
  input Real disparityNoise = 0.08;
  input Real noiseReferenceFx = defaultNoiseReferenceFx;
  input Real baseline = 0.05;
  input Real opticalToBody[3,3] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[3] = {0.18,0.0,-0.04};
  input Real frameEnabled = 0.0;
  input Real imageCaptureRequested = 0.0;
  input Real position[3] = zeros(3);
  input Real velocity[3] = zeros(3);
  input Real rotation[3,3] = identity(3);
  input Real accelBias[3] = zeros(3);
  input Real gyroBias[3] = zeros(3);
  input Real covariance[15,15] = diagonal({initialPositionVariance,initialPositionVariance,initialPositionVariance,
    initialVelocityVariance,initialVelocityVariance,initialVelocityVariance,
    initialAttitudeVariance,initialAttitudeVariance,initialAttitudeVariance,
    initialAccelBiasVariance,initialAccelBiasVariance,initialAccelBiasVariance,
    initialGyroBiasVariance,initialGyroBiasVariance,initialGyroBiasVariance});
  input Real crossCovariance[15,6] = zeros(15,6);
  input Real referenceCovariance[6,6] = zeros(6,6);
  input Real referencePosition[3] = zeros(3);
  input Real referenceRotation[3,3] = identity(3);
  input Real referenceAvailable = 0.0;
  input Real referenceEpoch = 0.0;
  input Real currentEpoch = 0.0;
  input Real referenceUsed = 0.0;
  input Real lastUsedEpoch = -1.0;
  input Real referenceDescriptor[featureCapacity,descriptorSize] = zeros(featureCapacity,descriptorSize);
  input Real referencePoint[featureCapacity,3] = zeros(featureCapacity,3);
  input Real referenceEnabled[featureCapacity] = zeros(featureCapacity);
  input Real referencePixels[featureCapacity,2] = zeros(featureCapacity,2);
  input Real referenceCount = 0.0;
  input Real referenceRgbCalibration[4] = RGBDNominalCalibration({size(rgb,1),size(rgb,2)},{69.0,42.0});
  input Real referenceDepthCalibration[4] = RGBDNominalCalibration({size(rgb,1),size(rgb,2)},{87.0,58.0});
  input Real referenceNoiseReferenceFx = defaultNoiseReferenceFx;
  input Real referenceDisparityNoise = 0.08;
  input Real referenceBaseline = 0.05;
  input Real referenceOpticalToBody[3,3] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real referenceCameraOriginBody[3] = {0.18,0.0,-0.04};
  input Real accel[3] = {0.0,0.0,9.81};
  input Real gyro[3] = zeros(3);
  input Real gravity[3] = {0.0,0.0,-9.81};
  input Real h = 1.0/90.0;
  input Real density[12] = {0.06,0.06,0.06,0.006,0.006,0.006,0.002,0.002,0.002,0.0002,0.0002,0.0002};
  input Real selectedFeatureLimit = 350.0;
  input Real absoluteThreshold = 18.0;
  output Real nextPosition[3];
  output Real nextVelocity[3];
  output Real nextRotation[3,3];
  output Real nextAccelBias[3];
  output Real nextGyroBias[3];
  output Real nextCovariance[15,15];
  output Real nextCrossCovariance[15,6];
  output Real nextReferenceCovariance[6,6];
  output Real nextReferencePosition[3];
  output Real nextReferenceRotation[3,3];
  output Real nextReferenceAvailable;
  output Real nextReferenceEpoch;
  output Real nextReferenceUsed;
  output Real nextLastUsedEpoch;
  output Real nextReferenceDescriptor[featureCapacity,descriptorSize];
  output Real nextReferencePoint[featureCapacity,3];
  output Real nextReferenceEnabled[featureCapacity];
  output Real nextReferencePixels[featureCapacity,2];
  output Real nextReferenceCount;
  output Real nextReferenceRgbCalibration[4];
  output Real nextReferenceDepthCalibration[4];
  output Real nextReferenceNoiseReferenceFx;
  output Real nextReferenceDisparityNoise;
  output Real nextReferenceBaseline;
  output Real nextReferenceOpticalToBody[3,3];
  output Real nextReferenceCameraOriginBody[3];
  output Real predictionAccepted;
  output Real observationAccepted;
  output Real observationRejected;
  output Real captureAccepted;
  output Real captureRejected;
  output Real imageReuseRejected;
  output Real imagePairEligible;
  output Real frameValid;
  output Real referenceGeometryCompatible;
  output Real visualValid;
  output Real matchCount;
  output Real uncertaintyRejectionReason;
  output Real currentDescriptor[featureCapacity,descriptorSize];
  output Real currentPoint[featureCapacity,3];
  output Real currentEnabled[featureCapacity];
  output Real currentCount;
  output Real currentFromReference[3,3];
  output Real currentFromReferenceTranslation[3];
  output Real relativeCovariance[6,6];
  output Real mapCandidatePoint[featureCapacity,3];
  output Real mapCandidateEnabled[featureCapacity];
  output Real mapCandidateCount;
  output Real nextQuaternion[4];
  output Real positionCovariance[3,3];
  output Real attitudeCovariance[3,3];
  output Real confidence;
  output Real features[featureCapacity,3];
  output Real featureEnabled[featureCapacity];
  output Real trackingCurrentPixel[featureCapacity,2];
  output Real trackingReferencePixel[featureCapacity,2];
  output Real trackingEnabled[featureCapacity];
  output Real selectionValid;
  input Boolean depthQualifiedSelection = false "Reserve the RGB-D budget for valid calibrated depth";
  input Real depthUnits = 1.0 "Meters per depth sample; 1 for metric depth, SDK scale for Z16";
protected
  constant Integer featureCapacity = 350;
  constant Integer descriptorSize = 49;
  constant Real initialPositionVariance = 0.25;
  constant Real initialVelocityVariance = 0.04;
  constant Real initialAttitudeVariance = 0.01;
  constant Real initialAccelBiasVariance = 0.0004;
  constant Real initialGyroBiasVariance = 0.000025;
  constant Real defaultNoiseReferenceFx = 848.0/(2.0*tan(87.0*3.141592653589793/360.0));
  constant Integer errorDimension = 15;
  constant Integer poseDimension = 6;
  Boolean imageOn; Boolean selectionConfiguration;
  Real scores[size(rgb,1)*size(rgb,2)]; Real selectedFeatures[featureCapacity,3];
  Real selectionCount; Real selectionStatus; Real selectedCount;
algorithm
  imageOn := SLAMExactRealEqual(frameEnabled,1.0);
  scores := FastFrameScores(rgb,imageOn);
  if depthQualifiedSelection then
    scores := RGBDDepthQualifiedScores(depth,scores,rgbCalibration,depthCalibration,
      0.28,10.0,disparityNoise,noiseReferenceFx,baseline,imageOn,depthUnits=depthUnits);
  end if;
  (selectedFeatures,selectionCount,selectionStatus) := SelectRasterFeatures(scores,
    size(rgb,2),size(rgb,1),featureCapacity,3,
    {absoluteThreshold,0.0,1e8,3.0,selectedFeatureLimit,1.0,3.0,3.0},false,imageOn);
  selectionConfiguration := selectedFeatureLimit >= 1.0 and selectedFeatureLimit <= featureCapacity
    and SLAMExactRealEqual(selectedFeatureLimit,floor(selectedFeatureLimit));
  selectionValid := if selectionConfiguration and selectionStatus > 0.5
    and selectionCount >= 0.0 and selectionCount <= featureCapacity then 1.0 else 0.0;
  selectedCount := if selectionValid > 0.5 then selectionCount else 0.0;
  (nextPosition,
    nextVelocity,
    nextRotation,
    nextAccelBias,
    nextGyroBias,
    nextCovariance,
    nextCrossCovariance,
    nextReferenceCovariance,
    nextReferencePosition,
    nextReferenceRotation,
    nextReferenceAvailable,
    nextReferenceEpoch,
    nextReferenceUsed,
    nextLastUsedEpoch,
    nextReferenceDescriptor,
    nextReferencePoint,
    nextReferenceEnabled,
    nextReferencePixels,
    nextReferenceCount,
    nextReferenceRgbCalibration,
    nextReferenceDepthCalibration,
    nextReferenceNoiseReferenceFx,
    nextReferenceDisparityNoise,
    nextReferenceBaseline,
    nextReferenceOpticalToBody,
    nextReferenceCameraOriginBody,
    predictionAccepted,
    observationAccepted,
    observationRejected,
    captureAccepted,
    captureRejected,
    imageReuseRejected,
    imagePairEligible,
    frameValid,
    referenceGeometryCompatible,
    visualValid,
    matchCount,
    uncertaintyRejectionReason,
    currentDescriptor,
    currentPoint,
    currentEnabled,
    currentCount,
    currentFromReference,
    currentFromReferenceTranslation,
    relativeCovariance,
    mapCandidatePoint,
    mapCandidateEnabled,
    mapCandidateCount,
    nextQuaternion,
    positionCovariance,
    attitudeCovariance,
    confidence,
    features,
    featureEnabled,
    trackingCurrentPixel,
    trackingReferencePixel,
    trackingEnabled) := AdvanceRGBDLocalization(
    rgb=rgb,
    depth=depth,
    rgbCalibration=rgbCalibration,
    depthCalibration=depthCalibration,
    disparityNoise=disparityNoise,
    noiseReferenceFx=noiseReferenceFx,
    baseline=baseline,
    opticalToBody=opticalToBody,
    cameraOriginBody=cameraOriginBody,
    frameEnabled=frameEnabled,
    imageCaptureRequested=imageCaptureRequested,
    position=position,
    velocity=velocity,
    rotation=rotation,
    accelBias=accelBias,
    gyroBias=gyroBias,
    covariance=covariance,
    crossCovariance=crossCovariance,
    referenceCovariance=referenceCovariance,
    referencePosition=referencePosition,
    referenceRotation=referenceRotation,
    referenceAvailable=referenceAvailable,
    referenceEpoch=referenceEpoch,
    currentEpoch=currentEpoch,
    referenceUsed=referenceUsed,
    lastUsedEpoch=lastUsedEpoch,
    referenceDescriptor=referenceDescriptor,
    referencePoint=referencePoint,
    referenceEnabled=referenceEnabled,
    referencePixels=referencePixels,
    referenceCount=referenceCount,
    referenceRgbCalibration=referenceRgbCalibration,
    referenceDepthCalibration=referenceDepthCalibration,
    referenceNoiseReferenceFx=referenceNoiseReferenceFx,
    referenceDisparityNoise=referenceDisparityNoise,
    referenceBaseline=referenceBaseline,
    referenceOpticalToBody=referenceOpticalToBody,
    referenceCameraOriginBody=referenceCameraOriginBody,
    accel=accel,
    gyro=gyro,
    gravity=gravity,
    h=h,
    density=density,
    pixels=selectedFeatures[1:featureCapacity,1:2],activeCount=selectedCount,
    featureScore=selectedFeatures[1:featureCapacity,3],depthUnits=depthUnits);
end AdvanceFastRGBDLocalization;

model RGBDFastInertialLocalizationStep
  extends RGBDInertialLocalizationInterface;
  parameter Real selectedFeatureLimit = 350.0;
  parameter Real absoluteThreshold = 18.0;
  output Real selectionValid;
algorithm
  (nextPosition,
    nextVelocity,
    nextRotation,
    nextAccelBias,
    nextGyroBias,
    nextCovariance,
    nextCrossCovariance,
    nextReferenceCovariance,
    nextReferencePosition,
    nextReferenceRotation,
    nextReferenceAvailable,
    nextReferenceEpoch,
    nextReferenceUsed,
    nextLastUsedEpoch,
    nextReferenceDescriptor,
    nextReferencePoint,
    nextReferenceEnabled,
    nextReferencePixels,
    nextReferenceCount,
    nextReferenceRgbCalibration,
    nextReferenceDepthCalibration,
    nextReferenceNoiseReferenceFx,
    nextReferenceDisparityNoise,
    nextReferenceBaseline,
    nextReferenceOpticalToBody,
    nextReferenceCameraOriginBody,
    predictionAccepted,
    observationAccepted,
    observationRejected,
    captureAccepted,
    captureRejected,
    imageReuseRejected,
    imagePairEligible,
    frameValid,
    referenceGeometryCompatible,
    visualValid,
    matchCount,
    uncertaintyRejectionReason,
    currentDescriptor,
    currentPoint,
    currentEnabled,
    currentCount,
    currentFromReference,
    currentFromReferenceTranslation,
    relativeCovariance,
    mapCandidatePoint,
    mapCandidateEnabled,
    mapCandidateCount,
    nextQuaternion,
    positionCovariance,
    attitudeCovariance,
    confidence,
    features,
    featureEnabled,
    trackingCurrentPixel,
    trackingReferencePixel,
    trackingEnabled,
    selectionValid) := AdvanceFastRGBDLocalization(
    rgb=rgb,
    depth=depth,
    rgbCalibration=rgbCalibration,
    depthCalibration=depthCalibration,
    disparityNoise=disparityNoise,
    noiseReferenceFx=noiseReferenceFx,
    baseline=baseline,
    opticalToBody=opticalToBody,
    cameraOriginBody=cameraOriginBody,
    frameEnabled=frameEnabled,
    imageCaptureRequested=imageCaptureRequested,
    position=position,
    velocity=velocity,
    rotation=rotation,
    accelBias=accelBias,
    gyroBias=gyroBias,
    covariance=covariance,
    crossCovariance=crossCovariance,
    referenceCovariance=referenceCovariance,
    referencePosition=referencePosition,
    referenceRotation=referenceRotation,
    referenceAvailable=referenceAvailable,
    referenceEpoch=referenceEpoch,
    currentEpoch=currentEpoch,
    referenceUsed=referenceUsed,
    lastUsedEpoch=lastUsedEpoch,
    referenceDescriptor=referenceDescriptor,
    referencePoint=referencePoint,
    referenceEnabled=referenceEnabled,
    referencePixels=referencePixels,
    referenceCount=referenceCount,
    referenceRgbCalibration=referenceRgbCalibration,
    referenceDepthCalibration=referenceDepthCalibration,
    referenceNoiseReferenceFx=referenceNoiseReferenceFx,
    referenceDisparityNoise=referenceDisparityNoise,
    referenceBaseline=referenceBaseline,
    referenceOpticalToBody=referenceOpticalToBody,
    referenceCameraOriginBody=referenceCameraOriginBody,
    accel=accel,
    gyro=gyro,
    gravity=gravity,
    h=h,
    density=density,
    selectedFeatureLimit=selectedFeatureLimit,absoluteThreshold=absoluteThreshold,depthUnits=depthUnits);
end RGBDFastInertialLocalizationStep;

// Complete time-zero raw RGB-D transaction; no positive-duration prediction.
// Ordered array math stays in this reusable function, with unchanged model I/O.
function InitializeRGBDLocalization
  input Real rgb[:,:,:];
  input Real depth[size(rgb,1),size(rgb,2)];
  input Real rgbCalibration[4];
  input Real depthCalibration[4];
  input Real disparityNoise;
  input Real noiseReferenceFx;
  input Real baseline;
  input Real opticalToBody[3,3];
  input Real cameraOriginBody[3];
  input Real frameEnabled;
  input Real imageCaptureRequested;
  input Real position[3];
  input Real velocity[3];
  input Real rotation[3,3];
  input Real accelBias[3];
  input Real gyroBias[3];
  input Real covariance[15,15];
  input Real crossCovariance[15,6];
  input Real referenceCovariance[6,6];
  input Real referencePosition[3];
  input Real referenceRotation[3,3];
  input Real referenceAvailable;
  input Real referenceEpoch;
  input Real currentEpoch;
  input Real referenceUsed;
  input Real lastUsedEpoch;
  input Real referenceDescriptor[featureCapacity,descriptorSize];
  input Real referencePoint[featureCapacity,3];
  input Real referenceEnabled[featureCapacity];
  input Real referencePixels[featureCapacity,2];
  input Real referenceCount;
  input Real referenceRgbCalibration[4];
  input Real referenceDepthCalibration[4];
  input Real referenceNoiseReferenceFx;
  input Real referenceDisparityNoise;
  input Real referenceBaseline;
  input Real referenceOpticalToBody[3,3];
  input Real referenceCameraOriginBody[3];
  input Real accel[3];
  input Real gyro[3];
  input Real gravity[3];
  input Real h;
  input Real density[12];
  input Real pixels[featureCapacity,2];
  input Real activeCount;
  input Real featureScore[featureCapacity];
  input Real imageTime;
  input Real initializationRequested;
  output Real nextPosition[3];
  output Real nextVelocity[3];
  output Real nextRotation[3,3];
  output Real nextAccelBias[3];
  output Real nextGyroBias[3];
  output Real nextCovariance[15,15];
  output Real nextCrossCovariance[15,6];
  output Real nextReferenceCovariance[6,6];
  output Real nextReferencePosition[3];
  output Real nextReferenceRotation[3,3];
  output Real nextReferenceAvailable;
  output Real nextReferenceEpoch;
  output Real nextReferenceUsed;
  output Real nextLastUsedEpoch;
  output Real nextReferenceDescriptor[featureCapacity,descriptorSize];
  output Real nextReferencePoint[featureCapacity,3];
  output Real nextReferenceEnabled[featureCapacity];
  output Real nextReferencePixels[featureCapacity,2];
  output Real nextReferenceCount;
  output Real nextReferenceRgbCalibration[4];
  output Real nextReferenceDepthCalibration[4];
  output Real nextReferenceNoiseReferenceFx;
  output Real nextReferenceDisparityNoise;
  output Real nextReferenceBaseline;
  output Real nextReferenceOpticalToBody[3,3];
  output Real nextReferenceCameraOriginBody[3];
  output Real predictionAccepted;
  output Real observationAccepted;
  output Real observationRejected;
  output Real captureAccepted;
  output Real captureRejected;
  output Real imageReuseRejected;
  output Real imagePairEligible;
  output Real frameValid;
  output Real referenceGeometryCompatible;
  output Real visualValid;
  output Real matchCount;
  output Real uncertaintyRejectionReason;
  output Real currentDescriptor[featureCapacity,descriptorSize];
  output Real currentPoint[featureCapacity,3];
  output Real currentEnabled[featureCapacity];
  output Real currentCount;
  output Real currentFromReference[3,3];
  output Real currentFromReferenceTranslation[3];
  output Real relativeCovariance[6,6];
  output Real mapCandidatePoint[featureCapacity,3];
  output Real mapCandidateEnabled[featureCapacity];
  output Real mapCandidateCount;
  output Real nextQuaternion[4];
  output Real positionCovariance[3,3];
  output Real attitudeCovariance[3,3];
  output Real confidence;
  output Real features[featureCapacity,3];
  output Real featureEnabled[featureCapacity];
  output Real trackingCurrentPixel[featureCapacity,2];
  output Real trackingReferencePixel[featureCapacity,2];
  output Real trackingEnabled[featureCapacity];
  output Real initializationAccepted;
  output Real initializationRejected;
  input Real minimumContrast = 1e-6;
  input Real nearDepth = 0.28;
  input Real farDepth = 10.0;
  input Real depthUnits = 1.0 "Meters per depth sample; 1 for metric depth, SDK scale for Z16";
protected
  constant Integer featureCapacity = 350;
  constant Integer descriptorSize = 49;
  Boolean imageOn;
  Real nominalChecks[3]; Real densityChecks[12];
  Real originChecks[3]; Real cameraChecks[3,3]; Real referenceOriginChecks[3];
  Real currentCovarianceValid; Real jointCovarianceValid;
  Real priorJoint[21,21]; Real priorValid;
  Real pairValid; Real pairEligible; Real captureFresh;
  Real descriptorInvalidCount; Real captureRejectedInternal;
  Real projectionInvalidCount; Real projectionConfigurationValid; Real projectionPoseValid;
  Real orientationVector[3]; Real orientationAngle; Real orientationValid; Real orientationQuaternion[4];
algorithm
  imageOn := SLAMExactRealEqual(frameEnabled,1.0);
  (pairValid,pairEligible,captureFresh) := SchmidtImagePairEligibility(referenceAvailable,
    referenceUsed,referenceEpoch,currentEpoch,lastUsedEpoch);
  priorJoint := cat(1,cat(2,covariance,crossCovariance),
    cat(2,transpose(crossCovariance),referenceCovariance));
  currentCovarianceValid := SLAMCovariancePSDCheck(covariance,1e-12);
  jointCovarianceValid := SLAMCovariancePSDCheck(priorJoint,1e-12);
  for axis in 1:3 loop
    nominalChecks[axis] := if noEvent(abs(position[axis]) <= 1e6
      and abs(velocity[axis]) <= 1e6 and abs(accelBias[axis]) <= 2.0
      and abs(gyroBias[axis]) <= 0.3 and abs(gravity[axis]) <= 1e3
      and abs(referencePosition[axis]) <= 1e6) then 0.0 else 1.0;
    originChecks[axis] := if noEvent(abs(cameraOriginBody[axis]) <= 10.0) then 0.0 else 1.0;
    referenceOriginChecks[axis] := if noEvent(SLAMExactRealEqual(referenceCameraOriginBody[axis],cameraOriginBody[axis]))
      then 0.0 else 1.0;
    for column in 1:3 loop
      cameraChecks[axis,column] := if noEvent(SLAMExactRealEqual(referenceOpticalToBody[axis,column],opticalToBody[axis,column]))
        then 0.0 else 1.0;
    end for;
  end for;
  for channel in 1:12 loop
    densityChecks[channel] := if noEvent(density[channel] >= 0.0 and density[channel] <= 1e6) then 0.0 else 1.0;
  end for;
  // Complete prior validation includes unavailable cross/reference buffers;
  // initialization never erases a malformed prior to manufacture a cold clone.
  priorValid := if noEvent(RGBDProperRotationValue(rotation) > 0.5 and RGBDProperRotationValue(referenceRotation) > 0.5
    and sum(nominalChecks)+sum(densityChecks) < 0.5
    and currentCovarianceValid > 0.5 and jointCovarianceValid > 0.5
    and pairValid > 0.5) then 1.0 else 0.0;
  initializationAccepted := if noEvent(SLAMExactRealEqual(initializationRequested,1.0)
    and SLAMExactRealEqual(imageTime,0.0) and priorValid > 0.5
    and (SLAMExactRealEqual(frameEnabled,0.0) or imageOn)) then 1.0 else 0.0;
  initializationRejected := if noEvent(SLAMExactRealEqual(initializationRequested,0.0)
    or initializationAccepted > 0.5) then 0.0 else 1.0;
  // Raw image reads stay inside the existing acquisition guard. Alpha is ignored.
  (currentDescriptor,currentPoint,currentEnabled,descriptorInvalidCount) := DescribeRGBDFrame(
    rgb,depth,pixels,if imageOn and initializationAccepted > 0.5 then activeCount else 0.0,
    rgbCalibration,depthCalibration,disparityNoise,noiseReferenceFx,baseline,
    nearDepth,farDepth,minimumContrast,imageOn and initializationAccepted > 0.5,depthUnits=depthUnits);
  frameValid := if noEvent(imageOn and initializationAccepted > 0.5
    and activeCount >= 0.0 and activeCount <= featureCapacity
    and SLAMExactRealEqual(activeCount,floor(activeCount)) and sum(currentEnabled) >= 3.0
    and disparityNoise > 0.0 and disparityNoise <= 1.0
    and noiseReferenceFx >= 1e-6 and noiseReferenceFx <= 1e6
    and baseline >= 1e-6 and baseline <= 1.0 and RGBDProperRotationValue(opticalToBody) > 0.5
    and sum(originChecks) < 0.5) then 1.0 else 0.0;
  referenceGeometryCompatible := if noEvent(sum(cameraChecks)+sum(referenceOriginChecks) < 0.5
    and SLAMExactRealEqual(referenceBaseline,baseline)
    and SLAMExactRealEqual(referenceDisparityNoise,disparityNoise)) then 1.0 else 0.0;
  (captureAccepted,captureRejectedInternal,nextReferenceAvailable,nextReferencePosition,
    nextReferenceRotation,nextCovariance,nextCrossCovariance,nextReferenceCovariance)
    := SchmidtCaptureReference(position,rotation,covariance,referencePosition,referenceRotation,
      crossCovariance,referenceCovariance,referenceAvailable,
      if initializationAccepted > 0.5 and frameValid > 0.5 then imageCaptureRequested else 0.0,
      if initializationAccepted > 0.5 and frameValid > 0.5 and captureFresh > 0.5 then 1.0 else 0.0);
  (mapCandidatePoint,mapCandidateEnabled,mapCandidateCount,projectionInvalidCount,
    projectionConfigurationValid,projectionPoseValid) := RGBDProjectLandmarks(
      currentPoint,currentEnabled,if imageOn then activeCount else 0.0,captureAccepted,
      rotation,position,opticalToBody,cameraOriginBody);
  // No positive-duration component is instantiated. These unused inherited
  // inputs (h,accel,gyro) cannot trigger prediction or alter any current mean/P.
  predictionAccepted := 0.0; observationAccepted := 0.0; observationRejected := 0.0;
  captureRejected := if noEvent(imageOn and SLAMExactRealEqual(imageCaptureRequested,1.0)
    and (initializationAccepted < 0.5 or frameValid < 0.5)) then 1.0 else captureRejectedInternal;
  imagePairEligible := 0.0; imageReuseRejected := 0.0;
  nextPosition := position; nextVelocity := velocity; nextRotation := rotation;
  nextAccelBias := accelBias; nextGyroBias := gyroBias;
  nextReferenceEpoch := if noEvent(captureAccepted > 0.5) then currentEpoch else referenceEpoch;
  nextReferenceUsed := if noEvent(captureAccepted > 0.5) then 0.0 else referenceUsed;
  nextLastUsedEpoch := lastUsedEpoch;
  nextReferenceDescriptor := if noEvent(captureAccepted > 0.5) then currentDescriptor else referenceDescriptor;
  nextReferencePoint := if noEvent(captureAccepted > 0.5) then currentPoint else referencePoint;
  nextReferenceEnabled := if noEvent(captureAccepted > 0.5) then currentEnabled else referenceEnabled;
  nextReferencePixels := if noEvent(captureAccepted > 0.5) then pixels else referencePixels;
  nextReferenceCount := if noEvent(captureAccepted > 0.5) then activeCount else referenceCount;
  nextReferenceRgbCalibration := if noEvent(captureAccepted > 0.5) then rgbCalibration else referenceRgbCalibration;
  nextReferenceDepthCalibration := if noEvent(captureAccepted > 0.5) then depthCalibration else referenceDepthCalibration;
  nextReferenceNoiseReferenceFx := if noEvent(captureAccepted > 0.5) then noiseReferenceFx else referenceNoiseReferenceFx;
  nextReferenceDisparityNoise := if noEvent(captureAccepted > 0.5) then disparityNoise else referenceDisparityNoise;
  nextReferenceBaseline := if noEvent(captureAccepted > 0.5) then baseline else referenceBaseline;
  nextReferenceOpticalToBody := if noEvent(captureAccepted > 0.5) then opticalToBody else referenceOpticalToBody;
  nextReferenceCameraOriginBody := if noEvent(captureAccepted > 0.5) then cameraOriginBody else referenceCameraOriginBody;
  currentCount := if noEvent(imageOn) then activeCount else 0.0;
  visualValid := 0.0; matchCount := 0.0; uncertaintyRejectionReason := 0.0;
  currentFromReference := identity(3); currentFromReferenceTranslation := zeros(3);
  relativeCovariance := zeros(6,6);
  (orientationVector,orientationAngle,orientationValid,orientationQuaternion) := SLAMRotationCoordinates(rotation);
  nextQuaternion := if orientationValid > 0.5 then orientationQuaternion else {1.0,0.0,0.0,0.0};
  positionCovariance := covariance[1:3,1:3]; attitudeCovariance := covariance[7:9,7:9];
  confidence := 0.0;
  featureEnabled := currentEnabled;
  for feature in 1:featureCapacity loop
    features[feature,1] := if noEvent(currentEnabled[feature] > 0.5) then pixels[feature,1] else 0.0;
    features[feature,2] := if noEvent(currentEnabled[feature] > 0.5) then pixels[feature,2] else 0.0;
    features[feature,3] := if noEvent(currentEnabled[feature] > 0.5 and abs(featureScore[feature]) <= 1e30)
      then featureScore[feature] else 0.0;
  end for;
  trackingCurrentPixel := zeros(featureCapacity,2); trackingReferencePixel := zeros(featureCapacity,2);
  trackingEnabled := zeros(featureCapacity);
end InitializeRGBDLocalization;

// Time-zero initialization is a separate source transaction, not h=0 prediction.
// The outer owner schedules it once and publishes the complete returned tuple.
model RGBDInertialLocalizationInitialize
  extends RGBDInertialLocalizationInterface;
  input Real pixels[featureCapacity,2];
  input Real activeCount;
  input Real featureScore[featureCapacity] = zeros(featureCapacity);
  input Real imageTime = 0.0;
  input Real initializationRequested = 1.0;
  output Real initializationAccepted;
  output Real initializationRejected;
protected
  parameter Real minimumContrast = 1e-6;
  parameter Real nearDepth = 0.28;
  parameter Real farDepth = 10.0;
algorithm
  (nextPosition,nextVelocity,nextRotation,
    nextAccelBias,nextGyroBias,nextCovariance,
    nextCrossCovariance,nextReferenceCovariance,nextReferencePosition,
    nextReferenceRotation,nextReferenceAvailable,nextReferenceEpoch,
    nextReferenceUsed,nextLastUsedEpoch,nextReferenceDescriptor,
    nextReferencePoint,nextReferenceEnabled,nextReferencePixels,
    nextReferenceCount,nextReferenceRgbCalibration,nextReferenceDepthCalibration,
    nextReferenceNoiseReferenceFx,nextReferenceDisparityNoise,nextReferenceBaseline,
    nextReferenceOpticalToBody,nextReferenceCameraOriginBody,predictionAccepted,
    observationAccepted,observationRejected,captureAccepted,
    captureRejected,imageReuseRejected,imagePairEligible,
    frameValid,referenceGeometryCompatible,visualValid,
    matchCount,uncertaintyRejectionReason,currentDescriptor,
    currentPoint,currentEnabled,currentCount,
    currentFromReference,currentFromReferenceTranslation,relativeCovariance,
    mapCandidatePoint,mapCandidateEnabled,mapCandidateCount,
    nextQuaternion,positionCovariance,attitudeCovariance,
    confidence,features,featureEnabled,
    trackingCurrentPixel,trackingReferencePixel,trackingEnabled,
    initializationAccepted,initializationRejected) := InitializeRGBDLocalization(
    rgb,depth,rgbCalibration,
    depthCalibration,disparityNoise,noiseReferenceFx,
    baseline,opticalToBody,cameraOriginBody,
    frameEnabled,imageCaptureRequested,position,
    velocity,rotation,accelBias,
    gyroBias,covariance,crossCovariance,
    referenceCovariance,referencePosition,referenceRotation,
    referenceAvailable,referenceEpoch,currentEpoch,
    referenceUsed,lastUsedEpoch,referenceDescriptor,
    referencePoint,referenceEnabled,referencePixels,
    referenceCount,referenceRgbCalibration,referenceDepthCalibration,
    referenceNoiseReferenceFx,referenceDisparityNoise,referenceBaseline,
    referenceOpticalToBody,referenceCameraOriginBody,accel,
    gyro,gravity,h,
    density,pixels,activeCount,
    featureScore,imageTime,initializationRequested,
    minimumContrast,nearDepth,farDepth,depthUnits=depthUnits);
end RGBDInertialLocalizationInitialize;

// Complete raw FAST -> selection -> time-zero RGB-D initialization transaction.
// All image/ranking/pose/covariance math is Modelica; no host intermediate stage.
function InitializeFastRGBDLocalization
  input Real rgb[:,:,:];
  input Real depth[size(rgb,1),size(rgb,2)];
  input Real rgbCalibration[4];
  input Real depthCalibration[4];
  input Real disparityNoise;
  input Real noiseReferenceFx;
  input Real baseline;
  input Real opticalToBody[3,3];
  input Real cameraOriginBody[3];
  input Real frameEnabled;
  input Real imageCaptureRequested;
  input Real position[3];
  input Real velocity[3];
  input Real rotation[3,3];
  input Real accelBias[3];
  input Real gyroBias[3];
  input Real covariance[15,15];
  input Real crossCovariance[15,6];
  input Real referenceCovariance[6,6];
  input Real referencePosition[3];
  input Real referenceRotation[3,3];
  input Real referenceAvailable;
  input Real referenceEpoch;
  input Real currentEpoch;
  input Real referenceUsed;
  input Real lastUsedEpoch;
  input Real referenceDescriptor[featureCapacity,descriptorSize];
  input Real referencePoint[featureCapacity,3];
  input Real referenceEnabled[featureCapacity];
  input Real referencePixels[featureCapacity,2];
  input Real referenceCount;
  input Real referenceRgbCalibration[4];
  input Real referenceDepthCalibration[4];
  input Real referenceNoiseReferenceFx;
  input Real referenceDisparityNoise;
  input Real referenceBaseline;
  input Real referenceOpticalToBody[3,3];
  input Real referenceCameraOriginBody[3];
  input Real accel[3];
  input Real gyro[3];
  input Real gravity[3];
  input Real h;
  input Real density[12];
  input Real imageTime;
  input Real initializationRequested;
  input Real selectedFeatureLimit = 350.0;
  input Real absoluteThreshold = 18.0;
  output Real nextPosition[3];
  output Real nextVelocity[3];
  output Real nextRotation[3,3];
  output Real nextAccelBias[3];
  output Real nextGyroBias[3];
  output Real nextCovariance[15,15];
  output Real nextCrossCovariance[15,6];
  output Real nextReferenceCovariance[6,6];
  output Real nextReferencePosition[3];
  output Real nextReferenceRotation[3,3];
  output Real nextReferenceAvailable;
  output Real nextReferenceEpoch;
  output Real nextReferenceUsed;
  output Real nextLastUsedEpoch;
  output Real nextReferenceDescriptor[featureCapacity,descriptorSize];
  output Real nextReferencePoint[featureCapacity,3];
  output Real nextReferenceEnabled[featureCapacity];
  output Real nextReferencePixels[featureCapacity,2];
  output Real nextReferenceCount;
  output Real nextReferenceRgbCalibration[4];
  output Real nextReferenceDepthCalibration[4];
  output Real nextReferenceNoiseReferenceFx;
  output Real nextReferenceDisparityNoise;
  output Real nextReferenceBaseline;
  output Real nextReferenceOpticalToBody[3,3];
  output Real nextReferenceCameraOriginBody[3];
  output Real predictionAccepted;
  output Real observationAccepted;
  output Real observationRejected;
  output Real captureAccepted;
  output Real captureRejected;
  output Real imageReuseRejected;
  output Real imagePairEligible;
  output Real frameValid;
  output Real referenceGeometryCompatible;
  output Real visualValid;
  output Real matchCount;
  output Real uncertaintyRejectionReason;
  output Real currentDescriptor[featureCapacity,descriptorSize];
  output Real currentPoint[featureCapacity,3];
  output Real currentEnabled[featureCapacity];
  output Real currentCount;
  output Real currentFromReference[3,3];
  output Real currentFromReferenceTranslation[3];
  output Real relativeCovariance[6,6];
  output Real mapCandidatePoint[featureCapacity,3];
  output Real mapCandidateEnabled[featureCapacity];
  output Real mapCandidateCount;
  output Real nextQuaternion[4];
  output Real positionCovariance[3,3];
  output Real attitudeCovariance[3,3];
  output Real confidence;
  output Real features[featureCapacity,3];
  output Real featureEnabled[featureCapacity];
  output Real trackingCurrentPixel[featureCapacity,2];
  output Real trackingReferencePixel[featureCapacity,2];
  output Real trackingEnabled[featureCapacity];
  output Real initializationAccepted;
  output Real initializationRejected;
  output Real selectionValid;
  input Boolean depthQualifiedSelection = false "Reserve the RGB-D budget for valid calibrated depth";
  input Real depthUnits = 1.0 "Meters per depth sample; 1 for metric depth, SDK scale for Z16";
protected
  constant Integer featureCapacity = 350; constant Integer descriptorSize = 49;
  Boolean imageOn; Boolean selectionConfiguration;
  Real scores[size(rgb,1)*size(rgb,2)];
  Real selectedFeatures[featureCapacity,3];
  Real selectionCount; Real selectionStatus; Real selectedCount;
algorithm
  imageOn := SLAMExactRealEqual(frameEnabled,1.0);
  scores := FastFrameScores(rgb,imageOn);
  if depthQualifiedSelection then
    scores := RGBDDepthQualifiedScores(depth,scores,rgbCalibration,depthCalibration,
      0.28,10.0,disparityNoise,noiseReferenceFx,baseline,imageOn,depthUnits=depthUnits);
  end if;
  (selectedFeatures,selectionCount,selectionStatus) := SelectRasterFeatures(scores,
    size(rgb,2),size(rgb,1),featureCapacity,3,
    {absoluteThreshold,0.0,1e8,3.0,selectedFeatureLimit,1.0,3.0,3.0},false,imageOn);
  selectionConfiguration := selectedFeatureLimit >= 1.0 and selectedFeatureLimit <= featureCapacity
    and SLAMExactRealEqual(selectedFeatureLimit,floor(selectedFeatureLimit));
  selectionValid := if selectionConfiguration and selectionStatus > 0.5
    and selectionCount >= 0.0 and selectionCount <= featureCapacity then 1.0 else 0.0;
  selectedCount := if selectionValid > 0.5 then selectionCount else 0.0;
  (nextPosition,nextVelocity,nextRotation,
    nextAccelBias,nextGyroBias,nextCovariance,
    nextCrossCovariance,nextReferenceCovariance,nextReferencePosition,
    nextReferenceRotation,nextReferenceAvailable,nextReferenceEpoch,
    nextReferenceUsed,nextLastUsedEpoch,nextReferenceDescriptor,
    nextReferencePoint,nextReferenceEnabled,nextReferencePixels,
    nextReferenceCount,nextReferenceRgbCalibration,nextReferenceDepthCalibration,
    nextReferenceNoiseReferenceFx,nextReferenceDisparityNoise,nextReferenceBaseline,
    nextReferenceOpticalToBody,nextReferenceCameraOriginBody,predictionAccepted,
    observationAccepted,observationRejected,captureAccepted,
    captureRejected,imageReuseRejected,imagePairEligible,
    frameValid,referenceGeometryCompatible,visualValid,
    matchCount,uncertaintyRejectionReason,currentDescriptor,
    currentPoint,currentEnabled,currentCount,
    currentFromReference,currentFromReferenceTranslation,relativeCovariance,
    mapCandidatePoint,mapCandidateEnabled,mapCandidateCount,
    nextQuaternion,positionCovariance,attitudeCovariance,
    confidence,features,featureEnabled,
    trackingCurrentPixel,trackingReferencePixel,trackingEnabled,
    initializationAccepted,initializationRejected) := InitializeRGBDLocalization(
    rgb,depth,rgbCalibration,
    depthCalibration,disparityNoise,noiseReferenceFx,
    baseline,opticalToBody,cameraOriginBody,
    frameEnabled,imageCaptureRequested,position,
    velocity,rotation,accelBias,
    gyroBias,covariance,crossCovariance,
    referenceCovariance,referencePosition,referenceRotation,
    referenceAvailable,referenceEpoch,currentEpoch,
    referenceUsed,lastUsedEpoch,referenceDescriptor,
    referencePoint,referenceEnabled,referencePixels,
    referenceCount,referenceRgbCalibration,referenceDepthCalibration,
    referenceNoiseReferenceFx,referenceDisparityNoise,referenceBaseline,
    referenceOpticalToBody,referenceCameraOriginBody,accel,
    gyro,gravity,h,
    density,selectedFeatures[1:featureCapacity,1:2],selectedCount,
    selectedFeatures[1:featureCapacity,3],imageTime,initializationRequested,depthUnits=depthUnits);
end InitializeFastRGBDLocalization;

// Time-zero source initialization with the full original raster and selection.
// No h/IMU prediction component is instantiated; the outer owner schedules once.
model RGBDFastInertialLocalizationInitialize
  extends RGBDInertialLocalizationInterface;
  parameter Real selectedFeatureLimit = 350.0;
  parameter Real absoluteThreshold = 18.0;
  input Real imageTime = 0.0;
  input Real initializationRequested = 1.0;
  output Real initializationAccepted;
  output Real initializationRejected;
  output Real selectionValid;
algorithm
  (nextPosition,nextVelocity,nextRotation,
    nextAccelBias,nextGyroBias,nextCovariance,
    nextCrossCovariance,nextReferenceCovariance,nextReferencePosition,
    nextReferenceRotation,nextReferenceAvailable,nextReferenceEpoch,
    nextReferenceUsed,nextLastUsedEpoch,nextReferenceDescriptor,
    nextReferencePoint,nextReferenceEnabled,nextReferencePixels,
    nextReferenceCount,nextReferenceRgbCalibration,nextReferenceDepthCalibration,
    nextReferenceNoiseReferenceFx,nextReferenceDisparityNoise,nextReferenceBaseline,
    nextReferenceOpticalToBody,nextReferenceCameraOriginBody,predictionAccepted,
    observationAccepted,observationRejected,captureAccepted,
    captureRejected,imageReuseRejected,imagePairEligible,
    frameValid,referenceGeometryCompatible,visualValid,
    matchCount,uncertaintyRejectionReason,currentDescriptor,
    currentPoint,currentEnabled,currentCount,
    currentFromReference,currentFromReferenceTranslation,relativeCovariance,
    mapCandidatePoint,mapCandidateEnabled,mapCandidateCount,
    nextQuaternion,positionCovariance,attitudeCovariance,
    confidence,features,featureEnabled,
    trackingCurrentPixel,trackingReferencePixel,trackingEnabled,
    initializationAccepted,initializationRejected,selectionValid) := InitializeFastRGBDLocalization(
    rgb,depth,rgbCalibration,
    depthCalibration,disparityNoise,noiseReferenceFx,
    baseline,opticalToBody,cameraOriginBody,
    frameEnabled,imageCaptureRequested,position,
    velocity,rotation,accelBias,
    gyroBias,covariance,crossCovariance,
    referenceCovariance,referencePosition,referenceRotation,
    referenceAvailable,referenceEpoch,currentEpoch,
    referenceUsed,lastUsedEpoch,referenceDescriptor,
    referencePoint,referenceEnabled,referencePixels,
    referenceCount,referenceRgbCalibration,referenceDepthCalibration,
    referenceNoiseReferenceFx,referenceDisparityNoise,referenceBaseline,
    referenceOpticalToBody,referenceCameraOriginBody,accel,
    gyro,gravity,h,
    density,imageTime,initializationRequested,
    selectedFeatureLimit,absoluteThreshold,depthUnits=depthUnits);
end RGBDFastInertialLocalizationInitialize;

// Persistent keyframe ownership, independent of the current single-reference
// filter. A saved histogram and its calibrated geometry share one record/slot.
// These functions are not yet connected to the browser SLAM estimator.
package RGBDKeyframes
  constant Integer imageHeight = 90;
  constant Integer imageWidth = 160;
  constant Integer featureCapacity = 350;
  constant Integer descriptorSize = 49;
  constant Integer wordCapacity = 256;
  constant Integer keyframeCapacity = 128;
  constant Integer dimension = 3;
  constant Integer poseDimension = 6;
  constant Integer identifierLimit = 1000000000;

  record Frame
    Integer generation "Reset/source/world ownership generation";
    Integer id "Monotone identity; never a reusable array slot";
    Integer epoch "Measured image identity, independent of wall time";
    Real imageTime "Simulation time of image acquisition";
    Integer count "Full feature domain, including disabled sparse slots";
    Boolean enabled[featureCapacity];
    Real descriptor[featureCapacity,descriptorSize];
    Real opticalPoint[featureCapacity,dimension];
    Integer pixels[featureCapacity,2] "Zero-based RGB pixels";
    Integer rgbSize[2] "Height, width";
    Integer depthSize[2];
    Real rgbCalibration[4] "fx, fy, cx, cy";
    Real depthCalibration[4];
    Real opticalToBody[dimension,dimension];
    Real cameraOriginBody[dimension];
    Real disparityNoise;
    Real noiseReferenceFx;
    Real baseline;
    Real bodyRotation[dimension,dimension];
    Real bodyPosition[dimension];
    Real poseCovariance[poseDimension,poseDimension];
    Integer vocabularyVersion;
    Real histogram[wordCapacity];
  end Frame;

  function EmptyFrame
    output Frame frame;
  algorithm
    frame.generation := 1;
    frame.id := 0;
    frame.epoch := -1;
    frame.imageTime := 0.0;
    frame.count := 0;
    frame.enabled := fill(false,featureCapacity);
    frame.descriptor := zeros(featureCapacity,descriptorSize);
    frame.opticalPoint := zeros(featureCapacity,dimension);
    frame.pixels := fill(0,featureCapacity,2);
    frame.rgbSize := {imageHeight,imageWidth};
    frame.depthSize := {imageHeight,imageWidth};
    frame.rgbCalibration := {116.4,116.4,79.5,44.5};
    frame.depthCalibration := {84.3,84.3,79.5,44.5};
    frame.opticalToBody := [0,0,1;-1,0,0;0,-1,0];
    frame.cameraOriginBody := {0.18,0,-0.04};
    frame.disparityNoise := 0.08;
    frame.noiseReferenceFx := 84.3;
    frame.baseline := 0.05;
    frame.bodyRotation := identity(dimension);
    frame.bodyPosition := zeros(dimension);
    frame.poseCovariance := identity(poseDimension);
    frame.vocabularyVersion := 1;
    frame.histogram := zeros(wordCapacity);
  end EmptyFrame;

  record Catalog
    Integer generation = 1;
    Integer vocabularyVersion = 1 "All retained histograms share one vocabulary";
    Integer nextId = 1;
    Integer nextSlot = 1;
    Integer lastEpoch = -1;
    Real lastTime = 0.0;
    Boolean occupied[keyframeCapacity] = fill(false,keyframeCapacity);
    // Structure-of-arrays storage; Frame remains the public measurement API.
    Integer generations[keyframeCapacity];
    Integer ids[keyframeCapacity];
    Integer epochs[keyframeCapacity];
    Real imageTimes[keyframeCapacity];
    Integer counts[keyframeCapacity];
    Boolean featureEnabled[keyframeCapacity,featureCapacity];
    Real descriptors[keyframeCapacity,featureCapacity,descriptorSize];
    Real opticalPoints[keyframeCapacity,featureCapacity,dimension];
    Integer pixelCoordinates[keyframeCapacity,featureCapacity,2];
    Integer rgbSizes[keyframeCapacity,2];
    Integer depthSizes[keyframeCapacity,2];
    Real rgbCalibrations[keyframeCapacity,4];
    Real depthCalibrations[keyframeCapacity,4];
    Real opticalToBodyRotations[keyframeCapacity,dimension,dimension];
    Real cameraOriginsBody[keyframeCapacity,dimension];
    Real disparityNoises[keyframeCapacity];
    Real noiseReferenceFocals[keyframeCapacity];
    Real baselines[keyframeCapacity];
    Real bodyRotations[keyframeCapacity,dimension,dimension];
    Real bodyPositions[keyframeCapacity,dimension];
    Real poseCovariances[keyframeCapacity,poseDimension,poseDimension];
    Integer vocabularyVersions[keyframeCapacity];
    Real histograms[keyframeCapacity,wordCapacity];
  end Catalog;

  function Empty
    input Integer generation = 1;
    input Integer vocabularyVersion = 1;
    output Catalog state;
  protected
    Frame emptyFrame;
  algorithm
    state.generation := generation;
    state.vocabularyVersion := vocabularyVersion;
    state.nextId := 1;
    state.nextSlot := 1;
    state.lastEpoch := -1;
    state.lastTime := 0.0;
    // Copy one canonical frame into each array slice. This initializes every
    // field once, including inactive payload, without a separate catalog-sized
    // zero initializer followed by overwriting each frame's metadata.
    emptyFrame := EmptyFrame();
    for slot in 1:keyframeCapacity loop
      state.occupied[slot] := false;
      state.generations[slot] := emptyFrame.generation;
      state.ids[slot] := emptyFrame.id;
      state.epochs[slot] := emptyFrame.epoch;
      state.imageTimes[slot] := emptyFrame.imageTime;
      state.counts[slot] := emptyFrame.count;
      state.featureEnabled[slot,:] := emptyFrame.enabled;
      state.descriptors[slot,:,:] := emptyFrame.descriptor;
      state.opticalPoints[slot,:,:] := emptyFrame.opticalPoint;
      state.pixelCoordinates[slot,:,:] := emptyFrame.pixels;
      state.rgbSizes[slot,:] := emptyFrame.rgbSize;
      state.depthSizes[slot,:] := emptyFrame.depthSize;
      state.rgbCalibrations[slot,:] := emptyFrame.rgbCalibration;
      state.depthCalibrations[slot,:] := emptyFrame.depthCalibration;
      state.opticalToBodyRotations[slot,:,:] := emptyFrame.opticalToBody;
      state.cameraOriginsBody[slot,:] := emptyFrame.cameraOriginBody;
      state.disparityNoises[slot] := emptyFrame.disparityNoise;
      state.noiseReferenceFocals[slot] := emptyFrame.noiseReferenceFx;
      state.baselines[slot] := emptyFrame.baseline;
      state.bodyRotations[slot,:,:] := emptyFrame.bodyRotation;
      state.bodyPositions[slot,:] := emptyFrame.bodyPosition;
      state.poseCovariances[slot,:,:] := emptyFrame.poseCovariance;
      state.vocabularyVersions[slot] := emptyFrame.vocabularyVersion;
      state.histograms[slot,:] := emptyFrame.histogram;
    end for;
  end Empty;


  // Internal slot extraction. Array domains are certified before reads.
  function ReadSlot
    input Catalog state;
    input Integer slot;
    output Frame frame;
  algorithm
    frame := EmptyFrame();
    if slot >= 1 and slot <= keyframeCapacity then
      frame.generation := state.generations[slot];
      frame.id := state.ids[slot];
      frame.epoch := state.epochs[slot];
      frame.imageTime := state.imageTimes[slot];
      frame.count := state.counts[slot];
      frame.enabled := state.featureEnabled[slot,:];
      frame.descriptor := state.descriptors[slot,:,:];
      frame.opticalPoint := state.opticalPoints[slot,:,:];
      frame.pixels := state.pixelCoordinates[slot,:,:];
      frame.rgbSize := state.rgbSizes[slot,:];
      frame.depthSize := state.depthSizes[slot,:];
      frame.rgbCalibration := state.rgbCalibrations[slot,:];
      frame.depthCalibration := state.depthCalibrations[slot,:];
      frame.opticalToBody := state.opticalToBodyRotations[slot,:,:];
      frame.cameraOriginBody := state.cameraOriginsBody[slot,:];
      frame.disparityNoise := state.disparityNoises[slot];
      frame.noiseReferenceFx := state.noiseReferenceFocals[slot];
      frame.baseline := state.baselines[slot];
      frame.bodyRotation := state.bodyRotations[slot,:,:];
      frame.bodyPosition := state.bodyPositions[slot,:];
      frame.poseCovariance := state.poseCovariances[slot,:,:];
      frame.vocabularyVersion := state.vocabularyVersions[slot];
      frame.histogram := state.histograms[slot,:];
    end if;
  end ReadSlot;

  function ValidCalibration
    input Real calibration[4];
    input Integer imageSize[2];
    output Boolean valid;
  algorithm
    valid := imageSize[1] > 0 and imageSize[1] <= 8192
      and imageSize[2] > 0 and imageSize[2] <= 8192
      and calibration[1] > 0 and calibration[1] <= 1e6
      and calibration[2] > 0 and calibration[2] <= 1e6
      and abs(calibration[3]) <= 8192 and abs(calibration[4]) <= 8192;
  end ValidCalibration;

  function ValidFrame
    input Frame frame;
    output Boolean valid;
  protected
    Integer measured;
    Real mass;
    Real norm;
    Real mean;
    Real inverseCovariance[poseDimension,poseDimension];
    Real scaledPivot;
    Boolean covarianceValid;
  algorithm
    valid := frame.generation >= 1 and frame.generation <= identifierLimit
      and frame.id >= 1 and frame.id < identifierLimit
      and frame.epoch >= 0 and frame.epoch <= identifierLimit
      and frame.imageTime >= 0 and frame.imageTime <= 1e9
      and frame.count >= 0 and frame.count <= featureCapacity
      and frame.vocabularyVersion >= 1 and frame.vocabularyVersion <= identifierLimit
      and ValidCalibration(frame.rgbCalibration,frame.rgbSize)
      and ValidCalibration(frame.depthCalibration,frame.depthSize)
      and frame.disparityNoise > 0 and frame.disparityNoise <= 100
      and frame.noiseReferenceFx > 0 and frame.noiseReferenceFx <= 1e6
      and frame.baseline > 0 and frame.baseline <= 10
      and RGBDUncertaintyProper(frame.opticalToBody)
      and RGBDUncertaintyProper(frame.bodyRotation);
    for axis in 1:dimension loop
      valid := valid and abs(frame.bodyPosition[axis]) <= 1e6
        and abs(frame.cameraOriginBody[axis]) <= 1e6;
    end for;
    (inverseCovariance,covarianceValid,scaledPivot) :=
      RGBDUncertaintyInverse6(frame.poseCovariance,1e-10);
    valid := valid and covarianceValid;
    measured := 0;
    for feature in 1:featureCapacity loop
      if frame.enabled[feature] then
        measured := measured+1;
        valid := valid and feature <= frame.count
          and frame.pixels[feature,1] >= 0 and frame.pixels[feature,1] < frame.rgbSize[2]
          and frame.pixels[feature,2] >= 0 and frame.pixels[feature,2] < frame.rgbSize[1]
          and frame.opticalPoint[feature,3] > 0;
        for axis in 1:dimension loop
          valid := valid and abs(frame.opticalPoint[feature,axis]) <= 1e6;
        end for;
        norm := 0.0;
        mean := 0.0;
        for sample in 1:descriptorSize loop
          valid := valid and abs(frame.descriptor[feature,sample]) <= 1.000001;
          norm := norm+frame.descriptor[feature,sample]^2;
          mean := mean+frame.descriptor[feature,sample];
        end for;
        valid := valid and abs(norm-1.0) <= 1e-6 and abs(mean) <= 1e-6;
      end if;
    end for;
    valid := valid and measured >= 8;
    mass := 0.0;
    for word in 1:wordCapacity loop
      valid := valid and frame.histogram[word] >= 0 and frame.histogram[word] <= 1;
      mass := mass+frame.histogram[word];
    end for;
    valid := valid and abs(mass-1.0) <= 1e-6;
  end ValidFrame;

  // Header checks are cheap; full payload validation belongs to admission or
  // restore. Store operates on an already validated, Modelica-owned catalog.
  function ValidHeader
    input Catalog state;
    output Boolean valid;
  protected
    Integer expectedOccupied;
    Integer actualOccupied;
    Integer olderSlot;
    Integer newestSlot;
    Boolean identityValid;
  algorithm
    expectedOccupied := 0; actualOccupied := 0;
    olderSlot := 1; newestSlot := 1; identityValid := false;
    valid := state.generation >= 1 and state.generation <= identifierLimit
      and state.vocabularyVersion >= 1 and state.vocabularyVersion <= identifierLimit
      and state.nextId >= 1 and state.nextId <= identifierLimit
      and state.nextSlot >= 1 and state.nextSlot <= keyframeCapacity
      and state.lastEpoch >= -1 and state.lastEpoch <= identifierLimit
      and state.lastTime >= 0 and state.lastTime <= 1e9;
    // Certify Integer domains before subtraction or computing array indices.
    if valid then
      valid := state.nextSlot == mod(state.nextId-1,keyframeCapacity)+1;
      expectedOccupied := min(state.nextId-1,keyframeCapacity);
      for slot in 1:keyframeCapacity loop
        if state.occupied[slot] then
          actualOccupied := actualOccupied+1;
          identityValid := state.ids[slot] >= max(1,state.nextId-keyframeCapacity)
            and state.ids[slot] < state.nextId;
          valid := valid and identityValid
            and state.generations[slot] == state.generation
            and state.vocabularyVersions[slot] == state.vocabularyVersion
            and state.epochs[slot] >= 0 and state.epochs[slot] <= state.lastEpoch
            and state.imageTimes[slot] >= 0 and state.imageTimes[slot] <= state.lastTime;
          if identityValid then
            valid := valid and mod(state.ids[slot]-1,keyframeCapacity)+1 == slot;
            if state.ids[slot] > max(1,state.nextId-keyframeCapacity) then
              olderSlot := mod(state.ids[slot]-2,keyframeCapacity)+1;
              valid := valid and state.occupied[olderSlot]
                and state.ids[olderSlot] == state.ids[slot]-1
                and state.epochs[olderSlot] < state.epochs[slot]
                and state.imageTimes[olderSlot] < state.imageTimes[slot];
            end if;
          end if;
        end if;
      end for;
      valid := valid and actualOccupied == expectedOccupied
        and ((state.nextId == 1 and state.lastEpoch == -1 and state.lastTime == 0)
          or (state.nextId > 1 and state.lastEpoch >= 0));
      if state.nextId > 1 then
        newestSlot := mod(state.nextId-2,keyframeCapacity)+1;
        valid := valid and state.occupied[newestSlot]
          and state.ids[newestSlot] == state.nextId-1
          and state.epochs[newestSlot] == state.lastEpoch
          and state.imageTimes[newestSlot] == state.lastTime;
      end if;
    end if;
  end ValidHeader;

  function ValidCatalog
    input Catalog state;
    output Boolean valid;
  algorithm
    valid := ValidHeader(state);
    for slot in 1:keyframeCapacity loop
      if state.occupied[slot] then
        valid := valid and ValidFrame(ReadSlot(state,slot));
      end if;
    end for;
  end ValidCatalog;

  function Store
    input Catalog previous;
    input Frame candidate;
    input Boolean requested;
    output Catalog next;
    output Boolean accepted;
    output Integer storedSlot;
    output Integer evictedId "Invalidate this generation/id in graph and landmark owners";
  algorithm
    next := previous;
    accepted := false;
    storedSlot := 0;
    evictedId := 0;
    if requested and ValidHeader(previous) and previous.nextId < identifierLimit then
      accepted := candidate.generation == previous.generation
        and candidate.vocabularyVersion == previous.vocabularyVersion
        and candidate.id == previous.nextId and candidate.epoch > previous.lastEpoch
        and (previous.nextId == 1 or candidate.imageTime > previous.lastTime)
        and ValidFrame(candidate);
      if accepted then
        storedSlot := previous.nextSlot;
        evictedId := if previous.occupied[storedSlot] then previous.ids[storedSlot] else 0;
        next.generations[storedSlot] := candidate.generation;
        next.ids[storedSlot] := candidate.id;
        next.epochs[storedSlot] := candidate.epoch;
        next.imageTimes[storedSlot] := candidate.imageTime;
        next.counts[storedSlot] := candidate.count;
        next.featureEnabled[storedSlot,:] := candidate.enabled;
        next.descriptors[storedSlot,:,:] := candidate.descriptor;
        next.opticalPoints[storedSlot,:,:] := candidate.opticalPoint;
        next.pixelCoordinates[storedSlot,:,:] := candidate.pixels;
        next.rgbSizes[storedSlot,:] := candidate.rgbSize;
        next.depthSizes[storedSlot,:] := candidate.depthSize;
        next.rgbCalibrations[storedSlot,:] := candidate.rgbCalibration;
        next.depthCalibrations[storedSlot,:] := candidate.depthCalibration;
        next.opticalToBodyRotations[storedSlot,:,:] := candidate.opticalToBody;
        next.cameraOriginsBody[storedSlot,:] := candidate.cameraOriginBody;
        next.disparityNoises[storedSlot] := candidate.disparityNoise;
        next.noiseReferenceFocals[storedSlot] := candidate.noiseReferenceFx;
        next.baselines[storedSlot] := candidate.baseline;
        next.bodyRotations[storedSlot,:,:] := candidate.bodyRotation;
        next.bodyPositions[storedSlot,:] := candidate.bodyPosition;
        next.poseCovariances[storedSlot,:,:] := candidate.poseCovariance;
        next.vocabularyVersions[storedSlot] := candidate.vocabularyVersion;
        next.histograms[storedSlot,:] := candidate.histogram;
        next.occupied[storedSlot] := true;
        next.nextId := previous.nextId+1;
        next.nextSlot := mod(previous.nextSlot,keyframeCapacity)+1;
        next.lastEpoch := candidate.epoch;
        next.lastTime := candidate.imageTime;
      end if;
    end if;
  end Store;

  function Lookup
    input Catalog state;
    input Integer generation;
    input Integer id;
    output Frame frame;
    output Boolean found;
    output Integer slot;
  protected
    Integer proposedSlot;
  algorithm
    frame := EmptyFrame();
    found := false;
    slot := 0;
    if generation == state.generation and id >= 1 and id < state.nextId and ValidHeader(state) then
      proposedSlot := mod(id-1,keyframeCapacity)+1;
      if state.occupied[proposedSlot] and state.ids[proposedSlot] == id then
        frame := ReadSlot(state,proposedSlot);
        found := true;
        slot := proposedSlot;
      end if;
    end if;
  end Lookup;

  function Reset
    input Catalog previous;
    input Integer generation;
    input Integer vocabularyVersion = 1;
    output Catalog next;
    output Boolean accepted;
  algorithm
    next := previous;
    accepted := generation >= 1 and generation > previous.generation and generation <= identifierLimit
      and vocabularyVersion >= 1 and vocabularyVersion <= identifierLimit;
    if accepted then
      next := Empty(generation,vocabularyVersion);
    end if;
  end Reset;
end RGBDKeyframes;

// Appearance retrieval only. A returned candidate is NEVER a loop constraint:
// full descriptor matching and geometric registration must verify every proposal.
// The explicit vocabulary contains learned/configured measured-image descriptors.
// No position, orientation, trajectory truth or scene-specific signature enters here.
function NormalizeVisualWord
  input Real descriptor[49]; input Real enabled;
  output Real normalized[49]; output Boolean valid;
protected
  Real mean; Real energy; Real value; Real scale;
algorithm
  normalized := zeros(49); mean := 0.0; energy := 0.0; value := 0.0; scale := 1.0;
  valid := enabled >= 1.0 and enabled <= 1.0;
  for k in 1:49 loop
    valid := valid and abs(descriptor[k]) <= 1e3;
    value := if abs(descriptor[k]) <= 1e3 then descriptor[k] else 0.0;
    normalized[k] := value; mean := mean+value/49.0;
  end for;
  for k in 1:49 loop
    normalized[k] := normalized[k]-mean;
    energy := energy+normalized[k]*normalized[k];
  end for;
  valid := valid and energy > 1e-12 and energy <= 1e9;
  scale := if valid then sqrt(max(energy,1e-12)) else 1.0;
  for k in 1:49 loop
    normalized[k] := if valid then normalized[k]/scale else 0.0;
  end for;
end NormalizeVisualWord;

function RetrieveVisualWords
  input Real descriptor[350,49]; input Real descriptorEnabled[350]; input Real descriptorCount;
  input Real vocabulary[256,49]; input Real vocabularyEnabled[256]; input Real vocabularyVersion;
  input Real previousHistogram[128,256]; input Real previousEnabled[128];
  input Real previousKeyframeId[128]; input Real previousKeyframeTime[128];
  input Real previousVersion; input Real previousNextSlot; input Real previousTime;
  input Real queryKeyframeId; input Real timeNow; input Real storeKeyframe; input Real resetRequested;
  input Real maximumWordDistanceSquared; input Real minimumAssignments;
  input Real minimumSimilarity; input Real minimumAge;
  output Real wordIndex[350]; output Real histogram[256];
  output Real candidateId[4]; output Real candidateSlot[4]; output Real candidateScore[4];
  output Real nextHistogram[128,256]; output Real nextEnabled[128];
  output Real nextKeyframeId[128]; output Real nextKeyframeTime[128];
  output Real nextVersion; output Real nextSlot; output Real nextTime;
  output Real configurationValid; output Real vocabularyCount; output Real assignmentCount;
  output Real retrievalValid; output Real candidateCount; output Real stored; output Real invalidHistoryCount;
protected
  Real words[256,49]; Real usableWord[256]; Real sample[49]; Boolean sampleValid;
  Real distance; Real nearest; Integer nearestWord; Real mass; Real candidateMass;
  Real idf[256]; Real documentFrequency; Real documentCount; Real queryNorm;
  Real dot; Real candidateNorm; Real weighted; Real score[128]; Real selected[128];
  Real bestScore; Real bestId; Integer bestSlot; Integer destination; Integer existingSlot;
  Boolean configuration; Boolean stateValid; Boolean reset; Boolean rowValid; Boolean eligible;
algorithm
  wordIndex := zeros(350); histogram := zeros(256); candidateId := zeros(4);
  candidateSlot := zeros(4); candidateScore := zeros(4); words := zeros(256,49);
  usableWord := zeros(256); sample := zeros(49); sampleValid := false;
  nextHistogram := zeros(128,256); nextEnabled := zeros(128);
  nextKeyframeId := zeros(128); nextKeyframeTime := zeros(128);
  idf := zeros(256); score := zeros(128); selected := zeros(128);
  nextVersion := 0.0; nextSlot := 1.0; nextTime := 0.0;
  configurationValid := 0.0; vocabularyCount := 0.0; assignmentCount := 0.0;
  retrievalValid := 0.0; candidateCount := 0.0; stored := 0.0; invalidHistoryCount := 0.0;
  distance := 0.0; nearest := 5.0; nearestWord := 0; mass := 0.0; candidateMass := 0.0;
  documentFrequency := 0.0; documentCount := 0.0; queryNorm := 0.0;
  dot := 0.0; candidateNorm := 0.0; weighted := 0.0;
  bestScore := -1.0; bestId := 1e9+1.0; bestSlot := 0; destination := 1; existingSlot := 0;
  rowValid := false; eligible := false;
  stateValid := previousVersion >= 0.0 and previousVersion <= 1e9 and floor(previousVersion) == previousVersion
    and previousNextSlot >= 1.0 and previousNextSlot <= 128.0 and floor(previousNextSlot) == previousNextSlot
    and previousTime >= 0.0 and previousTime <= 1e9;
  configuration := descriptorCount >= 0.0 and descriptorCount <= 350.0 and floor(descriptorCount) == descriptorCount
    and vocabularyVersion >= 1.0 and vocabularyVersion <= 1e9 and floor(vocabularyVersion) == vocabularyVersion
    and queryKeyframeId >= 0.0 and queryKeyframeId <= 1e9 and floor(queryKeyframeId) == queryKeyframeId
    and timeNow >= 0.0 and timeNow <= 1e9 and (timeNow >= previousTime or resetRequested == 1.0)
    and (storeKeyframe == 0.0 or storeKeyframe == 1.0) and (storeKeyframe == 0.0 or queryKeyframeId >= 1.0)
    and (resetRequested == 0.0 or resetRequested == 1.0) and (stateValid or resetRequested == 1.0)
    and maximumWordDistanceSquared >= 0.0 and maximumWordDistanceSquared <= 4.0
    and minimumAssignments >= 1.0 and minimumAssignments <= 350.0 and floor(minimumAssignments) == minimumAssignments
    and minimumSimilarity >= 0.0 and minimumSimilarity <= 1.0 and minimumAge >= 0.0 and minimumAge <= 1e6;
  reset := configuration and (resetRequested == 1.0 or vocabularyVersion <> previousVersion);
  nextVersion := if configuration then vocabularyVersion else if stateValid then previousVersion else 0.0;
  nextSlot := if stateValid and not reset then previousNextSlot else 1.0;
  nextTime := if configuration then timeNow else if stateValid then previousTime else 0.0;
  // Copied state is checked in Modelica. Disabled padding is not a measurement.
  for frame in 1:128 loop
    mass := 0.0;
    rowValid := stateValid and not reset and previousEnabled[frame] == 1.0
      and previousKeyframeId[frame] >= 1.0 and previousKeyframeId[frame] <= 1e9
      and floor(previousKeyframeId[frame]) == previousKeyframeId[frame]
      and previousKeyframeTime[frame] >= 0.0 and previousKeyframeTime[frame] <= previousTime;
    for word in 1:256 loop
      rowValid := rowValid and previousHistogram[frame,word] >= 0.0 and previousHistogram[frame,word] <= 1.0;
      mass := mass+(if previousHistogram[frame,word] >= 0.0 and previousHistogram[frame,word] <= 1.0
        then previousHistogram[frame,word] else 0.0);
    end for;
    rowValid := rowValid and abs(mass-1.0) <= 1e-6;
    invalidHistoryCount := invalidHistoryCount+(if not reset and previousEnabled[frame] <> 0.0 and not rowValid then 1.0 else 0.0);
    nextEnabled[frame] := if rowValid then 1.0 else 0.0;
    nextKeyframeId[frame] := if rowValid then previousKeyframeId[frame] else 0.0;
    nextKeyframeTime[frame] := if rowValid then previousKeyframeTime[frame] else 0.0;
    for word in 1:256 loop
      nextHistogram[frame,word] := if rowValid then previousHistogram[frame,word] else 0.0;
    end for;
    documentCount := documentCount+nextEnabled[frame];
    if nextEnabled[frame] == 1.0 and nextKeyframeId[frame] == queryKeyframeId and existingSlot == 0 then
      existingSlot := frame;
    end if;
  end for;
  for word in 1:256 loop
    (sample,sampleValid) := NormalizeVisualWord(vocabulary[word,:],if configuration then vocabularyEnabled[word] else 0.0);
    words[word,:] := sample; usableWord[word] := if sampleValid then 1.0 else 0.0;
    vocabularyCount := vocabularyCount+usableWord[word];
  end for;
  // Exhaustive nearest learned/configured word; exact distance ties use lower word index.
  for feature in 1:350 loop
    (sample,sampleValid) := NormalizeVisualWord(descriptor[feature,:],
      if configuration and feature <= descriptorCount then descriptorEnabled[feature] else 0.0);
    nearest := 5.0; nearestWord := 0;
    for word in 1:256 loop
      if sampleValid and usableWord[word] == 1.0 then
        distance := 0.0;
        for k in 1:49 loop
          distance := distance+(sample[k]-words[word,k])*(sample[k]-words[word,k]);
        end for;
        if distance < nearest then
          nearest := distance; nearestWord := word;
        end if;
      end if;
    end for;
    if nearestWord > 0 and nearest <= maximumWordDistanceSquared then
      wordIndex[feature] := nearestWord; histogram[nearestWord] := histogram[nearestWord]+1.0;
      assignmentCount := assignmentCount+1.0;
    end if;
  end for;
  for word in 1:256 loop
    histogram[word] := if assignmentCount > 0.0 then histogram[word]/max(assignmentCount,1.0) else 0.0;
    documentFrequency := 0.0;
    for frame in 1:128 loop
      documentFrequency := documentFrequency+(if nextEnabled[frame] == 1.0 and nextHistogram[frame,word] > 0.0 then 1.0 else 0.0);
    end for;
    idf[word] := 1.0+log((1.0+documentCount)/(1.0+documentFrequency));
    weighted := histogram[word]*idf[word]; queryNorm := queryNorm+weighted*weighted;
  end for;
  configurationValid := if configuration then 1.0 else 0.0;
  retrievalValid := if configuration and vocabularyCount > 0.0 and assignmentCount >= minimumAssignments and queryNorm > 1e-12 then 1.0 else 0.0;
  for frame in 1:128 loop
    eligible := retrievalValid == 1.0 and nextEnabled[frame] == 1.0
      and timeNow-nextKeyframeTime[frame] >= minimumAge and queryKeyframeId <> nextKeyframeId[frame];
    dot := 0.0; candidateNorm := 0.0;
    for word in 1:256 loop
      weighted := nextHistogram[frame,word]*idf[word]; candidateNorm := candidateNorm+weighted*weighted;
      dot := dot+weighted*histogram[word]*idf[word];
    end for;
    score[frame] := if eligible and candidateNorm > 1e-12 then min(1.0,max(0.0,dot/sqrt(max(queryNorm*candidateNorm,1e-24)))) else -1.0;
  end for;
  for rank in 1:4 loop
    bestScore := -1.0; bestId := 1e9+1.0; bestSlot := 0;
    for frame in 1:128 loop
      if selected[frame] == 0.0 and score[frame] >= minimumSimilarity
        and (score[frame] > bestScore or (score[frame] == bestScore and
          (nextKeyframeId[frame] < bestId or (nextKeyframeId[frame] == bestId and frame < bestSlot)))) then
        bestScore := score[frame]; bestId := nextKeyframeId[frame]; bestSlot := frame;
      end if;
    end for;
    if bestSlot > 0 then
      candidateId[rank] := bestId; candidateSlot[rank] := bestSlot; candidateScore[rank] := bestScore;
      selected[bestSlot] := 1.0; candidateCount := candidateCount+1.0;
    end if;
  end for;
  // Retrieval precedes insertion. Modelica owns the bounded FIFO state update;
  // storeKeyframe is the upstream geometric keyframe-admission decision.
  destination := if existingSlot > 0 then existingSlot else if nextSlot >= 1.0 and nextSlot <= 128.0 then integer(nextSlot) else 1;
  stored := if retrievalValid == 1.0 and storeKeyframe == 1.0 then 1.0 else 0.0;
  if stored == 1.0 then
    nextHistogram[destination,:] := histogram; nextEnabled[destination] := 1.0;
    nextKeyframeId[destination] := queryKeyframeId; nextKeyframeTime[destination] := timeNow;
    nextSlot := if existingSlot > 0 then nextSlot else if destination < 128 then destination+1.0 else 1.0;
  end if;
end RetrieveVisualWords;

model RGBDBagOfWords
  constant Integer featureCapacity = 350; constant Integer descriptorSize = 49;
  constant Integer vocabularyCapacity = 256; constant Integer keyframeCapacity = 128;
  parameter Real maximumWordDistanceSquared = 0.8;
  parameter Real minimumAssignments = 8.0;
  parameter Real minimumSimilarity = 0.35;
  parameter Real minimumAge = 2.0 "Simulation seconds; independent of frame rate";
  input Real descriptor[featureCapacity,descriptorSize] = zeros(featureCapacity,descriptorSize);
  input Real descriptorEnabled[featureCapacity] = zeros(featureCapacity); input Real descriptorCount = 0.0;
  input Real vocabulary[vocabularyCapacity,descriptorSize] = zeros(vocabularyCapacity,descriptorSize);
  input Real vocabularyEnabled[vocabularyCapacity] = zeros(vocabularyCapacity); input Real vocabularyVersion = 1.0;
  input Real previousHistogram[keyframeCapacity,vocabularyCapacity] = zeros(keyframeCapacity,vocabularyCapacity);
  input Real previousEnabled[keyframeCapacity] = zeros(keyframeCapacity);
  input Real previousKeyframeId[keyframeCapacity] = zeros(keyframeCapacity);
  input Real previousKeyframeTime[keyframeCapacity] = zeros(keyframeCapacity);
  input Real previousVersion = 0.0; input Real previousNextSlot = 1.0; input Real previousTime = 0.0;
  input Real queryKeyframeId = 0.0; input Real timeNow = 0.0;
  input Real storeKeyframe = 0.0; input Real resetRequested = 0.0;
  output Real wordIndex[featureCapacity]; output Real histogram[vocabularyCapacity];
  output Real candidateId[4]; output Real candidateSlot[4]; output Real candidateScore[4];
  output Real nextHistogram[keyframeCapacity,vocabularyCapacity]; output Real nextEnabled[keyframeCapacity];
  output Real nextKeyframeId[keyframeCapacity]; output Real nextKeyframeTime[keyframeCapacity];
  output Real nextVersion; output Real nextSlot; output Real nextTime;
  output Real configurationValid; output Real vocabularyCount; output Real assignmentCount;
  output Real retrievalValid; output Real candidateCount; output Real stored; output Real invalidHistoryCount;
equation
  (wordIndex,histogram,candidateId,candidateSlot,candidateScore,nextHistogram,nextEnabled,nextKeyframeId,nextKeyframeTime,
    nextVersion,nextSlot,nextTime,configurationValid,vocabularyCount,assignmentCount,retrievalValid,candidateCount,stored,invalidHistoryCount) =
    RetrieveVisualWords(descriptor,descriptorEnabled,descriptorCount,vocabulary,vocabularyEnabled,vocabularyVersion,
      previousHistogram,previousEnabled,previousKeyframeId,previousKeyframeTime,previousVersion,previousNextSlot,previousTime,
      queryKeyframeId,timeNow,storeKeyframe,resetRequested,maximumWordDistanceSquared,minimumAssignments,minimumSimilarity,minimumAge);
end RGBDBagOfWords;

// Measured appearance bootstrap. Word identities freeze before histogram storage.
// This is not a loop constraint, geometric observation or scene/truth signature.
package RGBDVisualVocabulary
  constant Integer vocabularyCapacity = RGBDKeyframes.wordCapacity;
  constant Integer descriptorSize = RGBDKeyframes.descriptorSize;
  constant Integer featureCapacity = RGBDKeyframes.featureCapacity;
  constant Integer identifierLimit = RGBDKeyframes.identifierLimit;

  record State
    Integer generation;
    Integer sourceRevision;
    Integer version;
    Real words[vocabularyCapacity,descriptorSize];
    Real enabled[vocabularyCapacity];
    Integer count;
    Boolean ready "Once true, this dictionary cannot be changed by Learn";
  end State;

  function Empty
    input Integer generation = 1;
    input Integer sourceRevision = 1;
    input Integer version = 1;
    output State state;
  algorithm
    // Invalid supplied ownership remains invalid: Valid/Learn refuse it.
    state.generation := generation; state.sourceRevision := sourceRevision;
    state.version := version; state.words := zeros(vocabularyCapacity,descriptorSize);
    state.enabled := zeros(vocabularyCapacity); state.count := 0; state.ready := false;
  end Empty;

  function Valid
    input State state;
    output Boolean valid;
  protected
    Real mean; Real energy;
  algorithm
    valid := state.generation >= 1 and state.generation <= identifierLimit
      and state.sourceRevision >= 1 and state.sourceRevision <= identifierLimit
      and state.version >= 1 and state.version <= identifierLimit
      and state.count >= 0 and state.count <= vocabularyCapacity
      and (not state.ready or state.count >= 1);
    mean := 0.0; energy := 0.0;
    for word in 1:vocabularyCapacity loop
      valid := valid and state.enabled[word] == (if word <= state.count then 1.0 else 0.0);
      // Disabled word storage is opaque, including restored padding.
      if word <= state.count then
        mean := 0.0; energy := 0.0;
        for component in 1:descriptorSize loop
          valid := valid and abs(state.words[word,component]) <= 1.0;
          mean := mean+state.words[word,component]/descriptorSize;
          energy := energy+state.words[word,component]*state.words[word,component];
        end for;
        valid := valid and abs(mean) <= 1e-6 and abs(energy-1.0) <= 1e-6;
      end if;
    end for;
  end Valid;

  function Learn
    input State previous;
    input Real descriptor[featureCapacity,descriptorSize];
    input Real descriptorEnabled[featureCapacity];
    input Real descriptorCount "Full domain extent, including disabled sparse slots";
    input Integer generation;
    input Integer sourceRevision;
    input Integer version;
    input Boolean requested = true;
    input Integer minimumMeasuredDescriptors = 8;
    input Real minimumDistanceSquared = 0.04;
    output State next;
    output Boolean accepted;
    output Integer reason "0 idle, 1 frozen now, 2 learning, 3 already frozen; negative refusal";
  protected
    State pending;
    Real samples[featureCapacity,descriptorSize];
    Real sample[descriptorSize]; Boolean sampleValid; Boolean inputsValid;
    Integer domainCount; Integer measuredCount;
    Real distance; Real nearest;
  algorithm
    next := previous; accepted := false; reason := 0;
    pending := previous; samples := zeros(featureCapacity,descriptorSize);
    sample := zeros(descriptorSize); sampleValid := false; inputsValid := true;
    domainCount := 0; measuredCount := 0; distance := 0.0; nearest := 5.0;
    if requested then
      if not Valid(previous) then
        reason := -1;
      elseif generation < 1 or generation > identifierLimit or sourceRevision < 1
        or sourceRevision > identifierLimit or version < 1 or version > identifierLimit
        or generation <> previous.generation or sourceRevision <> previous.sourceRevision
        or version <> previous.version then
        reason := -2;
      elseif minimumMeasuredDescriptors < 1 or minimumMeasuredDescriptors > featureCapacity
        or not (minimumDistanceSquared >= 1e-12 and minimumDistanceSquared <= 4.0) then
        reason := -3;
      elseif not (descriptorCount >= 0.0 and descriptorCount <= featureCapacity
        and floor(descriptorCount) == descriptorCount) then
        reason := -4;
      else
        domainCount := integer(descriptorCount);
        // Complete preflight before adding even the first word. No enabled slot
        // outside the supplied domain, fractional mask or active poison can commit.
        for feature in 1:featureCapacity loop
          inputsValid := inputsValid and (descriptorEnabled[feature] == 0.0
            or descriptorEnabled[feature] == 1.0)
            and (feature <= domainCount or descriptorEnabled[feature] == 0.0);
          if feature <= domainCount and descriptorEnabled[feature] == 1.0 then
            (sample,sampleValid) := NormalizeVisualWord(descriptor[feature,:],1.0);
            inputsValid := inputsValid and sampleValid;
            samples[feature,:] := sample;
            measuredCount := measuredCount+1;
          end if;
        end for;
        if not inputsValid then
          reason := -4;
        elseif previous.ready then
          accepted := true; reason := 3;
        else
          // Fixed-bounded nearest representative admission, source raster order.
          // Identical samples count as measurements but do not consume more words.
          for feature in 1:featureCapacity loop
            if feature <= domainCount and descriptorEnabled[feature] == 1.0
              and pending.count < vocabularyCapacity then
              nearest := 5.0;
              for word in 1:vocabularyCapacity loop
                if word <= pending.count then
                  distance := 0.0;
                  for component in 1:descriptorSize loop
                    distance := distance+(samples[feature,component]-pending.words[word,component])
                      *(samples[feature,component]-pending.words[word,component]);
                  end for;
                  nearest := min(nearest,distance);
                end if;
              end for;
              if pending.count == 0 or nearest >= minimumDistanceSquared then
                pending.count := pending.count+1;
                pending.words[pending.count,:] := samples[feature,:];
                pending.enabled[pending.count] := 1.0;
              end if;
            end if;
          end for;
          pending.ready := measuredCount >= minimumMeasuredDescriptors and pending.count >= 1;
          next := pending; accepted := true; reason := if pending.ready then 1 else 2;
        end if;
      end if;
    end if;
  end Learn;

  function Bootstrap
    input State previous;
    input Real descriptor[featureCapacity,descriptorSize];
    input Real descriptorEnabled[featureCapacity]; input Real descriptorCount;
    input Integer generation; input Integer sourceRevision; input Integer version;
    input Boolean requested = true;
    input Integer minimumMeasuredDescriptors = 8; input Real minimumDistanceSquared = 0.04;
    output State next; output Boolean accepted; output Integer reason;
  algorithm
    (next,accepted,reason) := Learn(previous,descriptor,descriptorEnabled,descriptorCount,
      generation,sourceRevision,version,requested,minimumMeasuredDescriptors,minimumDistanceSquared);
  end Bootstrap;
end RGBDVisualVocabulary;

// Appearance queries share the retained geometry catalog. Only its capture
// owner publishes history; retrieval never advances a second FIFO or clock.
package RGBDKeyframeRetrieval
  constant Integer proposalCapacity = 4;

  function PrepareCapture
    input RGBDKeyframes.Catalog catalog;
    input RGBDKeyframes.Frame measurement;
    input Real vocabulary[RGBDKeyframes.wordCapacity,RGBDKeyframes.descriptorSize];
    input Real vocabularyEnabled[RGBDKeyframes.wordCapacity];
    input Boolean requested;
    input Real maximumWordDistanceSquared = 0.8;
    input Integer minimumAssignments = 8;
    input Real minimumSimilarity = 0.35;
    input Real minimumAge = 5.0;
    output RGBDKeyframes.Frame prepared;
    output Boolean accepted;
    output Integer rejectionReason "0 accepted; 1 not requested; 2 metadata; 3 retrieval/history; 4 frame; 5 candidate binding";
    output Real wordIndex[RGBDKeyframes.featureCapacity];
    output Integer candidateId[proposalCapacity];
    output Integer candidateSlot[proposalCapacity];
    output Real candidateScore[proposalCapacity];
    output Integer candidateCount;
    output Real assignmentCount;
  protected
    Real featureMask[RGBDKeyframes.featureCapacity];
    Real historyMask[RGBDKeyframes.keyframeCapacity];
    Real histogram[RGBDKeyframes.wordCapacity];
    Real ids[proposalCapacity]; Real slots[proposalCapacity]; Real scores[proposalCapacity];
    Real unusedHistogram[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.wordCapacity];
    Real unusedEnabled[RGBDKeyframes.keyframeCapacity];
    Real unusedIds[RGBDKeyframes.keyframeCapacity]; Real unusedTimes[RGBDKeyframes.keyframeCapacity];
    Real unusedVersion; Real unusedSlot; Real unusedTime; Real unusedStored;
    Real configurationValid; Real vocabularyCount; Real retrievalValid; Real count; Real invalidHistoryCount;
    Boolean valid; Integer slot;
  algorithm
    prepared := measurement; accepted := false; rejectionReason := 1;
    wordIndex := zeros(RGBDKeyframes.featureCapacity);
    candidateId := fill(0,proposalCapacity); candidateSlot := fill(0,proposalCapacity);
    candidateScore := zeros(proposalCapacity); candidateCount := 0; assignmentCount := 0;
    if requested then
      rejectionReason := 2;
      valid := RGBDKeyframes.ValidHeader(catalog)
        and catalog.nextId < RGBDKeyframes.identifierLimit
        and measurement.generation == catalog.generation
        and measurement.vocabularyVersion == catalog.vocabularyVersion
        and measurement.id == catalog.nextId and measurement.epoch > catalog.lastEpoch
        and (catalog.nextId == 1 or measurement.imageTime > catalog.lastTime);
      if valid then
        for feature in 1:RGBDKeyframes.featureCapacity loop
          featureMask[feature] := if measurement.enabled[feature] then 1.0 else 0.0;
        end for;
        for node in 1:RGBDKeyframes.keyframeCapacity loop
          // The capture will evict nextSlot. It cannot be a retained loop node
          // in the resulting transaction, so exclude it before query scoring.
          historyMask[node] := if catalog.occupied[node] and node <> catalog.nextSlot then 1.0 else 0.0;
        end for;
        (wordIndex,histogram,ids,slots,scores,unusedHistogram,unusedEnabled,unusedIds,unusedTimes,
          unusedVersion,unusedSlot,unusedTime,configurationValid,vocabularyCount,assignmentCount,
          retrievalValid,count,unusedStored,invalidHistoryCount) := RetrieveVisualWords(
            measurement.descriptor,featureMask,measurement.count,vocabulary,vocabularyEnabled,catalog.vocabularyVersion,
            catalog.histograms,historyMask,catalog.ids,catalog.imageTimes,catalog.vocabularyVersion,
            catalog.nextSlot,catalog.lastTime,measurement.id,measurement.imageTime,0.0,0.0,
            maximumWordDistanceSquared,minimumAssignments,minimumSimilarity,minimumAge);
        rejectionReason := 3;
        valid := configurationValid == 1.0 and retrievalValid == 1.0 and invalidHistoryCount == 0.0
          and count >= 0 and count <= proposalCapacity and floor(count) == count;
        if valid then
          prepared.histogram := histogram;
          rejectionReason := 4;
          valid := RGBDKeyframes.ValidFrame(prepared);
          if valid then
            rejectionReason := 5;
            for rank in 1:proposalCapacity loop
              if rank <= count then
                // Certify Real output domains before Integer conversion or indexing.
                valid := valid and slots[rank] >= 1 and slots[rank] <= RGBDKeyframes.keyframeCapacity
                  and floor(slots[rank]) == slots[rank] and ids[rank] >= 1
                  and ids[rank] < catalog.nextId and floor(ids[rank]) == ids[rank]
                  and scores[rank] >= minimumSimilarity and scores[rank] <= 1.0;
                if valid then
                  slot := integer(slots[rank]);
                  valid := catalog.occupied[slot] and slot <> catalog.nextSlot
                    and catalog.ids[slot] == ids[rank]
                    and catalog.generations[slot] == measurement.generation
                    and catalog.vocabularyVersions[slot] == measurement.vocabularyVersion
                    and measurement.imageTime-catalog.imageTimes[slot] >= minimumAge;
                  if valid then
                    candidateId[rank] := integer(ids[rank]); candidateSlot[rank] := slot;
                    candidateScore[rank] := scores[rank];
                  end if;
                end if;
              end if;
            end for;
            if valid then
              candidateCount := integer(count); accepted := true; rejectionReason := 0;
            end if;
          end if;
        end if;
      end if;
    end if;
    if not accepted then
      prepared := measurement; wordIndex := zeros(RGBDKeyframes.featureCapacity);
      candidateId := fill(0,proposalCapacity); candidateSlot := fill(0,proposalCapacity);
      candidateScore := zeros(proposalCapacity); candidateCount := 0; assignmentCount := 0;
    end if;
  end PrepareCapture;
end RGBDKeyframeRetrieval;

// Convert an already verified optical registration into the product residual
// used by ModelicaPoseGraph. This component does not verify correspondences,
// admit graph edges, or resolve correlations between reused images.
// Dependencies: RGBDRegistrationUncertainty.mo (rotation/SPD helpers).
function RGBDOpticalToBodyEdge
  input Real currentFromReference[3,3];
  input Real opticalTranslation[3];
  input Real opticalCovariance[6,6]
    "Independent translation increment, then left optical angle increment";
  input Real referenceOpticalToBody[3,3];
  input Real currentOpticalToBody[3,3];
  input Real referenceCameraOrigin[3];
  input Real currentCameraOrigin[3];
  input Boolean requested;
  input Real coordinateLimit;
  input Real minimumPivot;
  output Real measuredRotation[3,3] "Current body coordinates to reference body";
  output Real measuredTranslation[3] "Current body origin in reference body";
  output Real residualJacobian[6,6];
  output Real residualCovariance[6,6];
  output Real information[6,6];
  output Boolean valid;
  output Integer rejectionReason;
  output Real minimumScaledPivot;
protected
  Boolean configuration; Boolean geometry; Boolean opticalValid; Boolean edgeValid;
  Real rotationCandidate[3,3]; Real translationCandidate[3];
  Real opticalToReferenceBody[3,3]; Real arm[3]; Real J[6,6];
  Real covarianceCandidate[6,6]; Real inverseCandidate[6,6];
  Real unusedInverse[6,6]; Real opticalPivot;
algorithm
  measuredRotation := identity(3); measuredTranslation := zeros(3);
  residualJacobian := zeros(6,6); residualCovariance := zeros(6,6);
  information := zeros(6,6); valid := false; rejectionReason := 1;
  minimumScaledPivot := 0.0;
  // Disabled payload is not read as a measurement.
  if requested then
    configuration := coordinateLimit > 0.0 and coordinateLimit <= 1e4
      and minimumPivot > 0.0 and minimumPivot < 1.0;
    rejectionReason := 2;
    if configuration then
      geometry := RGBDUncertaintyProper(currentFromReference)
        and RGBDUncertaintyProper(referenceOpticalToBody)
        and RGBDUncertaintyProper(currentOpticalToBody);
      for axis in 1:3 loop
        geometry := geometry and abs(opticalTranslation[axis]) <= coordinateLimit
          and abs(referenceCameraOrigin[axis]) <= coordinateLimit
          and abs(currentCameraOrigin[axis]) <= coordinateLimit;
      end for;
      rejectionReason := 3;
      if geometry then
        (unusedInverse,opticalValid,opticalPivot) :=
          RGBDUncertaintyInverse6(opticalCovariance,minimumPivot);
        rejectionReason := 4;
        if opticalValid then
          opticalToReferenceBody := referenceOpticalToBody*transpose(currentFromReference);
          rotationCandidate := opticalToReferenceBody*transpose(currentOpticalToBody);
          arm := opticalTranslation+transpose(currentOpticalToBody)*currentCameraOrigin;
          translationCandidate := referenceCameraOrigin-opticalToReferenceBody*arm;
          // At the nominal edge, r = [Ri'*(pj-pi)-u, Log(D'*Ri'*Rj)].
          // Perturb C as Exp(dtheta)*C and t independently as t+dt.
          // Differentiating this residual gives [A, A*skew(arm); 0, Ecurrent].
          // It is not the coupled SE(3) logarithm/adjoint covariance convention.
          J := zeros(6,6);
          J[1:3,1:3] := opticalToReferenceBody;
          J[1:3,4:6] := opticalToReferenceBody*RGBDUncertaintySkew(arm);
          J[4:6,4:6] := currentOpticalToBody;
          // Only roundoff asymmetry within the SPD helper's tolerance is
          // averaged. No damping or covariance floor invents an accepted edge.
          covarianceCandidate := J*((opticalCovariance+transpose(opticalCovariance))/2.0)*transpose(J);
          covarianceCandidate := (covarianceCandidate+transpose(covarianceCandidate))/2.0;
          (inverseCandidate,edgeValid,minimumScaledPivot) :=
            RGBDUncertaintyInverse6(covarianceCandidate,minimumPivot);
          rejectionReason := 5;
          if edgeValid then
            measuredRotation := rotationCandidate;
            measuredTranslation := translationCandidate;
            residualJacobian := J;
            residualCovariance := covarianceCandidate;
            information := (inverseCandidate+transpose(inverseCandidate))/2.0;
            valid := true; rejectionReason := 0;
          end if;
        end if;
      end if;
    end if;
  end if;
end RGBDOpticalToBodyEdge;

model RGBDBodyRelativeEdge
  parameter Real coordinateLimit = 100.0;
  parameter Real minimumPivot = 1e-10;
  input Real currentFromReference[3,3] = identity(3);
  input Real opticalTranslation[3] = zeros(3);
  input Real opticalCovariance[6,6] = identity(6);
  input Real referenceOpticalToBody[3,3] = identity(3);
  input Real currentOpticalToBody[3,3] = identity(3);
  input Real referenceCameraOrigin[3] = zeros(3);
  input Real currentCameraOrigin[3] = zeros(3);
  input Boolean requested = false;
  output Real measuredRotation[3,3]; output Real measuredTranslation[3];
  output Real residualJacobian[6,6]; output Real residualCovariance[6,6];
  output Real information[6,6]; output Boolean valid;
  output Integer rejectionReason; output Real minimumScaledPivot;
equation
  (measuredRotation,measuredTranslation,residualJacobian,residualCovariance,
    information,valid,rejectionReason,minimumScaledPivot) = RGBDOpticalToBodyEdge(
      currentFromReference,opticalTranslation,opticalCovariance,
      referenceOpticalToBody,currentOpticalToBody,referenceCameraOrigin,
      currentCameraOrigin,requested,coordinateLimit,minimumPivot);
end RGBDBodyRelativeEdge;

// Geometric verification of a retrieved keyframe. A verified measurement is a
// proposal: graph identity/eviction and shared-image correlation policies must
// still admit it before any optimizer or estimator state can change.
package RGBDLoopVerification
  constant Integer featureCapacity = RGBDKeyframes.featureCapacity;
  constant Integer dimension = 3;
  constant Integer poseDimension = 6;
  constant Integer maximumTrials = 256;
  constant Integer maximumRefinements = 8;
  constant Integer randomModulus = 2147483647;

  // Park-Miller with Schrage decomposition. Every Integer intermediate fits
  // signed 32-bit storage; no large floating-point RNG product is required.
  function NextSample
    input Integer previous;
    output Integer next;
  protected
    Integer high; Integer low; Integer difference;
  algorithm
    next := 0;
    if previous >= 1 and previous < randomModulus then
      high := div(previous,127773);
      low := mod(previous,127773);
      difference := 16807*low-2836*high;
      next := if difference > 0 then difference else difference+randomModulus;
    end if;
  end NextSample;

  function ScorePairs
    input Real sourcePoint[:,dimension];
    input Real targetPoint[size(sourcePoint,1),dimension];
    input Real pairEnabled[size(sourcePoint,1)];
    input Real rotation[dimension,dimension]; input Real translation[dimension];
    input Real distanceLimit;
    output Real mask[size(sourcePoint,1)];
    output Integer count;
    output Real cost;
  protected
    Real residual[dimension]; Real squared;
  algorithm
    mask := zeros(size(sourcePoint,1)); count := 0; cost := 0.0;
    for slot in 1:size(sourcePoint,1) loop
      if pairEnabled[slot] == 1.0 then
        residual := rotation*sourcePoint[slot,:]+translation-targetPoint[slot,:];
        squared := residual*residual;
        if squared <= distanceLimit^2 then
          mask[slot] := 1.0; count := count+1; cost := cost+squared;
        end if;
      end if;
    end for;
  end ScorePairs;

  // Three-point hypotheses are scored against the entire original sparse
  // domain. The slot list is only a sampling index, never a prefix extent.
  // A finite trial budget can miss a real loop; it does not certify recall.
  function Consensus
    input Real sourcePoint[:,dimension];
    input Real targetPoint[size(sourcePoint,1),dimension];
    input Real pairEnabled[size(sourcePoint,1)];
    input Boolean requested;
    input Integer seed; input Integer trials; input Integer refinements;
    input Integer minimumInliers; input Real minimumFraction;
    input Real inlierDistance; input Real maximumRms;
    input Real coordinateLimit; input Real rankTolerance;
    output Boolean valid;
    output Integer rejectionReason;
    output Real rotation[dimension,dimension]; output Real translation[dimension];
    output Real inlierMask[size(sourcePoint,1)];
    output Integer matchCount; output Integer inlierCount;
    output Real rms; output Integer nextSeed;
  protected
    Boolean configuration; Boolean payload; Boolean eligible; Boolean stable;
    Integer slots[size(sourcePoint,1)]; Integer first; Integer second; Integer third;
    Integer chosen[dimension]; Integer state; Integer count; Integer bestCount;
    Real sampleSource[dimension,dimension]; Real sampleTarget[dimension,dimension];
    Real candidateRotation[dimension,dimension]; Real candidateTranslation[dimension];
    Real candidateMask[size(sourcePoint,1)]; Real bestMask[size(sourcePoint,1)];
    Real workingMask[size(sourcePoint,1)]; Real cost; Real bestCost;
    Real fitAccepted; Real fitReason; Real fitCount; Real invalidCount; Real rank;
    Real fitCost; Real fitRms; Real gap; Real sourceCentroid[dimension]; Real targetCentroid[dimension];
  algorithm
    valid := false; rejectionReason := 1;
    rotation := identity(dimension); translation := zeros(dimension);
    inlierMask := zeros(size(sourcePoint,1)); matchCount := 0; inlierCount := 0;
    rms := 0.0; nextSeed := seed;
    if requested then
      configuration := size(sourcePoint,1) >= dimension and size(sourcePoint,1) <= featureCapacity
        and seed >= 1 and seed < randomModulus and trials >= 1 and trials <= maximumTrials
        and refinements >= 1 and refinements <= maximumRefinements
        and minimumInliers >= dimension and minimumInliers <= size(sourcePoint,1)
        and minimumFraction > 0.0 and minimumFraction <= 1.0
        and inlierDistance > 0.0 and inlierDistance <= 10.0
        and maximumRms >= 0.0 and maximumRms <= inlierDistance
        and coordinateLimit > 0.0 and coordinateLimit <= 1e4
        and rankTolerance >= 1e-12 and rankTolerance <= 1e-2;
      rejectionReason := 2;
      if configuration then
        slots := fill(0,size(sourcePoint,1)); payload := true;
        for slot in 1:size(sourcePoint,1) loop
          payload := payload and (pairEnabled[slot] == 0.0 or pairEnabled[slot] == 1.0);
          if pairEnabled[slot] == 1.0 then
            matchCount := matchCount+1; slots[matchCount] := slot;
            for axis in 1:dimension loop
              payload := payload and abs(sourcePoint[slot,axis]) <= coordinateLimit
                and abs(targetPoint[slot,axis]) <= coordinateLimit;
            end for;
          end if;
        end for;
        rejectionReason := 3;
        if payload then
          rejectionReason := 4;
          if matchCount >= minimumInliers then
            bestCount := 0; bestCost := 1e100; bestMask := zeros(size(sourcePoint,1)); state := seed;
            for hypothesis in 1:trials loop
              state := NextSample(state); first := mod(state,matchCount)+1;
              state := NextSample(state); second := mod(state,matchCount-1)+1;
              if second >= first then second := second+1; end if;
              state := NextSample(state); third := mod(state,matchCount-2)+1;
              if third >= min(first,second) then third := third+1; end if;
              if third >= max(first,second) then third := third+1; end if;
              chosen := {slots[first],slots[second],slots[third]};
              for point in 1:dimension loop
                sampleSource[point,:] := sourcePoint[chosen[point],:];
                sampleTarget[point,:] := targetPoint[chosen[point],:];
              end for;
              (fitAccepted,fitReason,candidateRotation,candidateTranslation,fitCount,invalidCount,
                rank,fitCost,fitRms,gap,sourceCentroid,targetCentroid) := FitRigidPointPairs(
                  sampleSource,sampleTarget,ones(dimension),dimension,coordinateLimit,rankTolerance,inlierDistance);
              if fitAccepted == 1.0 then
                (candidateMask,count,cost) := ScorePairs(sourcePoint,targetPoint,pairEnabled,
                  candidateRotation,candidateTranslation,inlierDistance);
                if count > bestCount or (count == bestCount and cost < bestCost) then
                  bestCount := count; bestCost := cost; bestMask := candidateMask;
                end if;
              end if;
            end for;
            nextSeed := state;
            eligible := bestCount >= minimumInliers and bestCount >= minimumFraction*matchCount;
            stable := false; workingMask := bestMask; rejectionReason := 5;
            // Stop doing fits after stability/refusal, while keeping a bounded
            // compact loop. The final fit and covariance must use one mask.
            for refinement in 1:refinements loop
              if eligible and not stable then
                (fitAccepted,fitReason,candidateRotation,candidateTranslation,fitCount,invalidCount,
                  rank,fitCost,fitRms,gap,sourceCentroid,targetCentroid) := FitRigidPointPairs(
                    sourcePoint,targetPoint,workingMask,size(sourcePoint,1),coordinateLimit,rankTolerance,maximumRms);
                eligible := fitAccepted == 1.0;
                if not eligible then rejectionReason := 5; end if;
                if eligible then
                  (candidateMask,count,cost) := ScorePairs(sourcePoint,targetPoint,pairEnabled,
                    candidateRotation,candidateTranslation,inlierDistance);
                  eligible := count >= minimumInliers and count >= minimumFraction*matchCount;
                  stable := true;
                  for slot in 1:size(sourcePoint,1) loop
                    stable := stable and candidateMask[slot] == workingMask[slot];
                  end for;
                  if eligible and stable then
                    rotation := candidateRotation; translation := candidateTranslation;
                    inlierMask := workingMask; inlierCount := count; rms := fitRms;
                    valid := true; rejectionReason := 0;
                  else
                    workingMask := candidateMask;
                    rejectionReason := if eligible then 6 else 5;
                  end if;
                end if;
              end if;
            end for;
          end if;
        end if;
      end if;
    end if;
  end Consensus;

  record Proposal
    Boolean verified;
    Integer rejectionReason;
    Integer generation; Integer referenceId; Integer currentId;
    Integer referenceEpoch; Integer currentEpoch;
    Integer matchedCount; Integer inlierCount;
    Real rms; Integer nextSeed;
    Boolean inliers[featureCapacity];
    Integer partners[featureCapacity];
    Real opticalRotation[dimension,dimension]; Real opticalTranslation[dimension];
    Real bodyRotation[dimension,dimension]; Real bodyTranslation[dimension];
    Real covariance[poseDimension,poseDimension]; Real information[poseDimension,poseDimension];
  end Proposal;

  function EmptyProposal
    input Integer seed;
    output Proposal result;
  algorithm
    result.verified := false; result.rejectionReason := 1;
    result.generation := 0; result.referenceId := 0; result.currentId := 0;
    result.referenceEpoch := -1; result.currentEpoch := -1;
    result.matchedCount := 0; result.inlierCount := 0; result.rms := 0.0; result.nextSeed := seed;
    result.inliers := fill(false,featureCapacity); result.partners := fill(0,featureCapacity);
    result.opticalRotation := identity(dimension); result.opticalTranslation := zeros(dimension);
    result.bodyRotation := identity(dimension); result.bodyTranslation := zeros(dimension);
    result.covariance := zeros(poseDimension,poseDimension); result.information := zeros(poseDimension,poseDimension);
  end EmptyProposal;

  function Verify
    input RGBDKeyframes.Frame reference;
    input RGBDKeyframes.Frame current;
    input Boolean requested;
    input Integer seed = 7; input Integer trials = 96; input Integer refinements = 4;
    input Integer minimumInliers = 12; input Real minimumFraction = 0.5;
    input Real inlierDistance = 0.08; input Real maximumRms = 0.03;
    input Real minimumAge = 5.0; input Real descriptorRatio = 0.8;
    input Real maximumDescriptorDistance = 0.8;
    input Real coordinateLimit = 100.0; input Real rankTolerance = 1e-8;
    input Real localizationSigma = 0.5; input Real depthInflation = 1.0; input Real minimumPivot = 1e-10;
    output Proposal result;
  protected
    Boolean configuration; Boolean identityValid; Boolean consensusValid; Boolean edgeValid;
    Integer consensusReason; Integer edgeReason; Integer matches; Integer inliers; Integer nextSeed;
    Real referenceMask[featureCapacity]; Real currentMask[featureCapacity];
    Real partners[featureCapacity]; Real pairEnabled[featureCapacity];
    Real sourcePoint[featureCapacity,dimension]; Real targetPoint[featureCapacity,dimension];
    Real nearest[featureCapacity]; Real second[featureCapacity]; Real count; Real matchValid;
    Real invalidReference; Real invalidCurrent; Real mask[featureCapacity];
    Real C[dimension,dimension]; Real t[dimension]; Real rms;
    Real uncertaintyValid; Real uncertaintyReason; Real uncertaintyCount; Real uncertaintyInvalid;
    Real relativeCovariance[poseDimension,poseDimension]; Real unusedCovariance[poseDimension,poseDimension];
    Real normal[poseDimension,poseDimension]; Real noise[poseDimension,poseDimension]; Real J[poseDimension,poseDimension];
    Real pivot; Real D[dimension,dimension]; Real u[dimension];
    Real edgeCovariance[poseDimension,poseDimension]; Real information[poseDimension,poseDimension];
  algorithm
    result := EmptyProposal(seed);
    if requested then
      configuration := minimumAge >= 0.0 and minimumAge <= 1e6
        and seed >= 1 and seed < randomModulus and trials >= 1 and trials <= maximumTrials
        and refinements >= 1 and refinements <= maximumRefinements
        and minimumInliers >= dimension and minimumInliers <= featureCapacity
        and minimumFraction > 0.0 and minimumFraction <= 1.0
        and inlierDistance > 0.0 and inlierDistance <= 10.0
        and maximumRms >= 0.0 and maximumRms <= inlierDistance
        and coordinateLimit > 0.0 and coordinateLimit <= 1e4
        and rankTolerance >= 1e-12 and rankTolerance <= 1e-2
        and descriptorRatio > 0.0 and descriptorRatio < 1.0
        and maximumDescriptorDistance >= 0.0 and maximumDescriptorDistance <= 2.0
        and localizationSigma > 0.0 and localizationSigma <= 10.0
        and depthInflation >= 1.0 and depthInflation <= 100.0
        and minimumPivot > 0.0 and minimumPivot < 1.0;
      result.rejectionReason := 2;
      if configuration then
        identityValid := reference.generation == current.generation and reference.id < current.id
          and reference.epoch < current.epoch and reference.imageTime < current.imageTime
          and current.imageTime-reference.imageTime >= minimumAge
          and reference.vocabularyVersion == current.vocabularyVersion;
        result.rejectionReason := 3;
        if identityValid then
          result.rejectionReason := 4;
          if RGBDKeyframes.ValidFrame(reference) and RGBDKeyframes.ValidFrame(current) then
            // The current sandwich model assumes a common disparity noise and
            // stereo baseline. Refuse incompatible snapshots rather than reuse
            // current calibration for the retained reference image.
            result.rejectionReason := 5;
            if reference.disparityNoise == current.disparityNoise and reference.baseline == current.baseline then
              for slot in 1:featureCapacity loop
                referenceMask[slot] := if reference.enabled[slot] then 1.0 else 0.0;
                currentMask[slot] := if current.enabled[slot] then 1.0 else 0.0;
              end for;
              (partners,pairEnabled,sourcePoint,targetPoint,count,matchValid,invalidReference,invalidCurrent,nearest,second) :=
                MatchRGBDDescriptors(reference.descriptor,current.descriptor,reference.opticalPoint,current.opticalPoint,
                  referenceMask,currentMask,reference.count,current.count,descriptorRatio,maximumDescriptorDistance,
                  0.0,identity(dimension),zeros(dimension),0.0);
              result.matchedCount := integer(count); result.rejectionReason := 6;
              if matchValid == 1.0 and invalidReference == 0.0 and invalidCurrent == 0.0 then
                (consensusValid,consensusReason,C,t,mask,matches,inliers,rms,nextSeed) := Consensus(
                  sourcePoint,targetPoint,pairEnabled,true,seed,trials,refinements,minimumInliers,minimumFraction,
                  inlierDistance,maximumRms,coordinateLimit,rankTolerance);
                result.nextSeed := nextSeed; result.rejectionReason := 7;
                if consensusValid then
                  (uncertaintyValid,uncertaintyReason,uncertaintyCount,uncertaintyInvalid,relativeCovariance,
                    unusedCovariance,normal,noise,J,pivot) := RGBDRegistrationSandwich(sourcePoint,targetPoint,
                      mask,featureCapacity,1.0,C,t,reference.bodyRotation,reference.opticalToBody,
                      reference.cameraOriginBody,reference.rgbCalibration[1:2],current.rgbCalibration[1:2],
                      reference.noiseReferenceFx,current.noiseReferenceFx,reference.baseline,localizationSigma,
                      reference.disparityNoise,depthInflation,coordinateLimit,minimumPivot);
                  result.rejectionReason := 8;
                  if uncertaintyValid == 1.0 then
                    (D,u,J,edgeCovariance,information,edgeValid,edgeReason,pivot) := RGBDOpticalToBodyEdge(C,t,
                      relativeCovariance,reference.opticalToBody,current.opticalToBody,
                      reference.cameraOriginBody,current.cameraOriginBody,true,coordinateLimit,minimumPivot);
                    result.rejectionReason := 9;
                    if edgeValid then
                      result.verified := true; result.rejectionReason := 0;
                      result.generation := current.generation;
                      result.referenceId := reference.id; result.currentId := current.id;
                      result.referenceEpoch := reference.epoch; result.currentEpoch := current.epoch;
                      result.inlierCount := inliers; result.rms := rms;
                      result.opticalRotation := C; result.opticalTranslation := t;
                      result.bodyRotation := D; result.bodyTranslation := u;
                      result.covariance := edgeCovariance; result.information := information;
                      for slot in 1:featureCapacity loop
                        result.inliers[slot] := mask[slot] == 1.0;
                        result.partners[slot] := if mask[slot] == 1.0 then integer(partners[slot]) else 0;
                      end for;
                    end if;
                  end if;
                end if;
              end if;
            end if;
          end if;
        end if;
      end if;
    end if;
  end Verify;
end RGBDLoopVerification;

// Bounded pose-graph numerical component; no loop detection or truth inputs.
// Body-to-world R, world-additive p and RIGHT-local attitude increments.
// Residual [Ri'*(pj-pi)-translation, Log(measuredRotation'*Ri'*Rj)].
// This product residual is not the coupled SE(3) logarithm (no V^-1 translation).
// Small numerical helpers are editable Modelica, not host math.
function PGTranspose
  input Real A[3,3]; output Real B[3,3];
algorithm
  B[1,1] := A[1,1];
  B[2,1] := A[1,2];
  B[3,1] := A[1,3];
  B[1,2] := A[2,1];
  B[2,2] := A[2,2];
  B[3,2] := A[2,3];
  B[1,3] := A[3,1];
  B[2,3] := A[3,2];
  B[3,3] := A[3,3];
end PGTranspose;

function PGMultiply
  input Real A[3,3]; input Real B[3,3]; output Real C[3,3];
algorithm
  C[1,1] := A[1,1]*B[1,1]+A[1,2]*B[2,1]+A[1,3]*B[3,1];
  C[1,2] := A[1,1]*B[1,2]+A[1,2]*B[2,2]+A[1,3]*B[3,2];
  C[1,3] := A[1,1]*B[1,3]+A[1,2]*B[2,3]+A[1,3]*B[3,3];
  C[2,1] := A[2,1]*B[1,1]+A[2,2]*B[2,1]+A[2,3]*B[3,1];
  C[2,2] := A[2,1]*B[1,2]+A[2,2]*B[2,2]+A[2,3]*B[3,2];
  C[2,3] := A[2,1]*B[1,3]+A[2,2]*B[2,3]+A[2,3]*B[3,3];
  C[3,1] := A[3,1]*B[1,1]+A[3,2]*B[2,1]+A[3,3]*B[3,1];
  C[3,2] := A[3,1]*B[1,2]+A[3,2]*B[2,2]+A[3,3]*B[3,2];
  C[3,3] := A[3,1]*B[1,3]+A[3,2]*B[2,3]+A[3,3]*B[3,3];
end PGMultiply;

function PGMatVec
  input Real A[3,3]; input Real x[3]; output Real y[3];
algorithm
  y[1] := A[1,1]*x[1]+A[1,2]*x[2]+A[1,3]*x[3];
  y[2] := A[2,1]*x[1]+A[2,2]*x[2]+A[2,3]*x[3];
  y[3] := A[3,1]*x[1]+A[3,2]*x[2]+A[3,3]*x[3];
end PGMatVec;

function PGSkew
  input Real x[3]; output Real S[3,3];
algorithm
  S := zeros(3,3);
  S[1,2] := -x[3]; S[1,3] := x[2]; S[2,1] := x[3];
  S[2,3] := -x[1]; S[3,1] := -x[2]; S[3,2] := x[1];
end PGSkew;

function PGProperRotation
  input Real R[3,3]; output Boolean valid;
protected Real value; Real determinant;
algorithm
  valid := true; value := 0.0;
  for i in 1:3 loop
    for j in 1:3 loop
      valid := valid and abs(R[i,j]) <= 1.000001;
      value := 0.0;
      for k in 1:3 loop value := value+R[k,i]*R[k,j]; end for;
      valid := valid and abs(value-(if i == j then 1.0 else 0.0)) <= 1e-7;
    end for;
  end for;
  determinant := R[1,1]*(R[2,2]*R[3,3]-R[2,3]*R[3,2])
    -R[1,2]*(R[2,1]*R[3,3]-R[2,3]*R[3,1])+R[1,3]*(R[2,1]*R[3,2]-R[2,2]*R[3,1]);
  valid := valid and abs(determinant-1.0) <= 1e-7;
end PGProperRotation;

function PGExp
  input Real angle[3]; output Real R[3,3];
protected Real square; Real theta; Real a; Real b; Real S[3,3];
algorithm
  square := angle[1]*angle[1]+angle[2]*angle[2]+angle[3]*angle[3]; theta := sqrt(max(square,0.0));
  a := if square < 1e-8 then 1.0-square/6.0+square*square/120.0 else sin(theta)/max(theta,1e-12);
  b := if square < 1e-8 then 0.5-square/24.0+square*square/720.0 else (1.0-cos(theta))/max(square,1e-12);
  S := PGSkew(angle); R := identity(3)+a*S+b*PGMultiply(S,S);
end PGExp;

function PGLog
  input Real R[3,3]; output Real angle[3]; output Boolean valid;
protected Real cosine; Real theta; Real square; Real scale;
algorithm
  cosine := min(1.0,max(-1.0,(R[1,1]+R[2,2]+R[3,3]-1.0)/2.0));
  theta := acos(cosine); square := theta*theta;
  // The chart is deliberately refused near its nonunique pi branch.
  valid := theta >= 0.0 and theta < 3.140592653589793;
  scale := if square < 1e-8 then 0.5+square/12.0+7.0*square*square/720.0
    else theta/(2.0*max(sin(theta),1e-12));
  angle := if valid then scale*{R[3,2]-R[2,3],R[1,3]-R[3,1],R[2,1]-R[1,2]} else zeros(3);
end PGLog;

function PGEdge
  input Real pi[3]; input Real Ri[3,3]; input Real pj[3]; input Real Rj[3,3];
  input Real translation[3]; input Real measuredRotation[3,3];
  output Real residual[6]; output Real Ji[6,6]; output Real Jj[6,6]; output Boolean valid;
protected Real t[3]; Real r[3]; Real square; Real theta; Real c;
  Real S[3,3]; Real leftInverse[3,3]; Real rightInverse[3,3];
algorithm
  t := PGMatVec(PGTranspose(Ri),pj-pi);
  (r,valid) := PGLog(PGMultiply(PGMultiply(PGTranspose(measuredRotation),PGTranspose(Ri)),Rj));
  square := r[1]*r[1]+r[2]*r[2]+r[3]*r[3]; theta := sqrt(max(square,0.0));
  c := if square < 1e-8 then 1.0/12.0+square/720.0+square*square/30240.0
    else (1.0-0.5*theta*cos(0.5*theta)/max(sin(0.5*theta),1e-12))/max(square,1e-12);
  S := PGSkew(r); leftInverse := identity(3)-0.5*S+c*PGMultiply(S,S);
  rightInverse := identity(3)+0.5*S+c*PGMultiply(S,S);
  residual := zeros(6); Ji := zeros(6,6); Jj := zeros(6,6); S := PGSkew(t);
  leftInverse := -PGMultiply(leftInverse,PGTranspose(measuredRotation));
  for i in 1:3 loop
    residual[i] := t[i]-translation[i]; residual[i+3] := r[i];
    for j in 1:3 loop
      Ji[i,j] := -Ri[j,i]; Jj[i,j] := Ri[j,i]; Ji[i,j+3] := S[i,j];
      Ji[i+3,j+3] := leftInverse[i,j]; Jj[i+3,j+3] := rightInverse[i,j];
    end for;
  end for;
end PGEdge;

function PGCholesky
  input Real A[6,6]; input Real pivotRelative;
  output Real L[6,6]; output Boolean valid;
protected Real scale; Real value;
algorithm
  L := zeros(6,6); valid := true; scale := 0.0; value := 0.0;
  for i in 1:6 loop scale := max(scale,abs(A[i,i])); end for;
  valid := scale > 1e-12 and scale <= 1e18;
  for i in 1:6 loop
    for j in 1:6 loop
      valid := valid and abs(A[i,j]) <= 1e18
        and abs(A[i,j]-A[j,i]) <= 1e-10*max(1.0,scale);
      value := A[i,j];
      for k in 1:6 loop
        if j <= i and k < j then value := value-L[i,k]*L[j,k]; end if;
      end for;
      if j <= i then
        if i == j then
          valid := valid and value > pivotRelative*scale and value <= 1e18;
          L[i,j] := sqrt(if value > pivotRelative*scale and value <= 1e18 then value else 1.0);
        else
          L[i,j] := value/L[j,j];
        end if;
      end if;
    end for;
  end for;
end PGCholesky;

function PGSolveBlock
  input Real L[6,6]; input Real b[6]; output Real x[6];
protected Real z[6]; Real value; Integer row;
algorithm
  z := zeros(6); x := zeros(6); value := 0.0; row := 1;
  for i in 1:6 loop
    value := b[i];
    for k in 1:6 loop if k < i then value := value-L[i,k]*z[k]; end if; end for;
    z[i] := value/L[i,i];
  end for;
  for reverseRow in 1:6 loop
    row := 7-reverseRow; value := z[row];
    for k in 1:6 loop if k > row then value := value-L[k,row]*x[k]; end if; end for;
    x[row] := value/L[row,row];
  end for;
end PGSolveBlock;

function PGNormalProduct
  input Real x[:,6]; input Real nodeMask[size(x,1)];
  input Real edgeMask[:]; input Integer source[size(edgeMask,1)]; input Integer target[size(edgeMask,1)];
  input Real Ji[size(edgeMask,1),6,6]; input Real Jj[size(edgeMask,1),6,6];
  input Real information[size(edgeMask,1),6,6]; input Real dampingDiagonal[size(x,1),6]; input Real damping;
  output Real y[size(x,1),6];
protected Integer i; Integer j; Real row[6]; Real weighted[6];
algorithm
  y := zeros(size(x,1),6); i := 1; j := 1; row := zeros(6); weighted := zeros(6);
  for node in 1:size(x,1) loop
    for k in 1:6 loop
      y[node,k] := if node > 1 and nodeMask[node] == 1.0 then damping*dampingDiagonal[node,k]*x[node,k] else 0.0;
    end for;
  end for;
  for edge in 1:size(edgeMask,1) loop
    if edgeMask[edge] == 1.0 then
      i := source[edge]; j := target[edge];
      row := Ji[edge,:,:]*x[i,:]+Jj[edge,:,:]*x[j,:]; weighted := information[edge,:,:]*row;
      if i > 1 then y[i,:] := y[i,:]+transpose(Ji[edge,:,:])*weighted; end if;
      if j > 1 then y[j,:] := y[j,:]+transpose(Jj[edge,:,:])*weighted; end if;
    end if;
  end for;
  // Node1 is the exact gauge: callers keep x[1,:]=0; its operator row is zero.
end PGNormalProduct;

function PGGraphCost
  input Real p[:,3]; input Real R[size(p,1),3,3]; input Real edgeMask[:];
  input Integer source[size(edgeMask,1)]; input Integer target[size(edgeMask,1)];
  input Real translation[size(edgeMask,1),3]; input Real measuredRotation[size(edgeMask,1),3,3];
  input Real information[size(edgeMask,1),6,6];
  output Real cost; output Boolean valid;
protected Real residual[6]; Real Ji[6,6]; Real Jj[6,6]; Boolean edgeValid;
algorithm
  cost := 0.0; valid := true; edgeValid := false; residual := zeros(6); Ji := zeros(6,6); Jj := zeros(6,6);
  for edge in 1:size(edgeMask,1) loop
    if edgeMask[edge] == 1.0 then
      (residual,Ji,Jj,edgeValid) := PGEdge(p[source[edge],:],R[source[edge],:,:],
        p[target[edge],:],R[target[edge],:,:],translation[edge,:],measuredRotation[edge,:,:]);
      valid := valid and edgeValid; cost := cost+0.5*(residual*(information[edge,:,:]*residual));
    end if;
  end for;
  valid := valid and cost >= 0.0 and cost <= 1e100;
end PGGraphCost;

function PGValidateGraph
  input Real p[:,3]; input Real R[size(p,1),3,3]; input Real nodeMask[size(p,1)]; input Real edgeMask[:];
  input Real fromNode[size(edgeMask,1)]; input Real toNode[size(edgeMask,1)];
  input Real translation[size(edgeMask,1),3]; input Real measuredRotation[size(edgeMask,1),3,3];
  input Real information[size(edgeMask,1),6,6];
  output Integer source[size(edgeMask,1)]; output Integer target[size(edgeMask,1)];
  output Real status; output Real activeNodes; output Real activeEdges;
protected Boolean valid; Boolean proper; Boolean endpoints; Boolean factorValid;
  Real L[6,6]; Real reached[size(p,1)]; Integer i; Integer j;
algorithm
  source := fill(1,size(edgeMask,1)); target := fill(1,size(edgeMask,1)); reached := zeros(size(p,1));
  valid := size(p,1) >= 1 and size(p,1) <= 128 and size(edgeMask,1) >= 1 and size(edgeMask,1) <= 256 and nodeMask[1] == 1.0;
  proper := false; endpoints := false; factorValid := false; L := zeros(6,6); i := 1; j := 1;
  status := -1.0; activeNodes := 0.0; activeEdges := 0.0;
  for node in 1:size(p,1) loop
    valid := valid and (nodeMask[node] == 0.0 or nodeMask[node] == 1.0);
    for k in 1:3 loop valid := valid and (nodeMask[node] == 0.0 or abs(p[node,k]) <= 1e6); end for;
    proper := PGProperRotation(R[node,:,:]); valid := valid and (nodeMask[node] == 0.0 or proper);
    activeNodes := activeNodes+(if nodeMask[node] == 1.0 then 1.0 else 0.0);
  end for;
  status := if valid then -2.0 else status;
  for edge in 1:size(edgeMask,1) loop
    endpoints := edgeMask[edge] == 1.0 and fromNode[edge] >= 1.0 and fromNode[edge] <= size(p,1)
      and floor(fromNode[edge]) == fromNode[edge] and toNode[edge] >= 1.0 and toNode[edge] <= size(p,1)
      and floor(toNode[edge]) == toNode[edge] and fromNode[edge] <> toNode[edge];
    valid := valid and (edgeMask[edge] == 0.0 or (edgeMask[edge] == 1.0 and endpoints));
    source[edge] := if endpoints then integer(fromNode[edge]) else 1;
    target[edge] := if endpoints then integer(toNode[edge]) else 1;
    valid := valid and (edgeMask[edge] == 0.0 or (nodeMask[source[edge]] == 1.0 and nodeMask[target[edge]] == 1.0));
    for k in 1:3 loop valid := valid and (edgeMask[edge] == 0.0 or abs(translation[edge,k]) <= 1e6); end for;
    proper := PGProperRotation(measuredRotation[edge,:,:]);
    (L,factorValid) := PGCholesky(information[edge,:,:],1e-10);
    valid := valid and (edgeMask[edge] == 0.0 or (proper and factorValid));
    activeEdges := activeEdges+(if edgeMask[edge] == 1.0 then 1.0 else 0.0);
  end for;
  status := if valid then -3.0 else status; reached[1] := 1.0;
  for pass in 1:size(p,1) loop
    for edge in 1:size(edgeMask,1) loop
      if valid and edgeMask[edge] == 1.0 then
        i := source[edge]; j := target[edge];
        if reached[i] == 1.0 or reached[j] == 1.0 then reached[i] := 1.0; reached[j] := 1.0; end if;
      end if;
    end for;
  end for;
  for node in 1:size(p,1) loop valid := valid and (nodeMask[node] == 0.0 or reached[node] == 1.0); end for;
  status := if valid then 1.0 else status;
end PGValidateGraph;

function PGLinearize
  input Real p[:,3]; input Real R[size(p,1),3,3]; input Real edgeMask[:];
  input Integer source[size(edgeMask,1)]; input Integer target[size(edgeMask,1)];
  input Real translation[size(edgeMask,1),3]; input Real measuredRotation[size(edgeMask,1),3,3];
  input Real information[size(edgeMask,1),6,6];
  output Real Ji[size(edgeMask,1),6,6]; output Real Jj[size(edgeMask,1),6,6];
  output Real gradient[size(p,1),6]; output Real blocks[size(p,1),6,6];
protected Integer i; Integer j; Real residual[6]; Boolean valid;
  Real edgeJi[6,6]; Real edgeJj[6,6];
algorithm
  Ji := zeros(size(edgeMask,1),6,6); Jj := zeros(size(edgeMask,1),6,6);
  gradient := zeros(size(p,1),6); blocks := zeros(size(p,1),6,6); residual := zeros(6); valid := false; i := 1; j := 1;
  edgeJi := zeros(6,6); edgeJj := zeros(6,6);
  for edge in 1:size(edgeMask,1) loop
    if edgeMask[edge] == 1.0 then
      i := source[edge]; j := target[edge];
      (residual,edgeJi,edgeJj,valid) := PGEdge(p[i,:],R[i,:,:],p[j,:],R[j,:,:],translation[edge,:],measuredRotation[edge,:,:]);
      Ji[edge,:,:] := edgeJi; Jj[edge,:,:] := edgeJj;
      if i > 1 then
        gradient[i,:] := gradient[i,:]+transpose(Ji[edge,:,:])*(information[edge,:,:]*residual);
        blocks[i,:,:] := blocks[i,:,:]+transpose(Ji[edge,:,:])*information[edge,:,:]*Ji[edge,:,:];
      end if;
      if j > 1 then
        gradient[j,:] := gradient[j,:]+transpose(Jj[edge,:,:])*(information[edge,:,:]*residual);
        blocks[j,:,:] := blocks[j,:,:]+transpose(Jj[edge,:,:])*information[edge,:,:]*Jj[edge,:,:];
      end if;
    end if;
  end for;
end PGLinearize;

function PGDampedFactor
  input Real localBlock[6,6]; input Real damping;
  output Real L[6,6]; output Real diagonal[6]; output Boolean valid;
protected Real A[6,6];
algorithm
  A := localBlock; diagonal := zeros(6);
  for k in 1:6 loop diagonal[k] := max(A[k,k],1e-6); A[k,k] := A[k,k]+damping*diagonal[k]; end for;
  (L,valid) := PGCholesky(A,1e-12);
end PGDampedFactor;

function PGPrecondition
  input Real rhs[:,6]; input Real factors[size(rhs,1),6,6]; input Real nodeMask[size(rhs,1)];
  output Real z[size(rhs,1),6];
algorithm
  z := zeros(size(rhs,1),6);
  for node in 1:size(rhs,1) loop
    if node > 1 and nodeMask[node] == 1.0 then z[node,:] := PGSolveBlock(factors[node,:,:],rhs[node,:]); end if;
  end for;
end PGPrecondition;

function PGDot
  input Real x[:,:]; input Real y[size(x,1),size(x,2)]; output Real value;
algorithm
  value := 0.0;
  for i in 1:size(x,1) loop for j in 1:size(x,2) loop value := value+x[i,j]*y[i,j]; end for; end for;
end PGDot;

function PGPCG
  input Real gradient[:,6]; input Real blocks[size(gradient,1),6,6]; input Real nodeMask[size(gradient,1)];
  input Real edgeMask[:]; input Integer source[size(edgeMask,1)]; input Integer target[size(edgeMask,1)];
  input Real Ji[size(edgeMask,1),6,6]; input Real Jj[size(edgeMask,1),6,6]; input Real information[size(edgeMask,1),6,6];
  input Real damping; input Real tolerance; input Integer maximumPCG;
  output Real delta[size(gradient,1),6]; output Real iterations; output Real initialNorm; output Boolean valid;
protected Real factors[size(gradient,1),6,6]; Real diagonal[size(gradient,1),6]; Real rhs[size(gradient,1),6];
  Real localFactor[6,6]; Real localDiagonal[6];
  Real z[size(gradient,1),6]; Real direction[size(gradient,1),6]; Real product[size(gradient,1),6];
  Real rho; Real nextRho; Real denominator; Real alpha; Real beta; Real residualNorm; Boolean factorValid; Boolean running;
algorithm
  factors := zeros(size(gradient,1),6,6); diagonal := zeros(size(gradient,1),6); delta := zeros(size(gradient,1),6);
  localFactor := zeros(6,6); localDiagonal := zeros(6);
  rhs := -gradient; z := zeros(size(gradient,1),6); direction := zeros(size(gradient,1),6); product := zeros(size(gradient,1),6);
  valid := true; factorValid := false; iterations := 0.0; rho := 0.0; nextRho := 0.0; denominator := 0.0;
  alpha := 0.0; beta := 0.0; residualNorm := 0.0; running := false;
  for node in 1:size(gradient,1) loop
    if node > 1 and nodeMask[node] == 1.0 then
      (localFactor,localDiagonal,factorValid) := PGDampedFactor(blocks[node,:,:],damping);
      factors[node,:,:] := localFactor; diagonal[node,:] := localDiagonal;
      valid := valid and factorValid;
    end if;
  end for;
  z := PGPrecondition(rhs,factors,nodeMask); direction := z;
  rho := PGDot(rhs,z); initialNorm := PGDot(rhs,rhs);
  valid := valid and rho >= 0.0 and rho <= 1e100 and initialNorm <= 1e100;
  running := valid and initialNorm > 1e-18;
  for pcg in 1:96 loop
    if running and pcg <= maximumPCG then
      iterations := iterations+1.0;
      product := PGNormalProduct(direction,nodeMask,edgeMask,source,target,Ji,Jj,information,diagonal,damping);
      denominator := PGDot(direction,product); valid := denominator > 0.0 and denominator <= 1e100 and rho > 0.0;
      if valid then
        alpha := rho/denominator; delta := delta+alpha*direction; rhs := rhs-alpha*product; residualNorm := PGDot(rhs,rhs);
        valid := residualNorm >= 0.0 and residualNorm <= 1e100;
        running := valid and residualNorm > tolerance*tolerance*initialNorm;
        if running then
          z := PGPrecondition(rhs,factors,nodeMask); nextRho := PGDot(rhs,z);
          valid := nextRho > 0.0 and nextRho <= 1e100; beta := nextRho/max(rho,1e-300);
          direction := z+beta*direction; rho := nextRho; running := running and valid;
        end if;
      else running := false;
      end if;
    end if;
  end for;
end PGPCG;

function PGRetract
  input Real p[:,3]; input Real R[size(p,1),3,3]; input Real nodeMask[size(p,1)]; input Real delta[size(p,1),6]; input Real scale;
  output Real nextP[size(p,1),3]; output Real nextR[size(p,1),3,3];
algorithm
  nextP := p; nextR := R;
  for node in 1:size(p,1) loop
    if node > 1 and nodeMask[node] == 1.0 then
      nextP[node,:] := p[node,:]+scale*delta[node,1:3]; nextR[node,:,:] := R[node,:,:]*PGExp(scale*delta[node,4:6]);
    end if;
  end for;
end PGRetract;

function PGStep
  input Real p[:,3]; input Real R[size(p,1),3,3]; input Real nodeMask[size(p,1)]; input Real edgeMask[:];
  input Integer source[size(edgeMask,1)]; input Integer target[size(edgeMask,1)];
  input Real translation[size(edgeMask,1),3]; input Real measuredRotation[size(edgeMask,1),3,3]; input Real information[size(edgeMask,1),6,6];
  input Real currentCost; input Real damping; input Real maximumPositionStep; input Real maximumAngleStep;
  input Real pcgTolerance; input Integer maximumPCG; input Integer maximumBacktracks;
  output Real nextP[size(p,1),3]; output Real nextR[size(p,1),3,3]; output Real nextCost; output Real nextDamping;
  output Real accepted; output Real iterations; output Boolean running;
protected Real Ji[size(edgeMask,1),6,6]; Real Jj[size(edgeMask,1),6,6]; Real gradient[size(p,1),6]; Real blocks[size(p,1),6,6];
  Real delta[size(p,1),6]; Real initialNorm; Real scale; Real positionNorm; Real angleNorm;
  Real trialP[size(p,1),3]; Real trialR[size(p,1),3,3]; Real trialCost; Boolean pcgValid; Boolean trialValid;
algorithm
  nextP := p; nextR := R; nextCost := currentCost; nextDamping := min(1e6,damping*10.0); accepted := 0.0;
  trialP := p; trialR := R; trialCost := currentCost; scale := 1.0; positionNorm := 0.0; angleNorm := 0.0; trialValid := false;
  (Ji,Jj,gradient,blocks) := PGLinearize(p,R,edgeMask,source,target,translation,measuredRotation,information);
  (delta,iterations,initialNorm,pcgValid) := PGPCG(gradient,blocks,nodeMask,edgeMask,source,target,Ji,Jj,information,damping,pcgTolerance,maximumPCG);
  running := initialNorm > 1e-18;
  for node in 1:size(p,1) loop
    positionNorm := sqrt(max(delta[node,1:3]*delta[node,1:3],0.0)); angleNorm := sqrt(max(delta[node,4:6]*delta[node,4:6],0.0));
    scale := min(scale,min(maximumPositionStep/max(positionNorm,1e-12),maximumAngleStep/max(angleNorm,1e-12)));
  end for;
  for backtrack in 1:12 loop
    if pcgValid and running and accepted == 0.0 and backtrack <= maximumBacktracks then
      (trialP,trialR) := PGRetract(p,R,nodeMask,delta,scale);
      (trialCost,trialValid) := PGGraphCost(trialP,trialR,edgeMask,source,target,translation,measuredRotation,information);
      if trialValid and trialCost < currentCost-1e-12*max(1.0,currentCost) then
        nextP := trialP; nextR := trialR; nextCost := trialCost; nextDamping := max(1e-9,damping*0.3); accepted := 1.0;
      else scale := scale*0.5;
      end if;
    end if;
  end for;
end PGStep;

function PGRun
  input Real p[:,3]; input Real R[size(p,1),3,3]; input Real nodeMask[size(p,1)]; input Real edgeMask[:];
  input Integer source[size(edgeMask,1)]; input Integer target[size(edgeMask,1)];
  input Real translation[size(edgeMask,1),3]; input Real measuredRotation[size(edgeMask,1),3,3]; input Real information[size(edgeMask,1),6,6];
  input Real initialCost; input Real initialDamping; input Real maximumPositionStep; input Real maximumAngleStep; input Real pcgTolerance;
  input Integer maximumIterations; input Integer maximumPCG; input Integer maximumBacktracks;
  output Real nextP[size(p,1),3]; output Real nextR[size(p,1),3,3]; output Real cost; output Real acceptedIterations; output Real pcgIterations;
protected Real damping; Real accepted; Real iterations; Boolean running;
algorithm
  nextP := p; nextR := R; cost := initialCost; acceptedIterations := 0.0; pcgIterations := 0.0;
  damping := initialDamping; accepted := 0.0; iterations := 0.0; running := true;
  for iteration in 1:16 loop
    if running and iteration <= maximumIterations then
      (nextP,nextR,cost,damping,accepted,iterations,running) := PGStep(nextP,nextR,nodeMask,edgeMask,source,target,
        translation,measuredRotation,information,cost,damping,maximumPositionStep,maximumAngleStep,pcgTolerance,maximumPCG,maximumBacktracks);
      acceptedIterations := acceptedIterations+accepted; pcgIterations := pcgIterations+iterations;
    end if;
  end for;
end PGRun;

function OptimizeModelicaPoseGraph
  input Real position[:,3]; input Real rotation[size(position,1),3,3]; input Real nodeMask[size(position,1)];
  input Real edgeMask[:]; input Real fromNode[size(edgeMask,1)]; input Real toNode[size(edgeMask,1)];
  input Real translation[size(edgeMask,1),3]; input Real measuredRotation[size(edgeMask,1),3,3]; input Real information[size(edgeMask,1),6,6];
  input Integer maximumIterations; input Integer maximumPCG; input Integer maximumBacktracks;
  input Real initialDamping; input Real maximumPositionStep; input Real maximumAngleStep; input Real pcgTolerance;
  output Real nextPosition[size(position,1),3]; output Real nextRotation[size(position,1),3,3]; output Real status;
  output Real costBefore; output Real costAfter; output Real acceptedIterations; output Real pcgIterations; output Real activeNodes; output Real activeEdges;
protected Integer source[size(edgeMask,1)]; Integer target[size(edgeMask,1)]; Boolean valid; Boolean costValid;
algorithm
  nextPosition := position; nextRotation := rotation; costBefore := 0.0; costAfter := 0.0; acceptedIterations := 0.0; pcgIterations := 0.0;
  (source,target,status,activeNodes,activeEdges) := PGValidateGraph(position,rotation,nodeMask,edgeMask,fromNode,toNode,translation,measuredRotation,information);
  valid := status == 1.0 and maximumIterations >= 1 and maximumIterations <= 16 and maximumPCG >= 1 and maximumPCG <= 96
    and maximumBacktracks >= 1 and maximumBacktracks <= 12 and initialDamping >= 1e-9 and initialDamping <= 1e3
    and maximumPositionStep > 0.0 and maximumPositionStep <= 2.0 and maximumAngleStep > 0.0 and maximumAngleStep <= 0.5
    and pcgTolerance >= 1e-8 and pcgTolerance <= 0.1;
  status := if status == 1.0 and not valid then -1.0 else status; costValid := false;
  if valid then
    (costBefore,costValid) := PGGraphCost(position,rotation,edgeMask,source,target,translation,measuredRotation,information);
    status := if costValid then 1.0 else -4.0; costAfter := costBefore;
    if costValid then
      (nextPosition,nextRotation,costAfter,acceptedIterations,pcgIterations) := PGRun(position,rotation,nodeMask,edgeMask,source,target,
        translation,measuredRotation,information,costBefore,initialDamping,maximumPositionStep,maximumAngleStep,pcgTolerance,maximumIterations,maximumPCG,maximumBacktracks);
      status := if acceptedIterations > 0.0 then 2.0 else 1.0;
    end if;
  end if;
end OptimizeModelicaPoseGraph;

function PGEdgeDiagnostics
  input Real pi[3]; input Real Ri[3,3]; input Real pj[3]; input Real Rj[3,3]; input Real translation[3]; input Real measuredRotation[3,3];
  output Real residual[6]; output Real Ji[6,6]; output Real Jj[6,6]; output Real valid;
protected Boolean chartValid;
algorithm
  (residual,Ji,Jj,chartValid) := PGEdge(pi,Ri,pj,Rj,translation,measuredRotation); valid := if chartValid then 1.0 else 0.0;
end PGEdgeDiagnostics;

model ModelicaPoseGraph
  parameter Integer nodeCapacity = 128; parameter Integer edgeCapacity = 256;
  parameter Integer maximumIterations = 8; parameter Integer maximumPCG = 48; parameter Integer maximumBacktracks = 8;
  parameter Real initialDamping = 0.001; parameter Real maximumPositionStep = 0.5;
  parameter Real maximumAngleStep = 0.2; parameter Real pcgTolerance = 1e-5;
  input Real position[nodeCapacity,3] = zeros(nodeCapacity,3);
  input Real rotation[nodeCapacity,3,3] = zeros(nodeCapacity,3,3);
  input Real nodeMask[nodeCapacity] = zeros(nodeCapacity); input Real edgeMask[edgeCapacity] = zeros(edgeCapacity);
  input Real fromNode[edgeCapacity] = ones(edgeCapacity); input Real toNode[edgeCapacity] = ones(edgeCapacity);
  input Real translation[edgeCapacity,3] = zeros(edgeCapacity,3);
  input Real measuredRotation[edgeCapacity,3,3] = zeros(edgeCapacity,3,3);
  input Real information[edgeCapacity,6,6] = zeros(edgeCapacity,6,6);
  output Real nextPosition[nodeCapacity,3]; output Real nextRotation[nodeCapacity,3,3];
  output Real status; output Real costBefore; output Real costAfter; output Real acceptedIterations;
  output Real pcgIterations; output Real activeNodes; output Real activeEdges;
equation
  (nextPosition,nextRotation,status,costBefore,costAfter,acceptedIterations,pcgIterations,activeNodes,activeEdges) =
    OptimizeModelicaPoseGraph(position,rotation,nodeMask,edgeMask,fromNode,toNode,translation,measuredRotation,information,
      maximumIterations,maximumPCG,maximumBacktracks,initialDamping,maximumPositionStep,maximumAngleStep,pcgTolerance);
end ModelicaPoseGraph;

model ModelicaPoseGraphEdge
  input Real pi[3] = zeros(3); input Real pj[3] = zeros(3);
  input Real Ri[3,3] = identity(3); input Real Rj[3,3] = identity(3);
  input Real translation[3] = zeros(3); input Real measuredRotation[3,3] = identity(3);
  output Real residual[6]; output Real Ji[6,6]; output Real Jj[6,6]; output Real valid;
equation
  (residual,Ji,Jj,valid) = PGEdgeDiagnostics(pi,Ri,pj,Rj,translation,measuredRotation);
end ModelicaPoseGraphEdge;

// Geometric proposals use the same immutable catalog snapshot as retrieval.
// Graph admission and shared-image correlation remain separate owners.
package RGBDCatalogLoopVerification
  function VerifyCandidate
    input RGBDKeyframes.Catalog catalog;
    input RGBDKeyframes.Frame current;
    input Integer candidateId; input Integer candidateSlot;
    input Real appearanceScore; input Boolean requested;
    input Integer seed = 7; input Integer trials = 96; input Integer refinements = 4;
    input Integer minimumInliers = 12; input Real minimumFraction = 0.5;
    input Real inlierDistance = 0.08; input Real maximumRms = 0.03;
    input Real minimumAge = 5.0; input Real minimumSimilarity = 0.35;
    input Real descriptorRatio = 0.8; input Real maximumDescriptorDistance = 0.8;
    input Real coordinateLimit = 100.0; input Real rankTolerance = 1e-8;
    input Real localizationSigma = 0.5; input Real depthInflation = 1.0; input Real minimumPivot = 1e-10;
    output RGBDLoopVerification.Proposal proposal;
  protected
    RGBDKeyframes.Frame reference;
    Boolean bound;
  algorithm
    proposal := RGBDLoopVerification.EmptyProposal(seed);
    if requested then
      // Check domains before reading a slot. Capture will replace nextSlot,
      // so that identity cannot supply a retained loop endpoint.
      bound := RGBDKeyframes.ValidHeader(catalog)
        and candidateSlot >= 1 and candidateSlot <= RGBDKeyframes.keyframeCapacity
        and candidateSlot <> catalog.nextSlot and candidateId >= 1 and candidateId < catalog.nextId
        and current.generation == catalog.generation
        and current.vocabularyVersion == catalog.vocabularyVersion
        and current.id == catalog.nextId and current.epoch > catalog.lastEpoch
        and (catalog.nextId == 1 or current.imageTime > catalog.lastTime)
        and minimumSimilarity >= 0 and minimumSimilarity <= 1
        and appearanceScore >= minimumSimilarity and appearanceScore <= 1;
      proposal.rejectionReason := 10 "Catalog/appearance identity binding refused";
      if bound then
        bound := catalog.occupied[candidateSlot] and catalog.ids[candidateSlot] == candidateId
          and catalog.generations[candidateSlot] == current.generation
          and catalog.vocabularyVersions[candidateSlot] == current.vocabularyVersion;
        if bound then
          reference := RGBDKeyframes.ReadSlot(catalog,candidateSlot);
          proposal := RGBDLoopVerification.Verify(reference,current,true,seed,trials,refinements,
            minimumInliers,minimumFraction,inlierDistance,maximumRms,minimumAge,descriptorRatio,
            maximumDescriptorDistance,coordinateLimit,rankTolerance,localizationSigma,depthInflation,minimumPivot);
        end if;
      end if;
    end if;
  end VerifyCandidate;

  record Batch
    RGBDKeyframes.Frame prepared;
    Boolean retrievalAccepted; Integer retrievalRejectionReason;
    Real wordIndex[RGBDKeyframes.featureCapacity];
    Integer candidateId[RGBDKeyframeRetrieval.proposalCapacity];
    Integer candidateSlot[RGBDKeyframeRetrieval.proposalCapacity];
    Real candidateScore[RGBDKeyframeRetrieval.proposalCapacity];
    Integer candidateCount; Real assignmentCount;
    RGBDLoopVerification.Proposal proposals[RGBDKeyframeRetrieval.proposalCapacity];
    Integer verifiedCount;
    Integer nextSeeds[RGBDKeyframeRetrieval.proposalCapacity];
  end Batch;

  function ProposeCapture
    input RGBDKeyframes.Catalog catalog;
    input RGBDKeyframes.Frame measurement;
    input Real vocabulary[RGBDKeyframes.wordCapacity,RGBDKeyframes.descriptorSize];
    input Real vocabularyEnabled[RGBDKeyframes.wordCapacity];
    input Boolean requested;
    input Integer seeds[RGBDKeyframeRetrieval.proposalCapacity];
    input Real maximumWordDistanceSquared = 0.8; input Integer minimumAssignments = 8;
    input Real minimumSimilarity = 0.35; input Real minimumAge = 5.0;
    input Integer trials = 96; input Integer refinements = 4;
    input Integer minimumInliers = 12; input Real minimumFraction = 0.5;
    input Real inlierDistance = 0.08; input Real maximumRms = 0.03;
    input Real descriptorRatio = 0.8; input Real maximumDescriptorDistance = 0.8;
    input Real coordinateLimit = 100.0; input Real rankTolerance = 1e-8;
    input Real localizationSigma = 0.5; input Real depthInflation = 1.0; input Real minimumPivot = 1e-10;
    output Batch result;
  algorithm
    (result.prepared,result.retrievalAccepted,result.retrievalRejectionReason,result.wordIndex,result.candidateId,result.candidateSlot,result.candidateScore,
      result.candidateCount,result.assignmentCount) := RGBDKeyframeRetrieval.PrepareCapture(catalog,measurement,
        vocabulary,vocabularyEnabled,requested,maximumWordDistanceSquared,minimumAssignments,minimumSimilarity,minimumAge);
    result.verifiedCount := 0;
    for rank in 1:RGBDKeyframeRetrieval.proposalCapacity loop
      result.proposals[rank] := VerifyCandidate(catalog,result.prepared,result.candidateId[rank],result.candidateSlot[rank],result.candidateScore[rank],
        result.retrievalAccepted and rank <= result.candidateCount,seeds[rank],trials,refinements,minimumInliers,
        minimumFraction,inlierDistance,maximumRms,minimumAge,minimumSimilarity,descriptorRatio,
        maximumDescriptorDistance,coordinateLimit,rankTolerance,localizationSigma,depthInflation,minimumPivot);
      result.nextSeeds[rank] := result.proposals[rank].nextSeed;
      result.verifiedCount := result.verifiedCount+(if result.proposals[rank].verified then 1 else 0);
    end for;
  end ProposeCapture;
end RGBDCatalogLoopVerification;

// The keyframe catalog owns nodes. This owner retains measured body edges,
// never poses inferred from them. All results are proposals for an outer
// estimator/reference/catalog/map transaction; callers must publish together.
package RGBDGraphMeasurements
  constant Integer nodeCapacity = RGBDKeyframes.keyframeCapacity;
  constant Integer edgeCapacity = 256;
  constant Integer proposalCapacity = RGBDKeyframeRetrieval.proposalCapacity;
  constant Integer dimension = RGBDKeyframes.dimension;
  constant Integer poseDimension = RGBDKeyframes.poseDimension;
  constant Integer identifierLimit = RGBDKeyframes.identifierLimit;

  record Edge
    Boolean enabled;
    Integer id;
    Integer kind "1: consecutive capture; 2: verified loop";
    Integer referenceId; Integer currentId;
    Integer referenceSlot; Integer currentSlot;
    Integer referenceEpoch; Integer currentEpoch;
    Real rotation[dimension,dimension]; Real translation[dimension];
    Real covariance[poseDimension,poseDimension];
    Real information[poseDimension,poseDimension];
  end Edge;

  record State
    Integer generation;
    Integer revision;
    Integer lastCaptureId;
    Integer nextEdgeId;
    Edge edges[edgeCapacity];
  end State;

  function EmptyEdge
    output Edge result;
  algorithm
    result.enabled := false; result.id := 0; result.kind := 0;
    result.referenceId := 0; result.currentId := 0;
    result.referenceSlot := 0; result.currentSlot := 0;
    result.referenceEpoch := -1; result.currentEpoch := -1;
    result.rotation := identity(dimension); result.translation := zeros(dimension);
    result.covariance := zeros(poseDimension,poseDimension);
    result.information := zeros(poseDimension,poseDimension);
  end EmptyEdge;

  function Empty
    input Integer generation = 1;
    output State result;
  protected
    Edge empty;
  algorithm
    result.generation := generation; result.revision := 0;
    result.lastCaptureId := 0; result.nextEdgeId := 1;
    empty := EmptyEdge();
    for slot in 1:edgeCapacity loop result.edges[slot] := empty; end for;
  end Empty;

  function Bound
    input RGBDKeyframes.Catalog catalog;
    input Integer id; input Integer slot; input Integer epoch;
    output Boolean valid;
  algorithm
    // Header certification belongs to the caller. Integer domains precede
    // subtraction, ring arithmetic and all catalog subscripts.
    valid := catalog.nextId >= 1 and catalog.nextId <= identifierLimit
      and catalog.lastEpoch >= -1 and catalog.lastEpoch <= identifierLimit;
    if valid then
      valid := id >= max(1,catalog.nextId-nodeCapacity) and id < catalog.nextId
        and slot >= 1 and slot <= nodeCapacity and epoch >= 0 and epoch <= catalog.lastEpoch;
    end if;
    if valid then
      valid := mod(id-1,nodeCapacity)+1 == slot;
      if valid then
        valid := catalog.occupied[slot] and catalog.ids[slot] == id
          and catalog.generations[slot] == catalog.generation
          and catalog.epochs[slot] == epoch;
      end if;
    end if;
  end Bound;

  function ValidUncertainty
    input Real covariance[poseDimension,poseDimension];
    input Real information[poseDimension,poseDimension];
    output Boolean valid;
  protected
    Real inverseCovariance[poseDimension,poseDimension];
    Real inverseInformation[poseDimension,poseDimension];
    Real pivot; Boolean covarianceValid; Boolean informationValid;
  algorithm
    (inverseCovariance,covarianceValid,pivot) := RGBDUncertaintyInverse6(covariance,1e-10);
    (inverseInformation,informationValid,pivot) := RGBDUncertaintyInverse6(information,1e-10);
    valid := covarianceValid and informationValid;
    if valid then
      for row in 1:poseDimension loop
        for column in 1:poseDimension loop
          valid := valid and abs(inverseCovariance[row,column]-information[row,column])
            <= 1e-7*max(1.0,abs(inverseCovariance[row,column]))
            and abs(inverseInformation[row,column]-covariance[row,column])
            <= 1e-7*max(1.0,abs(inverseInformation[row,column]));
        end for;
      end for;
    end if;
  end ValidUncertainty;

  function ValidState
    input RGBDKeyframes.Catalog catalog;
    input State state;
    output Boolean valid;
  protected
    Boolean chain[nodeCapacity]; Boolean edgeValid;
    Integer oldest;
  algorithm
    chain := fill(false,nodeCapacity); oldest := 1;
    valid := RGBDKeyframes.ValidHeader(catalog)
      and state.generation == catalog.generation
      and state.revision >= 0 and state.revision <= identifierLimit
      and state.nextEdgeId >= 1 and state.nextEdgeId <= identifierLimit;
    if valid then
      valid := state.lastCaptureId == catalog.nextId-1;
      oldest := max(1,catalog.nextId-nodeCapacity);
      for slot in 1:edgeCapacity loop
        if state.edges[slot].enabled then
          edgeValid := state.edges[slot].id >= 1 and state.edges[slot].id < state.nextEdgeId
            and (state.edges[slot].kind == 1 or state.edges[slot].kind == 2)
            and state.edges[slot].referenceId < state.edges[slot].currentId
            and Bound(catalog,state.edges[slot].referenceId,state.edges[slot].referenceSlot,state.edges[slot].referenceEpoch)
            and Bound(catalog,state.edges[slot].currentId,state.edges[slot].currentSlot,state.edges[slot].currentEpoch)
            and RGBDUncertaintyProper(state.edges[slot].rotation)
            and ValidUncertainty(state.edges[slot].covariance,state.edges[slot].information);
          for axis in 1:dimension loop
            edgeValid := edgeValid and abs(state.edges[slot].translation[axis]) <= 1e6;
          end for;
          if state.edges[slot].kind == 1 then
            edgeValid := edgeValid and state.edges[slot].currentId == state.edges[slot].referenceId+1;
            if edgeValid then chain[state.edges[slot].currentSlot] := true; end if;
          end if;
          valid := valid and edgeValid;
          for earlier in 1:slot-1 loop
            if state.edges[earlier].enabled then
              valid := valid and state.edges[earlier].id <> state.edges[slot].id
                and (state.edges[earlier].referenceId <> state.edges[slot].referenceId
                  or state.edges[earlier].currentId <> state.edges[slot].currentId);
            end if;
          end for;
        end if;
      end for;
      // Every consecutive retained pair has a measured edge, so eviction
      // leaves a connected chain rooted at the oldest surviving keyframe.
      for node in 1:nodeCapacity loop
        if catalog.occupied[node] and catalog.ids[node] > oldest then
          valid := valid and chain[node];
        end if;
      end for;
    end if;
  end ValidState;

  function ValidProposal
    input RGBDKeyframes.Catalog catalog;
    input RGBDLoopVerification.Proposal proposal;
    input Real inlierDistance = 0.08;
    input Real maximumRms = 0.03;
    output Boolean valid;
  protected
    Integer referenceSlot; Integer currentSlot; Integer partner; Integer inliers;
    Boolean used[RGBDKeyframes.featureCapacity]; Boolean pairValid;
    Real A[dimension,dimension]; Real D[dimension,dimension]; Real u[dimension];
    Real residual[dimension]; Real cost;
  algorithm
    referenceSlot := 1; currentSlot := 1; partner := 1; inliers := 0; cost := 0.0;
    used := fill(false,RGBDKeyframes.featureCapacity);
    valid := RGBDKeyframes.ValidHeader(catalog) and proposal.verified and proposal.rejectionReason == 0
      and proposal.generation == catalog.generation
      and proposal.referenceId >= 1 and proposal.referenceId < proposal.currentId
      and proposal.currentId < catalog.nextId
      and proposal.matchedCount >= proposal.inlierCount
      and proposal.matchedCount <= RGBDKeyframes.featureCapacity
      and proposal.inlierCount >= 3 and proposal.inlierCount <= RGBDKeyframes.featureCapacity
      and proposal.rms >= 0 and proposal.rms <= maximumRms
      and inlierDistance > 0 and inlierDistance <= 10
      and maximumRms >= 0 and maximumRms <= inlierDistance
      and RGBDUncertaintyProper(proposal.opticalRotation)
      and RGBDUncertaintyProper(proposal.bodyRotation)
      and ValidUncertainty(proposal.covariance,proposal.information);
    if valid then
      valid := proposal.currentId == catalog.nextId-1;
      referenceSlot := mod(proposal.referenceId-1,nodeCapacity)+1;
      currentSlot := mod(proposal.currentId-1,nodeCapacity)+1;
      valid := Bound(catalog,proposal.referenceId,referenceSlot,proposal.referenceEpoch)
        and Bound(catalog,proposal.currentId,currentSlot,proposal.currentEpoch);
      if valid then
        A := catalog.opticalToBodyRotations[referenceSlot,:,:]*transpose(proposal.opticalRotation);
        D := A*transpose(catalog.opticalToBodyRotations[currentSlot,:,:]);
        u := catalog.cameraOriginsBody[referenceSlot,:]-A*(proposal.opticalTranslation
          +transpose(catalog.opticalToBodyRotations[currentSlot,:,:])*catalog.cameraOriginsBody[currentSlot,:]);
        valid := max(abs(D-proposal.bodyRotation)) <= 1e-7
          and max(abs(u-proposal.bodyTranslation)) <= 1e-7;
        for axis in 1:dimension loop
          valid := valid and abs(proposal.opticalTranslation[axis]) <= 1e6
            and abs(proposal.bodyTranslation[axis]) <= 1e6;
        end for;
        for feature in 1:RGBDKeyframes.featureCapacity loop
          if proposal.inliers[feature] then
            inliers := inliers+1;
            partner := proposal.partners[feature];
            pairValid := catalog.featureEnabled[referenceSlot,feature]
              and partner >= 1 and partner <= RGBDKeyframes.featureCapacity;
            if pairValid then
              pairValid := catalog.featureEnabled[currentSlot,partner] and not used[partner];
              used[partner] := true;
              residual := proposal.opticalRotation*catalog.opticalPoints[referenceSlot,feature,:]
                +proposal.opticalTranslation-catalog.opticalPoints[currentSlot,partner,:];
              pairValid := pairValid and residual*residual <= inlierDistance^2;
              cost := cost+residual*residual;
            end if;
            valid := valid and pairValid;
          else
            valid := valid and proposal.partners[feature] == 0;
          end if;
        end for;
        valid := valid and inliers == proposal.inlierCount;
        if inliers > 0 then valid := valid and abs(sqrt(cost/inliers)-proposal.rms) <= 1e-6; end if;
      end if;
    end if;
  end ValidProposal;

  function FromProposal
    input RGBDLoopVerification.Proposal proposal;
    input Integer id; input Integer kind;
    output Edge result;
  algorithm
    result := EmptyEdge(); result.enabled := true; result.id := id; result.kind := kind;
    result.referenceId := proposal.referenceId; result.currentId := proposal.currentId;
    result.referenceSlot := mod(proposal.referenceId-1,nodeCapacity)+1;
    result.currentSlot := mod(proposal.currentId-1,nodeCapacity)+1;
    result.referenceEpoch := proposal.referenceEpoch; result.currentEpoch := proposal.currentEpoch;
    result.rotation := proposal.bodyRotation; result.translation := proposal.bodyTranslation;
    result.covariance := proposal.covariance; result.information := proposal.information;
  end FromProposal;

  record Insertion
    State state;
    Boolean accepted; Boolean duplicate;
    Integer replacedLoops;
  end Insertion;

  function Insert
    // Internal primitive: Capture certifies the graph, proposal and kind
    // before calling. Direct callers must satisfy the same preconditions.
    input State previous;
    input RGBDLoopVerification.Proposal proposal;
    input Integer kind;
    output Insertion result;
  protected
    Integer freeSlot; Integer oldestLoop; Integer oldestId;
  algorithm
    result.state := previous; result.accepted := false; result.duplicate := false; result.replacedLoops := 0;
    freeSlot := 0; oldestLoop := 0; oldestId := identifierLimit;
    for slot in 1:edgeCapacity loop
      if previous.edges[slot].enabled then
        result.duplicate := result.duplicate or (previous.edges[slot].referenceId == proposal.referenceId
          and previous.edges[slot].currentId == proposal.currentId);
        if previous.edges[slot].kind == 2 and previous.edges[slot].id < oldestId then
          oldestLoop := slot; oldestId := previous.edges[slot].id;
        end if;
      elseif freeSlot == 0 then freeSlot := slot;
      end if;
    end for;
    if result.duplicate then
      result.accepted := true;
    elseif previous.nextEdgeId < identifierLimit then
      if freeSlot == 0 then freeSlot := oldestLoop; result.replacedLoops := if oldestLoop > 0 then 1 else 0; end if;
      if freeSlot > 0 then
        result.state.edges[freeSlot] := FromProposal(proposal,previous.nextEdgeId,kind);
        result.state.nextEdgeId := previous.nextEdgeId+1;
        result.accepted := true;
      end if;
    end if;
  end Insert;

  record Update
    State state;
    Boolean accepted;
    Integer rejectionReason "1 idle; 2 catalog/config; 3 prior graph; 4 chain; 5 loop; 6 capacity/identity; 7 invariant";
    Integer removedEdges; Integer admittedSequential; Integer admittedLoops; Integer duplicateLoops;
  end Update;

  function Capture
    input RGBDKeyframes.Catalog previousCatalog;
    input RGBDKeyframes.Catalog capturedCatalog "Already admitted capture; immutable old payload is trusted";
    input State previous;
    input RGBDLoopVerification.Proposal sequential;
    input RGBDLoopVerification.Proposal loops[proposalCapacity];
    input Boolean requested;
    input Boolean reset = false;
    input Real inlierDistance = 0.08; input Real maximumRms = 0.03;
    output Update result;
  protected
    State working; Insertion insertion;
    Boolean valid; Integer reason; Integer removed; Integer sequentialCount; Integer loopCount; Integer duplicates;
  algorithm
    result.state := previous; result.accepted := false; result.rejectionReason := 1;
    result.removedEdges := 0; result.admittedSequential := 0; result.admittedLoops := 0; result.duplicateLoops := 0;
    removed := 0; sequentialCount := 0; loopCount := 0; duplicates := 0;
    if requested then
      reason := 2;
      valid := RGBDKeyframes.ValidHeader(capturedCatalog) and capturedCatalog.nextId >= 2
        and inlierDistance > 0 and inlierDistance <= 10 and maximumRms >= 0 and maximumRms <= inlierDistance;
      if reset then
        // A deliberate new generation can recover a damaged old payload.
        valid := valid and previous.generation >= 1 and previous.generation < identifierLimit
          and capturedCatalog.generation > previous.generation and capturedCatalog.nextId == 2;
        working := Empty(capturedCatalog.generation);
      else
        working := previous;
        valid := valid and RGBDKeyframes.ValidHeader(previousCatalog)
          and previousCatalog.nextId < identifierLimit
          and capturedCatalog.generation == previousCatalog.generation
          and capturedCatalog.vocabularyVersion == previousCatalog.vocabularyVersion
          and capturedCatalog.nextId == previousCatalog.nextId+1
          and capturedCatalog.lastEpoch > previousCatalog.lastEpoch
          and (previousCatalog.nextId == 1 or capturedCatalog.lastTime > previousCatalog.lastTime);
        if valid then
          for node in 1:nodeCapacity loop
            if previousCatalog.occupied[node] and node <> previousCatalog.nextSlot then
              valid := valid and capturedCatalog.occupied[node]
                and capturedCatalog.ids[node] == previousCatalog.ids[node]
                and capturedCatalog.epochs[node] == previousCatalog.epochs[node]
                and capturedCatalog.imageTimes[node] == previousCatalog.imageTimes[node];
            end if;
          end for;
          if valid then reason := 3; valid := ValidState(previousCatalog,previous) and previous.revision < identifierLimit; end if;
        end if;
      end if;
      if valid then
        for slot in 1:edgeCapacity loop
          if working.edges[slot].enabled then
            if not Bound(capturedCatalog,working.edges[slot].referenceId,working.edges[slot].referenceSlot,working.edges[slot].referenceEpoch)
              or not Bound(capturedCatalog,working.edges[slot].currentId,working.edges[slot].currentSlot,working.edges[slot].currentEpoch) then
              working.edges[slot] := EmptyEdge(); removed := removed+1;
            end if;
          end if;
        end for;
        reason := 4;
        if not reset and previousCatalog.nextId > 1 then
          valid := sequential.referenceId == previousCatalog.nextId-1
            and ValidProposal(capturedCatalog,sequential,inlierDistance,maximumRms);
          if valid then
            insertion := Insert(working,sequential,1); working := insertion.state;
            valid := insertion.accepted and not insertion.duplicate;
            removed := removed+insertion.replacedLoops; sequentialCount := if valid then 1 else 0;
            if not valid then reason := 6; end if;
          end if;
        else valid := not sequential.verified;
        end if;
        for rank in 1:proposalCapacity loop
          if valid and loops[rank].verified then
            reason := 5; valid := ValidProposal(capturedCatalog,loops[rank],inlierDistance,maximumRms);
            if valid then
              insertion := Insert(working,loops[rank],2); working := insertion.state; valid := insertion.accepted;
              removed := removed+insertion.replacedLoops;
              duplicates := duplicates+(if insertion.duplicate then 1 else 0);
              loopCount := loopCount+(if insertion.accepted and not insertion.duplicate then 1 else 0);
              if not valid then reason := 6; end if;
            end if;
          end if;
        end for;
        if valid then
          working.lastCaptureId := capturedCatalog.nextId-1;
          working.revision := if reset then 1 else previous.revision+1;
          reason := 7; valid := ValidState(capturedCatalog,working);
        end if;
        if valid then
          result.state := working; result.accepted := true; result.rejectionReason := 0;
          result.removedEdges := removed; result.admittedSequential := sequentialCount;
          result.admittedLoops := loopCount; result.duplicateLoops := duplicates;
        else result.rejectionReason := reason;
        end if;
      else result.rejectionReason := reason;
      end if;
    end if;
  end Capture;

  record Problem
    Boolean accepted;
    Integer nodeCount; Integer edgeCount; Integer correlationInflation;
    Integer nodeId[nodeCapacity]; Integer catalogSlot[nodeCapacity];
    Real nodeMask[nodeCapacity]; Real positions[nodeCapacity,dimension];
    Real rotations[nodeCapacity,dimension,dimension];
    Real edgeMask[edgeCapacity]; Real fromNode[edgeCapacity]; Real toNode[edgeCapacity];
    Real measuredRotation[edgeCapacity,dimension,dimension]; Real measuredTranslation[edgeCapacity,dimension];
    Real information[edgeCapacity,poseDimension,poseDimension];
  end Problem;

  function EmptyProblem
    output Problem result;
  algorithm
    result.accepted := false; result.nodeCount := 0; result.edgeCount := 0; result.correlationInflation := 1;
    result.nodeId := fill(0,nodeCapacity); result.catalogSlot := fill(0,nodeCapacity);
    result.nodeMask := zeros(nodeCapacity); result.positions := zeros(nodeCapacity,dimension);
    result.edgeMask := zeros(edgeCapacity); result.fromNode := zeros(edgeCapacity); result.toNode := zeros(edgeCapacity);
    result.measuredTranslation := zeros(edgeCapacity,dimension); result.information := zeros(edgeCapacity,poseDimension,poseDimension);
    for node in 1:nodeCapacity loop result.rotations[node,:,:] := identity(dimension); end for;
    for edge in 1:edgeCapacity loop result.measuredRotation[edge,:,:] := identity(dimension); end for;
  end EmptyProblem;

  function PrepareProblem
    input RGBDKeyframes.Catalog catalog;
    input State state;
    input Boolean requested = true;
    output Problem result;
  protected
    Integer oldest; Integer id; Integer slot; Boolean valid;
  algorithm
    result := EmptyProblem(); valid := false;
    if requested then valid := ValidState(catalog,state) and catalog.nextId > 1; end if;
    if valid then
      for node in 1:nodeCapacity loop
        if catalog.occupied[node] then
          valid := valid and RGBDUncertaintyProper(catalog.bodyRotations[node,:,:]);
          for axis in 1:dimension loop valid := valid and abs(catalog.bodyPositions[node,axis]) <= 1e6; end for;
        end if;
      end for;
    end if;
    if valid then
      result.nodeCount := min(catalog.nextId-1,nodeCapacity); oldest := max(1,catalog.nextId-nodeCapacity);
      for node in 1:result.nodeCount loop
        id := oldest+node-1; slot := mod(id-1,nodeCapacity)+1;
        result.nodeId[node] := id; result.catalogSlot[node] := slot; result.nodeMask[node] := 1.0;
        result.positions[node,:] := catalog.bodyPositions[slot,:]; result.rotations[node,:,:] := catalog.bodyRotations[slot,:,:];
      end for;
      for edge in 1:edgeCapacity loop result.edgeCount := result.edgeCount+(if state.edges[edge].enabled then 1 else 0); end for;
      // No edge independence is presumed. For E arbitrarily correlated
      // errors with bounded marginal covariance R_e, C <= E*diag(R_e).
      // This changes the information scale, never the stored measurement.
      // It does not establish independence from the inertial/filter prior.
      result.correlationInflation := max(1,result.edgeCount);
      for edge in 1:edgeCapacity loop
        if state.edges[edge].enabled then
          result.edgeMask[edge] := 1.0;
          result.fromNode[edge] := state.edges[edge].referenceId-oldest+1;
          result.toNode[edge] := state.edges[edge].currentId-oldest+1;
          result.measuredRotation[edge,:,:] := state.edges[edge].rotation;
          result.measuredTranslation[edge,:] := state.edges[edge].translation;
          result.information[edge,:,:] := state.edges[edge].information/result.correlationInflation;
        end if;
      end for;
      result.accepted := true;
    end if;
  end PrepareProblem;
end RGBDGraphMeasurements;

// Atomic proposal for the catalog and measured graph owners. Publication,
// estimator correlation, optimization and map updates remain outer owners.
package RGBDCatalogGraphCapture
  record Result
    RGBDKeyframes.Catalog catalog;
    RGBDGraphMeasurements.State graph;
    Boolean accepted;
    Integer rejectionReason "1 idle; 2 retrieval; 3 store; 4 graph; 5 problem";
    Integer storedSlot; Integer evictedId;
    RGBDCatalogLoopVerification.Batch loopDiagnostics;
    RGBDLoopVerification.Proposal sequentialDiagnostics;
    RGBDGraphMeasurements.Update graphDiagnostics;
    RGBDGraphMeasurements.Problem problem;
  end Result;

  function Capture
    input RGBDKeyframes.Catalog previousCatalog;
    input RGBDKeyframes.Frame measurement;
    input Real vocabulary[RGBDKeyframes.wordCapacity,RGBDKeyframes.descriptorSize];
    input Real vocabularyEnabled[RGBDKeyframes.wordCapacity];
    input RGBDGraphMeasurements.State previousGraph;
    input Boolean requested;
    input Integer seeds[RGBDKeyframeRetrieval.proposalCapacity] = fill(7,RGBDKeyframeRetrieval.proposalCapacity);
    input Integer sequentialSeed = 7;
    input Real maximumWordDistanceSquared = 0.8; input Integer minimumAssignments = 8;
    input Real minimumSimilarity = 0.35; input Real minimumAge = 5.0;
    input Integer trials = 96; input Integer refinements = 4;
    input Integer minimumInliers = 12; input Real minimumFraction = 0.5;
    input Real inlierDistance = 0.08; input Real maximumRms = 0.03;
    input Real descriptorRatio = 0.8; input Real maximumDescriptorDistance = 0.8;
    input Real coordinateLimit = 100.0; input Real rankTolerance = 1e-8;
    input Real localizationSigma = 0.5; input Real depthInflation = 1.0; input Real minimumPivot = 1e-10;
    output Result result;
  protected
    RGBDKeyframes.Catalog captured;
    RGBDKeyframes.Frame latest;
    Boolean stored; Integer slot; Integer evicted;
  algorithm
    result.catalog := previousCatalog; result.graph := previousGraph;
    result.accepted := false; result.rejectionReason := 1;
    result.storedSlot := 0; result.evictedId := 0;
    result.loopDiagnostics := RGBDCatalogLoopVerification.ProposeCapture(previousCatalog,measurement,vocabulary,vocabularyEnabled,
      requested,seeds,maximumWordDistanceSquared,minimumAssignments,minimumSimilarity,minimumAge,trials,refinements,
      minimumInliers,minimumFraction,inlierDistance,maximumRms,descriptorRatio,maximumDescriptorDistance,
      coordinateLimit,rankTolerance,localizationSigma,depthInflation,minimumPivot);
    result.sequentialDiagnostics := RGBDLoopVerification.EmptyProposal(sequentialSeed);
    if result.loopDiagnostics.retrievalAccepted and previousCatalog.nextId > 1 then
      latest := RGBDKeyframes.ReadSlot(previousCatalog,mod(previousCatalog.nextId-2,RGBDKeyframes.keyframeCapacity)+1);
      result.sequentialDiagnostics := RGBDLoopVerification.Verify(latest,result.loopDiagnostics.prepared,true,
        sequentialSeed,trials,refinements,minimumInliers,minimumFraction,inlierDistance,maximumRms,0.0,
        descriptorRatio,maximumDescriptorDistance,coordinateLimit,rankTolerance,localizationSigma,depthInflation,minimumPivot);
    end if;
    (captured,stored,slot,evicted) := RGBDKeyframes.Store(previousCatalog,result.loopDiagnostics.prepared,result.loopDiagnostics.retrievalAccepted);
    result.graphDiagnostics := RGBDGraphMeasurements.Capture(previousCatalog,captured,previousGraph,
      result.sequentialDiagnostics,result.loopDiagnostics.proposals,stored,false,inlierDistance,maximumRms);
    result.problem := RGBDGraphMeasurements.EmptyProblem();
    if result.graphDiagnostics.accepted then
      result.problem := RGBDGraphMeasurements.PrepareProblem(captured,result.graphDiagnostics.state,true);
    end if;
    if requested then
      result.rejectionReason := if not result.loopDiagnostics.retrievalAccepted then 2 else if not stored then 3
        else if not result.graphDiagnostics.accepted then 4 else if not result.problem.accepted then 5 else 0;
      if result.rejectionReason == 0 then
        result.catalog := captured; result.graph := result.graphDiagnostics.state;
        result.accepted := true; result.storedSlot := slot; result.evictedId := evicted;
      end if;
    end if;
  end Capture;
end RGBDCatalogGraphCapture;

// Collision-safe bounded spatial lookup. Storage and all search mathematics are
// Modelica-owned. Rebuild after pruning; inserted points keep their anchor.
package RGBDSpatialIndex
  constant Integer defaultBucketCount = 32768;
  constant Integer maximumBucketCount = 65536;
  constant Integer maximumSlotCount = 1000000;
  constant Real coordinateLimit = 1e6;
  constant Integer maximumIndexedRadius = 4;

  function Cell
    input Real point[3];
    input Real voxelWidth;
    output Integer cell[3];
    output Boolean valid;
  algorithm
    cell := fill(0,3);
    valid := voxelWidth >= 0.001 and voxelWidth <= 10.0;
    for axis in 1:3 loop
      valid := valid and abs(point[axis]) <= coordinateLimit;
    end for;
    if valid then
      for axis in 1:3 loop
        cell[axis] := integer(floor(point[axis]/voxelWidth));
      end for;
    end if;
  end Cell;

  function Bucket
    input Integer cell[3];
    input Integer bucketCount;
    output Integer bucket;
  protected
    Integer hash;
  algorithm
    // The caller certifies 1..maximumBucketCount buckets. Reduce each key
    // before multiplication: the intermediate fits even a signed 32-bit Integer.
    hash := 0;
    for axis in 1:3 loop
      hash := mod(31*hash+mod(cell[axis],bucketCount),bucketCount);
    end for;
    bucket := hash+1;
  end Bucket;

  function Build
    input Real point[:,3];
    input Real occupied[size(point,1)];
    input Real voxelWidth;
    input Integer bucketCount = defaultBucketCount;
    output Integer head[bucketCount];
    output Integer link[size(point,1)];
    output Integer cell[size(point,1),3];
    output Integer freeNext[size(point,1)];
    output Integer firstFree;
    output Boolean valid;
  protected
    Integer slot;
    Integer bucket;
    Boolean pointValid;
  algorithm
    head := fill(0,bucketCount);
    link := fill(0,size(point,1));
    cell := fill(0,size(point,1),3);
    freeNext := fill(0,size(point,1));
    firstFree := 0;
    valid := size(point,1) > 0 and size(point,1) <= maximumSlotCount
      and bucketCount >= 1 and bucketCount <= maximumBucketCount
      and voxelWidth >= 0.001 and voxelWidth <= 10.0;
    if valid then
      // Reverse construction makes both chains and the free list ascending.
      // Storage uses array indices, with no lossy collision replacement.
      // Allocation and buffer reuse are compiler/runtime responsibilities.
      for reverse in 1:size(point,1) loop
        slot := size(point,1)+1-reverse;
        if occupied[slot] == 1.0 then
          (cell[slot,:],pointValid) := Cell(point[slot,:],voxelWidth);
          valid := valid and pointValid;
          if pointValid then
            bucket := Bucket(cell[slot,:],bucketCount);
            link[slot] := head[bucket];
            head[bucket] := slot;
          end if;
        elseif occupied[slot] == 0.0 then
          freeNext[slot] := firstFree;
          firstFree := slot;
        else
          valid := false;
        end if;
      end for;
    end if;
    if not valid then
      head := fill(0,bucketCount);
      link := fill(0,size(point,1));
      cell := fill(0,size(point,1),3);
      freeNext := fill(0,size(point,1));
      firstFree := 0;
    end if;
  end Build;

  function Find
    input Real point[:,3];
    input Real occupied[size(point,1)];
    input Integer head[:];
    input Integer link[size(point,1)];
    input Integer cell[size(point,1),3];
    input Real candidate[3];
    input Real voxelWidth;
    input Real mergeRadius;
    input Boolean searchEnabled;
    output Integer duplicate;
    output Boolean valid;
    output Integer visited "Occupied point checks, for algorithmic profiling";
    output Boolean linearSearch;
  protected
    Integer queryCell[3];
    Integer neighbor[3];
    Integer radius;
    Integer neighborhood;
    Integer node;
    Integer traversed;
    Real difference[3];
    Boolean sameVoxel;
    Boolean matches;
  algorithm
    duplicate := 0;
    visited := 0;
    linearSearch := false;
    valid := true;
    queryCell := fill(0,3);
    neighbor := fill(0,3);
    difference := zeros(3);
    radius := 0;
    neighborhood := 0;
    node := 0;
    traversed := 0;
    sameVoxel := false;
    matches := false;
    if searchEnabled then
      (queryCell,valid) := Cell(candidate,voxelWidth);
      valid := valid and size(point,1) > 0 and size(point,1) <= maximumSlotCount
        and size(head,1) >= 1 and size(head,1) <= maximumBucketCount
        and mergeRadius >= 0.0 and mergeRadius <= 10.0;
      if valid then
        radius := integer(ceil(mergeRadius/voxelWidth));
        // Broad radii remain correct without iterating billions of empty cells.
        linearSearch := radius > maximumIndexedRadius;
        if not linearSearch then
          neighborhood := (2*radius+1)*(2*radius+1)*(2*radius+1);
          linearSearch := neighborhood >= size(point,1)
            or neighborhood >= size(head,1);
        end if;
        if linearSearch then
          for slot in 1:size(point,1) loop
            if occupied[slot] == 1.0 then
              visited := visited+1;
              difference := point[slot,:]-candidate;
              sameVoxel := floor(point[slot,1]/voxelWidth) == queryCell[1]
                and floor(point[slot,2]/voxelWidth) == queryCell[2]
                and floor(point[slot,3]/voxelWidth) == queryCell[3];
              matches := sameVoxel or difference*difference <= mergeRadius^2;
              if matches and duplicate == 0 then
                duplicate := slot;
              end if;
            end if;
          end for;
        else
          for dx in -radius:radius loop
            for dy in -radius:radius loop
              for dz in -radius:radius loop
                neighbor := queryCell+{dx,dy,dz};
                node := head[Bucket(neighbor,size(head,1))];
                traversed := 0;
                valid := valid and node >= 0 and node <= size(point,1);
                while node > 0 and valid loop
                  // Bound corrupt cycles and refuse invalid indices before reads.
                  if node > size(point,1) or traversed >= size(point,1) then
                    valid := false;
                  else
                    traversed := traversed+1;
                    visited := visited+1;
                    valid := occupied[node] == 1.0
                      and link[node] >= 0 and link[node] <= size(point,1);
                    if valid then
                      if cell[node,1] == neighbor[1] and cell[node,2] == neighbor[2]
                        and cell[node,3] == neighbor[3] then
                        difference := point[node,:]-candidate;
                        sameVoxel := neighbor[1] == queryCell[1]
                          and neighbor[2] == queryCell[2] and neighbor[3] == queryCell[3];
                        matches := sameVoxel or difference*difference <= mergeRadius^2;
                        if matches and (duplicate == 0 or node < duplicate) then
                          duplicate := node;
                        end if;
                      end if;
                      node := link[node];
                    end if;
                  end if;
                end while;
              end for;
            end for;
          end for;
        end if;
      end if;
    end if;
    if not valid then
      duplicate := 0;
    end if;
  end Find;
end RGBDSpatialIndex;

// Persistent state is explicit: callers retain only accepted next-state outputs.
// All coordinates are in one unchanged world ENU frame. Points come from
// RGBDLandmarkProjection and bodyPosition is estimated, never ground truth.
partial function RGBDLandmarkMapInterface
  input Real previousPoint[:,:];
  input Real previousOccupied[:];
  input Real previousConfidence[:];
  input Real previousLastSeen[:];
  input Real previousLastFrame[:];
  input Real candidatePoint[:,:];
  input Real candidateEnabled[:];
  input Real candidateCount;
  input Real bodyPosition[3];
  input Real poseAccepted;
  input Real previousTime;
  input Real timeNow;
  input Real previousFrame;
  input Real frameNow;
  input Real previousWorldFrame;
  input Real worldFrame;
  input Real resetRequested;
  input Real coordinateLimit;
  input Real voxelWidth;
  input Real mergeRadius;
  input Real maximumDistance;
  input Real tentativeLifetime;
  input Real confirmedLifetime;
  input Real confirmationObservations;
  input Real maximumConfidence;
  input Real maximumTentative;
  output Real point[size(previousOccupied,1),3];
  output Real occupied[size(previousOccupied,1)];
  output Real confidence[size(previousOccupied,1)];
  output Real lastSeen[size(previousOccupied,1)];
  output Real lastFrame[size(previousOccupied,1)];
  output Real confirmed[size(previousOccupied,1)];
  output Real accepted;
  output Real rejectionReason;
  output Real nextTime;
  output Real nextFrame;
  output Real nextWorldFrame;
  output Real occupiedCount;
  output Real confirmedCount;
  output Real tentativeCount;
  output Real insertedCount;
  output Real mergedCount;
  output Real prunedCount;
  output Real droppedCount;
  output Real invalidCandidateCount;
end RGBDLandmarkMapInterface;

function UpdateLandmarkMapWithReceipts
  extends RGBDLandmarkMapInterface;
  output Integer insertedFeature[size(previousOccupied,1)] "Original candidate slot, zero for retained/empty slots";
protected
  Boolean configurationValid;
  Boolean stateValid;
  Boolean slotValid;
  Boolean reset;
  Boolean initialObservation;
  Boolean present;
  Boolean keep;
  Boolean candidateValid;
  Boolean insert;
  Boolean merge;
  Real safeCandidate[3];
  Real difference[3];
  Real distanceSquared;
  Real lifetime;
  Integer spatialHead[RGBDSpatialIndex.defaultBucketCount];
  Integer spatialLink[size(previousOccupied,1)];
  Integer spatialCell[size(previousOccupied,1),3];
  Integer freeNext[size(previousOccupied,1)];
  Integer firstFree;
  Integer visited;
  Integer bucket;
  Boolean indexValid;
  Boolean queryValid;
  Boolean cellValid;
  Boolean linearSearch;
  Integer duplicate;
  Integer vacant;
  Integer destination;
algorithm
  reset := resetRequested >= 1.0 and resetRequested <= 1.0;
  // Only the first observation may share the empty map's zero timestamp.
  // State validation below rules out every occupied slot at previousFrame=0.
  // Later observations still require strictly increasing acquisition time.
  initialObservation := previousFrame == 0.0 and previousTime == 0.0 and timeNow == 0.0;
  slotValid := false; present := false; keep := false;
  candidateValid := false; insert := false; merge := false;
  safeCandidate := zeros(3); difference := zeros(3);
  distanceSquared := 0.0; lifetime := 0.0;
  duplicate := 0; vacant := 0; destination := 1;
  spatialHead := fill(0,RGBDSpatialIndex.defaultBucketCount);
  spatialLink := fill(0,size(previousOccupied,1));
  spatialCell := fill(0,size(previousOccupied,1),3);
  freeNext := fill(0,size(previousOccupied,1));
  firstFree := 0; visited := 0; bucket := 1;
  indexValid := true; queryValid := false; cellValid := false; linearSearch := false;
  confirmed := zeros(size(previousOccupied,1));
  insertedFeature := fill(0,size(previousOccupied,1));
  configurationValid := size(previousPoint,1) == size(previousOccupied,1) and size(previousPoint,2) == 3
    and size(previousConfidence,1) == size(previousOccupied,1) and size(previousLastSeen,1) == size(previousOccupied,1)
    and size(previousLastFrame,1) == size(previousOccupied,1) and size(candidatePoint,1) == size(candidateEnabled,1)
    and size(candidatePoint,2) == 3 and size(previousOccupied,1) > 0
    and size(previousOccupied,1) <= RGBDSpatialIndex.maximumSlotCount
    and coordinateLimit > 0.0 and coordinateLimit <= 1e6 and voxelWidth >= 0.001 and voxelWidth <= 10.0
    and mergeRadius >= 0.0 and mergeRadius <= 10.0 and maximumDistance > 0.0 and maximumDistance <= 1e4
    and tentativeLifetime > 0.0 and tentativeLifetime <= 1e4 and confirmedLifetime >= tentativeLifetime and confirmedLifetime <= 1e4
    and confirmationObservations >= 2.0 and confirmationObservations <= maximumConfidence and floor(confirmationObservations) == confirmationObservations
    and maximumConfidence <= 100.0 and floor(maximumConfidence) == maximumConfidence
    and maximumTentative >= 0.0 and maximumTentative <= size(previousOccupied,1) and floor(maximumTentative) == maximumTentative
    and candidateCount >= 0.0 and candidateCount <= size(candidateEnabled,1) and floor(candidateCount) == candidateCount
    and poseAccepted >= 1.0 and poseAccepted <= 1.0
    and abs(bodyPosition[1]) <= coordinateLimit and abs(bodyPosition[2]) <= coordinateLimit and abs(bodyPosition[3]) <= coordinateLimit
    and timeNow >= 0.0 and timeNow <= 1e9
    and worldFrame >= 0.0 and worldFrame <= 1e9 and floor(worldFrame) == worldFrame
    and ((reset and frameNow == 1.0) or (resetRequested >= 0.0 and resetRequested <= 0.0
      and previousTime >= 0.0 and previousTime <= 1e9 and (previousTime < timeNow or initialObservation)
      and previousFrame >= 0.0 and previousFrame < 1e9 and floor(previousFrame) == previousFrame and frameNow == previousFrame+1.0
      and previousWorldFrame == worldFrame));
  stateValid := true;
  for slot in 1:size(previousOccupied,1) loop
    slotValid := previousOccupied[slot] >= 0.0 and previousOccupied[slot] <= 0.0
      or (previousOccupied[slot] >= 1.0 and previousOccupied[slot] <= 1.0
        and abs(previousPoint[slot,1]) <= coordinateLimit and abs(previousPoint[slot,2]) <= coordinateLimit and abs(previousPoint[slot,3]) <= coordinateLimit
        and previousConfidence[slot] >= 1.0 and previousConfidence[slot] <= maximumConfidence and floor(previousConfidence[slot]) == previousConfidence[slot]
        and previousLastSeen[slot] >= 0.0 and previousLastSeen[slot] <= previousTime
        and previousLastFrame[slot] >= 1.0 and previousLastFrame[slot] <= previousFrame and floor(previousLastFrame[slot]) == previousLastFrame[slot]);
    stateValid := stateValid and (reset or slotValid);
  end for;
  accepted := if configurationValid and stateValid then 1.0 else 0.0;
  rejectionReason := if not configurationValid then 1.0 else if not stateValid then 2.0 else 0.0;
  point := previousPoint; occupied := previousOccupied; confidence := previousConfidence;
  lastSeen := previousLastSeen; lastFrame := previousLastFrame;
  nextTime := if accepted > 0.5 then timeNow else previousTime;
  nextFrame := if accepted > 0.5 then frameNow else previousFrame;
  nextWorldFrame := if accepted > 0.5 then worldFrame else previousWorldFrame;
  insertedCount := 0.0; mergedCount := 0.0; prunedCount := 0.0; droppedCount := 0.0; invalidCandidateCount := 0.0;
  tentativeCount := 0.0;
  // Prune before insertion. Empty storage is canonicalized only on acceptance.
  for slot in 1:size(previousOccupied,1) loop
    present := accepted > 0.5 and not reset and previousOccupied[slot] > 0.5;
    difference := if present then previousPoint[slot,:]-bodyPosition else zeros(3);
    distanceSquared := difference[1]*difference[1]+difference[2]*difference[2]+difference[3]*difference[3];
    lifetime := if present and previousConfidence[slot] >= confirmationObservations then confirmedLifetime else tentativeLifetime;
    keep := present and timeNow-previousLastSeen[slot] <= lifetime and distanceSquared <= maximumDistance*maximumDistance;
    prunedCount := prunedCount+(if present and not keep then 1.0 else 0.0);
    point[slot,:] := if accepted > 0.5 and not keep then zeros(3) else point[slot,:];
    occupied[slot] := if accepted > 0.5 then (if keep then 1.0 else 0.0) else occupied[slot];
    confidence[slot] := if accepted > 0.5 and not keep then 0.0 else confidence[slot];
    lastSeen[slot] := if accepted > 0.5 and not keep then 0.0 else lastSeen[slot];
    lastFrame[slot] := if accepted > 0.5 and not keep then 0.0 else lastFrame[slot];
    tentativeCount := tentativeCount+(if keep and confidence[slot] < confirmationObservations then 1.0 else 0.0);
  end for;
  // Build once after pruning. The index is local to this transaction, so it
  // cannot become stale across a reset, accepted pose or retained map update.
  if accepted > 0.5 then
    (spatialHead,spatialLink,spatialCell,freeNext,firstFree,indexValid) :=
      RGBDSpatialIndex.Build(point,occupied,voxelWidth);
  end if;
  // Raster candidate order is stable, including sparse final slots. Repeated
  // candidates in one frame never count as independent confirmation evidence.
  for feature in 1:size(candidateEnabled,1) loop
    candidateValid := accepted > 0.5 and indexValid and feature <= candidateCount and candidateEnabled[feature] >= 1.0 and candidateEnabled[feature] <= 1.0
      and abs(candidatePoint[feature,1]) <= coordinateLimit and abs(candidatePoint[feature,2]) <= coordinateLimit and abs(candidatePoint[feature,3]) <= coordinateLimit;
    invalidCandidateCount := invalidCandidateCount+(if accepted > 0.5 and feature <= candidateCount
      and not (candidateEnabled[feature] >= 0.0 and candidateEnabled[feature] <= 0.0) and not candidateValid then 1.0 else 0.0);
    safeCandidate := if candidateValid then candidatePoint[feature,:] else zeros(3);
    difference := if candidateValid then safeCandidate-bodyPosition else zeros(3);
    distanceSquared := difference[1]*difference[1]+difference[2]*difference[2]+difference[3]*difference[3];
    candidateValid := candidateValid and distanceSquared <= maximumDistance*maximumDistance;
    duplicate := 0; vacant := 0;
    if candidateValid then
      (duplicate,queryValid,visited,linearSearch) := RGBDSpatialIndex.Find(
        point,occupied,spatialHead,spatialLink,spatialCell,safeCandidate,voxelWidth,mergeRadius,true);
      indexValid := indexValid and queryValid;
      candidateValid := candidateValid and queryValid;
      vacant := if queryValid then firstFree else 0;
    end if;
    merge := candidateValid and duplicate > 0;
    insert := candidateValid and duplicate == 0 and vacant > 0 and tentativeCount < maximumTentative;
    destination := if duplicate > 0 then duplicate else if vacant > 0 then vacant else 1;
    tentativeCount := tentativeCount+(if insert then 1.0 else if merge and lastFrame[destination] < frameNow
      and confidence[destination] < confirmationObservations and confidence[destination]+1.0 >= confirmationObservations then -1.0 else 0.0);
    point[destination,:] := if insert then safeCandidate else point[destination,:];
    occupied[destination] := if insert then 1.0 else occupied[destination];
    confidence[destination] := if insert then 1.0 else if merge and lastFrame[destination] < frameNow
      then min(maximumConfidence,confidence[destination]+1.0) else confidence[destination];
    lastSeen[destination] := if insert or merge then timeNow else lastSeen[destination];
    lastFrame[destination] := if insert or merge then frameNow else lastFrame[destination];
    insertedFeature[destination] := if insert then feature else insertedFeature[destination];
    insertedCount := insertedCount+(if insert then 1.0 else 0.0);
    mergedCount := mergedCount+(if merge then 1.0 else 0.0);
    droppedCount := droppedCount+(if candidateValid and not insert and not merge then 1.0 else 0.0);
    if insert then
      // A merge keeps the original anchor; only insertions change the index.
      // Update local arrays instead of returning/copying a table per feature.
      (spatialCell[destination,:],cellValid) := RGBDSpatialIndex.Cell(safeCandidate,voxelWidth);
      indexValid := indexValid and cellValid;
      if cellValid then
        bucket := RGBDSpatialIndex.Bucket(spatialCell[destination,:],size(spatialHead,1));
        spatialLink[destination] := spatialHead[bucket];
        spatialHead[bucket] := destination;
        firstFree := freeNext[destination];
        freeNext[destination] := 0;
      end if;
    end if;
  end for;
  // Refuse an invalid private index atomically, just like invalid public state.
  if accepted > 0.5 and not indexValid then
    accepted := 0.0; rejectionReason := 3.0;
    point := previousPoint; occupied := previousOccupied; confidence := previousConfidence;
    lastSeen := previousLastSeen; lastFrame := previousLastFrame;
    nextTime := previousTime; nextFrame := previousFrame; nextWorldFrame := previousWorldFrame;
    insertedCount := 0.0; mergedCount := 0.0; prunedCount := 0.0;
    droppedCount := 0.0; invalidCandidateCount := 0.0;
    insertedFeature := fill(0,size(previousOccupied,1));
  end if;
  occupiedCount := 0.0; confirmedCount := 0.0; tentativeCount := 0.0;
  for slot in 1:size(previousOccupied,1) loop
    confirmed[slot] := if occupied[slot] >= 1.0 and occupied[slot] <= 1.0 and confidence[slot] >= confirmationObservations then 1.0 else 0.0;
    occupiedCount := occupiedCount+(if occupied[slot] >= 1.0 and occupied[slot] <= 1.0 then 1.0 else 0.0);
    confirmedCount := confirmedCount+confirmed[slot];
    tentativeCount := tentativeCount+(if occupied[slot] >= 1.0 and occupied[slot] <= 1.0 and confirmed[slot] < 0.5 then 1.0 else 0.0);
  end for;
end UpdateLandmarkMapWithReceipts;
// Existing public numerical interface delegates to the same kernel. Receipts
// are consumed by anchored composition; old callers retain their exact outputs.
function UpdateLandmarkMap
  extends RGBDLandmarkMapInterface;
protected
  Integer unusedReceipt[size(previousOccupied,1)];
algorithm
  (point,occupied,confidence,lastSeen,lastFrame,confirmed,accepted,rejectionReason,nextTime,nextFrame,nextWorldFrame,
    occupiedCount,confirmedCount,tentativeCount,insertedCount,mergedCount,prunedCount,droppedCount,invalidCandidateCount,
    unusedReceipt) := UpdateLandmarkMapWithReceipts(
      previousPoint,previousOccupied,previousConfidence,previousLastSeen,previousLastFrame,candidatePoint,candidateEnabled,
      candidateCount,bodyPosition,poseAccepted,previousTime,timeNow,previousFrame,frameNow,previousWorldFrame,worldFrame,resetRequested,
      coordinateLimit,voxelWidth,mergeRadius,maximumDistance,tentativeLifetime,confirmedLifetime,confirmationObservations,
      maximumConfidence,maximumTentative);
end UpdateLandmarkMap;

model RGBDLandmarkMap
  constant Integer imageHeight = 90;
  constant Integer imageWidth = 160;
  constant Integer mapCapacity = imageHeight*imageWidth;
  constant Integer featureCapacity = 350;
  constant Integer dimension = 3;
  parameter Real coordinateLimit = 1e6;
  parameter Real voxelWidth = 0.25;
  parameter Real mergeRadius = 0.15;
  parameter Real maximumDistance = 80.0;
  parameter Real tentativeLifetime = 0.5;
  parameter Real confirmedLifetime = 5.0;
  parameter Real confirmationObservations = 3.0;
  parameter Real maximumConfidence = 8.0;
  parameter Real maximumTentative = 700.0;
  input Real previousPoint[mapCapacity,dimension] = zeros(mapCapacity,dimension);
  input Real previousOccupied[mapCapacity] = zeros(mapCapacity);
  input Real previousConfidence[mapCapacity] = zeros(mapCapacity);
  input Real previousLastSeen[mapCapacity] = zeros(mapCapacity);
  input Real previousLastFrame[mapCapacity] = zeros(mapCapacity);
  input Real candidatePoint[featureCapacity,dimension] = zeros(featureCapacity,dimension);
  input Real candidateEnabled[featureCapacity] = zeros(featureCapacity);
  input Real candidateCount = 0.0;
  input Real bodyPosition[dimension] = zeros(dimension);
  input Real poseAccepted = 1.0;
  input Real previousTime = 0.0;
  input Real timeNow = 0.0;
  input Real previousFrame = 0.0;
  input Real frameNow = 1.0;
  input Real previousWorldFrame = 0.0;
  input Real worldFrame = 0.0;
  input Real resetRequested = 0.0;
  output Real point[mapCapacity,dimension];
  output Real occupied[mapCapacity];
  output Real confidence[mapCapacity];
  output Real lastSeen[mapCapacity];
  output Real lastFrame[mapCapacity];
  output Real confirmed[mapCapacity];
  output Real accepted; output Real rejectionReason;
  output Real nextTime; output Real nextFrame; output Real nextWorldFrame;
  output Real occupiedCount; output Real confirmedCount; output Real tentativeCount;
  output Real insertedCount; output Real mergedCount; output Real prunedCount;
  output Real droppedCount; output Real invalidCandidateCount;
equation
  (point,occupied,confidence,lastSeen,lastFrame,confirmed,accepted,rejectionReason,nextTime,nextFrame,nextWorldFrame,
    occupiedCount,confirmedCount,tentativeCount,insertedCount,mergedCount,prunedCount,droppedCount,invalidCandidateCount) =
    UpdateLandmarkMap(previousPoint,previousOccupied,previousConfidence,previousLastSeen,previousLastFrame,candidatePoint,candidateEnabled,
      candidateCount,bodyPosition,poseAccepted,previousTime,timeNow,previousFrame,frameNow,previousWorldFrame,worldFrame,resetRequested,
      coordinateLimit,voxelWidth,mergeRadius,maximumDistance,tentativeLifetime,confirmedLifetime,confirmationObservations,maximumConfidence,maximumTentative);
end RGBDLandmarkMap;

// Landmark coordinates stay local to stable keyframe identities. A graph
// correction is a proposal until every persistent owner commits it together.
package RGBDMapAnchors
  constant Integer imageHeight = 90;
  constant Integer imageWidth = 160;
  constant Integer mapCapacity = imageHeight*imageWidth;
  constant Integer keyframeCapacity = 128;
  constant Integer dimension = 3;
  constant Integer identifierLimit = 1000000000;

  function ProperRotation
    input Real rotation[dimension,dimension];
    output Boolean valid;
  protected
    Real gram[dimension,dimension]; Real determinant;
  algorithm
    valid := true;
    for row in 1:dimension loop
      for column in 1:dimension loop
        valid := valid and abs(rotation[row,column]) <= 1.000001;
      end for;
    end for;
    if valid then
      gram := transpose(rotation)*rotation;
      for row in 1:dimension loop
        for column in 1:dimension loop
          valid := valid and abs(gram[row,column]-(if row == column then 1.0 else 0.0)) <= 1e-6;
        end for;
      end for;
      determinant := rotation[1,1]*(rotation[2,2]*rotation[3,3]-rotation[2,3]*rotation[3,2])
        -rotation[1,2]*(rotation[2,1]*rotation[3,3]-rotation[2,3]*rotation[3,1])
        +rotation[1,3]*(rotation[2,1]*rotation[3,2]-rotation[2,2]*rotation[3,1]);
      valid := valid and abs(determinant-1.0) <= 1e-6;
    end if;
  end ProperRotation;

  // Catalog/graph slots never relocate within a generation. Reuse changes
  // the monotone identity; a cached slot alone cannot keep an anchor alive.
  function ValidNodes
    input Boolean enabled[:];
    input Integer ids[size(enabled,1)];
    input Real position[size(enabled,1),dimension];
    input Real rotation[size(enabled,1),dimension,dimension];
    input Real coordinateLimit;
    output Boolean valid;
  algorithm
    valid := true;
    for node in 1:size(enabled,1) loop
      if enabled[node] then
        valid := valid and ids[node] >= 1 and ids[node] <= identifierLimit
          and ProperRotation(rotation[node,:,:]);
        for axis in 1:dimension loop
          valid := valid and abs(position[node,axis]) <= coordinateLimit;
        end for;
        for other in 1:node-1 loop
          if enabled[other] then valid := valid and ids[node] <> ids[other]; end if;
        end for;
      end if;
    end for;
  end ValidNodes;

  function Reproject
    input Real previousPoint[:,dimension];
    input Real previousLocalPoint[size(previousPoint,1),dimension];
    input Real previousOccupied[size(previousPoint,1)];
    input Integer previousAnchorId[size(previousPoint,1)];
    input Integer previousAnchorSlot[size(previousPoint,1)];
    input Integer mapGeneration; input Integer previousRevision;
    input Boolean nodeEnabled[:];
    input Integer nodeId[size(nodeEnabled,1)];
    input Real nodePosition[size(nodeEnabled,1),dimension];
    input Real nodeRotation[size(nodeEnabled,1),dimension,dimension];
    input Integer graphGeneration; input Integer graphRevision;
    input Boolean graphAccepted; input Boolean requested;
    input Real coordinateLimit;
    output Real point[size(previousPoint,1),dimension];
    output Real localPoint[size(previousPoint,1),dimension];
    output Real occupied[size(previousPoint,1)];
    output Integer anchorId[size(previousPoint,1)];
    output Integer anchorSlot[size(previousPoint,1)];
    output Integer nextRevision;
    output Boolean accepted;
    output Integer rejectionReason;
    output Integer projectedCount; output Integer prunedCount;
  protected
    Boolean configuration; Boolean stateValid; Boolean slotValid;
    Boolean coordinatesValid; Boolean retained;
    Integer owner; Real candidate[dimension];
  algorithm
    point := previousPoint; localPoint := previousLocalPoint;
    occupied := previousOccupied; anchorId := previousAnchorId; anchorSlot := previousAnchorSlot;
    nextRevision := previousRevision; accepted := false; rejectionReason := 1;
    projectedCount := 0; prunedCount := 0;
    if requested then
      configuration := size(previousPoint,1) >= 1 and size(previousPoint,1) <= mapCapacity
        and size(nodeEnabled,1) >= 1 and size(nodeEnabled,1) <= keyframeCapacity
        and coordinateLimit > 0.0 and coordinateLimit <= 1e6
        and mapGeneration >= 1 and mapGeneration <= identifierLimit and graphGeneration == mapGeneration
        and previousRevision >= 0 and previousRevision < identifierLimit and graphRevision == previousRevision+1;
      rejectionReason := 2;
      if configuration then
        rejectionReason := 3;
        if graphAccepted then
          rejectionReason := 4;
          if ValidNodes(nodeEnabled,nodeId,nodePosition,nodeRotation,coordinateLimit) then
            stateValid := true; coordinatesValid := true;
            for slot in 1:size(previousPoint,1) loop
              if previousOccupied[slot] == 0.0 then
                point[slot,:] := zeros(dimension); localPoint[slot,:] := zeros(dimension);
                occupied[slot] := 0.0; anchorId[slot] := 0; anchorSlot[slot] := 0;
              elseif previousOccupied[slot] == 1.0 then
                owner := previousAnchorSlot[slot];
                slotValid := previousAnchorId[slot] >= 1 and previousAnchorId[slot] <= identifierLimit
                  and owner >= 1 and owner <= size(nodeEnabled,1);
                for axis in 1:dimension loop
                  slotValid := slotValid and abs(previousPoint[slot,axis]) <= coordinateLimit
                    and abs(previousLocalPoint[slot,axis]) <= coordinateLimit;
                end for;
                stateValid := stateValid and slotValid;
                if slotValid then
                  retained := nodeEnabled[owner] and nodeId[owner] == previousAnchorId[slot];
                  if retained then
                    candidate := nodeRotation[owner,:,:]*previousLocalPoint[slot,:]+nodePosition[owner,:];
                    for axis in 1:dimension loop
                      coordinatesValid := coordinatesValid and abs(candidate[axis]) <= coordinateLimit;
                    end for;
                    point[slot,:] := candidate; projectedCount := projectedCount+1;
                  else
                    // Eviction or slot reuse cannot transfer a landmark to a
                    // new keyframe that happens to occupy the same array slot.
                    point[slot,:] := zeros(dimension); localPoint[slot,:] := zeros(dimension);
                    occupied[slot] := 0.0; anchorId[slot] := 0; anchorSlot[slot] := 0;
                    prunedCount := prunedCount+1;
                  end if;
                end if;
              else
                stateValid := false;
              end if;
            end for;
            accepted := stateValid and coordinatesValid;
            rejectionReason := if not stateValid then 5 else if not coordinatesValid then 6 else 0;
            if accepted then nextRevision := graphRevision; end if;
          end if;
        end if;
      end if;
    end if;
    // Late failures preserve all previous fields, including poisoned disabled
    // payload. Canonicalization, pruning and version advancement commit together.
    if not accepted then
      point := previousPoint; localPoint := previousLocalPoint; occupied := previousOccupied;
      anchorId := previousAnchorId; anchorSlot := previousAnchorSlot;
      nextRevision := previousRevision; projectedCount := 0; prunedCount := 0;
    end if;
  end Reproject;
end RGBDMapAnchors;

model RGBDAnchoredMapCorrection
  constant Integer mapCapacity = RGBDMapAnchors.mapCapacity;
  constant Integer keyframeCapacity = RGBDMapAnchors.keyframeCapacity;
  constant Integer dimension = RGBDMapAnchors.dimension;
  parameter Real coordinateLimit = 1e6;
  input Real previousPoint[mapCapacity,dimension] = zeros(mapCapacity,dimension);
  input Real previousLocalPoint[mapCapacity,dimension] = zeros(mapCapacity,dimension);
  input Real previousOccupied[mapCapacity] = zeros(mapCapacity);
  input Integer previousAnchorId[mapCapacity] = fill(0,mapCapacity);
  input Integer previousAnchorSlot[mapCapacity] = fill(0,mapCapacity);
  input Integer mapGeneration = 1; input Integer previousRevision = 0;
  input Boolean nodeEnabled[keyframeCapacity] = fill(false,keyframeCapacity);
  input Integer nodeId[keyframeCapacity] = fill(0,keyframeCapacity);
  input Real nodePosition[keyframeCapacity,dimension] = zeros(keyframeCapacity,dimension);
  input Real nodeRotation[keyframeCapacity,dimension,dimension] = zeros(keyframeCapacity,dimension,dimension);
  input Integer graphGeneration = 1; input Integer graphRevision = 1;
  input Boolean graphAccepted = false; input Boolean requested = false;
  output Real point[mapCapacity,dimension]; output Real localPoint[mapCapacity,dimension];
  output Real occupied[mapCapacity];
  output Integer anchorId[mapCapacity]; output Integer anchorSlot[mapCapacity];
  output Integer nextRevision; output Boolean accepted;
  output Integer rejectionReason; output Integer projectedCount; output Integer prunedCount;
equation
  (point,localPoint,occupied,anchorId,anchorSlot,nextRevision,accepted,rejectionReason,projectedCount,prunedCount) =
    RGBDMapAnchors.Reproject(previousPoint,previousLocalPoint,previousOccupied,previousAnchorId,previousAnchorSlot,
      mapGeneration,previousRevision,nodeEnabled,nodeId,nodePosition,nodeRotation,graphGeneration,graphRevision,
      graphAccepted,requested,coordinateLimit);
end RGBDAnchoredMapCorrection;

// Consume private map insertion receipts. Anchor outputs are a proposal until
// the surrounding owner commits map geometry, metadata and anchors together.
function AssignLandmarkAnchors
  input Real previousPoint[:,3];
  input Real previousOccupied[size(previousPoint,1)];
  input Real previousLocalPoint[size(previousPoint,1),3];
  input Integer previousAnchorId[size(previousPoint,1)];
  input Integer previousAnchorSlot[size(previousPoint,1)];
  input Integer previousGeneration;
  input Real nextPoint[size(previousPoint,1),3];
  input Real nextOccupied[size(previousPoint,1)];
  input Integer insertedFeature[size(previousPoint,1)];
  input Real candidatePoint[:,3];
  input Real candidateEnabled[size(candidatePoint,1)]; input Real candidateCount;
  input Boolean nodeEnabled[:]; input Integer nodeId[size(nodeEnabled,1)];
  input Real nodePosition[size(nodeEnabled,1),3]; input Real nodeRotation[size(nodeEnabled,1),3,3];
  input Integer catalogGeneration; input Integer generation;
  input Integer selectedAnchorId; input Integer selectedAnchorSlot;
  input Boolean mapAccepted; input Boolean requested; input Boolean reset;
  input Real coordinateLimit; input Real consistencyTolerance;
  output Real localPoint[size(previousPoint,1),3];
  output Integer anchorId[size(previousPoint,1)]; output Integer anchorSlot[size(previousPoint,1)];
  output Integer nextGeneration; output Boolean accepted; output Integer rejectionReason;
  output Integer assignedCount; output Integer retainedCount; output Integer clearedCount;
protected
  constant Integer featureCapacity = 350;
  Boolean configuration; Boolean valid; Boolean slotValid; Boolean selectedValid;
  Boolean seen[size(candidatePoint,1)];
  Integer feature; Integer owner; Real local[3]; Real reconstructed[3];
algorithm
  localPoint := previousLocalPoint; anchorId := previousAnchorId; anchorSlot := previousAnchorSlot;
  nextGeneration := previousGeneration; accepted := false; rejectionReason := 1;
  assignedCount := 0; retainedCount := 0; clearedCount := 0;
  if requested then
    configuration := size(previousPoint,1) >= 1 and size(previousPoint,1) <= RGBDMapAnchors.mapCapacity
      and size(candidatePoint,1) >= 1 and size(candidatePoint,1) <= featureCapacity
      and size(nodeEnabled,1) >= 1 and size(nodeEnabled,1) <= RGBDMapAnchors.keyframeCapacity
      and candidateCount >= 0.0 and candidateCount <= size(candidatePoint,1) and floor(candidateCount) == candidateCount
      and generation >= 1 and generation <= RGBDMapAnchors.identifierLimit and catalogGeneration == generation
      and ((reset and previousGeneration >= 0 and previousGeneration < RGBDMapAnchors.identifierLimit
        and generation == previousGeneration+1) or (not reset and previousGeneration == generation))
      and selectedAnchorSlot >= 0 and selectedAnchorSlot <= size(nodeEnabled,1)
      and selectedAnchorId >= 0 and selectedAnchorId <= RGBDMapAnchors.identifierLimit
      and coordinateLimit > 0.0 and coordinateLimit <= 1e6
      and consistencyTolerance > 0.0 and consistencyTolerance <= 0.01;
    rejectionReason := 2;
    if configuration then
      rejectionReason := 3;
      if mapAccepted then
        rejectionReason := 4;
        if RGBDMapAnchors.ValidNodes(nodeEnabled,nodeId,nodePosition,nodeRotation,coordinateLimit) then
          selectedValid := false;
          if selectedAnchorSlot >= 1 and selectedAnchorId >= 1 then
            selectedValid := nodeEnabled[selectedAnchorSlot] and nodeId[selectedAnchorSlot] == selectedAnchorId;
          end if;
          valid := true; seen := fill(false,size(candidatePoint,1));
          for slot in 1:size(previousPoint,1) loop
            feature := insertedFeature[slot];
            slotValid := feature >= 0 and feature <= size(candidatePoint,1)
              and (nextOccupied[slot] == 0.0 or nextOccupied[slot] == 1.0);
            if slotValid then
              if nextOccupied[slot] == 0.0 then
                slotValid := feature == 0;
                localPoint[slot,:] := zeros(3); anchorId[slot] := 0; anchorSlot[slot] := 0;
                clearedCount := clearedCount+1;
              elseif feature > 0 then
                slotValid := selectedValid and feature <= candidateCount and candidateEnabled[feature] == 1.0
                  and not seen[feature];
                seen[feature] := true;
                for axis in 1:3 loop
                  slotValid := slotValid and abs(nextPoint[slot,axis]) <= coordinateLimit
                    and nextPoint[slot,axis] == candidatePoint[feature,axis];
                end for;
                if slotValid then
                  local := transpose(nodeRotation[selectedAnchorSlot,:,:])*(nextPoint[slot,:]-nodePosition[selectedAnchorSlot,:]);
                  reconstructed := nodeRotation[selectedAnchorSlot,:,:]*local+nodePosition[selectedAnchorSlot,:];
                  for axis in 1:3 loop
                    slotValid := slotValid and abs(local[axis]) <= coordinateLimit
                      and abs(reconstructed[axis]-nextPoint[slot,axis]) <= consistencyTolerance;
                  end for;
                  localPoint[slot,:] := local;
                  anchorId[slot] := selectedAnchorId; anchorSlot[slot] := selectedAnchorSlot;
                  assignedCount := assignedCount+1;
                end if;
              else
                owner := previousAnchorSlot[slot];
                slotValid := not reset and previousOccupied[slot] == 1.0
                  and previousAnchorId[slot] >= 1 and previousAnchorId[slot] <= RGBDMapAnchors.identifierLimit
                  and owner >= 1 and owner <= size(nodeEnabled,1);
                for axis in 1:3 loop
                  slotValid := slotValid and abs(previousLocalPoint[slot,axis]) <= coordinateLimit
                    and abs(previousPoint[slot,axis]) <= coordinateLimit
                    and nextPoint[slot,axis] == previousPoint[slot,axis];
                end for;
                if slotValid then
                  slotValid := nodeEnabled[owner] and nodeId[owner] == previousAnchorId[slot];
                  if slotValid then
                    reconstructed := nodeRotation[owner,:,:]*previousLocalPoint[slot,:]+nodePosition[owner,:];
                    for axis in 1:3 loop
                      slotValid := slotValid and abs(reconstructed[axis]-previousPoint[slot,axis]) <= consistencyTolerance;
                    end for;
                    retainedCount := retainedCount+1;
                  end if;
                end if;
              end if;
            end if;
            valid := valid and slotValid;
          end for;
          accepted := valid; rejectionReason := if valid then 0 else 5;
          if accepted then nextGeneration := generation; end if;
        end if;
      end if;
    end if;
  end if;
  if not accepted then
    localPoint := previousLocalPoint; anchorId := previousAnchorId; anchorSlot := previousAnchorSlot;
    nextGeneration := previousGeneration; assignedCount := 0; retainedCount := 0; clearedCount := 0;
  end if;
end AssignLandmarkAnchors;

// Geometry, observation metadata and keyframe-local anchors share one commit.
// This owner consumes a coherent catalog proposal; catalog/filter/graph commits
// must still be coordinated by the enclosing SLAM transaction.
function UpdateAnchoredLandmarkMap
  extends RGBDLandmarkMapInterface;
  input Real previousLocalPoint[size(previousOccupied,1),3];
  input Integer previousAnchorId[size(previousOccupied,1)];
  input Integer previousAnchorSlot[size(previousOccupied,1)];
  input Integer previousGeneration;
  input Boolean nodeEnabled[:]; input Integer nodeId[size(nodeEnabled,1)];
  input Real nodePosition[size(nodeEnabled,1),3]; input Real nodeRotation[size(nodeEnabled,1),3,3];
  input Integer catalogGeneration; input Integer generation;
  input Integer selectedAnchorId; input Integer selectedAnchorSlot;
  input Boolean requested; input Real consistencyTolerance;
  output Real localPoint[size(previousOccupied,1),3];
  output Integer anchorId[size(previousOccupied,1)]; output Integer anchorSlot[size(previousOccupied,1)];
  output Integer nextGeneration;
  output Real mapRejectionReason; output Integer anchorRejectionReason;
  output Integer assignedCount; output Integer retainedCount; output Integer clearedCount;
protected
  Integer insertedFeature[size(previousOccupied,1)];
  Boolean anchorsAccepted;
algorithm
  point := previousPoint; occupied := previousOccupied; confidence := previousConfidence;
  lastSeen := previousLastSeen; lastFrame := previousLastFrame;
  nextTime := previousTime; nextFrame := previousFrame; nextWorldFrame := previousWorldFrame;
  localPoint := previousLocalPoint; anchorId := previousAnchorId; anchorSlot := previousAnchorSlot;
  nextGeneration := previousGeneration;
  accepted := 0.0; rejectionReason := 1.0; mapRejectionReason := 0.0; anchorRejectionReason := 0;
  assignedCount := 0; retainedCount := 0; clearedCount := 0;
  insertedCount := 0.0; mergedCount := 0.0; prunedCount := 0.0;
  droppedCount := 0.0; invalidCandidateCount := 0.0;
  if requested then
    (point,occupied,confidence,lastSeen,lastFrame,confirmed,accepted,mapRejectionReason,nextTime,nextFrame,nextWorldFrame,
      occupiedCount,confirmedCount,tentativeCount,insertedCount,mergedCount,prunedCount,droppedCount,invalidCandidateCount,
      insertedFeature) := UpdateLandmarkMapWithReceipts(
        previousPoint,previousOccupied,previousConfidence,previousLastSeen,previousLastFrame,candidatePoint,candidateEnabled,
        candidateCount,bodyPosition,poseAccepted,previousTime,timeNow,previousFrame,frameNow,previousWorldFrame,worldFrame,resetRequested,
        coordinateLimit,voxelWidth,mergeRadius,maximumDistance,tentativeLifetime,confirmedLifetime,confirmationObservations,
        maximumConfidence,maximumTentative);
    rejectionReason := 2.0;
    if accepted == 1.0 then
      (localPoint,anchorId,anchorSlot,nextGeneration,anchorsAccepted,anchorRejectionReason,
        assignedCount,retainedCount,clearedCount) := AssignLandmarkAnchors(
          previousPoint,previousOccupied,previousLocalPoint,previousAnchorId,previousAnchorSlot,previousGeneration,
          point,occupied,insertedFeature,candidatePoint,candidateEnabled,candidateCount,
          nodeEnabled,nodeId,nodePosition,nodeRotation,catalogGeneration,generation,selectedAnchorId,selectedAnchorSlot,
          true,true,resetRequested == 1.0,coordinateLimit,consistencyTolerance);
      accepted := if anchorsAccepted then 1.0 else 0.0;
      rejectionReason := if anchorsAccepted then 0.0 else 3.0;
    end if;
  end if;
  if accepted <> 1.0 then
    // Even a failure discovered at the final landmark rolls back the map's
    // merges, pruning, insertion and clocks, as well as every anchor field.
    point := previousPoint; occupied := previousOccupied; confidence := previousConfidence;
    lastSeen := previousLastSeen; lastFrame := previousLastFrame;
    nextTime := previousTime; nextFrame := previousFrame; nextWorldFrame := previousWorldFrame;
    localPoint := previousLocalPoint; anchorId := previousAnchorId; anchorSlot := previousAnchorSlot;
    nextGeneration := previousGeneration;
    insertedCount := 0.0; mergedCount := 0.0; prunedCount := 0.0;
    droppedCount := 0.0; invalidCandidateCount := 0.0;
    assignedCount := 0; retainedCount := 0; clearedCount := 0;
    // Accepted counts come directly from the map kernel. Recompute only on
    // rollback so diagnostics cannot describe its discarded tentative state.
    occupiedCount := 0.0; confirmedCount := 0.0; tentativeCount := 0.0;
    for slot in 1:size(previousOccupied,1) loop
      confirmed[slot] := if occupied[slot] == 1.0 and confidence[slot] >= confirmationObservations then 1.0 else 0.0;
      occupiedCount := occupiedCount+(if occupied[slot] == 1.0 then 1.0 else 0.0);
      confirmedCount := confirmedCount+confirmed[slot];
      tentativeCount := tentativeCount+(if occupied[slot] == 1.0 and confirmed[slot] == 0.0 then 1.0 else 0.0);
    end for;
  end if;
end UpdateAnchoredLandmarkMap;

model RGBDAnchoredLandmarkMap
  constant Integer imageHeight = 90; constant Integer imageWidth = 160;
  constant Integer mapCapacity = imageHeight*imageWidth;
  constant Integer featureCapacity = 350; constant Integer keyframeCapacity = 128;
  constant Integer dimension = 3;
  parameter Real coordinateLimit = 1e6; parameter Real voxelWidth = 0.25;
  parameter Real mergeRadius = 0.15; parameter Real maximumDistance = 80.0;
  parameter Real tentativeLifetime = 0.5; parameter Real confirmedLifetime = 5.0;
  parameter Real confirmationObservations = 3.0; parameter Real maximumConfidence = 8.0;
  parameter Real maximumTentative = 700.0; parameter Real consistencyTolerance = 1e-6;
  input Real previousPoint[mapCapacity,dimension] = zeros(mapCapacity,dimension);
  input Real previousOccupied[mapCapacity] = zeros(mapCapacity);
  input Real previousConfidence[mapCapacity] = zeros(mapCapacity);
  input Real previousLastSeen[mapCapacity] = zeros(mapCapacity);
  input Real previousLastFrame[mapCapacity] = zeros(mapCapacity);
  input Real candidatePoint[featureCapacity,dimension] = zeros(featureCapacity,dimension);
  input Real candidateEnabled[featureCapacity] = zeros(featureCapacity); input Real candidateCount = 0.0;
  input Real bodyPosition[dimension] = zeros(dimension); input Real poseAccepted = 1.0;
  input Real previousTime = 0.0; input Real timeNow = 0.0;
  input Real previousFrame = 0.0; input Real frameNow = 1.0;
  input Real previousWorldFrame = 0.0; input Real worldFrame = 0.0; input Real resetRequested = 0.0;
  input Real previousLocalPoint[mapCapacity,dimension] = zeros(mapCapacity,dimension);
  input Integer previousAnchorId[mapCapacity] = fill(0,mapCapacity);
  input Integer previousAnchorSlot[mapCapacity] = fill(0,mapCapacity); input Integer previousGeneration = 1;
  input Boolean nodeEnabled[keyframeCapacity] = fill(false,keyframeCapacity);
  input Integer nodeId[keyframeCapacity] = fill(0,keyframeCapacity);
  input Real nodePosition[keyframeCapacity,dimension] = zeros(keyframeCapacity,dimension);
  input Real nodeRotation[keyframeCapacity,dimension,dimension] = zeros(keyframeCapacity,dimension,dimension);
  input Integer catalogGeneration = 1; input Integer generation = 1;
  input Integer selectedAnchorId = 0; input Integer selectedAnchorSlot = 0; input Boolean requested = true;
  output Real point[mapCapacity,dimension]; output Real occupied[mapCapacity];
  output Real confidence[mapCapacity]; output Real lastSeen[mapCapacity]; output Real lastFrame[mapCapacity];
  output Real confirmed[mapCapacity]; output Real accepted; output Real rejectionReason;
  output Real nextTime; output Real nextFrame; output Real nextWorldFrame;
  output Real occupiedCount; output Real confirmedCount; output Real tentativeCount;
  output Real insertedCount; output Real mergedCount; output Real prunedCount;
  output Real droppedCount; output Real invalidCandidateCount;
  output Real localPoint[mapCapacity,dimension]; output Integer anchorId[mapCapacity];
  output Integer anchorSlot[mapCapacity]; output Integer nextGeneration;
  output Real mapRejectionReason; output Integer anchorRejectionReason;
  output Integer assignedCount; output Integer retainedCount; output Integer clearedCount;
equation
  (point,occupied,confidence,lastSeen,lastFrame,confirmed,accepted,rejectionReason,nextTime,nextFrame,nextWorldFrame,
    occupiedCount,confirmedCount,tentativeCount,insertedCount,mergedCount,prunedCount,droppedCount,invalidCandidateCount,
    localPoint,anchorId,anchorSlot,nextGeneration,mapRejectionReason,anchorRejectionReason,
    assignedCount,retainedCount,clearedCount) = UpdateAnchoredLandmarkMap(
      previousPoint,previousOccupied,previousConfidence,previousLastSeen,previousLastFrame,candidatePoint,candidateEnabled,
      candidateCount,bodyPosition,poseAccepted,previousTime,timeNow,previousFrame,frameNow,previousWorldFrame,worldFrame,resetRequested,
      coordinateLimit,voxelWidth,mergeRadius,maximumDistance,tentativeLifetime,confirmedLifetime,confirmationObservations,
      maximumConfidence,maximumTentative,previousLocalPoint,previousAnchorId,previousAnchorSlot,previousGeneration,
      nodeEnabled,nodeId,nodePosition,nodeRotation,catalogGeneration,generation,selectedAnchorId,selectedAnchorSlot,
      requested,consistencyTolerance);
end RGBDAnchoredLandmarkMap;

// A catalog proposal changes map geometry before the spatial index is built.
// Stable identities prevent an evicted anchor from merging into its successor.
package RGBDLandmarkCatalog
  function Synchronize
    input Real previousPoint[:,3]; input Real previousOccupied[size(previousPoint,1)];
    input Real previousConfidence[size(previousPoint,1)]; input Real previousLastSeen[size(previousPoint,1)];
    input Real previousLastFrame[size(previousPoint,1)];
    input Real previousLocalPoint[size(previousPoint,1),3];
    input Integer previousAnchorId[size(previousPoint,1)]; input Integer previousAnchorSlot[size(previousPoint,1)];
    input Integer previousGeneration; input Integer previousRevision;
    input Boolean previousNodeEnabled[:]; input Integer previousNodeId[size(previousNodeEnabled,1)];
    input Real previousNodePosition[size(previousNodeEnabled,1),3];
    input Real previousNodeRotation[size(previousNodeEnabled,1),3,3];
    input Boolean nodeEnabled[size(previousNodeEnabled,1)]; input Integer nodeId[size(previousNodeEnabled,1)];
    input Real nodePosition[size(previousNodeEnabled,1),3]; input Real nodeRotation[size(previousNodeEnabled,1),3,3];
    input Integer generation; input Integer revision;
    input Boolean catalogAccepted; input Boolean requested; input Boolean reset;
    input Real previousTime; input Real previousFrame;
    input Real maximumConfidence; input Real coordinateLimit; input Real consistencyTolerance;
    output Real point[size(previousPoint,1),3]; output Real occupied[size(previousPoint,1)];
    output Real confidence[size(previousPoint,1)]; output Real lastSeen[size(previousPoint,1)];
    output Real lastFrame[size(previousPoint,1)]; output Real localPoint[size(previousPoint,1),3];
    output Integer anchorId[size(previousPoint,1)]; output Integer anchorSlot[size(previousPoint,1)];
    output Boolean accepted; output Integer rejectionReason; output Integer correctionReason;
    output Integer projectedCount; output Integer evictedCount;
  protected
    Boolean configuration; Boolean changed; Boolean valid; Boolean slotValid;
    Boolean correctionAccepted; Integer owner; Integer unusedRevision;
    Real reconstructed[3];
  algorithm
    point := previousPoint; occupied := previousOccupied; confidence := previousConfidence;
    lastSeen := previousLastSeen; lastFrame := previousLastFrame;
    localPoint := previousLocalPoint; anchorId := previousAnchorId; anchorSlot := previousAnchorSlot;
    accepted := false; rejectionReason := 1; correctionReason := 0;
    projectedCount := 0; evictedCount := 0;
    if requested then
      configuration := size(previousPoint,1) >= 1 and size(previousPoint,1) <= RGBDMapAnchors.mapCapacity
        and size(previousNodeEnabled,1) >= 1 and size(previousNodeEnabled,1) <= RGBDMapAnchors.keyframeCapacity
        and previousRevision >= 0 and previousRevision <= RGBDMapAnchors.identifierLimit
        and revision >= 0 and revision <= RGBDMapAnchors.identifierLimit
        and generation >= 1 and generation <= RGBDMapAnchors.identifierLimit
        and ((reset and previousGeneration >= 0 and previousGeneration < RGBDMapAnchors.identifierLimit
          and generation == previousGeneration+1 and revision == 0)
          or (not reset and generation == previousGeneration))
        and coordinateLimit > 0 and coordinateLimit <= 1e6
        and consistencyTolerance > 0 and consistencyTolerance <= 0.01
        and maximumConfidence >= 2 and maximumConfidence <= 100 and floor(maximumConfidence) == maximumConfidence
        and (reset or (previousTime >= 0 and previousTime <= 1e9 and previousFrame >= 0
          and previousFrame <= 1e9 and floor(previousFrame) == previousFrame));
      rejectionReason := 2;
      if configuration then
        rejectionReason := 3;
        if catalogAccepted then
          rejectionReason := 4;
          valid := RGBDMapAnchors.ValidNodes(nodeEnabled,nodeId,nodePosition,nodeRotation,coordinateLimit);
          if not reset then
            valid := valid and RGBDMapAnchors.ValidNodes(previousNodeEnabled,previousNodeId,
              previousNodePosition,previousNodeRotation,coordinateLimit);
          end if;
          if valid then
            changed := reset;
            if not reset then
              for node in 1:size(nodeEnabled,1) loop
                changed := changed or nodeEnabled[node] <> previousNodeEnabled[node];
                if nodeEnabled[node] and previousNodeEnabled[node] then
                  changed := changed or nodeId[node] <> previousNodeId[node];
                  for axis in 1:3 loop
                    changed := changed or nodePosition[node,axis] <> previousNodePosition[node,axis];
                    for column in 1:3 loop
                      changed := changed or nodeRotation[node,axis,column] <> previousNodeRotation[node,axis,column];
                    end for;
                  end for;
                end if;
              end for;
              valid := revision == previousRevision+(if changed then 1 else 0);
            end if;
            rejectionReason := 5;
            if valid then
              // Validate the old geometry against the old catalog before
              // reprojection can hide corruption or pruning can erase it.
              if not reset then
                for slot in 1:size(previousPoint,1) loop
                  if previousOccupied[slot] == 1 then
                    owner := previousAnchorSlot[slot];
                    slotValid := owner >= 1 and owner <= size(previousNodeEnabled,1)
                      and previousAnchorId[slot] >= 1 and previousAnchorId[slot] <= RGBDMapAnchors.identifierLimit
                      and previousConfidence[slot] >= 1 and previousConfidence[slot] <= maximumConfidence
                      and floor(previousConfidence[slot]) == previousConfidence[slot]
                      and previousLastSeen[slot] >= 0 and previousLastSeen[slot] <= previousTime
                      and previousLastFrame[slot] >= 1 and previousLastFrame[slot] <= previousFrame
                      and floor(previousLastFrame[slot]) == previousLastFrame[slot];
                    for axis in 1:3 loop
                      slotValid := slotValid and abs(previousPoint[slot,axis]) <= coordinateLimit
                        and abs(previousLocalPoint[slot,axis]) <= coordinateLimit;
                    end for;
                    if slotValid then
                      slotValid := previousNodeEnabled[owner] and previousNodeId[owner] == previousAnchorId[slot];
                      if slotValid then
                        reconstructed := previousNodeRotation[owner,:,:]*previousLocalPoint[slot,:]+previousNodePosition[owner,:];
                        for axis in 1:3 loop
                          slotValid := slotValid and abs(reconstructed[axis]-previousPoint[slot,axis]) <= consistencyTolerance;
                        end for;
                      end if;
                    end if;
                    valid := valid and slotValid;
                  else valid := valid and previousOccupied[slot] == 0; end if;
                end for;
              end if;
              rejectionReason := 6;
              if valid then
                if reset then
                  point := zeros(size(previousPoint,1),3); occupied := zeros(size(previousPoint,1));
                  confidence := zeros(size(previousPoint,1)); lastSeen := zeros(size(previousPoint,1));
                  lastFrame := zeros(size(previousPoint,1)); localPoint := zeros(size(previousPoint,1),3);
                  anchorId := fill(0,size(previousPoint,1)); anchorSlot := fill(0,size(previousPoint,1));
                  accepted := true;
                elseif changed then
                  (point,localPoint,occupied,anchorId,anchorSlot,unusedRevision,correctionAccepted,correctionReason,
                    projectedCount,evictedCount) := RGBDMapAnchors.Reproject(
                      previousPoint,previousLocalPoint,previousOccupied,previousAnchorId,previousAnchorSlot,
                      previousGeneration,previousRevision,nodeEnabled,nodeId,nodePosition,nodeRotation,
                      generation,revision,true,true,coordinateLimit);
                  accepted := correctionAccepted;
                  if accepted then
                    for slot in 1:size(previousPoint,1) loop
                      if occupied[slot] == 0 then
                        confidence[slot] := 0; lastSeen[slot] := 0; lastFrame[slot] := 0;
                      end if;
                    end for;
                  end if;
                else accepted := true; end if;
                rejectionReason := if accepted then 0 else 7;
              end if;
            end if;
          end if;
        end if;
      end if;
    end if;
    if not accepted then
      point := previousPoint; occupied := previousOccupied; confidence := previousConfidence;
      lastSeen := previousLastSeen; lastFrame := previousLastFrame;
      localPoint := previousLocalPoint; anchorId := previousAnchorId; anchorSlot := previousAnchorSlot;
      projectedCount := 0; evictedCount := 0;
    end if;
  end Synchronize;
end RGBDLandmarkCatalog;

function UpdateCatalogLandmarkMap
  extends RGBDLandmarkMapInterface;
  input Real previousLocalPoint[size(previousOccupied,1),3];
  input Integer previousAnchorId[size(previousOccupied,1)]; input Integer previousAnchorSlot[size(previousOccupied,1)];
  input Integer previousGeneration; input Integer previousCatalogRevision;
  input Boolean previousNodeEnabled[:]; input Integer previousNodeId[size(previousNodeEnabled,1)];
  input Real previousNodePosition[size(previousNodeEnabled,1),3];
  input Real previousNodeRotation[size(previousNodeEnabled,1),3,3];
  input Boolean nodeEnabled[size(previousNodeEnabled,1)]; input Integer nodeId[size(previousNodeEnabled,1)];
  input Real nodePosition[size(previousNodeEnabled,1),3]; input Real nodeRotation[size(previousNodeEnabled,1),3,3];
  input Integer catalogGeneration; input Integer catalogRevision;
  input Integer selectedAnchorId; input Integer selectedAnchorSlot;
  input Boolean catalogAccepted; input Boolean requested; input Real consistencyTolerance;
  input Integer previousPoseRevision = previousCatalogRevision;
  input Integer poseRevision = catalogRevision;
  output Real localPoint[size(previousOccupied,1),3];
  output Integer anchorId[size(previousOccupied,1)]; output Integer anchorSlot[size(previousOccupied,1)];
  output Integer nextGeneration; output Integer nextCatalogRevision;
  output Integer catalogRejectionReason; output Integer correctionReason;
  output Real updateRejectionReason; output Real mapRejectionReason; output Integer anchorRejectionReason;
  output Integer projectedCount; output Integer evictedCount;
  output Integer assignedCount; output Integer retainedCount; output Integer clearedCount;
protected
  Real preparedPoint[size(previousOccupied,1),3]; Real preparedOccupied[size(previousOccupied,1)];
  Real preparedConfidence[size(previousOccupied,1)]; Real preparedLastSeen[size(previousOccupied,1)];
  Real preparedLastFrame[size(previousOccupied,1)]; Real preparedLocal[size(previousOccupied,1),3];
  Integer preparedId[size(previousOccupied,1)]; Integer preparedSlot[size(previousOccupied,1)]; Boolean prepared;
algorithm
  point := previousPoint; occupied := previousOccupied; confidence := previousConfidence;
  lastSeen := previousLastSeen; lastFrame := previousLastFrame;
  localPoint := previousLocalPoint; anchorId := previousAnchorId; anchorSlot := previousAnchorSlot;
  nextTime := previousTime; nextFrame := previousFrame; nextWorldFrame := previousWorldFrame;
  nextGeneration := previousGeneration; nextCatalogRevision := previousCatalogRevision;
  accepted := 0; rejectionReason := 1; updateRejectionReason := 0; mapRejectionReason := 0; anchorRejectionReason := 0;
  projectedCount := 0; evictedCount := 0; assignedCount := 0; retainedCount := 0; clearedCount := 0;
  insertedCount := 0; mergedCount := 0; prunedCount := 0; droppedCount := 0; invalidCandidateCount := 0;
  (preparedPoint,preparedOccupied,preparedConfidence,preparedLastSeen,preparedLastFrame,
    preparedLocal,preparedId,preparedSlot,prepared,catalogRejectionReason,correctionReason,projectedCount,evictedCount) :=
    RGBDLandmarkCatalog.Synchronize(previousPoint,previousOccupied,previousConfidence,previousLastSeen,previousLastFrame,
      previousLocalPoint,previousAnchorId,previousAnchorSlot,previousGeneration,previousPoseRevision,
      previousNodeEnabled,previousNodeId,previousNodePosition,previousNodeRotation,
      nodeEnabled,nodeId,nodePosition,nodeRotation,catalogGeneration,poseRevision,catalogAccepted,requested,
      resetRequested == 1.0,previousTime,previousFrame,maximumConfidence,coordinateLimit,consistencyTolerance);
  if requested then
    rejectionReason := 2;
    if prepared then
      (point,occupied,confidence,lastSeen,lastFrame,confirmed,accepted,updateRejectionReason,nextTime,nextFrame,nextWorldFrame,
        occupiedCount,confirmedCount,tentativeCount,insertedCount,mergedCount,prunedCount,droppedCount,invalidCandidateCount,
        localPoint,anchorId,anchorSlot,nextGeneration,mapRejectionReason,anchorRejectionReason,assignedCount,retainedCount,clearedCount) :=
        UpdateAnchoredLandmarkMap(preparedPoint,preparedOccupied,preparedConfidence,preparedLastSeen,preparedLastFrame,
          candidatePoint,candidateEnabled,candidateCount,bodyPosition,poseAccepted,previousTime,timeNow,previousFrame,frameNow,
          previousWorldFrame,worldFrame,resetRequested,coordinateLimit,voxelWidth,mergeRadius,maximumDistance,
          tentativeLifetime,confirmedLifetime,confirmationObservations,maximumConfidence,maximumTentative,
          preparedLocal,preparedId,preparedSlot,previousGeneration,nodeEnabled,nodeId,nodePosition,nodeRotation,
          catalogGeneration,catalogGeneration,selectedAnchorId,selectedAnchorSlot,true,consistencyTolerance);
      rejectionReason := if accepted == 1.0 then 0 else 3;
      if accepted == 1.0 then
        nextCatalogRevision := catalogRevision;
        prunedCount := prunedCount+evictedCount;
      end if;
    end if;
  end if;
  if accepted <> 1.0 then
    // A later map/anchor failure must undo catalog eviction and reprojection,
    // not merely hold the already prepared geometry.
    point := previousPoint; occupied := previousOccupied; confidence := previousConfidence;
    lastSeen := previousLastSeen; lastFrame := previousLastFrame;
    localPoint := previousLocalPoint; anchorId := previousAnchorId; anchorSlot := previousAnchorSlot;
    nextTime := previousTime; nextFrame := previousFrame; nextWorldFrame := previousWorldFrame;
    nextGeneration := previousGeneration; nextCatalogRevision := previousCatalogRevision;
    projectedCount := 0; evictedCount := 0; assignedCount := 0; retainedCount := 0; clearedCount := 0;
    insertedCount := 0; mergedCount := 0; prunedCount := 0; droppedCount := 0; invalidCandidateCount := 0;
    occupiedCount := 0; confirmedCount := 0; tentativeCount := 0;
    for slot in 1:size(previousOccupied,1) loop
      confirmed[slot] := if occupied[slot] == 1.0 and confidence[slot] >= confirmationObservations then 1.0 else 0.0;
      occupiedCount := occupiedCount+(if occupied[slot] == 1.0 then 1.0 else 0.0);
      confirmedCount := confirmedCount+confirmed[slot];
      tentativeCount := tentativeCount+(if occupied[slot] == 1.0 and confirmed[slot] == 0.0 then 1.0 else 0.0);
    end for;
  end if;
end UpdateCatalogLandmarkMap;

// Mapping consumes an admitted visual/catalog/graph proposal. Publication is
// still local until estimator/reference and any graph correction also accept.
package RGBDCatalogMapping
  constant Integer mapCapacity = RGBDMapAnchors.mapCapacity;
  constant Integer featureCapacity = RGBDKeyframes.featureCapacity;
  constant Integer dimension = RGBDKeyframes.dimension;

  record State
    Real point[mapCapacity,dimension]; Real occupied[mapCapacity];
    Real confidence[mapCapacity]; Real lastSeen[mapCapacity]; Real lastFrame[mapCapacity];
    Real localPoint[mapCapacity,dimension];
    Integer anchorId[mapCapacity]; Integer anchorSlot[mapCapacity];
    Integer generation; Integer catalogRevision;
    Real imageTime; Integer imageEpoch;
    Real frame "Consecutive accepted map-observation counter, not camera epoch";
    Real worldFrame;
  end State;

  function Empty
    input Integer generation = 1;
    input Real worldFrame = 0.0;
    output State result;
  algorithm
    result.point := zeros(mapCapacity,dimension); result.occupied := zeros(mapCapacity);
    result.confidence := zeros(mapCapacity); result.lastSeen := zeros(mapCapacity); result.lastFrame := zeros(mapCapacity);
    result.localPoint := zeros(mapCapacity,dimension);
    result.anchorId := fill(0,mapCapacity); result.anchorSlot := fill(0,mapCapacity);
    result.generation := generation; result.catalogRevision := 0;
    result.imageTime := 0.0; result.imageEpoch := -1; result.frame := 0.0; result.worldFrame := worldFrame;
  end Empty;

  record Diagnostics
    Real mapAccepted; Real catalogUpdateRejectionReason;
    Integer catalogRejectionReason; Integer correctionReason;
    Real updateRejectionReason; Real mapRejectionReason; Integer anchorRejectionReason;
    Real occupiedCount; Real confirmedCount; Real tentativeCount;
    Real insertedCount; Real mergedCount; Real prunedCount; Real droppedCount; Real invalidCandidateCount;
    Integer projectedCount; Integer evictedCount; Integer assignedCount; Integer retainedCount; Integer clearedCount;
  end Diagnostics;

  function EmptyDiagnostics
    output Diagnostics result;
  algorithm
    result.mapAccepted := 0.0; result.catalogUpdateRejectionReason := 0.0;
    result.catalogRejectionReason := 0; result.correctionReason := 0;
    result.updateRejectionReason := 0.0; result.mapRejectionReason := 0.0; result.anchorRejectionReason := 0;
    result.occupiedCount := 0.0; result.confirmedCount := 0.0; result.tentativeCount := 0.0;
    result.insertedCount := 0.0; result.mergedCount := 0.0; result.prunedCount := 0.0;
    result.droppedCount := 0.0; result.invalidCandidateCount := 0.0;
    result.projectedCount := 0; result.evictedCount := 0; result.assignedCount := 0;
    result.retainedCount := 0; result.clearedCount := 0;
  end EmptyDiagnostics;

  record Result
    RGBDKeyframes.Catalog catalog;
    RGBDGraphMeasurements.State graph;
    State map;
    Boolean accepted;
    Integer rejectionReason "1 idle; 2 visual; 3 binding; 4 projection; 5 map";
    Diagnostics diagnostics "Map-stage diagnostics are proposals, not committed counts";
    RGBDGraphMeasurements.Problem problem;
  end Result;

  function Capture
    input RGBDKeyframes.Catalog previousCatalog;
    input RGBDGraphMeasurements.State previousGraph;
    input State previous;
    input RGBDCatalogGraphCapture.Result visual "From the same old catalog/graph owners";
    input Real candidatePoint[featureCapacity,dimension];
    input Real candidateEnabled[featureCapacity];
    input Real poseAccepted;
    input Boolean requested;
    input Real coordinateLimit = 1e6; input Real voxelWidth = 0.25;
    input Real mergeRadius = 0.15; input Real maximumDistance = 80.0;
    input Real tentativeLifetime = 0.5; input Real confirmedLifetime = 5.0;
    input Real confirmationObservations = 3.0; input Real maximumConfidence = 8.0;
    input Real maximumTentative = 700.0; input Real consistencyTolerance = 1e-6;
    input Real previousNodePosition[RGBDKeyframes.keyframeCapacity,3] = previousCatalog.bodyPositions;
    input Real previousNodeRotation[RGBDKeyframes.keyframeCapacity,3,3] = previousCatalog.bodyRotations;
    input Integer previousPoseRevision = previous.catalogRevision;
    output Result result;
  protected
    State proposed;
    RGBDKeyframes.Frame measurement;
    Diagnostics diagnostics;
    Real confirmed[mapCapacity];
    Integer slot; Boolean valid; Boolean candidateValid; Real expectedWorld[dimension];
    Real nodePosition[RGBDKeyframes.keyframeCapacity,3]; Real nodeRotation[RGBDKeyframes.keyframeCapacity,3,3];
  algorithm
    result.catalog := previousCatalog; result.graph := previousGraph; result.map := previous;
    result.accepted := false; result.rejectionReason := 1;
    result.diagnostics := EmptyDiagnostics(); result.problem := RGBDGraphMeasurements.EmptyProblem();
    if requested then
      result.rejectionReason := 2;
      if visual.accepted then
        result.rejectionReason := 3;
        valid := RGBDKeyframes.ValidHeader(previousCatalog) and RGBDKeyframes.ValidHeader(visual.catalog)
          and previous.generation == previousCatalog.generation
          and visual.catalog.generation == previousCatalog.generation
          and previousCatalog.nextId < RGBDKeyframes.identifierLimit
          and visual.catalog.nextId >= 2
          and previous.catalogRevision >= 0 and previous.catalogRevision < RGBDKeyframes.identifierLimit
          and previous.frame >= 0 and previous.frame < RGBDKeyframes.identifierLimit
          and floor(previous.frame) == previous.frame
          and previous.imageEpoch >= -1 and previous.imageEpoch <= RGBDKeyframes.identifierLimit
          and ((previous.frame == 0 and previous.imageEpoch == -1)
            or (previous.frame > 0 and previous.imageEpoch >= 0))
          and visual.graph.generation == previousGraph.generation
          and previousGraph.revision >= 0 and previousGraph.revision < RGBDKeyframes.identifierLimit
          and coordinateLimit > 0 and coordinateLimit <= 1e6
          and consistencyTolerance > 0 and consistencyTolerance <= 0.01
          and visual.storedSlot >= 1 and visual.storedSlot <= RGBDKeyframes.keyframeCapacity
          and visual.problem.accepted;
        if valid then
          valid := visual.catalog.nextId == previousCatalog.nextId+1
            and visual.graph.revision == previousGraph.revision+1
            and visual.graph.lastCaptureId == visual.catalog.nextId-1
            and visual.storedSlot == previousCatalog.nextSlot;
          if valid then
            slot := visual.storedSlot;
            measurement := RGBDKeyframes.ReadSlot(visual.catalog,slot);
            valid := measurement.id == previousCatalog.nextId
              and measurement.epoch == visual.catalog.lastEpoch
              and measurement.epoch > previous.imageEpoch
              and measurement.imageTime == visual.catalog.lastTime
              and RGBDKeyframes.ValidFrame(measurement)
              and poseAccepted == 1.0;
            result.rejectionReason := 4;
            if valid then
              for feature in 1:featureCapacity loop
                candidateValid := candidateEnabled[feature] == 0.0 or candidateEnabled[feature] == 1.0;
                if candidateEnabled[feature] == 1.0 then
                  candidateValid := measurement.enabled[feature] and feature <= measurement.count;
                  if candidateValid then
                    expectedWorld := measurement.bodyRotation*(measurement.opticalToBody*measurement.opticalPoint[feature,:]
                      +measurement.cameraOriginBody)+measurement.bodyPosition;
                    for axis in 1:dimension loop
                      candidateValid := candidateValid and abs(expectedWorld[axis]) <= coordinateLimit
                        and abs(candidatePoint[feature,axis]-expectedWorld[axis]) <= consistencyTolerance;
                    end for;
                  end if;
                end if;
                valid := valid and candidateValid;
              end for;
            end if;
            if valid then
              proposed := previous; diagnostics := EmptyDiagnostics();
              nodePosition := previousNodePosition; nodeRotation := previousNodeRotation;
              nodePosition[slot,:] := measurement.bodyPosition; nodeRotation[slot,:,:] := measurement.bodyRotation;
              (proposed.point,proposed.occupied,proposed.confidence,proposed.lastSeen,proposed.lastFrame,confirmed,
                diagnostics.mapAccepted,diagnostics.catalogUpdateRejectionReason,proposed.imageTime,proposed.frame,proposed.worldFrame,
                diagnostics.occupiedCount,diagnostics.confirmedCount,diagnostics.tentativeCount,
                diagnostics.insertedCount,diagnostics.mergedCount,diagnostics.prunedCount,diagnostics.droppedCount,diagnostics.invalidCandidateCount,
                proposed.localPoint,proposed.anchorId,proposed.anchorSlot,proposed.generation,proposed.catalogRevision,
                diagnostics.catalogRejectionReason,diagnostics.correctionReason,diagnostics.updateRejectionReason,
                diagnostics.mapRejectionReason,diagnostics.anchorRejectionReason,diagnostics.projectedCount,
                diagnostics.evictedCount,diagnostics.assignedCount,diagnostics.retainedCount,diagnostics.clearedCount) := UpdateCatalogLandmarkMap(
                  previous.point,previous.occupied,previous.confidence,previous.lastSeen,previous.lastFrame,
                  candidatePoint,candidateEnabled,measurement.count,measurement.bodyPosition,poseAccepted,
                  previous.imageTime,measurement.imageTime,previous.frame,previous.frame+1,previous.worldFrame,previous.worldFrame,0.0,
                  coordinateLimit,voxelWidth,mergeRadius,maximumDistance,tentativeLifetime,confirmedLifetime,
                  confirmationObservations,maximumConfidence,maximumTentative,
                  previous.localPoint,previous.anchorId,previous.anchorSlot,previous.generation,previous.catalogRevision,
                  previousCatalog.occupied,previousCatalog.ids,previousNodePosition,previousNodeRotation,
                  visual.catalog.occupied,visual.catalog.ids,nodePosition,nodeRotation,
                  visual.catalog.generation,previous.catalogRevision+1,measurement.id,slot,true,true,consistencyTolerance,
                  previousPoseRevision,previousPoseRevision+1);
              result.diagnostics := diagnostics; result.rejectionReason := 5;
              if diagnostics.mapAccepted == 1.0 then
                proposed.imageEpoch := measurement.epoch;
                result.catalog := visual.catalog; result.graph := visual.graph; result.map := proposed;
                result.problem := visual.problem; result.accepted := true; result.rejectionReason := 0;
              end if;
            end if;
          end if;
        end if;
      end if;
    end if;
  end Capture;
end RGBDCatalogMapping;

// Capture of a descriptor/calibration/pose/histogram record joins the map
// transaction. The enclosing estimator/reference/graph must join this commit.
function UpdateKeyframeLandmarks
  extends RGBDLandmarkMapInterface;
  input RGBDKeyframes.Catalog previousCatalog;
  input RGBDKeyframes.Frame measurement;
  input Integer imageEpoch; input Integer generation;
  input Boolean captureRequested; input Boolean requested;
  input Real previousLocalPoint[size(previousOccupied,1),3];
  input Integer previousAnchorId[size(previousOccupied,1)]; input Integer previousAnchorSlot[size(previousOccupied,1)];
  input Integer previousGeneration; input Integer previousCatalogRevision;
  input Real consistencyTolerance;
  input Real previousNodePosition[RGBDKeyframes.keyframeCapacity,3] = previousCatalog.bodyPositions;
  input Real previousNodeRotation[RGBDKeyframes.keyframeCapacity,3,3] = previousCatalog.bodyRotations;
  input Integer previousPoseRevision = previousCatalogRevision;
  output RGBDKeyframes.Catalog nextCatalog;
  output Real localPoint[size(previousOccupied,1),3];
  output Integer anchorId[size(previousOccupied,1)]; output Integer anchorSlot[size(previousOccupied,1)];
  output Integer nextGeneration; output Integer nextCatalogRevision;
  output Boolean captureAccepted; output Integer storedSlot; output Integer evictedId;
  output Integer measurementRejectionReason; output Integer catalogRejectionReason; output Integer correctionReason;
  output Real catalogUpdateRejectionReason; output Real updateRejectionReason;
  output Real mapRejectionReason; output Integer anchorRejectionReason;
  output Integer projectedCount; output Integer evictedCount;
  output Integer assignedCount; output Integer retainedCount; output Integer clearedCount;
protected
  RGBDKeyframes.Catalog baseCatalog; RGBDKeyframes.Catalog proposedCatalog;
  Boolean configuration; Boolean valid; Boolean featureValid; Boolean resetAccepted;
  Boolean stored; Integer proposedSlot; Integer proposedEvicted; Integer revision;
  Integer selectedId; Integer selectedSlot; Real expectedWorld[3];
  Real proposedNodePosition[RGBDKeyframes.keyframeCapacity,3];
  Real proposedNodeRotation[RGBDKeyframes.keyframeCapacity,3,3]; Integer poseRevision;
algorithm
  point := previousPoint; occupied := previousOccupied; confidence := previousConfidence;
  lastSeen := previousLastSeen; lastFrame := previousLastFrame;
  localPoint := previousLocalPoint; anchorId := previousAnchorId; anchorSlot := previousAnchorSlot;
  nextCatalog := previousCatalog; nextGeneration := previousGeneration; nextCatalogRevision := previousCatalogRevision;
  nextTime := previousTime; nextFrame := previousFrame; nextWorldFrame := previousWorldFrame;
  accepted := 0; rejectionReason := 1; measurementRejectionReason := 0; catalogRejectionReason := 0; correctionReason := 0;
  catalogUpdateRejectionReason := 0; updateRejectionReason := 0; mapRejectionReason := 0; anchorRejectionReason := 0;
  captureAccepted := false; storedSlot := 0; evictedId := 0;
  projectedCount := 0; evictedCount := 0; assignedCount := 0; retainedCount := 0; clearedCount := 0;
  insertedCount := 0; mergedCount := 0; prunedCount := 0; droppedCount := 0; invalidCandidateCount := 0;
  if requested then
    configuration := previousGeneration == previousCatalog.generation
      and generation >= 1 and generation <= RGBDKeyframes.identifierLimit
      and previousGeneration >= 1 and previousGeneration <= RGBDKeyframes.identifierLimit
      and previousCatalogRevision >= 0 and previousCatalogRevision <= RGBDKeyframes.identifierLimit
      and ((resetRequested == 1.0 and previousGeneration < RGBDKeyframes.identifierLimit and generation == previousGeneration+1)
        or (resetRequested == 0.0 and generation == previousGeneration))
      and size(candidatePoint,1) == RGBDKeyframes.featureCapacity and size(candidatePoint,2) == RGBDKeyframes.dimension
      and size(candidateEnabled,1) == RGBDKeyframes.featureCapacity
      and imageEpoch >= 0 and imageEpoch <= RGBDKeyframes.identifierLimit
      and consistencyTolerance > 0 and consistencyTolerance <= 0.01
      and coordinateLimit > 0 and coordinateLimit <= 1e6;
    rejectionReason := 2; measurementRejectionReason := 1;
    if configuration then
      baseCatalog := previousCatalog; resetAccepted := true;
      if resetRequested == 1.0 then
        (baseCatalog,resetAccepted) := RGBDKeyframes.Reset(previousCatalog,generation,measurement.vocabularyVersion);
      end if;
      valid := resetAccepted and RGBDKeyframes.ValidHeader(baseCatalog)
        and measurement.generation == generation and measurement.vocabularyVersion == baseCatalog.vocabularyVersion
        and measurement.epoch == imageEpoch and measurement.imageTime == timeNow
        and measurement.count >= 0 and measurement.count <= RGBDKeyframes.featureCapacity
        and candidateCount == measurement.count
        and RGBDMapAnchors.ProperRotation(measurement.bodyRotation)
        and RGBDMapAnchors.ProperRotation(measurement.opticalToBody);
      for axis in 1:RGBDKeyframes.dimension loop
        valid := valid and bodyPosition[axis] == measurement.bodyPosition[axis]
          and abs(measurement.bodyPosition[axis]) <= coordinateLimit
          and abs(measurement.cameraOriginBody[axis]) <= coordinateLimit;
      end for;
      // Check only enabled geometry; descriptors and calibration are admitted
      // by Store when capture is requested. Noncapture frames may have fewer
      // than eight features, including a zero-feature observation.
      if valid then
        for feature in 1:RGBDKeyframes.featureCapacity loop
          featureValid := candidateEnabled[feature] == 0.0 or candidateEnabled[feature] == 1.0;
          if candidateEnabled[feature] == 1.0 then
            featureValid := measurement.enabled[feature] and feature <= measurement.count
              and measurement.opticalPoint[feature,3] > 0;
            for axis in 1:RGBDKeyframes.dimension loop
              featureValid := featureValid and abs(measurement.opticalPoint[feature,axis]) <= coordinateLimit;
            end for;
            if featureValid then
              expectedWorld := measurement.bodyRotation*(measurement.opticalToBody*measurement.opticalPoint[feature,:]
                +measurement.cameraOriginBody)+measurement.bodyPosition;
              for axis in 1:RGBDKeyframes.dimension loop
                featureValid := featureValid and abs(expectedWorld[axis]) <= coordinateLimit
                  and abs(candidatePoint[feature,axis]-expectedWorld[axis]) <= consistencyTolerance;
              end for;
            end if;
          end if;
          valid := valid and featureValid;
        end for;
      end if;
      measurementRejectionReason := 2;
      if valid then
        proposedCatalog := baseCatalog; stored := false; proposedSlot := 0; proposedEvicted := 0;
        if captureRequested then
          (proposedCatalog,stored,proposedSlot,proposedEvicted) := RGBDKeyframes.Store(baseCatalog,measurement,true);
          valid := stored;
        end if;
        measurementRejectionReason := 3;
        if valid then
          revision := if resetRequested == 1.0 then 0 else previousCatalogRevision+(if stored then 1 else 0);
          proposedNodePosition := previousNodePosition; proposedNodeRotation := previousNodeRotation;
          if stored then
            proposedNodePosition[proposedSlot,:] := measurement.bodyPosition;
            proposedNodeRotation[proposedSlot,:,:] := measurement.bodyRotation;
          end if;
          poseRevision := if resetRequested == 1.0 then 0 else previousPoseRevision+(if stored then 1 else 0);
          selectedId := 0; selectedSlot := 0;
          if proposedCatalog.nextId > 1 then
            selectedSlot := mod(proposedCatalog.nextId-2,RGBDKeyframes.keyframeCapacity)+1;
            selectedId := proposedCatalog.ids[selectedSlot];
          end if;
          (point,occupied,confidence,lastSeen,lastFrame,confirmed,accepted,catalogUpdateRejectionReason,nextTime,nextFrame,nextWorldFrame,
            occupiedCount,confirmedCount,tentativeCount,insertedCount,mergedCount,prunedCount,droppedCount,invalidCandidateCount,
            localPoint,anchorId,anchorSlot,nextGeneration,nextCatalogRevision,catalogRejectionReason,correctionReason,
            updateRejectionReason,mapRejectionReason,anchorRejectionReason,projectedCount,evictedCount,
            assignedCount,retainedCount,clearedCount) := UpdateCatalogLandmarkMap(
              previousPoint,previousOccupied,previousConfidence,previousLastSeen,previousLastFrame,candidatePoint,candidateEnabled,
              candidateCount,bodyPosition,poseAccepted,previousTime,timeNow,previousFrame,frameNow,previousWorldFrame,worldFrame,resetRequested,
              coordinateLimit,voxelWidth,mergeRadius,maximumDistance,tentativeLifetime,confirmedLifetime,confirmationObservations,
              maximumConfidence,maximumTentative,previousLocalPoint,previousAnchorId,previousAnchorSlot,previousGeneration,
              previousCatalogRevision,previousCatalog.occupied,previousCatalog.ids,previousNodePosition,previousNodeRotation,
              proposedCatalog.occupied,proposedCatalog.ids,proposedNodePosition,proposedNodeRotation,
              generation,revision,selectedId,selectedSlot,true,true,consistencyTolerance,previousPoseRevision,poseRevision);
          rejectionReason := if accepted == 1.0 then 0 else 3;
          measurementRejectionReason := 0;
          if accepted == 1.0 then
            nextCatalog := proposedCatalog; captureAccepted := stored;
            storedSlot := proposedSlot; evictedId := proposedEvicted;
          end if;
        end if;
      end if;
    end if;
  end if;
  if accepted <> 1.0 then
    nextCatalog := previousCatalog; captureAccepted := false; storedSlot := 0; evictedId := 0;
    point := previousPoint; occupied := previousOccupied; confidence := previousConfidence;
    lastSeen := previousLastSeen; lastFrame := previousLastFrame;
    localPoint := previousLocalPoint; anchorId := previousAnchorId; anchorSlot := previousAnchorSlot;
    nextGeneration := previousGeneration; nextCatalogRevision := previousCatalogRevision;
    nextTime := previousTime; nextFrame := previousFrame; nextWorldFrame := previousWorldFrame;
    projectedCount := 0; evictedCount := 0; assignedCount := 0; retainedCount := 0; clearedCount := 0;
    insertedCount := 0; mergedCount := 0; prunedCount := 0; droppedCount := 0; invalidCandidateCount := 0;
    occupiedCount := 0; confirmedCount := 0; tentativeCount := 0;
    for slot in 1:size(previousOccupied,1) loop
      confirmed[slot] := if occupied[slot] == 1.0 and confidence[slot] >= confirmationObservations then 1.0 else 0.0;
      occupiedCount := occupiedCount+(if occupied[slot] == 1.0 then 1.0 else 0.0);
      confirmedCount := confirmedCount+confirmed[slot];
      tentativeCount := tentativeCount+(if occupied[slot] == 1.0 and confirmed[slot] == 0.0 then 1.0 else 0.0);
    end for;
  end if;
end UpdateKeyframeLandmarks;

// Selection only: every camera observation still passes the processing barrier.
// The estimated pose determines motion; sensor identity never comes from time.
package RGBDKeyframePolicy
  constant Real pi = 3.141592653589793;
  record Decision
    Boolean valid;
    Boolean captureRequested;
    Integer reason "0 capture; 1 idle; 2 configuration; 3 binding/geometry; 4 pose; 5 features; 6 cadence; 7 motion; 8 consumed image";
    Integer enabledCount;
    Real elapsed;
    Real translationSquared;
    Real rotationCosine;
  end Decision;

  function Select
    input RGBDKeyframes.Catalog catalog;
    input RGBDKeyframes.Frame measurement;
    input Boolean imageFresh "Fresh catalog acquisition receipt; separate from Schmidt independent-noise eligibility";
    input Real poseAccepted;
    input Boolean requested;
    input Real minimumInterval = 0.5;
    input Real maximumInterval = 2.0;
    input Real translationThreshold = 0.6;
    input Real rotationThreshold = 0.25 "Radians";
    input Integer minimumFeatures = 12;
    input Real coordinateLimit = 1e6;
    output Decision result;
  protected
    Boolean valid;
    Integer latestSlot;
    Real difference[RGBDKeyframes.dimension];
    Real relativeRotation[RGBDKeyframes.dimension,RGBDKeyframes.dimension];
  algorithm
    result.valid := false; result.captureRequested := false; result.reason := 1;
    result.enabledCount := 0; result.elapsed := 0.0;
    result.translationSquared := 0.0; result.rotationCosine := 1.0;
    if requested then
      result.reason := 2;
      valid := minimumInterval > 0 and minimumInterval <= 1e4
        and maximumInterval >= minimumInterval and maximumInterval <= 1e4
        and translationThreshold >= 0 and translationThreshold <= 1e4
        and rotationThreshold >= 0 and rotationThreshold <= pi
        and minimumFeatures >= 8 and minimumFeatures <= RGBDKeyframes.featureCapacity
        and coordinateLimit > 0 and coordinateLimit <= 1e6;
      if valid then
        result.reason := 3;
        valid := RGBDKeyframes.ValidHeader(catalog)
          and catalog.nextId < RGBDKeyframes.identifierLimit
          and measurement.generation == catalog.generation
          and measurement.vocabularyVersion == catalog.vocabularyVersion
          and measurement.id == catalog.nextId
          and measurement.epoch > catalog.lastEpoch and measurement.epoch <= RGBDKeyframes.identifierLimit
          and measurement.imageTime >= 0 and measurement.imageTime <= 1e9
          and (catalog.nextId == 1 or measurement.imageTime > catalog.lastTime)
          and measurement.count >= 0 and measurement.count <= RGBDKeyframes.featureCapacity
          and RGBDMapAnchors.ProperRotation(measurement.bodyRotation);
        for axis in 1:RGBDKeyframes.dimension loop
          valid := valid and abs(measurement.bodyPosition[axis]) <= coordinateLimit;
        end for;
        if valid then
          for feature in 1:RGBDKeyframes.featureCapacity loop
            if measurement.enabled[feature] then
              result.enabledCount := result.enabledCount+1;
              valid := valid and feature <= measurement.count and measurement.opticalPoint[feature,3] > 0;
              for axis in 1:RGBDKeyframes.dimension loop
                valid := valid and abs(measurement.opticalPoint[feature,axis]) <= coordinateLimit;
              end for;
            end if;
          end for;
          if catalog.nextId > 1 then
            latestSlot := mod(catalog.nextId-2,RGBDKeyframes.keyframeCapacity)+1;
            valid := valid and RGBDMapAnchors.ProperRotation(catalog.bodyRotations[latestSlot,:,:]);
            for axis in 1:RGBDKeyframes.dimension loop
              valid := valid and abs(catalog.bodyPositions[latestSlot,axis]) <= coordinateLimit;
            end for;
            if valid then
              difference := measurement.bodyPosition-catalog.bodyPositions[latestSlot,:];
              result.translationSquared := difference*difference;
              relativeRotation := transpose(catalog.bodyRotations[latestSlot,:,:])*measurement.bodyRotation;
              result.rotationCosine := max(-1.0,min(1.0,
                (sum(relativeRotation[axis,axis] for axis in 1:RGBDKeyframes.dimension)-1.0)/2.0));
              result.elapsed := measurement.imageTime-catalog.lastTime;
            end if;
          end if;
          result.valid := valid;
          if valid then
            if not imageFresh then
              result.reason := 8;
            elseif poseAccepted <> 1.0 then
              result.reason := 4;
            elseif result.enabledCount < minimumFeatures then
              result.reason := 5;
            elseif catalog.nextId == 1 then
              result.captureRequested := true; result.reason := 0;
            elseif result.elapsed < minimumInterval then
              result.reason := 6;
            elseif result.elapsed >= maximumInterval
                or result.translationSquared >= translationThreshold*translationThreshold
                or result.rotationCosine <= cos(rotationThreshold) then
              result.captureRequested := true; result.reason := 0;
            else
              result.reason := 7;
            end if;
          end if;
        end if;
      end if;
    end if;
  end Select;
end RGBDKeyframePolicy;

// Mapping between captures: the retained catalog and raw measured graph hold.
// Reuses the capture/map owner's noncapture validation and insertion receipts.
package RGBDCatalogObservation
  function Update
    input RGBDKeyframes.Catalog previousCatalog;
    input RGBDGraphMeasurements.State previousGraph;
    input RGBDCatalogMapping.State previous;
    input RGBDKeyframes.Frame measurement;
    input Real candidatePoint[RGBDKeyframes.featureCapacity,RGBDKeyframes.dimension];
    input Real candidateEnabled[RGBDKeyframes.featureCapacity];
    input Real poseAccepted;
    input Boolean requested;
    input Real coordinateLimit = 1e6; input Real voxelWidth = 0.25;
    input Real mergeRadius = 0.15; input Real maximumDistance = 80.0;
    input Real tentativeLifetime = 0.5; input Real confirmedLifetime = 5.0;
    input Real confirmationObservations = 3.0; input Real maximumConfidence = 8.0;
    input Real maximumTentative = 700.0; input Real consistencyTolerance = 1e-6;
    input Real nodePosition[RGBDKeyframes.keyframeCapacity,3] = previousCatalog.bodyPositions;
    input Real nodeRotation[RGBDKeyframes.keyframeCapacity,3,3] = previousCatalog.bodyRotations;
    input Integer poseRevision = previous.catalogRevision;
    output RGBDCatalogMapping.Result result;
  protected
    RGBDCatalogMapping.State proposed;
    RGBDCatalogMapping.Diagnostics diagnostics;
    RGBDKeyframes.Catalog unchangedCatalog;
    Real confirmed[RGBDCatalogMapping.mapCapacity]; Real updateAccepted; Real updateReason;
    Boolean valid; Boolean captured; Integer storedSlot; Integer evictedId; Integer measurementReason;
  algorithm
    result.catalog := previousCatalog; result.graph := previousGraph; result.map := previous;
    result.accepted := false; result.rejectionReason := 1;
    result.diagnostics := RGBDCatalogMapping.EmptyDiagnostics();
    result.problem := RGBDGraphMeasurements.EmptyProblem();
    if requested then
      result.rejectionReason := 3;
      valid := RGBDKeyframes.ValidHeader(previousCatalog)
        and previous.generation == previousCatalog.generation
        and previousGraph.generation == previousCatalog.generation
        and previousGraph.revision >= 0 and previousGraph.revision <= RGBDKeyframes.identifierLimit
        and previous.catalogRevision >= 0 and previous.catalogRevision <= RGBDKeyframes.identifierLimit
        and previous.frame >= 0 and previous.frame < RGBDKeyframes.identifierLimit
        and floor(previous.frame) == previous.frame
        and previous.imageEpoch >= -1 and previous.imageEpoch <= RGBDKeyframes.identifierLimit
        and ((previous.frame == 0 and previous.imageEpoch == -1)
          or (previous.frame > 0 and previous.imageEpoch >= 0))
        and measurement.id == previousCatalog.nextId
        and measurement.epoch > previous.imageEpoch
        and measurement.epoch > previousCatalog.lastEpoch
        and measurement.imageTime >= previousCatalog.lastTime
        and poseAccepted == 1.0;
      if valid then
        valid := previousGraph.lastCaptureId == previousCatalog.nextId-1;
      end if;
      if valid then
        proposed := previous; diagnostics := RGBDCatalogMapping.EmptyDiagnostics();
        (proposed.point,proposed.occupied,proposed.confidence,proposed.lastSeen,proposed.lastFrame,confirmed,
          updateAccepted,updateReason,proposed.imageTime,proposed.frame,proposed.worldFrame,
          diagnostics.occupiedCount,diagnostics.confirmedCount,diagnostics.tentativeCount,
          diagnostics.insertedCount,diagnostics.mergedCount,diagnostics.prunedCount,diagnostics.droppedCount,diagnostics.invalidCandidateCount,
          unchangedCatalog,proposed.localPoint,proposed.anchorId,proposed.anchorSlot,proposed.generation,proposed.catalogRevision,
          captured,storedSlot,evictedId,measurementReason,diagnostics.catalogRejectionReason,diagnostics.correctionReason,
          diagnostics.catalogUpdateRejectionReason,diagnostics.updateRejectionReason,
          diagnostics.mapRejectionReason,diagnostics.anchorRejectionReason,diagnostics.projectedCount,
          diagnostics.evictedCount,diagnostics.assignedCount,diagnostics.retainedCount,diagnostics.clearedCount) := UpdateKeyframeLandmarks(
            previous.point,previous.occupied,previous.confidence,previous.lastSeen,previous.lastFrame,
            candidatePoint,candidateEnabled,measurement.count,measurement.bodyPosition,poseAccepted,
            previous.imageTime,measurement.imageTime,previous.frame,previous.frame+1,previous.worldFrame,previous.worldFrame,0.0,
            coordinateLimit,voxelWidth,mergeRadius,maximumDistance,tentativeLifetime,confirmedLifetime,
            confirmationObservations,maximumConfidence,maximumTentative,
            previousCatalog,measurement,measurement.epoch,previousCatalog.generation,false,true,
            previous.localPoint,previous.anchorId,previous.anchorSlot,previous.generation,previous.catalogRevision,consistencyTolerance,
            nodePosition,nodeRotation,poseRevision);
        diagnostics.mapAccepted := updateAccepted;
        result.diagnostics := diagnostics;
        result.rejectionReason := if measurementReason <> 0 then 4 else 5;
        if updateAccepted == 1.0 and not captured and storedSlot == 0 and evictedId == 0 then
          proposed.imageEpoch := measurement.epoch;
          result.map := proposed; result.accepted := true; result.rejectionReason := 0;
        end if;
      end if;
    end if;
  end Update;
end RGBDCatalogObservation;

// One frame proposal. Expensive retrieval/registration runs only on capture.
// Both branches remain proposals for the enclosing estimator's atomic commit.
package RGBDCatalogFrame
  function Advance
    input RGBDKeyframes.Catalog catalog;
    input RGBDGraphMeasurements.State graph;
    input RGBDCatalogMapping.State map;
    input RGBDKeyframes.Frame measurement;
    input Real vocabulary[RGBDKeyframes.wordCapacity,RGBDKeyframes.descriptorSize];
    input Real vocabularyEnabled[RGBDKeyframes.wordCapacity];
    input Real candidatePoint[RGBDKeyframes.featureCapacity,RGBDKeyframes.dimension];
    input Real candidateEnabled[RGBDKeyframes.featureCapacity];
    input Boolean imageFresh;
    input Real poseAccepted;
    input Boolean requested;
    input Real minimumInterval = 0.5; input Real maximumInterval = 2.0;
    input Real translationThreshold = 0.6; input Real rotationThreshold = 0.25;
    input Integer minimumFeatures = 12;
    input Integer seeds[RGBDKeyframeRetrieval.proposalCapacity] = fill(7,RGBDKeyframeRetrieval.proposalCapacity);
    input Integer sequentialSeed = 7;
    input Real maximumWordDistanceSquared = 0.8; input Integer minimumAssignments = 8;
    input Real minimumSimilarity = 0.35; input Real minimumAge = 5.0;
    input Integer trials = 96; input Integer refinements = 4;
    input Integer minimumInliers = 12; input Real minimumFraction = 0.5;
    input Real inlierDistance = 0.08; input Real maximumRms = 0.03;
    input Real descriptorRatio = 0.8; input Real maximumDescriptorDistance = 0.8;
    input Real registrationCoordinateLimit = 100.0; input Real rankTolerance = 1e-8;
    input Real localizationSigma = 0.5; input Real depthInflation = 1.0; input Real minimumPivot = 1e-10;
    input Real coordinateLimit = 1e6; input Real voxelWidth = 0.25;
    input Real mergeRadius = 0.15; input Real maximumDistance = 80.0;
    input Real tentativeLifetime = 0.5; input Real confirmedLifetime = 5.0;
    input Real confirmationObservations = 3.0; input Real maximumConfidence = 8.0;
    input Real maximumTentative = 700.0; input Real consistencyTolerance = 1e-6;
    input Real nodePosition[RGBDKeyframes.keyframeCapacity,3] = catalog.bodyPositions;
    input Real nodeRotation[RGBDKeyframes.keyframeCapacity,3,3] = catalog.bodyRotations;
    input Integer poseRevision = map.catalogRevision;
    output RGBDCatalogMapping.Result result;
    output RGBDKeyframePolicy.Decision decision;
  protected
    RGBDCatalogGraphCapture.Result visual;
    RGBDKeyframes.Catalog policyCatalog;
  algorithm
    policyCatalog := catalog;
    policyCatalog.bodyPositions := nodePosition; policyCatalog.bodyRotations := nodeRotation;
    decision := RGBDKeyframePolicy.Select(policyCatalog,measurement,imageFresh,poseAccepted,requested,
      minimumInterval,maximumInterval,translationThreshold,rotationThreshold,minimumFeatures,coordinateLimit);
    if requested and decision.valid and decision.captureRequested then
      visual := RGBDCatalogGraphCapture.Capture(catalog,measurement,vocabulary,vocabularyEnabled,graph,
        true,seeds,sequentialSeed,maximumWordDistanceSquared,minimumAssignments,minimumSimilarity,minimumAge,
        trials,refinements,minimumInliers,minimumFraction,inlierDistance,maximumRms,descriptorRatio,
        maximumDescriptorDistance,registrationCoordinateLimit,rankTolerance,localizationSigma,depthInflation,minimumPivot);
      // PrepareCapture changes the histogram only. Projection is of the same
      // calibrated measured geometry, and Capture checks that binding again.
      result := RGBDCatalogMapping.Capture(catalog,graph,map,visual,candidatePoint,candidateEnabled,
        poseAccepted,true,coordinateLimit,voxelWidth,mergeRadius,maximumDistance,tentativeLifetime,confirmedLifetime,
        confirmationObservations,maximumConfidence,maximumTentative,consistencyTolerance,nodePosition,nodeRotation,poseRevision);
    else
      result := RGBDCatalogObservation.Update(catalog,graph,map,measurement,candidatePoint,candidateEnabled,
        poseAccepted,requested and decision.valid,coordinateLimit,voxelWidth,mergeRadius,maximumDistance,
        tentativeLifetime,confirmedLifetime,confirmationObservations,maximumConfidence,maximumTentative,consistencyTolerance,
        nodePosition,nodeRotation,poseRevision);
    end if;
  end Advance;
end RGBDCatalogFrame;

// Source-owned transport from one accepted localization image to the catalog
// measurement API. This is not another visual update or an independence claim.
// Dependencies: RGBDKeyframes, RGBDRegistrationUncertainty, SLAMExactRealEqual.
package RGBDLocalizationFrame
  // Current errors are five3-vectors: world dp,dv, right-local dtheta,dba,dbg.
  constant Integer currentDimension = 5*RGBDKeyframes.dimension;
  constant Integer poseIndices[RGBDKeyframes.poseDimension] = {1,2,3,7,8,9};

  function Build
    input Integer generation "Checked outer catalog/reset generation";
    input Integer id "Checked catalog nextId proposal, never a ring slot";
    input Integer imageEpoch "Acquisition identity, independent of imageTime";
    input Real coreEpoch "Must exactly equal the Integer acquisition identity";
    input Real imageTime;
    input Real currentCount "Selected domain extent, not enabled or match count";
    input Real currentDescriptor[RGBDKeyframes.featureCapacity,RGBDKeyframes.descriptorSize];
    input Real currentPoint[RGBDKeyframes.featureCapacity,RGBDKeyframes.dimension];
    input Real currentEnabled[RGBDKeyframes.featureCapacity];
    input Real pixels[RGBDKeyframes.featureCapacity,2] "Zero-based RGB pixels";
    input Integer rgbSize[2] "Actual height,width";
    input Integer depthSize[2];
    input Real rgbCalibration[4];
    input Real depthCalibration[4];
    input Real opticalToBody[RGBDKeyframes.dimension,RGBDKeyframes.dimension];
    input Real cameraOriginBody[RGBDKeyframes.dimension];
    input Real disparityNoise;
    input Real noiseReferenceFx;
    input Real baseline;
    input Real bodyPosition[RGBDKeyframes.dimension];
    input Real bodyRotation[RGBDKeyframes.dimension,RGBDKeyframes.dimension];
    input Real currentCovariance[currentDimension,currentDimension]
      "Already accepted producer covariance: world dp,dv; right-local angle; body biases";
    input Integer vocabularyVersion;
    input Real poseAccepted;
    input Boolean requested;
    output RGBDKeyframes.Frame frame;
    output Boolean accepted;
    output Integer rejectionReason "0 accepted; 1 idle; 2 metadata; 3 domain/mask; 4 calibration; 5 pose; 6 pose covariance; 7 feature payload";
  protected
    RGBDKeyframes.Frame candidate;
    Boolean valid;
    Boolean covarianceValid;
    Real inverseCovariance[RGBDKeyframes.poseDimension,RGBDKeyframes.poseDimension];
    Real scaledPivot;
    Real descriptorNorm;
    Real descriptorMean;
  algorithm
    frame := RGBDKeyframes.EmptyFrame();
    accepted := false;
    rejectionReason := 1;
    // The whole idle payload is opaque. No conversions or helper calls below
    // are demanded until requested and their preceding domains are certified.
    if requested then
      rejectionReason := 2;
      valid := generation >= 1 and generation <= RGBDKeyframes.identifierLimit
        and id >= 1 and id < RGBDKeyframes.identifierLimit
        and imageEpoch >= 0 and imageEpoch <= RGBDKeyframes.identifierLimit
        and SLAMExactRealEqual(coreEpoch,imageEpoch)
        and imageTime >= 0.0 and imageTime <= 1e9
        and vocabularyVersion >= 1 and vocabularyVersion <= RGBDKeyframes.identifierLimit;
      if valid then
        rejectionReason := 3;
        valid := currentCount >= 0.0 and currentCount <= RGBDKeyframes.featureCapacity
          and SLAMExactRealEqual(currentCount,floor(currentCount));
        if valid then
          // Mask validation never reads descriptor/point/pixel payload.
          for feature in 1:RGBDKeyframes.featureCapacity loop
            valid := valid and (SLAMExactRealEqual(currentEnabled[feature],0.0)
              or SLAMExactRealEqual(currentEnabled[feature],1.0));
            if SLAMExactRealEqual(currentEnabled[feature],1.0) then
              valid := valid and feature <= currentCount;
            end if;
          end for;
        end if;
        if valid then
          rejectionReason := 4;
          valid := RGBDKeyframes.ValidCalibration(rgbCalibration,rgbSize)
            and RGBDKeyframes.ValidCalibration(depthCalibration,depthSize)
            and disparityNoise > 0.0 and disparityNoise <= 1.0
            and noiseReferenceFx >= 1e-6 and noiseReferenceFx <= 1e6
            and baseline >= 1e-6 and baseline <= 1.0
            and RGBDUncertaintyProper(opticalToBody);
          for axis in 1:RGBDKeyframes.dimension loop
            valid := valid and abs(cameraOriginBody[axis]) <= 10.0;
          end for;
        end if;
        if valid then
          rejectionReason := 5;
          valid := SLAMExactRealEqual(poseAccepted,1.0)
            and RGBDUncertaintyProper(bodyRotation);
          for axis in 1:RGBDKeyframes.dimension loop
            valid := valid and abs(bodyPosition[axis]) <= 1e6;
          end for;
        end if;
        if valid then
          candidate := RGBDKeyframes.EmptyFrame();
          // Preserve the complete position/right-local-angle marginal, both
          // cross blocks included. This does not certify the full21-state prior.
          for row in 1:RGBDKeyframes.poseDimension loop
            for column in 1:RGBDKeyframes.poseDimension loop
              candidate.poseCovariance[row,column] :=
                currentCovariance[poseIndices[row],poseIndices[column]];
            end for;
          end for;
          rejectionReason := 6;
          (inverseCovariance,covarianceValid,scaledPivot) :=
            RGBDUncertaintyInverse6(candidate.poseCovariance,1e-10);
          valid := covarianceValid;
          if valid then
            rejectionReason := 7;
            for feature in 1:RGBDKeyframes.featureCapacity loop
              if SLAMExactRealEqual(currentEnabled[feature],1.0) then
                valid := valid and currentPoint[feature,3] > 0.0;
                for axis in 1:RGBDKeyframes.dimension loop
                  valid := valid and abs(currentPoint[feature,axis]) <= 1e6;
                end for;
                for coordinate in 1:2 loop
                  valid := valid and pixels[feature,coordinate] >= 0.0
                    and pixels[feature,coordinate] < rgbSize[3-coordinate]
                    and SLAMExactRealEqual(pixels[feature,coordinate],floor(pixels[feature,coordinate]));
                end for;
                descriptorNorm := 0.0;
                descriptorMean := 0.0;
                for sample in 1:RGBDKeyframes.descriptorSize loop
                  valid := valid and abs(currentDescriptor[feature,sample]) <= 1.000001;
                  descriptorNorm := descriptorNorm+currentDescriptor[feature,sample]^2;
                  descriptorMean := descriptorMean+currentDescriptor[feature,sample];
                end for;
                valid := valid and abs(descriptorNorm-1.0) <= 1e-6
                  and abs(descriptorMean) <= 1e-6;
              end if;
            end for;
            if valid then
              // Conversions follow complete domain validation. Disabled slots
              // retain canonical empty payload; even a poisoned slot is unread.
              candidate.generation := generation; candidate.id := id;
              candidate.epoch := imageEpoch; candidate.imageTime := imageTime;
              candidate.count := integer(currentCount);
              candidate.rgbSize := rgbSize; candidate.depthSize := depthSize;
              candidate.rgbCalibration := rgbCalibration;
              candidate.depthCalibration := depthCalibration;
              candidate.opticalToBody := opticalToBody;
              candidate.cameraOriginBody := cameraOriginBody;
              candidate.disparityNoise := disparityNoise;
              candidate.noiseReferenceFx := noiseReferenceFx; candidate.baseline := baseline;
              candidate.bodyPosition := bodyPosition; candidate.bodyRotation := bodyRotation;
              candidate.vocabularyVersion := vocabularyVersion;
              // Histogram stays canonical zero; PrepareCapture alone owns BoW.
              for feature in 1:RGBDKeyframes.featureCapacity loop
                if SLAMExactRealEqual(currentEnabled[feature],1.0) then
                  candidate.enabled[feature] := true;
                  candidate.descriptor[feature,:] := currentDescriptor[feature,:];
                  candidate.opticalPoint[feature,:] := currentPoint[feature,:];
                  for coordinate in 1:2 loop
                    candidate.pixels[feature,coordinate] := integer(pixels[feature,coordinate]);
                  end for;
                end if;
              end for;
              frame := candidate; accepted := true; rejectionReason := 0;
            end if;
          end if;
        end if;
      end if;
    end if;
  end Build;
end RGBDLocalizationFrame;

// One source-owned publication of localization and optional catalog/map work.
// The enclosing model binds proposed to the actual localization outputs once.
// This is not graph correction, independent graph noise, or a complete SLAM preset.
package RGBDLocalizationCatalog
  constant Integer dimension = RGBDKeyframes.dimension;
  constant Integer currentDimension = RGBDLocalizationFrame.currentDimension;
  constant Integer referenceDimension = RGBDKeyframes.poseDimension;
  constant Integer featureCapacity = RGBDKeyframes.featureCapacity;
  constant Integer descriptorSize = RGBDKeyframes.descriptorSize;
  constant Integer identifierLimit = RGBDKeyframes.identifierLimit;

  record Estimator
    Real position[dimension]; Real velocity[dimension]; Real rotation[dimension,dimension];
    Real accelBias[dimension]; Real gyroBias[dimension];
    Real covariance[currentDimension,currentDimension];
    Real crossCovariance[currentDimension,referenceDimension];
    Real referenceCovariance[referenceDimension,referenceDimension];
    Real referencePosition[dimension]; Real referenceRotation[dimension,dimension];
    Real referenceAvailable; Real referenceEpoch; Real referenceUsed; Real lastUsedEpoch;
    Real referenceDescriptor[featureCapacity,descriptorSize];
    Real referencePoint[featureCapacity,dimension]; Real referenceEnabled[featureCapacity];
    Real referencePixels[featureCapacity,2]; Real referenceCount;
    Real referenceRgbCalibration[4]; Real referenceDepthCalibration[4];
    Real referenceNoiseReferenceFx; Real referenceDisparityNoise; Real referenceBaseline;
    Real referenceOpticalToBody[dimension,dimension]; Real referenceCameraOriginBody[dimension];
  end Estimator;

  record ReferenceBirth
    Integer generation; Integer epoch;
    Integer sequence "Accepted processing-step identity at reference birth, not a replacement counter";
    Integer catalogId "0 means this local reference has no catalog capture binding";
  end ReferenceBirth;

  record State
    Estimator estimator;
    RGBDKeyframes.Catalog catalog;
    RGBDGraphMeasurements.State graph;
    RGBDCatalogMapping.State map;
    Integer generation; Integer sourceRevision;
    Boolean initialized;
    Real predictionTime; Integer steps;
    Integer lastProcessedImageEpoch; Real lastProcessedImageTime;
    ReferenceBirth referenceBirth;
  end State;

  record Result
    State next;
    Boolean accepted; Integer rejectionReason "0 accepted; 1 idle; 2 binding; 3 chronology; 4 producer; 5 estimator; 6 reference lifecycle";
    Boolean imageCompleted; Boolean mappingAccepted;
    Integer frameRejectionReason;
    RGBDKeyframePolicy.Decision decision;
    RGBDCatalogMapping.Diagnostics mapDiagnostics;
    RGBDGraphMeasurements.Problem problem;
  end Result;

  function EmptyEstimator
    input Real position[dimension] = zeros(dimension);
    input Real velocity[dimension] = zeros(dimension);
    input Real rotation[dimension,dimension] = identity(dimension);
    input Real accelBias[dimension] = zeros(dimension);
    input Real gyroBias[dimension] = zeros(dimension);
    input Real covariance[currentDimension,currentDimension] = diagonal({0.25,0.25,0.25,
      0.04,0.04,0.04,0.01,0.01,0.01,0.0004,0.0004,0.0004,0.000025,0.000025,0.000025});
    output Estimator result;
  algorithm
    result.position := position; result.velocity := velocity; result.rotation := rotation;
    result.accelBias := accelBias; result.gyroBias := gyroBias; result.covariance := covariance;
    result.crossCovariance := zeros(currentDimension,referenceDimension);
    result.referenceCovariance := zeros(referenceDimension,referenceDimension);
    result.referencePosition := zeros(dimension); result.referenceRotation := identity(dimension);
    result.referenceAvailable := 0.0; result.referenceEpoch := 0.0;
    result.referenceUsed := 0.0; result.lastUsedEpoch := -1.0;
    result.referenceDescriptor := zeros(featureCapacity,descriptorSize);
    result.referencePoint := zeros(featureCapacity,dimension); result.referenceEnabled := zeros(featureCapacity);
    result.referencePixels := zeros(featureCapacity,2); result.referenceCount := 0.0;
    result.referenceRgbCalibration := {1.0,1.0,0.0,0.0};
    result.referenceDepthCalibration := {1.0,1.0,0.0,0.0};
    result.referenceNoiseReferenceFx := 1.0; result.referenceDisparityNoise := 0.08;
    result.referenceBaseline := 0.05; result.referenceOpticalToBody := identity(dimension);
    result.referenceCameraOriginBody := zeros(dimension);
  end EmptyEstimator;

  function Empty
    input Estimator estimator;
    input Integer generation = 1;
    input Integer sourceRevision = 1;
    input Integer vocabularyVersion = 1;
    input Real worldFrame = 0.0;
    output State result;
  algorithm
    result.estimator := estimator;
    result.catalog := RGBDKeyframes.Empty(generation,vocabularyVersion);
    result.graph := RGBDGraphMeasurements.Empty(generation);
    result.map := RGBDCatalogMapping.Empty(generation,worldFrame);
    result.generation := generation; result.sourceRevision := sourceRevision;
    result.initialized := false; result.predictionTime := 0.0; result.steps := 0;
    result.lastProcessedImageEpoch := -1; result.lastProcessedImageTime := 0.0;
    result.referenceBirth.generation := generation; result.referenceBirth.epoch := -1;
    result.referenceBirth.sequence := 0; result.referenceBirth.catalogId := 0;
  end Empty;

  function ValidEstimator
    input Estimator value;
    output Boolean valid;
  protected
    Real joint[currentDimension+referenceDimension,currentDimension+referenceDimension];
  algorithm
    valid := RGBDMapAnchors.ProperRotation(value.rotation)
      and SLAMCovariancePSDCheck(value.covariance,1e-12) == 1.0
      and (SLAMExactRealEqual(value.referenceAvailable,0.0) or SLAMExactRealEqual(value.referenceAvailable,1.0))
      and (SLAMExactRealEqual(value.referenceUsed,0.0) or SLAMExactRealEqual(value.referenceUsed,1.0))
      and value.lastUsedEpoch >= -1.0 and value.lastUsedEpoch <= identifierLimit
      and SLAMExactRealEqual(value.lastUsedEpoch,floor(value.lastUsedEpoch));
    for axis in 1:dimension loop
      valid := valid and abs(value.position[axis]) <= 1e6 and abs(value.velocity[axis]) <= 1e6
        and abs(value.accelBias[axis]) <= 2.0 and abs(value.gyroBias[axis]) <= 0.3;
    end for;
    // Unavailable reference buffers stay opaque, matching the propagation owner.
    if SLAMExactRealEqual(value.referenceAvailable,0.0) then
      valid := valid and SLAMExactRealEqual(value.referenceUsed,0.0);
    elseif SLAMExactRealEqual(value.referenceAvailable,1.0) then
      valid := valid and RGBDMapAnchors.ProperRotation(value.referenceRotation)
        and value.referenceEpoch >= 0.0 and value.referenceEpoch <= identifierLimit
        and SLAMExactRealEqual(value.referenceEpoch,floor(value.referenceEpoch))
        and ((SLAMExactRealEqual(value.referenceUsed,0.0) and value.referenceEpoch > value.lastUsedEpoch)
          or (SLAMExactRealEqual(value.referenceUsed,1.0) and value.referenceEpoch <= value.lastUsedEpoch));
      for axis in 1:dimension loop
        valid := valid and abs(value.referencePosition[axis]) <= 1e6;
      end for;
      joint := cat(1,cat(2,value.covariance,value.crossCovariance),
        cat(2,transpose(value.crossCovariance),value.referenceCovariance));
      valid := valid and SLAMCovariancePSDCheck(joint,1e-12) == 1.0;
    end if;
  end ValidEstimator;

  function ValidHeader
    input State state;
    output Boolean valid;
  algorithm
    valid := state.generation >= 1 and state.generation <= identifierLimit
      and state.sourceRevision >= 1 and state.sourceRevision <= identifierLimit
      and state.steps >= 0 and state.steps < identifierLimit
      and state.predictionTime >= 0.0 and state.predictionTime <= 1e9
      and state.lastProcessedImageEpoch >= -1 and state.lastProcessedImageEpoch <= identifierLimit
      and state.lastProcessedImageTime >= 0.0 and state.lastProcessedImageTime <= state.predictionTime
      and RGBDKeyframes.ValidHeader(state.catalog)
      and state.catalog.generation == state.generation and state.graph.generation == state.generation
      and state.map.generation == state.generation
      and state.graph.revision >= 0 and state.graph.revision < identifierLimit
      and state.graph.lastCaptureId == state.catalog.nextId-1
      and state.graph.nextEdgeId >= 1 and state.graph.nextEdgeId <= identifierLimit
      and state.map.catalogRevision >= 0 and state.map.catalogRevision <= state.graph.revision
      and state.catalog.lastEpoch <= state.lastProcessedImageEpoch
      and state.map.imageEpoch >= -1 and state.map.imageEpoch <= state.lastProcessedImageEpoch
      and state.catalog.lastTime <= state.predictionTime and state.map.imageTime >= 0.0 and state.map.imageTime <= state.predictionTime
      and state.map.frame >= 0.0 and state.map.frame < identifierLimit
      and SLAMExactRealEqual(state.map.frame,floor(state.map.frame))
      and abs(state.map.worldFrame) <= 1e9
      and state.referenceBirth.generation == state.generation;
    if state.initialized then
      valid := valid and state.steps >= 1;
    else
      valid := valid and state.steps == 0 and SLAMExactRealEqual(state.predictionTime,0.0)
        and state.lastProcessedImageEpoch == -1 and state.catalog.nextId == 1
        and state.graph.revision == 0 and SLAMExactRealEqual(state.map.frame,0.0)
        and SLAMExactRealEqual(state.estimator.referenceAvailable,0.0)
        and SLAMExactRealEqual(state.estimator.lastUsedEpoch,-1.0);
    end if;
    if SLAMExactRealEqual(state.estimator.referenceAvailable,1.0) then
      valid := valid and state.referenceBirth.sequence >= 1 and state.referenceBirth.sequence <= state.steps
        and state.referenceBirth.epoch >= 0 and state.referenceBirth.epoch <= state.lastProcessedImageEpoch
        and SLAMExactRealEqual(state.estimator.referenceEpoch,state.referenceBirth.epoch)
        and state.referenceBirth.catalogId >= 0 and state.referenceBirth.catalogId < state.catalog.nextId;
    else
      valid := valid and state.referenceBirth.sequence == 0 and state.referenceBirth.epoch == -1
        and state.referenceBirth.catalogId == 0;
    end if;
  end ValidHeader;

  function FrameBound
    input State previous; input Estimator proposed; input RGBDKeyframes.Frame measurement;
    input Integer imageEpoch; input Real imageTime;
    input Real observationAccepted; input Real captureAccepted; input Boolean frameAccepted;
    output Boolean frameBound;
  algorithm
    frameBound := frameAccepted and measurement.generation == previous.generation
      and measurement.id == previous.catalog.nextId and measurement.epoch == imageEpoch
      and SLAMExactRealEqual(measurement.imageTime,imageTime)
      and measurement.vocabularyVersion == previous.catalog.vocabularyVersion
      and (SLAMExactRealEqual(observationAccepted,1.0) or SLAMExactRealEqual(captureAccepted,1.0));
    if frameBound then
      for axis in 1:dimension loop
        frameBound := frameBound and SLAMExactRealEqual(measurement.bodyPosition[axis],proposed.position[axis]);
        for column in 1:dimension loop
          frameBound := frameBound and SLAMExactRealEqual(measurement.bodyRotation[axis,column],proposed.rotation[axis,column]);
        end for;
      end for;
      for row in 1:referenceDimension loop
        for column in 1:referenceDimension loop
          frameBound := frameBound and SLAMExactRealEqual(measurement.poseCovariance[row,column],
            proposed.covariance[RGBDLocalizationFrame.poseIndices[row],RGBDLocalizationFrame.poseIndices[column]]);
        end for;
      end for;
    end if;
  end FrameBound;

  function ImageFresh
    input State previous; input Integer imageEpoch; input Real imageTime;
    output Boolean fresh;
  algorithm
    fresh := imageEpoch >= 0 and imageEpoch <= identifierLimit
      and imageEpoch > previous.lastProcessedImageEpoch
      and imageEpoch > previous.catalog.lastEpoch and imageEpoch > previous.map.imageEpoch
      and imageTime >= 0.0 and imageTime <= 1e9
      and (previous.lastProcessedImageEpoch == -1 or imageTime > previous.lastProcessedImageTime);
  end ImageFresh;

  function CanAdvance
    input State previous; input Real intervalTime; input Real h;
    input Boolean initializing; input Boolean requested;
    output Boolean allowed;
  algorithm
    allowed := false;
    if requested then
      allowed := ValidHeader(previous) and intervalTime >= 0.0 and intervalTime <= 1e9;
      if initializing then
        allowed := allowed and not previous.initialized
          and SLAMExactRealEqual(intervalTime,0.0) and SLAMExactRealEqual(h,0.0);
      else
        allowed := allowed and previous.initialized and ES15HeldIntervalValid(h)
          and intervalTime > previous.predictionTime
          and abs(intervalTime-previous.predictionTime-h) <= 1e-12*max(1.0,abs(intervalTime));
      end if;
    end if;
  end CanAdvance;

  function ReferenceHeld
    input Estimator previous; input Estimator proposed;
    output Boolean held;
  algorithm
    held := SLAMExactRealEqual(previous.referenceAvailable,proposed.referenceAvailable)
      and SLAMExactRealEqual(previous.referenceEpoch,proposed.referenceEpoch);
    if SLAMExactRealEqual(previous.referenceAvailable,1.0) then
      held := held and SLAMExactRealEqual(previous.referenceCount,proposed.referenceCount)
        and SLAMExactRealEqual(previous.referenceNoiseReferenceFx,proposed.referenceNoiseReferenceFx)
        and SLAMExactRealEqual(previous.referenceDisparityNoise,proposed.referenceDisparityNoise)
        and SLAMExactRealEqual(previous.referenceBaseline,proposed.referenceBaseline);
      for axis in 1:dimension loop
        held := held and SLAMExactRealEqual(previous.referencePosition[axis],proposed.referencePosition[axis])
          and SLAMExactRealEqual(previous.referenceCameraOriginBody[axis],proposed.referenceCameraOriginBody[axis]);
        for column in 1:dimension loop
          held := held and SLAMExactRealEqual(previous.referenceRotation[axis,column],proposed.referenceRotation[axis,column])
            and SLAMExactRealEqual(previous.referenceOpticalToBody[axis,column],proposed.referenceOpticalToBody[axis,column]);
        end for;
      end for;
      for coordinate in 1:4 loop
        held := held and SLAMExactRealEqual(previous.referenceRgbCalibration[coordinate],proposed.referenceRgbCalibration[coordinate])
          and SLAMExactRealEqual(previous.referenceDepthCalibration[coordinate],proposed.referenceDepthCalibration[coordinate]);
      end for;
      for row in 1:referenceDimension loop
        for column in 1:referenceDimension loop
          held := held and SLAMExactRealEqual(previous.referenceCovariance[row,column],proposed.referenceCovariance[row,column]);
        end for;
      end for;
      for feature in 1:featureCapacity loop
        held := held and SLAMExactRealEqual(previous.referenceEnabled[feature],proposed.referenceEnabled[feature]);
        if SLAMExactRealEqual(previous.referenceEnabled[feature],1.0) then
          for axis in 1:dimension loop
            held := held and SLAMExactRealEqual(previous.referencePoint[feature,axis],proposed.referencePoint[feature,axis]);
          end for;
          for coordinate in 1:2 loop
            held := held and SLAMExactRealEqual(previous.referencePixels[feature,coordinate],proposed.referencePixels[feature,coordinate]);
          end for;
          for coordinate in 1:descriptorSize loop
            held := held and SLAMExactRealEqual(previous.referenceDescriptor[feature,coordinate],proposed.referenceDescriptor[feature,coordinate]);
          end for;
        end if;
      end for;
    end if;
  end ReferenceHeld;

  function Publish
    input State previous;
    input Estimator proposed "Same compiled localization invocation; no host reconstruction";
    input RGBDKeyframes.Frame measurement;
    input Real producerAccepted "Prediction accepted, or explicit initialization accepted";
    input Real observationAccepted; input Real captureAccepted;
    input Boolean imageOn; input Integer imageEpoch; input Real imageTime; input Real h;
    input Boolean initializing;
    input Boolean frameAccepted; input Integer frameRejectionReason;
    input Boolean requested;
    input Real candidatePoint[featureCapacity,dimension]; input Real candidateEnabled[featureCapacity];
    input Real vocabulary[RGBDKeyframes.wordCapacity,descriptorSize];
    input Real vocabularyEnabled[RGBDKeyframes.wordCapacity];
    input Real minimumInterval = 0.5; input Real maximumInterval = 2.0;
    input Real translationThreshold = 0.6; input Real rotationThreshold = 0.25;
    input Integer minimumFeatures = 12;
    input Real voxelWidth = 0.25; input Real mergeRadius = 0.15;
    input Real maximumDistance = 80.0; input Real tentativeLifetime = 0.5;
    input Real confirmedLifetime = 5.0; input Real confirmationObservations = 3.0;
    input Real maximumConfidence = 8.0; input Real maximumTentative = 700.0;
    input Real posePositions[RGBDKeyframes.keyframeCapacity,dimension] = previous.catalog.bodyPositions;
    input Real poseRotations[RGBDKeyframes.keyframeCapacity,dimension,dimension] = previous.catalog.bodyRotations;
    input Integer poseRevision = previous.map.catalogRevision;
    output Result result;
  protected
    Boolean valid; Boolean frameBound;
    RGBDCatalogMapping.Result mapped;
  algorithm
    result.next := previous; result.accepted := false; result.rejectionReason := 1;
    result.imageCompleted := false; result.mappingAccepted := false;
    result.frameRejectionReason := frameRejectionReason;
    result.decision.valid := false; result.decision.captureRequested := false; result.decision.reason := 1;
    result.decision.enabledCount := 0; result.decision.elapsed := 0.0;
    result.decision.translationSquared := 0.0; result.decision.rotationCosine := 1.0;
    result.mapDiagnostics := RGBDCatalogMapping.EmptyDiagnostics();
    result.problem := RGBDGraphMeasurements.EmptyProblem();
    if requested then
      result.rejectionReason := 2;
      valid := ValidHeader(previous) and ValidEstimator(previous.estimator);
      if valid then
        result.rejectionReason := 3;
        valid := imageTime >= 0.0 and imageTime <= 1e9;
        if initializing then
          valid := valid and not previous.initialized and imageOn
            and SLAMExactRealEqual(imageTime,0.0) and SLAMExactRealEqual(h,0.0);
        else
          valid := valid and previous.initialized and ES15HeldIntervalValid(h)
            and imageTime > previous.predictionTime
            and abs(imageTime-previous.predictionTime-h) <= 1e-12*max(1.0,abs(imageTime));
        end if;
        if imageOn then valid := valid and ImageFresh(previous,imageEpoch,imageTime); end if;
        if valid then
          result.rejectionReason := 4;
          valid := SLAMExactRealEqual(producerAccepted,1.0)
            and (SLAMExactRealEqual(observationAccepted,0.0) or SLAMExactRealEqual(observationAccepted,1.0))
            and (SLAMExactRealEqual(captureAccepted,0.0) or SLAMExactRealEqual(captureAccepted,1.0))
            and (imageOn or (SLAMExactRealEqual(observationAccepted,0.0) and SLAMExactRealEqual(captureAccepted,0.0)))
            and (not initializing or SLAMExactRealEqual(observationAccepted,0.0));
          if valid then
            result.rejectionReason := 5; valid := ValidEstimator(proposed);
            if valid then
              result.rejectionReason := 6;
              valid := proposed.lastUsedEpoch >= previous.estimator.lastUsedEpoch
                and (not imageOn or proposed.lastUsedEpoch <= imageEpoch);
              if proposed.lastUsedEpoch > previous.estimator.lastUsedEpoch then
                valid := valid and imageOn and SLAMExactRealEqual(proposed.lastUsedEpoch,imageEpoch)
                  and SLAMExactRealEqual(proposed.referenceUsed,1.0);
              end if;
              if SLAMExactRealEqual(observationAccepted,1.0) then
                valid := valid and SLAMExactRealEqual(proposed.lastUsedEpoch,imageEpoch)
                  and SLAMExactRealEqual(proposed.referenceUsed,1.0)
                  and SLAMExactRealEqual(captureAccepted,0.0);
              end if;
              if SLAMExactRealEqual(captureAccepted,1.0) then
                valid := valid and previous.referenceBirth.sequence < identifierLimit
                  and SLAMExactRealEqual(proposed.referenceAvailable,1.0)
                  and SLAMExactRealEqual(proposed.referenceEpoch,imageEpoch)
                  and SLAMExactRealEqual(proposed.referenceUsed,0.0)
                  and imageEpoch > previous.estimator.lastUsedEpoch;
                for axis in 1:dimension loop
                  valid := valid and SLAMExactRealEqual(proposed.referencePosition[axis],proposed.position[axis]);
                  for column in 1:dimension loop
                    valid := valid and SLAMExactRealEqual(proposed.referenceRotation[axis,column],proposed.rotation[axis,column]);
                  end for;
                end for;
                for row in 1:currentDimension loop
                  for column in 1:referenceDimension loop
                    valid := valid and SLAMExactRealEqual(proposed.crossCovariance[row,column],
                      proposed.covariance[row,RGBDLocalizationFrame.poseIndices[column]]);
                  end for;
                end for;
                for row in 1:referenceDimension loop
                  for column in 1:referenceDimension loop
                    valid := valid and SLAMExactRealEqual(proposed.referenceCovariance[row,column],
                      proposed.covariance[RGBDLocalizationFrame.poseIndices[row],RGBDLocalizationFrame.poseIndices[column]]);
                  end for;
                end for;
              else
                valid := valid and ReferenceHeld(previous.estimator,proposed)
                  and proposed.referenceUsed >= previous.estimator.referenceUsed;
              end if;
              if not imageOn then
                valid := valid and SLAMExactRealEqual(proposed.lastUsedEpoch,previous.estimator.lastUsedEpoch)
                  and SLAMExactRealEqual(proposed.referenceUsed,previous.estimator.referenceUsed);
              end if;
              if valid then
                // Completed localization and its raw-noise ledger commit even
                // when optional Frame/BoW/registration/map admission refuses.
                result.next.estimator := proposed; result.next.initialized := true;
                if SLAMExactRealEqual(captureAccepted,0.0) then
                  // Retained image payload is immutable, including unavailable
                  // and disabled cells. Copy its owner rather than comparing NaN
                  // payload with numerical equality or inventing canonical data.
                  result.next.estimator.referenceDescriptor := previous.estimator.referenceDescriptor;
                  result.next.estimator.referencePoint := previous.estimator.referencePoint;
                  result.next.estimator.referenceEnabled := previous.estimator.referenceEnabled;
                  result.next.estimator.referencePixels := previous.estimator.referencePixels;
                  result.next.estimator.referenceCount := previous.estimator.referenceCount;
                  result.next.estimator.referenceRgbCalibration := previous.estimator.referenceRgbCalibration;
                  result.next.estimator.referenceDepthCalibration := previous.estimator.referenceDepthCalibration;
                  result.next.estimator.referenceNoiseReferenceFx := previous.estimator.referenceNoiseReferenceFx;
                  result.next.estimator.referenceDisparityNoise := previous.estimator.referenceDisparityNoise;
                  result.next.estimator.referenceBaseline := previous.estimator.referenceBaseline;
                  result.next.estimator.referenceOpticalToBody := previous.estimator.referenceOpticalToBody;
                  result.next.estimator.referenceCameraOriginBody := previous.estimator.referenceCameraOriginBody;
                  result.next.estimator.referencePosition := previous.estimator.referencePosition;
                  result.next.estimator.referenceRotation := previous.estimator.referenceRotation;
                  result.next.estimator.referenceCovariance := previous.estimator.referenceCovariance;
                  if SLAMExactRealEqual(previous.estimator.referenceAvailable,0.0) then
                    result.next.estimator.crossCovariance := previous.estimator.crossCovariance;
                  end if;
                end if;
                result.next.predictionTime := imageTime; result.next.steps := previous.steps+1;
                result.accepted := true; result.rejectionReason := 0;
                if SLAMExactRealEqual(captureAccepted,1.0) then
                  result.next.referenceBirth.generation := previous.generation;
                  result.next.referenceBirth.epoch := imageEpoch;
                  result.next.referenceBirth.sequence := previous.steps+1;
                  result.next.referenceBirth.catalogId := 0;
                end if;
                if imageOn then
                  result.imageCompleted := true;
                  result.next.lastProcessedImageEpoch := imageEpoch;
                  result.next.lastProcessedImageTime := imageTime;
                  // Check binding in addition to the builder's own certificate.
                  // Pose/covariance are from the same accepted localization.
                  frameBound := FrameBound(previous,proposed,measurement,imageEpoch,imageTime,
                    observationAccepted,captureAccepted,frameAccepted);
                  if frameAccepted and not frameBound then result.frameRejectionReason := 8; end if;
                  if frameBound then
                    (mapped,result.decision) := RGBDCatalogFrame.Advance(previous.catalog,previous.graph,previous.map,
                      measurement,vocabulary,vocabularyEnabled,candidatePoint,candidateEnabled,true,1.0,true,
                      minimumInterval=minimumInterval,maximumInterval=maximumInterval,
                      translationThreshold=translationThreshold,rotationThreshold=rotationThreshold,minimumFeatures=minimumFeatures,
                      voxelWidth=voxelWidth,mergeRadius=mergeRadius,maximumDistance=maximumDistance,
                      tentativeLifetime=tentativeLifetime,confirmedLifetime=confirmedLifetime,
                      confirmationObservations=confirmationObservations,maximumConfidence=maximumConfidence,maximumTentative=maximumTentative,
                      nodePosition=posePositions,nodeRotation=poseRotations,poseRevision=poseRevision);
                    result.mapDiagnostics := mapped.diagnostics; result.problem := mapped.problem;
                    if mapped.accepted then
                      result.next.catalog := mapped.catalog; result.next.graph := mapped.graph; result.next.map := mapped.map;
                      result.mappingAccepted := true;
                      if result.decision.captureRequested and result.next.referenceBirth.epoch == imageEpoch
                        and result.next.referenceBirth.generation == previous.generation then
                        result.next.referenceBirth.catalogId := measurement.id;
                      end if;
                    end if;
                  end if;
                end if;
              end if;
            end if;
          end if;
        end if;
      end if;
    end if;
  end Publish;
end RGBDLocalizationCatalog;

// Conditional first-order bound transport, not graph covariance certification.
// ENU additive position and body right-local attitude; selected order p,theta,p,theta.
// Anchor/relative cross-correlation is UNKNOWN, never silently set to zero.
// sourceRevision is a positive session identity token, not a verified hash here.
// Positive provenance tokens assert caller-provided bounds; they certify nothing.
package GraphGaugeUncertainty
  constant Integer chartENUPositionRightLocalAttitude = 1;
  constant Integer selectedDimension = 12;
  constant Integer anchorDimension = 6;
  record Binding
    Integer generation; Integer graphRevision; Integer catalogPoseRevision;
    Integer anchorId; Integer anchorEpoch; Integer anchorCaptureSequence;
    Integer currentId; Integer currentEpoch; Integer currentCaptureSequence; Integer referenceId; Integer referenceEpoch;
    Integer referenceCaptureSequence; Integer chart;
    Real anchorTime; Real currentTime; Real referenceTime;
    Integer sourceRevision; Integer factorProvenance; Integer anchorBoundProvenance;
  end Binding;
  record Estimate
    Binding binding;
    Real positions[2,3]; Real rotations[2,3,3]; Real covariance[12,12];
  end Estimate;
  function SameBinding
    input Binding a; input Binding b; output Boolean same;
  algorithm
    same := a.generation == b.generation and a.graphRevision == b.graphRevision
      and a.catalogPoseRevision == b.catalogPoseRevision and a.anchorId == b.anchorId
      and a.anchorEpoch == b.anchorEpoch and a.anchorCaptureSequence == b.anchorCaptureSequence
      and a.currentId == b.currentId and a.currentEpoch == b.currentEpoch and a.currentCaptureSequence == b.currentCaptureSequence
      and a.referenceId == b.referenceId and a.referenceEpoch == b.referenceEpoch
      and a.referenceCaptureSequence == b.referenceCaptureSequence and a.chart == b.chart
      and a.anchorTime == b.anchorTime and a.currentTime == b.currentTime and a.referenceTime == b.referenceTime
      and a.sourceRevision == b.sourceRevision and a.factorProvenance == b.factorProvenance
      and a.anchorBoundProvenance == b.anchorBoundProvenance;
  end SameBinding;
  // A repeated selected ID is one random pose, never two observations.
  function SameCapture
    input Binding b; output Boolean same;
  algorithm
    same := b.currentId == b.referenceId and b.currentEpoch == b.referenceEpoch
      and b.currentTime == b.referenceTime and b.currentCaptureSequence == b.referenceCaptureSequence;
  end SameCapture;
  function CloneEstimate
    input Estimate estimate; output Boolean valid;
  algorithm
    valid := SameCapture(estimate.binding);
    for i in 1:3 loop
      valid := valid and estimate.positions[1,i] == estimate.positions[2,i];
      for j in 1:3 loop valid := valid and estimate.rotations[1,i,j] == estimate.rotations[2,i,j]; end for;
    end for;
    for i in 1:6 loop for j in 1:6 loop
      valid := valid and estimate.covariance[i,j] == estimate.covariance[i,j+6]
        and estimate.covariance[i,j] == estimate.covariance[i+6,j]
        and estimate.covariance[i,j] == estimate.covariance[i+6,j+6];
    end for; end for;
  end CloneEstimate;
  function ValidBinding
    input Binding b; output Boolean valid;
  algorithm
    valid := b.generation > 0 and b.graphRevision > 0 and b.catalogPoseRevision >= 0
      and b.anchorId > 0 and b.anchorEpoch >= 0 and b.anchorCaptureSequence > 0
      and b.currentId > 0 and b.currentCaptureSequence > 0 and b.referenceId > 0 and (b.currentId <> b.referenceId or SameCapture(b))
      and b.currentEpoch >= b.referenceEpoch and b.referenceEpoch >= b.anchorEpoch
      and b.referenceCaptureSequence > 0 and b.chart == chartENUPositionRightLocalAttitude
      and b.anchorTime >= 0 and b.anchorTime <= b.referenceTime and b.referenceTime <= b.currentTime
      and b.currentTime <= 1e12 and b.sourceRevision > 0 and b.factorProvenance > 0
      and b.anchorBoundProvenance > 0;
    if b.currentId == b.anchorId then
      valid := valid and b.currentEpoch == b.anchorEpoch and b.currentTime == b.anchorTime
        and b.currentCaptureSequence == b.anchorCaptureSequence;
    end if;
    if b.referenceId == b.anchorId then
      valid := valid and b.referenceEpoch == b.anchorEpoch and b.referenceTime == b.anchorTime
        and b.referenceCaptureSequence == b.anchorCaptureSequence;
    end if;
  end ValidBinding;
  function Transport
    input Estimate previous;
    input Binding binding; input Binding expectedBinding;
    input Real anchorPosition[3]; input Real anchorRotation[3,3]; input Real anchorBound[6,6];
    input Real relativePositions[2,3]; input Real relativeRotations[2,3,3];
    input Real relativeJointBound[12,12]; input Real beta; input Boolean requested;
    output Estimate result; output Boolean accepted; output Integer rejectionReason;
  protected
    Boolean valid; Boolean endpoint;
    Real B[12,6]; Real C[12,12]; Real candidate[12,12]; Real lever[3,3];
    Real candidatePositions[2,3]; Real candidateRotations[2,3,3];
    Integer offset;
  algorithm
    result := previous; accepted := false; rejectionReason := 1;
    if requested then
      rejectionReason := 2;
      valid := ValidBinding(binding) and SameBinding(binding,expectedBinding);
      if valid then
        rejectionReason := 3; valid := beta > 0 and beta < 1;
      end if;
      if valid then
        rejectionReason := 4; valid := RGBDUncertaintyProper(anchorRotation);
        for i in 1:3 loop valid := valid and abs(anchorPosition[i]) <= 1e6; end for;
        for node in 1:2 loop
          valid := valid and RGBDUncertaintyProper(relativeRotations[node,:,:]);
          for i in 1:3 loop valid := valid and abs(relativePositions[node,i]) <= 1e6; end for;
        end for;
      end if;
      if valid then
        rejectionReason := 5;
        valid := SLAMCovariancePSDCheck(anchorBound,1e-12) == 1
          and SLAMCovariancePSDCheck(relativeJointBound,1e-12) == 1;
      end if;
      if valid then
        rejectionReason := 6;
        for node in 1:2 loop
          endpoint := (if node == 1 then binding.currentId else binding.referenceId) == binding.anchorId;
          offset := 6*(node-1);
          if endpoint then
            for i in 1:3 loop
              valid := valid and relativePositions[node,i] == 0;
              for j in 1:3 loop valid := valid and relativeRotations[node,i,j] == (if i == j then 1 else 0); end for;
            end for;
            for i in 1:6 loop for j in 1:12 loop
              valid := valid and relativeJointBound[offset+i,j] == 0 and relativeJointBound[j,offset+i] == 0;
            end for; end for;
          end if;
        end for;
      end if;
      if valid and SameCapture(binding) then
        rejectionReason := 6;
        for i in 1:3 loop
          valid := valid and relativePositions[1,i] == relativePositions[2,i];
          for j in 1:3 loop valid := valid and relativeRotations[1,i,j] == relativeRotations[2,i,j]; end for;
        end for;
        for i in 1:6 loop for j in 1:6 loop
          valid := valid and relativeJointBound[i,j] == relativeJointBound[i,j+6]
            and relativeJointBound[i,j] == relativeJointBound[i+6,j]
            and relativeJointBound[i,j] == relativeJointBound[i+6,j+6];
        end for; end for;
      end if;
      if valid then
        B := zeros(12,6); C := zeros(12,12);
        for node in 1:2 loop
          offset := 6*(node-1); lever := -anchorRotation*RGBDUncertaintySkew(relativePositions[node,:]);
          for i in 1:3 loop for j in 1:3 loop
            B[offset+i,j] := if i == j then 1 else 0; B[offset+i,j+3] := lever[i,j];
            B[offset+i+3,j+3] := relativeRotations[node,j,i];
            C[offset+i,offset+j] := anchorRotation[i,j]; C[offset+i+3,offset+j+3] := if i == j then 1 else 0;
          end for; end for;
        end for;
        candidate := B*anchorBound*transpose(B)/beta+C*relativeJointBound*transpose(C)/(1-beta);
        rejectionReason := 7;
        valid := SLAMCovariancePSDCheck(candidate,1e-12) == 1;
        if valid then
          rejectionReason := 8;
          for node in 1:2 loop
            candidatePositions[node,:] := anchorPosition+anchorRotation*relativePositions[node,:];
            candidateRotations[node,:,:] := anchorRotation*relativeRotations[node,:,:];
            valid := valid and RGBDUncertaintyProper(candidateRotations[node,:,:]);
            for i in 1:3 loop valid := valid and abs(candidatePositions[node,i]) <= 1e6; end for;
          end for;
          if valid then
            result.binding := binding; result.covariance := candidate;
            result.positions := candidatePositions; result.rotations := candidateRotations;
            accepted := true; rejectionReason := 0;
          end if;
        end if;
      end if;
    end if;
  end Transport;
end GraphGaugeUncertainty;

// Unknown graph/filter cross-correlation fusion; not a fresh independent image.
// Source-owned first-order math. Not selected by the production browser runtime.
// Dependencies: GraphGaugeUncertainty, RGBDUncertaintyProper/Skew,
// SLAMCovariancePSDCheck. No optimizer damping is interpreted as covariance.
package SchmidtGraphPoseCorrection
  constant Integer currentDimension = 15;
  constant Integer referenceDimension = 6;
  constant Integer jointDimension = currentDimension+referenceDimension;
  constant Integer observationDimension = 2*referenceDimension;

  constant Integer poseIndices[6] = {1,2,3,7,8,9};

  record State
    Real position[3]; Real velocity[3]; Real rotation[3,3];
    Real accelBias[3]; Real gyroBias[3];
    Real covariance[15,15]; Real crossCovariance[15,6]; Real referenceCovariance[6,6];
    Real referencePosition[3]; Real referenceRotation[3,3];
    Boolean referenceAvailable; Boolean referenceUsed;
    Integer generation; Integer sourceRevision;
    Integer currentId; Integer currentEpoch; Integer currentCaptureSequence;
    Integer referenceId; Integer referenceEpoch; Integer referenceCaptureSequence;
    Integer lastUsedEpoch;
    Real predictionTime; Real referenceTime;
  end State;

  record Policy
    Real weight; Boolean constrainVelocityAndBias;
    Real maximumPositionInnovation; Real maximumAngularInnovation;
    Real maximumPositionCorrection; Real maximumAngularCorrection; Real maximumNis;
  end Policy;

  record Attempt
    Integer generation; Integer graphRevision; Integer factorProvenance;
  end Attempt;

  record Result
    State next;
    Boolean accepted; Integer reason;
    Boolean attempted; Attempt nextAttempt;
    Real innovation[12]; Real measurementJacobian[12,21]; Real noise[12,12];
    Real gain[21,12]; Real correction[21]; Real nis;
    Real covarianceBeforeReset[21,21]; Real resetJacobian[21,21];
  end Result;

  function ExactClone
    input State state; output Boolean valid;
  algorithm
    valid := state.referenceAvailable;
    for i in 1:3 loop
      valid := valid and state.position[i] == state.referencePosition[i];
      for j in 1:3 loop valid := valid and state.rotation[i,j] == state.referenceRotation[i,j]; end for;
    end for;
    for i in 1:15 loop for j in 1:6 loop
      valid := valid and state.crossCovariance[i,j] == state.covariance[i,poseIndices[j]];
    end for; end for;
    for i in 1:6 loop for j in 1:6 loop
      valid := valid and state.referenceCovariance[i,j] == state.covariance[poseIndices[i],poseIndices[j]];
    end for; end for;
  end ExactClone;

  function DefaultPolicy
    output Policy result;
  algorithm
    result.weight := 0.5; result.constrainVelocityAndBias := false;
    result.maximumPositionInnovation := 5; result.maximumAngularInnovation := 0.35;
    result.maximumPositionCorrection := 5; result.maximumAngularCorrection := 0.35;
    result.maximumNis := 36;
  end DefaultPolicy;

  function Exp
    input Real vector[3]; output Real rotation[3,3];
  protected
    Real square; Real angle; Real a; Real b; Real skew[3,3];
  algorithm
    square := sum(vector.^2); angle := sqrt(square);
    a := if square < 1e-8 then 1-square/6+square^2/120 else sin(angle)/angle;
    b := if square < 1e-8 then 0.5-square/24+square^2/720 else (1-cos(angle))/square;
    skew := RGBDUncertaintySkew(vector);
    rotation := identity(3)+a*skew+b*(skew*skew);
  end Exp;

  function Log
    input Real rotation[3,3]; output Real vector[3]; output Boolean valid;
  protected
    Real cosine; Real angle; Real square; Real factor;
  algorithm
    vector := zeros(3); valid := RGBDUncertaintyProper(rotation);
    if valid then
      cosine := min(1.0,max(-1.0,(sum(rotation[i,i] for i in 1:3)-1)/2));
      angle := acos(cosine); square := angle^2;
      valid := angle < 3.140592653589793;
      if valid then
        factor := if square < 1e-8 then 0.5+square/12+7*square^2/720 else angle/(2*sin(angle));
        vector := factor*{rotation[3,2]-rotation[2,3],rotation[1,3]-rotation[3,1],rotation[2,1]-rotation[1,2]};
      end if;
    end if;
  end Log;

  function InverseJacobian
    input Real vector[3]; input Boolean right; output Real jacobian[3,3];
  protected
    Real square; Real angle; Real coefficient; Real skew[3,3];
  algorithm
    square := sum(vector.^2); angle := sqrt(square);
    coefficient := if square < 1e-8 then 1.0/12+square/720+square^2/30240
      else (1-angle*cos(angle/2)/(2*sin(angle/2)))/square;
    skew := RGBDUncertaintySkew(vector);
    jacobian := identity(3)+(if right then 0.5 else -0.5)*skew+coefficient*(skew*skew);
  end InverseJacobian;

  function RightJacobian
    input Real vector[3]; output Real jacobian[3,3];
  protected
    Real square; Real angle; Real a; Real b; Real skew[3,3];
  algorithm
    square := sum(vector.^2); angle := sqrt(square);
    a := if square < 1e-8 then 0.5-square/24+square^2/720 else (1-cos(angle))/square;
    b := if square < 1e-8 then 1.0/6-square/120+square^2/5040 else (angle-sin(angle))/(square*angle);
    skew := RGBDUncertaintySkew(vector);
    jacobian := identity(3)-a*skew+b*(skew*skew);
  end RightJacobian;

  // SPD12,22 RHS, dimensionless equilibration. A strictly positive pivot is
  // required; no retained jitter, diagonal floor or inverse approximation.
  function Solve
    input Real A[12,12]; input Real B[12,22];
    output Real X[12,22]; output Boolean valid;
  protected
    Real scale[12]; Real lower[12,12]; Real forward[12]; Real backward[12];
    Real value; Real residual; Real magnitude;
  algorithm
    X := zeros(12,22); lower := zeros(12,12); scale := ones(12);
    forward := zeros(12); backward := zeros(12); valid := true;
    for i in 1:12 loop
      valid := valid and A[i,i] > 0 and A[i,i] <= 1e12;
      if A[i,i] > 0 and A[i,i] <= 1e12 then scale[i] := sqrt(A[i,i]); end if;
      for j in 1:12 loop
        valid := valid and abs(A[i,j]) <= 1e12
          and abs(A[i,j]-A[j,i]) <= 1e-12*max(1.0,abs(A[i,j])+abs(A[j,i]));
      end for;
      for rhs in 1:22 loop valid := valid and abs(B[i,rhs]) <= 1e12; end for;
    end for;
    if valid then
      for i in 1:12 loop
        for j in 1:i loop
          value := A[i,j]/scale[i]/scale[j];
          for k in 1:j-1 loop value := value-lower[i,k]*lower[j,k]; end for;
          if j == i then
            valid := valid and value > 0 and value <= 1e12;
            lower[i,i] := sqrt(if value > 0 and value <= 1e12 then value else 1.0);
          else
            lower[i,j] := value/lower[j,j];
          end if;
        end for;
      end for;
    end if;
    if valid then
      for rhs in 1:22 loop
        for i in 1:12 loop
          value := B[i,rhs]/scale[i];
          for j in 1:i-1 loop value := value-lower[i,j]*forward[j]; end for;
          forward[i] := value/lower[i,i];
        end for;
        for reverse in 1:12 loop
          value := forward[13-reverse];
          for j in 14-reverse:12 loop value := value-lower[j,13-reverse]*backward[j]; end for;
          backward[13-reverse] := value/lower[13-reverse,13-reverse];
        end for;
        for i in 1:12 loop X[i,rhs] := backward[i]/scale[i]; end for;
      end for;
      for i in 1:12 loop for rhs in 1:22 loop
        residual := -B[i,rhs]; magnitude := abs(B[i,rhs]);
        for j in 1:12 loop
          residual := residual+A[i,j]*X[j,rhs]; magnitude := magnitude+abs(A[i,j]*X[j,rhs]);
        end for;
        valid := valid and abs(X[i,rhs]) <= 1e12 and abs(residual) <= 1e-9*max(1.0,magnitude);
      end for; end for;
    end if;
    if not valid then X := zeros(12,22); end if;
  end Solve;

  function Correct
    input State previous;
    input GraphGaugeUncertainty.Estimate graph;
    input GraphGaugeUncertainty.Binding expectedBinding;
    input Attempt previousAttempt;
    input Policy policy;
    input Boolean requested;
    output Result result;
  protected
    Boolean valid; Boolean logValid; Boolean solveValid; Boolean sameCapture;
    Integer count; Integer offset; Integer stateOffset;
    Real prior[21,21]; Real weightedPrior[21,21]; Real Q[12,12]; Real noiseMap[12,12];
    Real H[12,21]; Real innovation[12]; Real graphRotation[3,3]; Real priorRotation[3,3];
    Real logVector[3]; Real leftInverse[3,3]; Real rightInverse[3,3];
    Real cross[21,12]; Real S[12,12]; Real rhs[12,22]; Real solved[12,22];
    Real K[21,12]; Real delta[21]; Real A[21,21]; Real beforeReset[21,21];
    Real reset[21,21]; Real proposedCovariance[21,21]; State candidate;
  algorithm
    result.next := previous; result.accepted := false; result.reason := 1;
    result.attempted := false; result.nextAttempt := previousAttempt;
    result.innovation := zeros(12); result.measurementJacobian := zeros(12,21);
    result.noise := zeros(12,12); result.gain := zeros(21,12); result.correction := zeros(21);
    result.nis := 0; result.covarianceBeforeReset := zeros(21,21); result.resetJacobian := identity(21);
    if requested then
      sameCapture := GraphGaugeUncertainty.SameCapture(graph.binding);
      result.reason := 2;
      valid := GraphGaugeUncertainty.ValidBinding(graph.binding)
        and GraphGaugeUncertainty.SameBinding(graph.binding,expectedBinding)
        and previous.generation == graph.binding.generation
        and previous.sourceRevision == graph.binding.sourceRevision
        and previous.currentId == graph.binding.currentId and previous.currentEpoch == graph.binding.currentEpoch
        and previous.currentCaptureSequence == graph.binding.currentCaptureSequence
        and previous.predictionTime == graph.binding.currentTime
        and (previous.referenceAvailable or not previous.referenceUsed)
        and previousAttempt.generation == previous.generation and previousAttempt.graphRevision >= 0
        and (if previousAttempt.graphRevision == 0 then previousAttempt.factorProvenance == 0
          else previousAttempt.factorProvenance > 0)
        and graph.binding.graphRevision > previousAttempt.graphRevision
        and graph.binding.factorProvenance <> previousAttempt.factorProvenance;
      if previous.referenceAvailable then
        valid := valid and previous.referenceId == graph.binding.referenceId
          and previous.referenceEpoch == graph.binding.referenceEpoch
          and previous.referenceCaptureSequence == graph.binding.referenceCaptureSequence
          and previous.referenceTime == graph.binding.referenceTime
          and previous.lastUsedEpoch >= -1 and previous.lastUsedEpoch <= previous.currentEpoch
          and (if previous.referenceUsed then previous.referenceEpoch <= previous.lastUsedEpoch
            else previous.referenceEpoch > previous.lastUsedEpoch);
      end if;
      if sameCapture then valid := valid and previous.referenceAvailable; end if;
      if valid then
        // Attempt metadata survives numerical refusal. The enclosing owner must
        // persist it separately from the rolled-back numerical tuple.
        result.attempted := true;
        result.nextAttempt.generation := previous.generation;
        result.nextAttempt.graphRevision := graph.binding.graphRevision;
        result.nextAttempt.factorProvenance := graph.binding.factorProvenance;
        result.reason := 3;
        valid := policy.weight > 0 and policy.weight < 1
          and policy.maximumPositionInnovation > 0 and policy.maximumPositionInnovation <= 1e6
          and policy.maximumAngularInnovation > 0 and policy.maximumAngularInnovation < 3.140592653589793
          and policy.maximumPositionCorrection > 0 and policy.maximumPositionCorrection <= 1e6
          and policy.maximumAngularCorrection > 0 and policy.maximumAngularCorrection < 3.140592653589793
          and policy.maximumNis > 0 and policy.maximumNis <= 1e12;
      end if;
      if valid then
        result.reason := 4;
        valid := RGBDUncertaintyProper(previous.rotation) and RGBDUncertaintyProper(graph.rotations[1,:,:]);
        for i in 1:3 loop
          valid := valid and abs(previous.position[i]) <= 1e6 and abs(previous.velocity[i]) <= 1e6
            and abs(previous.accelBias[i]) <= 2 and abs(previous.gyroBias[i]) <= 0.3
            and abs(graph.positions[1,i]) <= 1e6;
        end for;
        if previous.referenceAvailable then
          valid := valid and RGBDUncertaintyProper(previous.referenceRotation)
            and RGBDUncertaintyProper(graph.rotations[2,:,:]);
          for i in 1:3 loop
            valid := valid and abs(previous.referencePosition[i]) <= 1e6 and abs(graph.positions[2,i]) <= 1e6;
          end for;
        end if;
      end if;
      if valid then
        result.reason := 5; prior := zeros(21,21);
        prior[1:15,1:15] := previous.covariance;
        if previous.referenceAvailable then
          prior[1:15,16:21] := previous.crossCovariance;
          prior[16:21,1:15] := transpose(previous.crossCovariance);
          prior[16:21,16:21] := previous.referenceCovariance;
          valid := SLAMCovariancePSDCheck(prior,1e-12) == 1
            and SLAMCovariancePSDCheck(graph.covariance,1e-12) == 1;
        else
          valid := SLAMCovariancePSDCheck(previous.covariance,1e-12) == 1
            and SLAMCovariancePSDCheck(graph.covariance[1:6,1:6],1e-12) == 1;
        end if;
      end if;
      if valid and sameCapture then
        result.reason := 5;
        valid := ExactClone(previous) and GraphGaugeUncertainty.CloneEstimate(graph);
      end if;
      if valid then
        result.reason := 6; H := zeros(12,21); noiseMap := zeros(12,12); innovation := zeros(12);
        count := if previous.referenceAvailable and not sameCapture then 2 else 1;
        for node in 1:count loop
          offset := 6*(node-1); stateOffset := if node == 1 then 0 else 15;
          priorRotation := if node == 1 then previous.rotation else previous.referenceRotation;
          graphRotation := graph.rotations[node,:,:];
          (logVector,logValid) := Log(transpose(priorRotation)*graphRotation);
          valid := valid and logValid and sum(logVector.^2) <= policy.maximumAngularInnovation^2;
          innovation[offset+1:offset+3] := graph.positions[node,:]
            -(if node == 1 then previous.position else previous.referencePosition);
          innovation[offset+4:offset+6] := logVector;
          valid := valid and sum(innovation[offset+1:offset+3].^2) <= policy.maximumPositionInnovation^2;
          leftInverse := InverseJacobian(logVector,false); rightInverse := InverseJacobian(logVector,true);
          H[offset+1:offset+3,stateOffset+1:stateOffset+3] := identity(3);
          H[offset+4:offset+6,stateOffset+(if node == 1 then 7 else 4):stateOffset+(if node == 1 then 9 else 6)] := leftInverse;
          noiseMap[offset+1:offset+3,offset+1:offset+3] := identity(3);
          noiseMap[offset+4:offset+6,offset+4:offset+6] := rightInverse;
        end for;
      end if;
      if valid then
        Q := zeros(12,12);
        if previous.referenceAvailable and not sameCapture then
          Q := noiseMap*graph.covariance*transpose(noiseMap);
        else
          Q[1:6,1:6] := noiseMap[1:6,1:6]*graph.covariance[1:6,1:6]*transpose(noiseMap[1:6,1:6]);
          // Neutral solver padding for current-only or one same-capture pose,
          // neither an extra reference observation nor retained
          // covariance. Zero H/K rows make this identical to the six-row solve.
          Q[7:12,7:12] := identity(6);
        end if;
        weightedPrior := prior/policy.weight; cross := weightedPrior*transpose(H);
        S := H*cross+Q/(1-policy.weight);
        rhs[:,1:21] := transpose(cross); rhs[:,22] := innovation;
        (solved,solveValid) := Solve(S,rhs);
        result.reason := 7; valid := solveValid;
      end if;
      if valid then
        K := transpose(solved[:,1:21]);
        if policy.constrainVelocityAndBias then
          K[4:6,:] := zeros(3,12); K[10:15,:] := zeros(6,12);
        end if;
        delta := K*innovation;
        result.innovation := innovation; result.measurementJacobian := H; result.noise := Q;
        result.gain := K; result.correction := delta; result.nis := sum(innovation.*solved[:,22]);
        result.reason := 8;
        valid := result.nis >= 0 and result.nis <= policy.maximumNis;
        for i in 1:21 loop valid := valid and abs(delta[i]) <= 1e6; end for;
        valid := valid and sum(delta[1:3].^2) <= policy.maximumPositionCorrection^2
          and sum(delta[7:9].^2) <= policy.maximumAngularCorrection^2;
        if previous.referenceAvailable then
          valid := valid and sum(delta[16:18].^2) <= policy.maximumPositionCorrection^2
            and sum(delta[19:21].^2) <= policy.maximumAngularCorrection^2;
        end if;
      end if;
      if valid then
        candidate := previous;
        candidate.position := previous.position+delta[1:3]; candidate.velocity := previous.velocity+delta[4:6];
        candidate.rotation := previous.rotation*Exp(delta[7:9]);
        candidate.accelBias := previous.accelBias+delta[10:12]; candidate.gyroBias := previous.gyroBias+delta[13:15];
        if previous.referenceAvailable then
          candidate.referencePosition := previous.referencePosition+delta[16:18];
          candidate.referenceRotation := previous.referenceRotation*Exp(delta[19:21]);
        end if;
        result.reason := 9; valid := RGBDUncertaintyProper(candidate.rotation);
        for i in 1:3 loop
          valid := valid and abs(candidate.position[i]) <= 1e6 and abs(candidate.velocity[i]) <= 1e6
            and abs(candidate.accelBias[i]) <= 2 and abs(candidate.gyroBias[i]) <= 0.3;
        end for;
        if previous.referenceAvailable then
          valid := valid and RGBDUncertaintyProper(candidate.referenceRotation);
          for i in 1:3 loop valid := valid and abs(candidate.referencePosition[i]) <= 1e6; end for;
        end if;
      end if;
      if valid then
        A := identity(21)-K*H;
        beforeReset := A*weightedPrior*transpose(A)+K*(Q/(1-policy.weight))*transpose(K);
        reset := identity(21); reset[7:9,7:9] := RightJacobian(delta[7:9]);
        if previous.referenceAvailable then reset[19:21,19:21] := RightJacobian(delta[19:21]); end if;
        proposedCovariance := reset*beforeReset*transpose(reset);
        proposedCovariance := (proposedCovariance+transpose(proposedCovariance))/2;
        result.covarianceBeforeReset := beforeReset; result.resetJacobian := reset;
        result.reason := 10;
        valid := SLAMCovariancePSDCheck(proposedCovariance,1e-12) == 1;
        if valid and sameCapture then
          // Validate full21 result closure before the structural clone map
          // C=[I15; selected6]. Only NEW corrected Pcc/means are retained.
          for i in 1:3 loop
            valid := valid and abs(candidate.referencePosition[i]-candidate.position[i])
              <= 1e-11*(1+max(abs(candidate.referencePosition[i]),abs(candidate.position[i])));
            for j in 1:3 loop valid := valid and abs(candidate.referenceRotation[i,j]-candidate.rotation[i,j]) <= 1e-11; end for;
          end for;
          for i in 1:15 loop for j in 1:6 loop
            valid := valid and abs(proposedCovariance[i,j+15]-proposedCovariance[i,poseIndices[j]])
              <= 1e-11*(1+max(abs(proposedCovariance[i,j+15]),abs(proposedCovariance[i,poseIndices[j]])));
          end for; end for;
          for i in 1:6 loop for j in 1:6 loop
            valid := valid and abs(proposedCovariance[i+15,j+15]-proposedCovariance[poseIndices[i],poseIndices[j]])
              <= 1e-11*(1+max(abs(proposedCovariance[i+15,j+15]),abs(proposedCovariance[poseIndices[i],poseIndices[j]])));
          end for; end for;
          if valid then
            candidate.referencePosition := candidate.position; candidate.referenceRotation := candidate.rotation;
            for i in 1:15 loop for j in 1:6 loop
              proposedCovariance[i,j+15] := proposedCovariance[i,poseIndices[j]];
              proposedCovariance[j+15,i] := proposedCovariance[poseIndices[j],i];
            end for; end for;
            for i in 1:6 loop for j in 1:6 loop
              proposedCovariance[i+15,j+15] := proposedCovariance[poseIndices[i],poseIndices[j]];
            end for; end for;
            valid := SLAMCovariancePSDCheck(proposedCovariance,1e-12) == 1;
          end if;
        end if;
        if valid then
          candidate.covariance := proposedCovariance[1:15,1:15];
          if previous.referenceAvailable then
            candidate.crossCovariance := proposedCovariance[1:15,16:21];
            candidate.referenceCovariance := proposedCovariance[16:21,16:21];
          end if;
          result.next := candidate; result.accepted := true; result.reason := 0;
        end if;
      end if;
    end if;
  end Correct;
end SchmidtGraphPoseCorrection;

// Staged graph/map/filter publication. Raw captures and measured edges never
// change during correction. Graph pose means have a separate versioned owner.
// Geometry-only map outputs are not independent filter measurements.
package RGBDGraphEstimatorCommit
  constant Integer nodeCapacity = RGBDKeyframes.keyframeCapacity;
  constant Integer dimension = RGBDKeyframes.dimension;
  constant Integer identifierLimit = RGBDKeyframes.identifierLimit;

  record PoseView
    Integer generation; Integer sourceRevision; Integer revision; Integer catalogNextId;
    Boolean enabled[nodeCapacity]; Integer ids[nodeCapacity];
    Real positions[nodeCapacity,dimension]; Real rotations[nodeCapacity,dimension,dimension];
  end PoseView;

  record State
    RGBDLocalizationCatalog.State localization;
    PoseView poses;
    Integer correctionRevision; Integer graphRevisionUsed;
  end State;

  record Proposal
    PoseView poses;
    GraphGaugeUncertainty.Estimate selected;
    Integer graphRevision;
    Boolean optimizerAccepted;
  end Proposal;

  record Result
    State next;
    Boolean accepted; Integer reason;
    Boolean attempted; SchmidtGraphPoseCorrection.Attempt nextAttempt;
    Boolean filterAccepted; Integer filterReason;
    Integer mapReason; Integer reprojectionReason;
    Integer projectedCount; Integer prunedCount;
  end Result;

  function FromLocalization
    input RGBDLocalizationCatalog.State localization;
    output State result;
  algorithm
    // Bootstrap only. Reconstructing this view from raw captures after a graph
    // correction would erase accepted pose means and is not a restore operation.
    result.localization := localization;
    result.poses.generation := localization.generation;
    result.poses.sourceRevision := localization.sourceRevision;
    result.poses.revision := 0; result.poses.catalogNextId := localization.catalog.nextId;
    result.poses.enabled := localization.catalog.occupied; result.poses.ids := localization.catalog.ids;
    result.poses.positions := localization.catalog.bodyPositions;
    result.poses.rotations := localization.catalog.bodyRotations;
    result.correctionRevision := 0; result.graphRevisionUsed := 0;
  end FromLocalization;

  function ValidView
    input RGBDKeyframes.Catalog catalog;
    input PoseView poses;
    input Integer sourceRevision;
    output Boolean valid;
  algorithm
    valid := RGBDKeyframes.ValidHeader(catalog)
      and poses.generation == catalog.generation and poses.sourceRevision == sourceRevision
      and sourceRevision >= 1 and sourceRevision <= identifierLimit
      and poses.revision >= 0 and poses.revision < identifierLimit
      and poses.catalogNextId == catalog.nextId;
    for slot in 1:nodeCapacity loop
      valid := valid and poses.enabled[slot] == catalog.occupied[slot];
      if poses.enabled[slot] then
        valid := valid and poses.ids[slot] == catalog.ids[slot]
          and RGBDUncertaintyProper(poses.rotations[slot,:,:]);
        for axis in 1:dimension loop valid := valid and abs(poses.positions[slot,axis]) <= 1e6; end for;
      end if;
    end for;
  end ValidView;

  function EstimatorState
    input RGBDLocalizationCatalog.State localization;
    output SchmidtGraphPoseCorrection.State result;
  protected
    Integer slot;
  algorithm
    // Caller validates headers, exact Real integer domains and reference birth
    // before this conversion; no projection, registration or host algebra.
    result.position := localization.estimator.position; result.velocity := localization.estimator.velocity;
    result.rotation := localization.estimator.rotation;
    result.accelBias := localization.estimator.accelBias; result.gyroBias := localization.estimator.gyroBias;
    result.covariance := localization.estimator.covariance;
    result.crossCovariance := localization.estimator.crossCovariance;
    result.referenceCovariance := localization.estimator.referenceCovariance;
    result.referencePosition := localization.estimator.referencePosition;
    result.referenceRotation := localization.estimator.referenceRotation;
    result.referenceAvailable := localization.estimator.referenceAvailable == 1;
    result.referenceUsed := localization.estimator.referenceUsed == 1;
    result.generation := localization.generation; result.sourceRevision := localization.sourceRevision;
    result.currentId := localization.catalog.nextId-1;
    result.currentEpoch := localization.lastProcessedImageEpoch;
    result.currentCaptureSequence := localization.steps;
    result.referenceId := localization.referenceBirth.catalogId;
    result.referenceEpoch := localization.referenceBirth.epoch;
    result.referenceCaptureSequence := localization.referenceBirth.sequence;
    result.lastUsedEpoch := integer(localization.estimator.lastUsedEpoch);
    result.predictionTime := localization.predictionTime; result.referenceTime := 0;
    if result.referenceAvailable then
      slot := mod(result.referenceId-1,nodeCapacity)+1;
      result.referenceTime := localization.catalog.imageTimes[slot];
    end if;
  end EstimatorState;

  function Commit
    input State previous;
    input Proposal proposal;
    input GraphGaugeUncertainty.Binding expectedBinding;
    input SchmidtGraphPoseCorrection.Attempt previousAttempt;
    input SchmidtGraphPoseCorrection.Policy policy;
    input Boolean requested;
    input Real consistencyTolerance = 1e-6;
    input Real maximumConfidence = 8;
    output Result result;
  protected
    Boolean valid; Boolean changed; Boolean mapAccepted;
    Integer currentSlot; Integer referenceSlot; Integer anchorSlot;
    SchmidtGraphPoseCorrection.State filterState;
    SchmidtGraphPoseCorrection.Result filterResult;
    State candidate;
  algorithm
    result.next := previous; result.accepted := false; result.reason := 1;
    result.attempted := false; result.nextAttempt := previousAttempt;
    result.filterAccepted := false; result.filterReason := 0;
    result.mapReason := 0; result.reprojectionReason := 0;
    result.projectedCount := 0; result.prunedCount := 0;
    if requested then
      result.reason := 2;
      valid := RGBDLocalizationCatalog.ValidHeader(previous.localization)
        and previous.localization.initialized
        and RGBDLocalizationCatalog.ValidEstimator(previous.localization.estimator)
        and ValidView(previous.localization.catalog,previous.poses,previous.localization.sourceRevision)
        and previous.correctionRevision >= 0 and previous.correctionRevision < identifierLimit
        and previous.graphRevisionUsed >= 0 and previous.graphRevisionUsed <= previous.localization.graph.revision
        and previous.correctionRevision <= previous.graphRevisionUsed
        and ((previous.correctionRevision == 0) == (previous.graphRevisionUsed == 0))
        and previous.localization.catalog.nextId > 2
        and previous.localization.lastProcessedImageEpoch == previous.localization.catalog.lastEpoch
        and previous.localization.lastProcessedImageTime == previous.localization.catalog.lastTime
        and previous.localization.predictionTime == previous.localization.catalog.lastTime
        and GraphGaugeUncertainty.ValidBinding(proposal.selected.binding)
        and GraphGaugeUncertainty.SameBinding(proposal.selected.binding,expectedBinding)
        and proposal.graphRevision == previous.localization.graph.revision
        and expectedBinding.graphRevision == proposal.graphRevision
        and expectedBinding.catalogPoseRevision == previous.poses.revision
        and expectedBinding.generation == previous.localization.generation
        and expectedBinding.sourceRevision == previous.localization.sourceRevision
        and expectedBinding.currentId == previous.localization.catalog.nextId-1
        and expectedBinding.currentEpoch == previous.localization.lastProcessedImageEpoch
        and expectedBinding.currentTime == previous.localization.predictionTime
        and expectedBinding.currentCaptureSequence == previous.localization.steps
        and expectedBinding.anchorId == max(1,previous.localization.catalog.nextId-nodeCapacity)
        and previousAttempt.generation == previous.localization.generation
        and previousAttempt.graphRevision >= previous.graphRevisionUsed
        and (if previousAttempt.graphRevision == 0 then previousAttempt.factorProvenance == 0
          else previousAttempt.factorProvenance > 0)
        and proposal.graphRevision > previousAttempt.graphRevision
        and proposal.selected.binding.factorProvenance <> previousAttempt.factorProvenance;
      if valid then
        currentSlot := mod(expectedBinding.currentId-1,nodeCapacity)+1;
        referenceSlot := mod(expectedBinding.referenceId-1,nodeCapacity)+1;
        anchorSlot := mod(expectedBinding.anchorId-1,nodeCapacity)+1;
        valid := RGBDGraphMeasurements.Bound(previous.localization.catalog,expectedBinding.referenceId,
            referenceSlot,expectedBinding.referenceEpoch)
          and RGBDGraphMeasurements.Bound(previous.localization.catalog,expectedBinding.anchorId,
            anchorSlot,expectedBinding.anchorEpoch)
          and expectedBinding.referenceTime == previous.localization.catalog.imageTimes[referenceSlot]
          and expectedBinding.anchorTime == previous.localization.catalog.imageTimes[anchorSlot];
        if previous.localization.estimator.referenceAvailable == 1 then
          valid := valid and previous.localization.referenceBirth.catalogId == expectedBinding.referenceId
            and previous.localization.referenceBirth.epoch == expectedBinding.referenceEpoch
            and previous.localization.referenceBirth.sequence == expectedBinding.referenceCaptureSequence;
        end if;
      end if;
      if valid then
        result.attempted := true;
        result.nextAttempt.generation := previous.localization.generation;
        result.nextAttempt.graphRevision := proposal.graphRevision;
        result.nextAttempt.factorProvenance := proposal.selected.binding.factorProvenance;
        result.reason := 3;
        valid := proposal.optimizerAccepted
          and RGBDGraphMeasurements.ValidState(previous.localization.catalog,previous.localization.graph)
          and ValidView(previous.localization.catalog,proposal.poses,previous.localization.sourceRevision)
          and consistencyTolerance > 0 and consistencyTolerance <= 1e-6
          and maximumConfidence >= 2 and maximumConfidence <= 100 and floor(maximumConfidence) == maximumConfidence;
      end if;
      if valid then
        result.reason := 4; changed := false;
        for slot in 1:nodeCapacity loop
          if previous.poses.enabled[slot] then
            for axis in 1:dimension loop
              changed := changed or proposal.poses.positions[slot,axis] <> previous.poses.positions[slot,axis];
              for column in 1:dimension loop
                changed := changed or proposal.poses.rotations[slot,axis,column] <> previous.poses.rotations[slot,axis,column];
              end for;
            end for;
          end if;
        end for;
        valid := proposal.poses.revision == previous.poses.revision+(if changed then 1 else 0);
        // The optimizer fixes the chronological first row in the same ENU gauge.
        for axis in 1:dimension loop
          valid := valid and proposal.poses.positions[anchorSlot,axis] == previous.poses.positions[anchorSlot,axis];
          for column in 1:dimension loop
            valid := valid and proposal.poses.rotations[anchorSlot,axis,column] == previous.poses.rotations[anchorSlot,axis,column];
          end for;
        end for;
        for node in 1:2 loop
          for axis in 1:dimension loop
            valid := valid and abs(proposal.selected.positions[node,axis]
              -proposal.poses.positions[if node == 1 then currentSlot else referenceSlot,axis]) <= consistencyTolerance;
            for column in 1:dimension loop
              valid := valid and abs(proposal.selected.rotations[node,axis,column]
                -proposal.poses.rotations[if node == 1 then currentSlot else referenceSlot,axis,column]) <= consistencyTolerance;
            end for;
          end for;
        end for;
      end if;
      if valid then
        filterState := EstimatorState(previous.localization);
        filterResult := SchmidtGraphPoseCorrection.Correct(filterState,proposal.selected,expectedBinding,
          previousAttempt,policy,true);
        result.filterAccepted := filterResult.accepted; result.filterReason := filterResult.reason;
        result.reason := 5; valid := filterResult.accepted;
      end if;
      if valid then
        candidate := previous; candidate.poses.revision := proposal.poses.revision;
        for slot in 1:nodeCapacity loop
          if previous.poses.enabled[slot] then
            candidate.poses.positions[slot,:] := proposal.poses.positions[slot,:];
            candidate.poses.rotations[slot,:,:] := proposal.poses.rotations[slot,:,:];
          end if;
        end for;
        candidate.localization.estimator.position := filterResult.next.position;
        candidate.localization.estimator.velocity := filterResult.next.velocity;
        candidate.localization.estimator.rotation := filterResult.next.rotation;
        candidate.localization.estimator.accelBias := filterResult.next.accelBias;
        candidate.localization.estimator.gyroBias := filterResult.next.gyroBias;
        candidate.localization.estimator.covariance := filterResult.next.covariance;
        candidate.localization.estimator.crossCovariance := filterResult.next.crossCovariance;
        candidate.localization.estimator.referenceCovariance := filterResult.next.referenceCovariance;
        candidate.localization.estimator.referencePosition := filterResult.next.referencePosition;
        candidate.localization.estimator.referenceRotation := filterResult.next.referenceRotation;
        // Preserve acquisition clocks, raw capture poses/noise/calibration,
        // every descriptor, all measured edges and the consumed-image ledger.
        (candidate.localization.map.point,candidate.localization.map.occupied,candidate.localization.map.confidence,
          candidate.localization.map.lastSeen,candidate.localization.map.lastFrame,candidate.localization.map.localPoint,
          candidate.localization.map.anchorId,candidate.localization.map.anchorSlot,
          mapAccepted,result.mapReason,result.reprojectionReason,result.projectedCount,result.prunedCount) :=
          RGBDLandmarkCatalog.Synchronize(
            previous.localization.map.point,previous.localization.map.occupied,previous.localization.map.confidence,
            previous.localization.map.lastSeen,previous.localization.map.lastFrame,previous.localization.map.localPoint,
            previous.localization.map.anchorId,previous.localization.map.anchorSlot,
            previous.localization.map.generation,previous.poses.revision,
            previous.poses.enabled,previous.poses.ids,previous.poses.positions,previous.poses.rotations,
            proposal.poses.enabled,proposal.poses.ids,proposal.poses.positions,proposal.poses.rotations,
            previous.localization.generation,proposal.poses.revision,true,true,false,
            previous.localization.map.imageTime,previous.localization.map.frame,maximumConfidence,1e6,consistencyTolerance);
        result.reason := 6; valid := mapAccepted;
        if valid then
          candidate.correctionRevision := previous.correctionRevision+1;
          candidate.graphRevisionUsed := proposal.graphRevision;
          result.reason := 7;
          valid := RGBDLocalizationCatalog.ValidHeader(candidate.localization)
            and RGBDLocalizationCatalog.ValidEstimator(candidate.localization.estimator);
          if valid then result.next := candidate; result.accepted := true; result.reason := 0; end if;
        end if;
      end if;
    end if;
    if not result.accepted then result.projectedCount := 0; result.prunedCount := 0; end if;
  end Commit;
end RGBDGraphEstimatorCommit;

// Full-capacity selected covariance of the FINAL undamped pose-graph linearization.
// Exact-real variational/tree bound; ordinary floating evaluation is explicitly
// not an outward-rounded certificate. No optimizer damping is statistical noise.
package ModelicaPoseGraphCovariance
  constant Integer nodeCapacity=128;
  constant Integer edgeCapacity=256;
  constant Integer poseDimension=6;
  constant Integer selectedDimension=12;
  constant Integer maximumIterations=96;

  record Result
    Real upper[selectedDimension,selectedDimension];
    Real lower[selectedDimension,selectedDimension];
    Real residualUpper[selectedDimension,selectedDimension];
    Boolean accepted;
    Integer status "0 idle;1 numerical result;-1 config/selection;-2 graph;-3 tree/pivot;-4 chart;-5 arithmetic";
    Integer iterations[selectedDimension];
    Boolean converged[selectedDimension];
    Real residualNorm[selectedDimension];
    Integer treeEdges;
    Integer activeNodes;
    Boolean roundoffCertified "Always false: no directed-rounding enclosure in this profile";
  end Result;

  record Tree
    Integer parent[nodeCapacity];
    Integer order[nodeCapacity];
    Integer count;
    Real childInverse[nodeCapacity,poseDimension,poseDimension];
    Real parentJacobian[nodeCapacity,poseDimension,poseDimension];
    Real weightFactor[nodeCapacity,poseDimension,poseDimension];
    Boolean valid;
  end Tree;

  record Coarse
    Real basis[nodeCapacity,poseDimension,poseDimension];
    Real product[nodeCapacity,poseDimension,poseDimension];
    Real factor[poseDimension,poseDimension];
    Boolean valid;
  end Coarse;

  function EmptyCoarse
    output Coarse coarse;
  algorithm
    coarse.basis:=zeros(nodeCapacity,poseDimension,poseDimension);
    coarse.product:=zeros(nodeCapacity,poseDimension,poseDimension);
    coarse.factor:=zeros(poseDimension,poseDimension); coarse.valid:=false;
  end EmptyCoarse;

  function Empty
    output Result result;
  algorithm
    result.upper:=zeros(selectedDimension,selectedDimension);
    result.lower:=zeros(selectedDimension,selectedDimension);
    result.residualUpper:=zeros(selectedDimension,selectedDimension);
    result.accepted:=false; result.status:=0;
    result.iterations:=fill(0,selectedDimension); result.converged:=fill(false,selectedDimension);
    result.residualNorm:=zeros(selectedDimension); result.treeEdges:=0; result.activeNodes:=0;
    result.roundoffCertified:=false;
  end Empty;

  // Checked small general inverse. Child Jacobians are not SPD matrices.
  // The inverse closure is a numerical rank diagnostic, not rounded interval proof.
  function Inverse6
    input Real A[poseDimension,poseDimension];
    output Real inverse[poseDimension,poseDimension];
    output Boolean valid;
  protected
    Real work[poseDimension,poseDimension]; Real scale; Real pivot; Real swap;
    Real largest; Real factor; Real closure; Integer selected;
  algorithm
    inverse:=identity(poseDimension); work:=A; scale:=0.0; valid:=true;
    pivot:=0.0; swap:=0.0; largest:=0.0; factor:=0.0; closure:=0.0; selected:=1;
    for row in 1:poseDimension loop
      for column in 1:poseDimension loop
        valid:=valid and abs(A[row,column])<=1e18;
        scale:=max(scale,abs(A[row,column]));
      end for;
    end for;
    valid:=valid and scale>1e-12;
    for column in 1:poseDimension loop
      if valid then
        selected:=column; largest:=abs(work[column,column]);
        for row in 1:poseDimension loop
          if row>column and abs(work[row,column])>largest then
            selected:=row; largest:=abs(work[row,column]);
          end if;
        end for;
        valid:=largest>1e-12*scale and largest<=1e18;
        if valid then
          for k in 1:poseDimension loop
            swap:=work[column,k]; work[column,k]:=work[selected,k]; work[selected,k]:=swap;
            swap:=inverse[column,k]; inverse[column,k]:=inverse[selected,k]; inverse[selected,k]:=swap;
          end for;
          pivot:=work[column,column];
          for k in 1:poseDimension loop
            work[column,k]:=work[column,k]/pivot; inverse[column,k]:=inverse[column,k]/pivot;
          end for;
          for row in 1:poseDimension loop
            if row<>column then
              factor:=work[row,column];
              for k in 1:poseDimension loop
                work[row,k]:=work[row,k]-factor*work[column,k];
                inverse[row,k]:=inverse[row,k]-factor*inverse[column,k];
              end for;
            end if;
          end for;
        end if;
      end if;
    end for;
    for row in 1:poseDimension loop
      for column in 1:poseDimension loop
        closure:=sum(inverse[row,k]*A[k,column] for k in 1:poseDimension)
          -(if row==column then 1.0 else 0.0);
        valid:=valid and abs(closure)<1e-8 and abs(inverse[row,column])<=1e18;
      end for;
    end for;
    if not valid then inverse:=zeros(poseDimension,poseDimension); end if;
  end Inverse6;

  function BuildTree
    input Real nodeMask[nodeCapacity]; input Real edgeMask[edgeCapacity];
    input Integer source[edgeCapacity]; input Integer target[edgeCapacity];
    input Real Ji[edgeCapacity,poseDimension,poseDimension];
    input Real Jj[edgeCapacity,poseDimension,poseDimension];
    input Real information[edgeCapacity,poseDimension,poseDimension];
    output Tree tree;
  protected
    Boolean reached[nodeCapacity]; Boolean layer[nodeCapacity]; Boolean inverseValid; Boolean weightValid;
    Integer parent; Integer child; Real childJacobian[poseDimension,poseDimension];
    Real parentJacobian[poseDimension,poseDimension]; Real inverse[poseDimension,poseDimension];
    Real weight[poseDimension,poseDimension];
  algorithm
    tree.parent:=fill(0,nodeCapacity); tree.order:=fill(1,nodeCapacity); tree.count:=0;
    tree.childInverse:=zeros(nodeCapacity,poseDimension,poseDimension);
    tree.parentJacobian:=zeros(nodeCapacity,poseDimension,poseDimension);
    tree.weightFactor:=zeros(nodeCapacity,poseDimension,poseDimension); tree.valid:=true;
    reached:=fill(false,nodeCapacity); reached[1]:=true; layer:=reached; parent:=1; child:=1;
    childJacobian:=zeros(poseDimension,poseDimension); parentJacobian:=childJacobian;
    inverse:=childJacobian; weight:=childJacobian; inverseValid:=false; weightValid:=false;
    for pass in 1:nodeCapacity loop
      // Only vertices reached before this pass can parent new vertices. Keeping
      // the discovery layer fixed avoids selecting an entire long chain before
      // any shortcut edge is examined. Original edge order breaks equal-depth
      // ties; every factor remains in the full undamped information operator.
      layer:=reached;
      for edge in 1:edgeCapacity loop
        if tree.valid and edgeMask[edge]==1.0 then
          parent:=1; child:=1;
          if layer[source[edge]] and not reached[target[edge]] then
            parent:=source[edge]; child:=target[edge];
            childJacobian:=Jj[edge,:,:]; parentJacobian:=Ji[edge,:,:];
          elseif layer[target[edge]] and not reached[source[edge]] then
            parent:=target[edge]; child:=source[edge];
            childJacobian:=Ji[edge,:,:]; parentJacobian:=Jj[edge,:,:];
          end if;
          if child>1 then
            (inverse,inverseValid):=Inverse6(childJacobian);
            (weight,weightValid):=PGCholesky(information[edge,:,:],1e-10);
            tree.valid:=inverseValid and weightValid and tree.count<nodeCapacity-1;
            if tree.valid then
              reached[child]:=true; tree.count:=tree.count+1;
              tree.order[tree.count]:=child; tree.parent[child]:=parent;
              tree.childInverse[child,:,:]:=inverse;
              tree.parentJacobian[child,:,:]:=parentJacobian;
              tree.weightFactor[child,:,:]:=weight;
            end if;
          end if;
        end if;
      end for;
    end for;
    for node in 1:nodeCapacity loop tree.valid:=tree.valid and (nodeMask[node]==0.0 or reached[node]); end for;
  end BuildTree;

  // T' q=f, reversed discovery order, retaining each edge's original direction.
  function Backward
    input Real f[nodeCapacity,poseDimension]; input Tree tree;
    output Real q[nodeCapacity,poseDimension];
  protected
    Real pending[nodeCapacity,poseDimension]; Integer node; Integer parent;
  algorithm
    q:=zeros(nodeCapacity,poseDimension); pending:=f; pending[1,:]:=zeros(poseDimension);
    node:=1; parent:=1;
    for reverseIndex in 1:nodeCapacity loop
      if reverseIndex<=tree.count then
        node:=tree.order[tree.count+1-reverseIndex]; parent:=tree.parent[node];
        q[node,:]:=transpose(tree.childInverse[node,:,:])*pending[node,:];
        if parent>1 then pending[parent,:]:=pending[parent,:]-transpose(tree.parentJacobian[node,:,:])*q[node,:]; end if;
      end if;
    end for;
  end Backward;

  function TreeSolve
    input Real f[nodeCapacity,poseDimension]; input Tree tree;
    output Real x[nodeCapacity,poseDimension];
  protected
    Real q[nodeCapacity,poseDimension]; Real w[poseDimension]; Integer node;
  algorithm
    q:=Backward(f,tree); x:=zeros(nodeCapacity,poseDimension); w:=zeros(poseDimension); node:=1;
    for index in 1:nodeCapacity loop
      if index<=tree.count then
        node:=tree.order[index]; w:=PGSolveBlock(tree.weightFactor[node,:,:],q[node,:]);
        x[node,:]:=tree.childInverse[node,:,:]*(w-tree.parentJacobian[node,:,:]*x[tree.parent[node],:]);
      end if;
    end for;
  end TreeSolve;

  // Six global rigid-motion directions in the graph's world-p/right-local-angle
  // chart. The root and inactive rows stay zero; column normalization changes
  // the basis, not its span. H is the same full undamped operator used by PCG.
  function BuildCoarse
    input Real position[nodeCapacity,3]; input Real rotation[nodeCapacity,3,3];
    input Real nodeMask[nodeCapacity]; input Real edgeMask[edgeCapacity];
    input Integer source[edgeCapacity]; input Integer target[edgeCapacity];
    input Real Ji[edgeCapacity,poseDimension,poseDimension];
    input Real Jj[edgeCapacity,poseDimension,poseDimension];
    input Real information[edgeCapacity,poseDimension,poseDimension];
    output Coarse coarse;
  protected
    Real skew[3,3]; Real square; Real E[poseDimension,poseDimension]; Real value;
    Boolean factorValid;
  algorithm
    coarse:=EmptyCoarse(); skew:=zeros(3,3); square:=0.0;
    E:=zeros(poseDimension,poseDimension); value:=0.0; factorValid:=false; coarse.valid:=true;
    for node in 1:nodeCapacity loop
      if node>1 and nodeMask[node]==1.0 then
        skew:=PGSkew(position[node,:]-position[1,:]);
        for axis in 1:3 loop
          coarse.basis[node,axis,axis]:=1.0;
          for column in 1:3 loop
            coarse.basis[node,axis,column+3]:=-skew[axis,column];
            coarse.basis[node,axis+3,column+3]:=rotation[node,column,axis];
          end for;
        end for;
      end if;
    end for;
    for column in 1:poseDimension loop
      square:=PGDot(coarse.basis[:,:,column],coarse.basis[:,:,column]);
      coarse.valid:=coarse.valid and square>1e-24 and square<=1e100;
      if coarse.valid then coarse.basis[:,:,column]:=coarse.basis[:,:,column]/sqrt(square); end if;
    end for;
    if coarse.valid then
      for column in 1:poseDimension loop
        coarse.product[:,:,column]:=PGNormalProduct(coarse.basis[:,:,column],nodeMask,edgeMask,
          source,target,Ji,Jj,information,zeros(nodeCapacity,poseDimension),0.0);
      end for;
      for row in 1:poseDimension loop
        for column in 1:poseDimension loop
          value:=0.5*(PGDot(coarse.basis[:,:,row],coarse.product[:,:,column])
            +PGDot(coarse.basis[:,:,column],coarse.product[:,:,row]));
          E[row,column]:=value; coarse.valid:=coarse.valid and abs(value)<=1e100;
        end for;
      end for;
      if coarse.valid then
        (coarse.factor,factorValid):=PGCholesky(E,1e-12); coarse.valid:=factorValid;
      end if;
    end if;
    if not coarse.valid then coarse:=EmptyCoarse(); end if;
  end BuildCoarse;

  // C=ZKZ'+(I-ZKZ'H) TreeInverse (I-HZKZ'), K=(Z'HZ)^-1.
  // HZ is precomputed; no full H application occurs in this helper. The same
  // fixed factor is used on both sides, preserving the symmetric SPD contract.
  function BalancedSolve
    input Real f[nodeCapacity,poseDimension]; input Tree tree; input Coarse coarse;
    output Real x[nodeCapacity,poseDimension];
  protected
    Real coefficients[poseDimension]; Real correction[poseDimension];
    Real pending[nodeCapacity,poseDimension]; Real work[nodeCapacity,poseDimension];
  algorithm
    coefficients:=zeros(poseDimension); correction:=zeros(poseDimension);
    pending:=f; work:=zeros(nodeCapacity,poseDimension); x:=work;
    for column in 1:poseDimension loop coefficients[column]:=PGDot(coarse.basis[:,:,column],f); end for;
    coefficients:=PGSolveBlock(coarse.factor,coefficients);
    for column in 1:poseDimension loop pending:=pending-coarse.product[:,:,column]*coefficients[column]; end for;
    work:=TreeSolve(pending,tree);
    for column in 1:poseDimension loop correction[column]:=PGDot(coarse.product[:,:,column],work); end for;
    correction:=PGSolveBlock(coarse.factor,correction);
    x:=work;
    for column in 1:poseDimension loop x:=x+coarse.basis[:,:,column]*(coefficients[column]-correction[column]); end for;
  end BalancedSolve;

  constant Integer pairDimension = 2*poseDimension;
  constant Integer pairCapacity = div(nodeCapacity,2);
  record Pairs
    Real factor[pairCapacity,pairDimension,pairDimension];
    Boolean active[nodeCapacity];
    Boolean valid;
  end Pairs;
  function EmptyPairs
    output Pairs pairs;
  algorithm
    pairs.factor := zeros(pairCapacity,pairDimension,pairDimension);
    pairs.active := fill(false,nodeCapacity); pairs.valid := false;
  end EmptyPairs;
  function FactorPair
    input Real A[pairDimension,pairDimension];
    output Real L[pairDimension,pairDimension]; output Boolean valid;
  protected Real scale; Real value;
  algorithm
    L := zeros(pairDimension,pairDimension); scale := 0.0; value := 0.0; valid := true;
    for i in 1:pairDimension loop scale := max(scale,abs(A[i,i])); end for;
    valid := scale > 1e-12 and scale <= 1e18;
    for i in 1:pairDimension loop
      for j in 1:pairDimension loop
        valid := valid and abs(A[i,j]) <= 1e18 and abs(A[i,j]-A[j,i]) <= 1e-10*max(1.0,scale);
        value := A[i,j];
        for k in 1:pairDimension loop
          if j <= i and k < j then value := value-L[i,k]*L[j,k]; end if;
        end for;
        if j <= i then
          if i == j then
            valid := valid and value > 1e-12*scale and value <= 1e18;
            L[i,j] := sqrt(if value > 1e-12*scale and value <= 1e18 then value else 1.0);
          else L[i,j] := value/L[j,j]; end if;
        end if;
      end for;
    end for;
    if not valid then L := zeros(pairDimension,pairDimension); end if;
  end FactorPair;
  // Principal full-H blocks on free rows (2,3),(4,5),...,(128,padding).
  // Every active factor contributes diagonal terms; within-pair factors also
  // contribute both cross blocks. This changes only the numerical preconditioner.
  function BuildPairs
    input Real nodeMask[nodeCapacity]; input Real edgeMask[edgeCapacity];
    input Integer source[edgeCapacity]; input Integer target[edgeCapacity];
    input Real Ji[edgeCapacity,poseDimension,poseDimension];
    input Real Jj[edgeCapacity,poseDimension,poseDimension];
    input Real information[edgeCapacity,poseDimension,poseDimension];
    output Pairs pairs;
  protected
    Real blocks[pairCapacity,pairDimension,pairDimension]; Real normalBlock[poseDimension,poseDimension];
    Real left[poseDimension,poseDimension]; Real right[poseDimension,poseDimension];
    Real L[pairDimension,pairDimension]; Real paddingScale; Boolean factorValid;
    Integer a; Integer b; Integer pa; Integer pb; Integer oa; Integer ob; Integer node;
  algorithm
    pairs := EmptyPairs(); pairs.valid := true;
    blocks := zeros(pairCapacity,pairDimension,pairDimension); normalBlock := zeros(poseDimension,poseDimension);
    left := normalBlock; right := normalBlock; L := zeros(pairDimension,pairDimension); factorValid := false;
    paddingScale := 1.0; a := 1; b := 1; pa := 1; pb := 1; oa := 0; ob := 0; node := 1;
    for i in 1:nodeCapacity loop
      pairs.valid := pairs.valid and (nodeMask[i] == 0.0 or nodeMask[i] == 1.0);
      pairs.active[i] := i > 1 and nodeMask[i] == 1.0;
    end for;
    for edge in 1:edgeCapacity loop
      pairs.valid := pairs.valid and (edgeMask[edge] == 0.0 or edgeMask[edge] == 1.0);
      if pairs.valid and edgeMask[edge] == 1.0 then
        a := source[edge]; b := target[edge];
        pairs.valid := a >= 1 and a <= nodeCapacity and b >= 1 and b <= nodeCapacity and a <> b;
        if pairs.valid then pairs.valid := nodeMask[a] == 1.0 and nodeMask[b] == 1.0; end if;
        if pairs.valid then
          for sideA in 1:2 loop
            for sideB in 1:2 loop
              a := if sideA == 1 then source[edge] else target[edge];
              b := if sideB == 1 then source[edge] else target[edge];
              if a > 1 and b > 1 then
                pa := div(a-2,2)+1; pb := div(b-2,2)+1;
                if pa == pb then
                  oa := mod(a-2,2)*poseDimension; ob := mod(b-2,2)*poseDimension;
                  left := if sideA == 1 then Ji[edge,:,:] else Jj[edge,:,:];
                  right := if sideB == 1 then Ji[edge,:,:] else Jj[edge,:,:];
                  normalBlock := transpose(left)*information[edge,:,:]*right;
                  for i in 1:poseDimension loop for j in 1:poseDimension loop
                    blocks[pa,oa+i,ob+j] := blocks[pa,oa+i,ob+j]+normalBlock[i,j];
                  end for; end for;
                end if;
              end if;
            end for;
          end for;
        end if;
      end if;
    end for;
    if pairs.valid then
      for pair in 1:pairCapacity loop
        paddingScale := 0.0;
        for row in 1:pairDimension loop
          node := 2+2*(pair-1)+div(row-1,poseDimension);
          if node <= nodeCapacity then
            if pairs.active[node] then paddingScale := max(paddingScale,abs(blocks[pair,row,row])); end if;
          end if;
        end for;
        if paddingScale == 0.0 then paddingScale := 1.0; end if;
        for row in 1:pairDimension loop
          node := 2+2*(pair-1)+div(row-1,poseDimension);
          // Inactive and out-of-range padding never read numerical input cells.
          if node > nodeCapacity then blocks[pair,row,row] := paddingScale;
          elseif not pairs.active[node] then blocks[pair,row,row] := paddingScale; end if;
        end for;
        (L,factorValid) := FactorPair(blocks[pair,:,:]); pairs.valid := pairs.valid and factorValid;
        pairs.factor[pair,:,:] := L;
      end for;
    end if;
    if not pairs.valid then pairs := EmptyPairs(); end if;
  end BuildPairs;
  function PairSolve
    input Real f[nodeCapacity,poseDimension]; input Pairs pairs;
    output Real x[nodeCapacity,poseDimension];
  protected Real z[pairDimension]; Real w[pairDimension]; Real value; Integer node; Integer axis; Integer row;
  algorithm
    x := zeros(nodeCapacity,poseDimension); z := zeros(pairDimension); w := z;
    value := 0.0; node := 1; axis := 1; row := 1;
    if pairs.valid then
      for pair in 1:pairCapacity loop
        z := zeros(pairDimension); w := z;
        for i in 1:pairDimension loop
          node := 2+2*(pair-1)+div(i-1,poseDimension); axis := mod(i-1,poseDimension)+1;
          value := 0.0;
          if node <= nodeCapacity then if pairs.active[node] then value := f[node,axis]; end if; end if;
          for k in 1:pairDimension loop if k < i then value := value-pairs.factor[pair,i,k]*z[k]; end if; end for;
          z[i] := value/pairs.factor[pair,i,i];
        end for;
        for i in 1:pairDimension loop
          row := pairDimension+1-i; value := z[row];
          for k in 1:pairDimension loop if k > row then value := value-pairs.factor[pair,k,row]*w[k]; end if; end for;
          w[row] := value/pairs.factor[pair,row,row];
        end for;
        for i in 1:pairDimension loop
          node := 2+2*(pair-1)+div(i-1,poseDimension); axis := mod(i-1,poseDimension)+1;
          if node <= nodeCapacity then if pairs.active[node] then x[node,axis] := w[i]; end if; end if;
        end for;
      end for;
    end if;
  end PairSolve;
  function BalancedPairSolve
    input Real f[nodeCapacity,poseDimension]; input Pairs pairs; input Coarse coarse;
    output Real x[nodeCapacity,poseDimension];
  protected Real coefficients[poseDimension]; Real correction[poseDimension];
    Real pending[nodeCapacity,poseDimension]; Real work[nodeCapacity,poseDimension];
  algorithm
    coefficients := zeros(poseDimension); correction := zeros(poseDimension);
    pending := f; work := zeros(nodeCapacity,poseDimension); x := work;
    for column in 1:poseDimension loop coefficients[column] := PGDot(coarse.basis[:,:,column],f); end for;
    coefficients := PGSolveBlock(coarse.factor,coefficients);
    for column in 1:poseDimension loop pending := pending-coarse.product[:,:,column]*coefficients[column]; end for;
    work := PairSolve(pending,pairs);
    for column in 1:poseDimension loop correction[column] := PGDot(coarse.product[:,:,column],work); end for;
    correction := PGSolveBlock(coarse.factor,correction);
    x := work;
    for column in 1:poseDimension loop x := x+coarse.basis[:,:,column]*(coefficients[column]-correction[column]); end for;
  end BalancedPairSolve;

  function Select
    input Real position[nodeCapacity,3]; input Real rotation[nodeCapacity,3,3];
    input Real nodeMask[nodeCapacity]; input Real edgeMask[edgeCapacity];
    input Real fromNode[edgeCapacity]; input Real toNode[edgeCapacity];
    input Real translation[edgeCapacity,3]; input Real measuredRotation[edgeCapacity,3,3];
    input Real information[edgeCapacity,poseDimension,poseDimension] "Already scaled by PrepareProblem; no second inflation";
    input Integer currentNode; input Integer referenceNode;
    input Integer maximumPCG=48; input Real tolerance=1e-10; input Boolean requested=true;
    output Result result;
  protected
    Integer source[edgeCapacity]; Integer target[edgeCapacity]; Integer selected[selectedDimension];
    Real Ji[edgeCapacity,poseDimension,poseDimension]; Real Jj[edgeCapacity,poseDimension,poseDimension];
    Real B[nodeCapacity,poseDimension,selectedDimension]; Real X[nodeCapacity,poseDimension,selectedDimension];
    Real HX[nodeCapacity,poseDimension,selectedDimension]; Real residual[nodeCapacity,poseDimension,selectedDimension];
    Real whitened[nodeCapacity,poseDimension,selectedDimension];
    Real r[nodeCapacity,poseDimension]; Real z[nodeCapacity,poseDimension];
    Real direction[nodeCapacity,poseDimension]; Real product[nodeCapacity,poseDimension];
    Real q[nodeCapacity,poseDimension]; Real edgeResidual[poseDimension];
    Real edgeJi[poseDimension,poseDimension]; Real edgeJj[poseDimension,poseDimension];
    Real rho; Real nextRho; Real curvature; Real alpha; Real beta; Real initialNorm;
    Real norm; Real value; Real graphStatus; Real activeNodes; Real activeEdges;
    Boolean valid; Boolean chartValid; Boolean running; Boolean coarseEnabled;
    Tree tree; Coarse coarse; Pairs pairs;
  algorithm
    result:=Empty(); source:=fill(1,edgeCapacity); target:=source; selected:=fill(1,selectedDimension);
    Ji:=zeros(edgeCapacity,poseDimension,poseDimension); Jj:=Ji;
    B:=zeros(nodeCapacity,poseDimension,selectedDimension); X:=B; HX:=B; residual:=B; whitened:=B;
    r:=zeros(nodeCapacity,poseDimension); z:=r; direction:=r; product:=r; q:=r;
    edgeJi:=zeros(poseDimension,poseDimension); edgeJj:=edgeJi; edgeResidual:=zeros(poseDimension);
    rho:=0.0; nextRho:=0.0; curvature:=0.0; alpha:=0.0; beta:=0.0; initialNorm:=0.0;
    norm:=0.0; value:=0.0; graphStatus:=0.0; activeNodes:=0.0; activeEdges:=0.0;
    valid:=false; chartValid:=false; running:=false; coarseEnabled:=false; coarse:=EmptyCoarse(); pairs:=EmptyPairs();
    if requested then
      result.status:=-1;
      valid:=currentNode>=1 and currentNode<=nodeCapacity and referenceNode>=1 and referenceNode<=nodeCapacity
        and maximumPCG>=0 and maximumPCG<=maximumIterations and tolerance>=1e-14 and tolerance<=1e-2;
      if valid then valid:=nodeMask[currentNode]==1.0 and nodeMask[referenceNode]==1.0; end if;
      if valid then
        (source,target,graphStatus,activeNodes,activeEdges):=PGValidateGraph(position,rotation,nodeMask,
          edgeMask,fromNode,toNode,translation,measuredRotation,information);
        result.status:=-2; valid:=graphStatus==1.0;
      end if;
      if valid then
        result.status:=-4;
        for edge in 1:edgeCapacity loop
          if edgeMask[edge]==1.0 then
            (edgeResidual,edgeJi,edgeJj,chartValid):=PGEdge(position[source[edge],:],rotation[source[edge],:,:],
              position[target[edge],:],rotation[target[edge],:,:],translation[edge,:],measuredRotation[edge,:,:]);
            Ji[edge,:,:]:=edgeJi; Jj[edge,:,:]:=edgeJj;
            valid:=valid and chartValid;
            for row in 1:poseDimension loop
              for column in 1:poseDimension loop
                valid:=valid and information[edge,row,column]==information[edge,column,row]
                  and abs(Ji[edge,row,column])<=1e18 and abs(Jj[edge,row,column])<=1e18;
              end for;
            end for;
          end if;
        end for;
      end if;
      if valid then
        result.status:=-3; tree:=BuildTree(nodeMask,edgeMask,source,target,Ji,Jj,information); valid:=tree.valid;
      end if;
      if valid then
        // Preserve X=0/tree-only majorant when no PCG step is requested. With
        // only the root active there is no free subspace or coarse rank to test.
        coarseEnabled:=maximumPCG>0 and activeNodes>1.0;
        if coarseEnabled then
          coarse:=BuildCoarse(position,rotation,nodeMask,edgeMask,source,target,Ji,Jj,information); valid:=coarse.valid;
          if valid then pairs:=BuildPairs(nodeMask,edgeMask,source,target,Ji,Jj,information); valid:=pairs.valid; end if;
        end if;
      end if;
      if valid then
        result.status:=-5;
        for column in 1:selectedDimension loop
          selected[column]:=if column<=poseDimension then currentNode else referenceNode;
          if selected[column]>1 then B[selected[column],mod(column-1,poseDimension)+1,column]:=1.0; end if;
          r:=B[:,:,column]; z:=if coarseEnabled then BalancedPairSolve(r,pairs,coarse) else TreeSolve(r,tree); direction:=z;
          rho:=PGDot(r,z); initialNorm:=PGDot(r,r);
          valid:=valid and rho>=0.0 and rho<=1e100;
          running:=valid and initialNorm>0.0;
          for iteration in 1:maximumIterations loop
            if running and iteration<=maximumPCG then
              product:=PGNormalProduct(direction,nodeMask,edgeMask,source,target,Ji,Jj,information,zeros(nodeCapacity,poseDimension),0.0);
              curvature:=PGDot(direction,product); valid:=curvature>0.0 and curvature<=1e100 and rho>0.0;
              if valid then
                alpha:=rho/curvature; X[:,:,column]:=X[:,:,column]+alpha*direction;
                r:=r-alpha*product; norm:=PGDot(r,r); result.iterations[column]:=iteration;
                valid:=norm>=0.0 and norm<=1e100;
                running:=valid and norm>tolerance*tolerance*initialNorm;
                if running then
                  z:=if coarseEnabled then BalancedPairSolve(r,pairs,coarse) else TreeSolve(r,tree); nextRho:=PGDot(r,z); valid:=nextRho>0.0 and nextRho<=1e100;
                  if valid then beta:=nextRho/rho; direction:=z+beta*direction; rho:=nextRho; else running:=false; end if;
                end if;
              else running:=false;
              end if;
            end if;
          end for;
          HX[:,:,column]:=PGNormalProduct(X[:,:,column],nodeMask,edgeMask,source,target,Ji,Jj,information,zeros(nodeCapacity,poseDimension),0.0);
          residual[:,:,column]:=B[:,:,column]-HX[:,:,column];
          norm:=PGDot(residual[:,:,column],residual[:,:,column]);
          result.residualNorm[column]:=sqrt(max(0.0,norm));
          result.converged[column]:=norm<=tolerance*tolerance*initialNorm;
          q:=Backward(residual[:,:,column],tree);
          for node in 1:nodeCapacity loop
            if node>1 and nodeMask[node]==1.0 then
              // Only L_W^-1 q is needed for the full residual Gram upper bound.
              for axis in 1:poseDimension loop
                value:=q[node,axis];
                for k in 1:poseDimension loop
                  if k<axis then value:=value-tree.weightFactor[node,axis,k]*whitened[node,k,column]; end if;
                end for;
                whitened[node,axis,column]:=value/tree.weightFactor[node,axis,axis];
              end for;
            end if;
          end for;
        end for;
        for row in 1:selectedDimension loop
          for column in 1:selectedDimension loop
            result.lower[row,column]:=PGDot(B[:,:,row],X[:,:,column])+PGDot(X[:,:,row],B[:,:,column])
              -0.5*(PGDot(X[:,:,row],HX[:,:,column])+PGDot(HX[:,:,row],X[:,:,column]));
            result.residualUpper[row,column]:=PGDot(whitened[:,:,row],whitened[:,:,column]);
            result.upper[row,column]:=result.lower[row,column]+result.residualUpper[row,column];
            valid:=valid and abs(result.lower[row,column])<=1e100
              and abs(result.residualUpper[row,column])<=1e100 and abs(result.upper[row,column])<=1e100;
          end for;
        end for;
        if valid then
          result.accepted:=true; result.status:=1; result.treeEdges:=tree.count; result.activeNodes:=integer(activeNodes);
        end if;
      end if;
      if not valid then
        graphStatus:=result.status; result:=Empty(); result.status:=integer(graphStatus);
      end if;
    end if;
  end Select;
end ModelicaPoseGraphCovariance;

// Durable capture birth identities. Catalog ID, camera epoch and accepted
// processing-step sequence are separate clocks; none is inferred from another.
package RGBDGraphCaptureLedger
  constant Integer capacity = RGBDKeyframes.keyframeCapacity;
  constant Integer identifierLimit = RGBDKeyframes.identifierLimit;

  record State
    Integer generation; Integer sourceRevision; Integer catalogNextId; Integer lastStep;
    Integer ids[capacity]; Integer epochs[capacity]; Integer sequences[capacity];
    Real times[capacity];
  end State;

  function Empty
    input Integer generation; input Integer sourceRevision;
    output State result;
  algorithm
    result.generation := generation; result.sourceRevision := sourceRevision;
    result.catalogNextId := 1; result.lastStep := 0;
    result.ids := fill(0,capacity); result.epochs := fill(-1,capacity);
    result.sequences := fill(0,capacity); result.times := zeros(capacity);
  end Empty;

  function Valid
    input State ledger; input RGBDKeyframes.Catalog catalog;
    input Integer sourceRevision; input Integer step;
    output Boolean valid;
  protected Integer oldest; Integer slot; Integer previousSequence;
  algorithm
    valid := RGBDKeyframes.ValidHeader(catalog)
      and ledger.generation == catalog.generation
      and sourceRevision >= 1 and sourceRevision <= identifierLimit
      and ledger.sourceRevision == sourceRevision
      and step >= 0 and step < identifierLimit and ledger.lastStep == step
      and ledger.catalogNextId == catalog.nextId;
    oldest := 1; slot := 1; previousSequence := 0;
    if valid then
      oldest := max(1,catalog.nextId-capacity);
      for node in 1:capacity loop
        if node <= min(capacity,catalog.nextId-1) then
          slot := mod(oldest+node-2,capacity)+1;
          valid := valid and ledger.ids[slot] == catalog.ids[slot]
            and ledger.epochs[slot] == catalog.epochs[slot]
            and ledger.times[slot] == catalog.imageTimes[slot]
            and ledger.sequences[slot] > previousSequence
            and ledger.sequences[slot] <= step;
          previousSequence := ledger.sequences[slot];
        end if;
      end for;
    end if;
  end Valid;

  function Advance
    input State previous;
    input RGBDKeyframes.Catalog previousCatalog;
    input RGBDKeyframes.Catalog nextCatalog;
    input Integer sourceRevision;
    input Integer nextStep "Accepted localization publication's actual next.steps";
    input Boolean publicationAccepted;
    input Boolean requested;
    output State result; output Boolean accepted; output Integer reason;
  protected
    State candidate; Boolean valid; Boolean captured; Integer storedSlot;
  algorithm
    result := previous; accepted := false; reason := 1;
    if requested then
      reason := 2;
      valid := publicationAccepted and Valid(previous,previousCatalog,sourceRevision,previous.lastStep)
        and previous.lastStep < identifierLimit-1 and nextStep == previous.lastStep+1
        and RGBDKeyframes.ValidHeader(nextCatalog)
        and nextCatalog.generation == previousCatalog.generation
        and nextCatalog.vocabularyVersion == previousCatalog.vocabularyVersion;
      captured := false; storedSlot := 1;
      if valid then
        reason := 3;
        valid := nextCatalog.nextId == previousCatalog.nextId
          or (previousCatalog.nextId < identifierLimit and nextCatalog.nextId == previousCatalog.nextId+1);
        captured := nextCatalog.nextId == previousCatalog.nextId+1;
        storedSlot := previousCatalog.nextSlot;
        if not captured then
          valid := valid and nextCatalog.lastEpoch == previousCatalog.lastEpoch
            and nextCatalog.lastTime == previousCatalog.lastTime;
        else
          valid := valid and nextCatalog.ids[storedSlot] == previousCatalog.nextId
            and nextCatalog.epochs[storedSlot] > previousCatalog.lastEpoch
            and (previousCatalog.nextId == 1 or nextCatalog.imageTimes[storedSlot] > previousCatalog.lastTime);
        end if;
        for slot in 1:capacity loop
          if not captured or slot <> storedSlot then
            valid := valid and nextCatalog.occupied[slot] == previousCatalog.occupied[slot];
            if previousCatalog.occupied[slot] then
              valid := valid and nextCatalog.ids[slot] == previousCatalog.ids[slot]
                and nextCatalog.epochs[slot] == previousCatalog.epochs[slot]
                and nextCatalog.imageTimes[slot] == previousCatalog.imageTimes[slot];
            end if;
          end if;
        end for;
      end if;
      if valid then
        candidate := previous; candidate.lastStep := nextStep;
        candidate.catalogNextId := nextCatalog.nextId;
        if captured then
          candidate.ids[storedSlot] := nextCatalog.ids[storedSlot];
          candidate.epochs[storedSlot] := nextCatalog.epochs[storedSlot];
          candidate.times[storedSlot] := nextCatalog.imageTimes[storedSlot];
          candidate.sequences[storedSlot] := nextStep;
        end if;
        reason := 4; valid := Valid(candidate,nextCatalog,sourceRevision,nextStep);
        if valid then result := candidate; accepted := true; reason := 0; end if;
      end if;
    end if;
  end Advance;
end RGBDGraphCaptureLedger;

// Local first-order ERROR SECOND-MOMENT bound about a graph anchor mean.
// Raw capture means/bounds stay immutable; changing gauge never creates a zero
// absolute bound. Input capture covariance is assumed a valid local error bound.
package RGBDGraphAnchorBound
  constant Integer dimension = RGBDKeyframes.dimension;
  constant Integer poseDimension = RGBDKeyframes.poseDimension;
  constant Integer capacity = RGBDKeyframes.keyframeCapacity;
  constant Integer identifierLimit = RGBDKeyframes.identifierLimit;

  record Binding
    Integer generation; Integer sourceRevision; Integer id; Integer slot;
    Integer epoch; Integer sequence; Integer catalogPoseRevision; Integer provenance;
    Real imageTime;
  end Binding;
  record Estimate
    Binding binding;
    Real position[dimension]; Real rotation[dimension,dimension];
    Real bound[poseDimension,poseDimension];
  end Estimate;

  function Empty
    input Integer generation; input Integer sourceRevision;
    output Estimate result;
  algorithm
    result.binding.generation := generation; result.binding.sourceRevision := sourceRevision;
    result.binding.id := 0; result.binding.slot := 0; result.binding.epoch := -1;
    result.binding.sequence := 0; result.binding.catalogPoseRevision := 0;
    result.binding.provenance := 0; result.binding.imageTime := 0;
    result.position := zeros(dimension); result.rotation := identity(dimension);
    result.bound := zeros(poseDimension,poseDimension);
  end Empty;

  function FromCapture
    input Estimate previous;
    input RGBDKeyframes.Catalog catalog;
    input RGBDGraphCaptureLedger.State ledger;
    input Integer sourceRevision; input Integer step; input Integer catalogPoseRevision;
    input Real anchorPosition[dimension]; input Real anchorRotation[dimension,dimension];
    input Integer provenance;
    input Real weight = 0.5;
    input Real maximumPositionShift = 5.0; input Real maximumAngleShift = 0.35;
    input Boolean requested = true;
    output Estimate result; output Boolean accepted; output Integer reason;
  protected
    Boolean valid; Boolean chartValid; Boolean unchanged;
    Integer id; Integer slot;
    Real offset[poseDimension]; Real J[poseDimension,poseDimension];
    Real attitudeOffset[dimension]; Real angleJacobian[dimension,dimension];
    Real captureBound[poseDimension,poseDimension]; Real candidate[poseDimension,poseDimension];
  algorithm
    result := previous; accepted := false; reason := 1;
    if requested then
      reason := 2;
      valid := RGBDGraphCaptureLedger.Valid(ledger,catalog,sourceRevision,step)
        and catalog.nextId > 1
        and catalogPoseRevision >= 0 and catalogPoseRevision < identifierLimit
        and provenance >= 1 and provenance <= identifierLimit;
      id := 1; slot := 1; unchanged := false;
      if valid then
        id := max(1,catalog.nextId-capacity); slot := mod(id-1,capacity)+1;
        valid := catalog.occupied[slot] and catalog.ids[slot] == id;
      end if;
      if valid then
        reason := 3;
        valid := weight > 0 and weight < 1
          and maximumPositionShift > 0 and maximumPositionShift <= 100
          and maximumAngleShift > 0 and maximumAngleShift <= 0.35;
      end if;
      if valid then
        reason := 4;
        valid := RGBDUncertaintyProper(anchorRotation)
          and RGBDUncertaintyProper(catalog.bodyRotations[slot,:,:]);
        unchanged := true;
        for axis in 1:dimension loop
          valid := valid and abs(anchorPosition[axis]) <= 1e6
            and abs(catalog.bodyPositions[slot,axis]) <= 1e6;
          unchanged := unchanged and anchorPosition[axis] == catalog.bodyPositions[slot,axis];
          for column in 1:dimension loop
            unchanged := unchanged and anchorRotation[axis,column] == catalog.bodyRotations[slot,axis,column];
          end for;
        end for;
        captureBound := catalog.poseCovariances[slot,:,:];
        valid := valid and SLAMCovariancePSDCheck(captureBound,1e-12) == 1;
      end if;
      if valid then
        candidate := captureBound;
        if not unchanged then
          reason := 5;
          offset := zeros(poseDimension);
          offset[1:dimension] := catalog.bodyPositions[slot,:]-anchorPosition;
          (attitudeOffset,chartValid) := SchmidtGraphPoseCorrection.Log(
            transpose(anchorRotation)*catalog.bodyRotations[slot,:,:]);
          valid := chartValid and sqrt(offset[1:dimension]*offset[1:dimension]) <= maximumPositionShift
            and sqrt(attitudeOffset*attitudeOffset) <= maximumAngleShift;
          if valid then
            offset[dimension+1:poseDimension] := attitudeOffset;
            J := identity(poseDimension);
            angleJacobian := SchmidtGraphPoseCorrection.InverseJacobian(attitudeOffset,true);
            J[dimension+1:poseDimension,dimension+1:poseDimension] := angleJacobian;
            // If e_new = offset+J*e_capture to first order and E[e e']<=P,
            // weighted Young bounds its SECOND MOMENT even for unknown mean.
            candidate := J*captureBound*transpose(J)/weight
              +outerProduct(offset,offset)/(1-weight);
          end if;
        end if;
        if valid then
          reason := 6; valid := SLAMCovariancePSDCheck(candidate,1e-12) == 1;
          if valid then
            result.binding.generation := catalog.generation;
            result.binding.sourceRevision := sourceRevision; result.binding.id := id; result.binding.slot := slot;
            result.binding.epoch := catalog.epochs[slot]; result.binding.sequence := ledger.sequences[slot];
            result.binding.catalogPoseRevision := catalogPoseRevision;
            result.binding.provenance := provenance; result.binding.imageTime := catalog.imageTimes[slot];
            result.position := anchorPosition; result.rotation := anchorRotation; result.bound := candidate;
            accepted := true; reason := 0;
          end if;
        end if;
      end if;
    end if;
  end FromCapture;
end RGBDGraphAnchorBound;

// Numerical first-order adapter. ContextFromLedger binds capture identities to
// their durable owner; anchor-bound provenance remains an explicit input.
package RGBDGraphSelectedGauge
  constant Integer nodeCapacity = RGBDKeyframes.keyframeCapacity;
  constant Integer edgeCapacity = RGBDGraphMeasurements.edgeCapacity;
  constant Integer identifierLimit = RGBDKeyframes.identifierLimit;

  record Context
    Integer generation; Integer sourceRevision; Integer graphRevision; Integer catalogPoseRevision;
    Integer captureIds[nodeCapacity];
    Integer captureSequences[nodeCapacity] "Accepted processing-step birth, indexed by catalog slot";
  end Context;

  record Result
    GraphGaugeUncertainty.Estimate estimate;
    Boolean accepted;
    Integer rejectionReason "0 accepted;1 idle;2 context/graph/ledger;3 selection/binding;4 final pose/anchor;5 covariance;6 transport;7 typed anchor binding/mean";
    Integer covarianceStatus; Integer transportReason;
    Boolean roundoffCertified;
  end Result;

  function ContextFromLedger
    input Context previous;
    input RGBDGraphCaptureLedger.State ledger;
    input RGBDKeyframes.Catalog catalog;
    input RGBDGraphMeasurements.State graph;
    input Integer sourceRevision; input Integer step; input Integer catalogPoseRevision;
    input Boolean requested = true;
    output Context context; output Boolean accepted; output Integer reason;
  protected Boolean valid;
  algorithm
    context := previous; accepted := false; reason := 1;
    if requested then
      reason := 2;
      valid := RGBDGraphCaptureLedger.Valid(ledger,catalog,sourceRevision,step);
      if valid then
        reason := 3;
        valid := graph.generation == catalog.generation
          and graph.revision > 0 and graph.revision <= identifierLimit
          and catalogPoseRevision >= 0 and catalogPoseRevision < identifierLimit;
      end if;
      if valid then
        context.generation := catalog.generation; context.sourceRevision := sourceRevision;
        context.graphRevision := graph.revision; context.catalogPoseRevision := catalogPoseRevision;
        context.captureIds := ledger.ids; context.captureSequences := ledger.sequences;
        accepted := true; reason := 0;
      end if;
    end if;
  end ContextFromLedger;

  function SelectFromAnchor
    input GraphGaugeUncertainty.Estimate previous;
    input RGBDKeyframes.Catalog catalog;
    input RGBDGraphMeasurements.State graph;
    input Context context;
    input Real finalPositionsBySlot[nodeCapacity,3]; input Real finalRotationsBySlot[nodeCapacity,3,3];
    input Integer currentNode; input Integer referenceNode;
    input GraphGaugeUncertainty.Binding binding;
    input RGBDGraphAnchorBound.Estimate anchor;
    input Integer factorProvenance; input Real beta; input Boolean requested = true;
    input Integer maximumPCG = 48; input Real tolerance = 1e-10;
    output Result result;
  protected Boolean valid; Integer id; Integer slot;
  algorithm
    result.estimate := previous; result.accepted := false; result.rejectionReason := 1;
    result.covarianceStatus := 0; result.transportReason := 0; result.roundoffCertified := false;
    if requested then
      result.rejectionReason := 7;
      valid := RGBDKeyframes.ValidHeader(catalog) and catalog.nextId > 1
        and GraphGaugeUncertainty.ValidBinding(binding);
      if valid then
        id := max(1,catalog.nextId-nodeCapacity); slot := mod(id-1,nodeCapacity)+1;
        valid := anchor.binding.generation == catalog.generation
          and anchor.binding.generation == context.generation and anchor.binding.generation == binding.generation
          and anchor.binding.sourceRevision == context.sourceRevision and anchor.binding.sourceRevision == binding.sourceRevision
          and anchor.binding.id == id and anchor.binding.id == binding.anchorId
          and anchor.binding.slot == slot and catalog.occupied[slot] and catalog.ids[slot] == id
          and context.captureIds[slot] == id
          and anchor.binding.epoch == catalog.epochs[slot] and anchor.binding.epoch == binding.anchorEpoch
          and anchor.binding.sequence == context.captureSequences[slot]
          and anchor.binding.sequence == binding.anchorCaptureSequence
          and anchor.binding.catalogPoseRevision == context.catalogPoseRevision
          and anchor.binding.catalogPoseRevision == binding.catalogPoseRevision
          and anchor.binding.imageTime == catalog.imageTimes[slot] and anchor.binding.imageTime == binding.anchorTime
          and anchor.binding.provenance >= 1 and anchor.binding.provenance <= identifierLimit
          and anchor.binding.provenance == binding.anchorBoundProvenance
          and max(abs(anchor.position-finalPositionsBySlot[slot,:])) == 0
          and max(abs(anchor.rotation-finalRotationsBySlot[slot,:,:])) == 0;
      end if;
      if valid then
        // The typed owner supplies a local ERROR SECOND-MOMENT bound about
        // this exact mean; it is not a centered/global covariance certificate.
        result := SelectAndTransport(previous,catalog,graph,context,finalPositionsBySlot,finalRotationsBySlot,
          currentNode,referenceNode,binding,anchor.position,anchor.rotation,anchor.bound,
          anchor.binding.provenance,factorProvenance,beta,true,maximumPCG,tolerance);
      end if;
    end if;
  end SelectFromAnchor;

  function SelectAndTransport
    input GraphGaugeUncertainty.Estimate previous;
    input RGBDKeyframes.Catalog catalog;
    input RGBDGraphMeasurements.State graph;
    input Context context;
    input Real finalPositionsBySlot[nodeCapacity,3];
    input Real finalRotationsBySlot[nodeCapacity,3,3];
    input Integer currentNode; input Integer referenceNode;
    input GraphGaugeUncertainty.Binding binding;
    input Real anchorPosition[3]; input Real anchorRotation[3,3]; input Real anchorBound[6,6];
    input Integer anchorBoundProvenance; input Integer factorProvenance;
    input Real beta; input Boolean requested = true;
    input Integer maximumPCG = 48; input Real tolerance = 1e-10;
    output Result result;
  protected
    RGBDGraphMeasurements.Problem problem;
    ModelicaPoseGraphCovariance.Result selected;
    GraphGaugeUncertainty.Binding expected;
    GraphGaugeUncertainty.Estimate transported;
    Boolean valid; Boolean transportAccepted;
    Integer slot; Integer previousSequence; Integer anchorSlot; Integer currentSlot; Integer referenceSlot;
    Integer nodes[2]; Integer offset;
    Real relativePositions[2,3]; Real relativeRotations[2,3,3];
    Real D[12,12]; Real relativeBound[12,12];
  algorithm
    result.estimate := previous; result.accepted := false; result.rejectionReason := 1;
    result.covarianceStatus := 0; result.transportReason := 0; result.roundoffCertified := false;
    if requested then
      result.rejectionReason := 2;
      valid := RGBDKeyframes.ValidHeader(catalog)
        and context.generation == catalog.generation and graph.generation == catalog.generation
        and context.sourceRevision >= 1 and context.sourceRevision <= identifierLimit
        and context.graphRevision == graph.revision and graph.revision > 0
        and context.catalogPoseRevision >= 0 and context.catalogPoseRevision < identifierLimit
        and anchorBoundProvenance > 0 and anchorBoundProvenance <= identifierLimit
        and factorProvenance > 0 and factorProvenance <= identifierLimit;
      if valid then
        // Prepare the actual graph once; no caller-constructed Problem can
        // substitute endpoints, information scale or a different factor set.
        problem := RGBDGraphMeasurements.PrepareProblem(catalog,graph,true);
        valid := problem.accepted;
      end if;
      if valid then
        previousSequence := 0;
        for node in 1:nodeCapacity loop
          if node <= problem.nodeCount then
            slot := problem.catalogSlot[node];
            valid := valid and context.captureIds[slot] == problem.nodeId[node]
              and context.captureSequences[slot] > previousSequence
              and context.captureSequences[slot] <= identifierLimit;
            previousSequence := context.captureSequences[slot];
          end if;
        end for;
      end if;
      if valid then
        result.rejectionReason := 3;
        valid := currentNode >= 1 and currentNode <= problem.nodeCount
          and referenceNode >= 1 and referenceNode <= problem.nodeCount
          and (currentNode <> referenceNode or GraphGaugeUncertainty.SameCapture(binding));
        if valid then
          anchorSlot := problem.catalogSlot[1]; currentSlot := problem.catalogSlot[currentNode];
          referenceSlot := problem.catalogSlot[referenceNode];
          expected.generation := catalog.generation; expected.sourceRevision := context.sourceRevision;
          expected.graphRevision := graph.revision; expected.catalogPoseRevision := context.catalogPoseRevision;
          expected.anchorId := problem.nodeId[1]; expected.anchorEpoch := catalog.epochs[anchorSlot];
          expected.anchorTime := catalog.imageTimes[anchorSlot];
          expected.anchorCaptureSequence := context.captureSequences[anchorSlot];
          expected.currentId := problem.nodeId[currentNode]; expected.currentEpoch := catalog.epochs[currentSlot];
          expected.currentTime := catalog.imageTimes[currentSlot];
          expected.currentCaptureSequence := context.captureSequences[currentSlot];
          expected.referenceId := problem.nodeId[referenceNode]; expected.referenceEpoch := catalog.epochs[referenceSlot];
          expected.referenceTime := catalog.imageTimes[referenceSlot];
          expected.referenceCaptureSequence := context.captureSequences[referenceSlot];
          expected.chart := GraphGaugeUncertainty.chartENUPositionRightLocalAttitude;
          expected.factorProvenance := factorProvenance; expected.anchorBoundProvenance := anchorBoundProvenance;
          valid := GraphGaugeUncertainty.ValidBinding(expected) and GraphGaugeUncertainty.SameBinding(binding,expected);
        end if;
      end if;
      if valid then
        result.rejectionReason := 4;
        for node in 1:nodeCapacity loop
          if node <= problem.nodeCount then
            slot := problem.catalogSlot[node];
            valid := valid and RGBDUncertaintyProper(finalRotationsBySlot[slot,:,:]);
            for axis in 1:3 loop valid := valid and abs(finalPositionsBySlot[slot,axis]) <= 1e6; end for;
            problem.positions[node,:] := finalPositionsBySlot[slot,:];
            problem.rotations[node,:,:] := finalRotationsBySlot[slot,:,:];
          end if;
        end for;
        valid := valid and max(abs(anchorPosition-problem.positions[1,:])) == 0
          and max(abs(anchorRotation-problem.rotations[1,:,:])) == 0;
      end if;
      if valid then
        result.rejectionReason := 5;
        selected := ModelicaPoseGraphCovariance.Select(problem.positions,problem.rotations,problem.nodeMask,
          problem.edgeMask,problem.fromNode,problem.toNode,problem.measuredTranslation,problem.measuredRotation,
          problem.information,currentNode,referenceNode,maximumPCG,tolerance,true);
        result.covarianceStatus := selected.status;
        valid := selected.accepted;
      end if;
      if valid then
        nodes := {currentNode,referenceNode}; D := zeros(12,12);
        for node in 1:2 loop
          offset := 6*(node-1);
          // The gauge endpoint is an exact identity/zero, including the
          // selected solver's exact-zero covariance rows and columns.
          if nodes[node] == 1 then
            relativePositions[node,:] := zeros(3); relativeRotations[node,:,:] := identity(3);
          else
            relativePositions[node,:] := transpose(anchorRotation)*(problem.positions[nodes[node],:]-anchorPosition);
            relativeRotations[node,:,:] := transpose(anchorRotation)*problem.rotations[nodes[node],:,:];
          end if;
          for row in 1:3 loop for column in 1:3 loop
            D[offset+row,offset+column] := anchorRotation[column,row];
            D[offset+row+3,offset+column+3] := if row == column then 1 else 0;
          end for; end for;
        end for;
        // Rotate every position-position, position-angle and cross-pose cell.
        relativeBound := D*selected.upper*transpose(D);
        result.rejectionReason := 6;
        (transported,transportAccepted,result.transportReason) := GraphGaugeUncertainty.Transport(
          previous,binding,expected,anchorPosition,anchorRotation,anchorBound,
          relativePositions,relativeRotations,relativeBound,beta,true);
        if transportAccepted then
          result.estimate := transported; result.accepted := true; result.rejectionReason := 0;
          result.roundoffCertified := selected.roundoffCertified;
        end if;
      end if;
    end if;
  end SelectAndTransport;
end RGBDGraphSelectedGauge;

// Source-owned graph correction and persistent session state. These functions
// compose the actual optimizer, selected bound, gauge transport and atomic
// filter/map commit; the host supplies neither a solved graph nor a proposal.
package RGBDGraphProcessing
  constant Integer nodeCapacity = RGBDKeyframes.keyframeCapacity;
  constant Integer dimension = RGBDKeyframes.dimension;
  constant Integer identifierLimit = RGBDKeyframes.identifierLimit;

  record State
    RGBDGraphEstimatorCommit.State estimator;
    RGBDVisualVocabulary.State vocabulary "Frozen appearance owner shared by every retained histogram";
    RGBDGraphCaptureLedger.State captures;
    SchmidtGraphPoseCorrection.Attempt attempt;
    RGBDGraphAnchorBound.Estimate anchor;
    GraphGaugeUncertainty.Estimate selected;
  end State;

  record Policy
    SchmidtGraphPoseCorrection.Policy filter;
    Integer maximumIterations; Integer maximumPCG; Integer maximumBacktracks;
    Real initialDamping; Real maximumPositionStep; Real maximumAngleStep; Real pcgTolerance;
    Integer covariancePCG; Real covarianceTolerance;
    Real anchorWeight; Real anchorPositionLimit; Real anchorAngleLimit; Real transportWeight;
    Real consistencyTolerance; Real maximumConfidence;
  end Policy;

  record Result
    State next;
    Boolean accepted;
    Integer reason "0 accepted;1 idle;2 owner/chronology;3 graph problem;4 optimizer;5 anchor;6 selection;7 commit";
    Boolean attempted; Integer commitReason; Integer filterReason; Integer mapReason;
    Integer anchorReason; Integer selectionReason; Integer covarianceStatus;
    Real optimizerStatus; Real costBefore; Real costAfter; Real acceptedIterations; Real pcgIterations;
    Integer projectedCount; Integer prunedCount;
    Boolean roundoffCertified;
  end Result;

  function DefaultPolicy
    output Policy result;
  algorithm
    result.filter := SchmidtGraphPoseCorrection.DefaultPolicy();
    result.maximumIterations := 8; result.maximumPCG := 48; result.maximumBacktracks := 8;
    result.initialDamping := 1e-3; result.maximumPositionStep := 0.5;
    result.maximumAngleStep := 0.15; result.pcgTolerance := 1e-6;
    result.covariancePCG := 48; result.covarianceTolerance := 1e-10;
    result.anchorWeight := 0.5; result.anchorPositionLimit := 5.0; result.anchorAngleLimit := 0.35;
    result.transportWeight := 0.5; result.consistencyTolerance := 1e-6; result.maximumConfidence := 8;
  end DefaultPolicy;

  function EmptySelected
    input Integer generation; input Integer sourceRevision;
    output GraphGaugeUncertainty.Estimate result;
  algorithm
    result.binding.generation := generation; result.binding.sourceRevision := sourceRevision;
    result.binding.graphRevision := 0; result.binding.catalogPoseRevision := 0;
    result.binding.anchorId := 0; result.binding.anchorEpoch := -1; result.binding.anchorCaptureSequence := 0;
    result.binding.currentId := 0; result.binding.currentEpoch := -1; result.binding.currentCaptureSequence := 0;
    result.binding.referenceId := 0; result.binding.referenceEpoch := -1; result.binding.referenceCaptureSequence := 0;
    result.binding.chart := GraphGaugeUncertainty.chartENUPositionRightLocalAttitude;
    result.binding.anchorTime := 0; result.binding.currentTime := 0; result.binding.referenceTime := 0;
    result.binding.factorProvenance := 0; result.binding.anchorBoundProvenance := 0;
    result.positions := zeros(2,dimension); result.covariance := zeros(12,12);
    for node in 1:2 loop result.rotations[node,:,:] := identity(dimension); end for;
  end EmptySelected;

  function Empty
    input RGBDLocalizationCatalog.State localization;
    output State result;
  algorithm
    // A fresh constructor is not a restore operation. Reload carries the
    // complete State, including corrected means and consumed attempts.
    assert(RGBDLocalizationCatalog.ValidHeader(localization)
      and RGBDLocalizationCatalog.ValidEstimator(localization.estimator) and not localization.initialized
      and localization.steps == 0 and localization.catalog.nextId == 1,
      "GraphProcessing.Empty requires a fresh empty localization owner");
    result.estimator := RGBDGraphEstimatorCommit.FromLocalization(localization);
    result.vocabulary := RGBDVisualVocabulary.Empty(localization.generation,
      localization.sourceRevision,localization.catalog.vocabularyVersion);
    result.captures := RGBDGraphCaptureLedger.Empty(localization.generation,localization.sourceRevision);
    result.attempt.generation := localization.generation;
    result.attempt.graphRevision := 0; result.attempt.factorProvenance := 0;
    result.anchor := RGBDGraphAnchorBound.Empty(localization.generation,localization.sourceRevision);
    result.selected := EmptySelected(localization.generation,localization.sourceRevision);
  end Empty;

  function Valid
    input State state;
    output Boolean valid;
  algorithm
    valid := RGBDLocalizationCatalog.ValidHeader(state.estimator.localization)
      and RGBDLocalizationCatalog.ValidEstimator(state.estimator.localization.estimator)
      and RGBDVisualVocabulary.Valid(state.vocabulary)
      and state.vocabulary.generation == state.estimator.localization.generation
      and state.vocabulary.sourceRevision == state.estimator.localization.sourceRevision
      and state.vocabulary.version == state.estimator.localization.catalog.vocabularyVersion
      and (state.estimator.localization.catalog.nextId == 1 or state.vocabulary.ready)
      and RGBDGraphEstimatorCommit.ValidView(state.estimator.localization.catalog,
        state.estimator.poses,state.estimator.localization.sourceRevision)
      and RGBDGraphCaptureLedger.Valid(state.captures,state.estimator.localization.catalog,
        state.estimator.localization.sourceRevision,state.estimator.localization.steps)
      and state.estimator.correctionRevision >= 0 and state.estimator.correctionRevision < identifierLimit
      and state.estimator.graphRevisionUsed >= 0
      and state.estimator.graphRevisionUsed <= state.estimator.localization.graph.revision
      and state.estimator.correctionRevision <= state.estimator.graphRevisionUsed
      and ((state.estimator.correctionRevision == 0) == (state.estimator.graphRevisionUsed == 0))
      and state.attempt.generation == state.estimator.localization.generation
      and state.attempt.graphRevision >= state.estimator.graphRevisionUsed
      and state.attempt.graphRevision <= state.estimator.localization.graph.revision
      and state.attempt.factorProvenance == state.attempt.graphRevision
      and state.anchor.binding.generation == state.estimator.localization.generation
      and state.anchor.binding.sourceRevision == state.estimator.localization.sourceRevision
      and state.selected.binding.generation == state.estimator.localization.generation
      and state.selected.binding.sourceRevision == state.estimator.localization.sourceRevision;
    // These are receipts of the last ACCEPTED correction. Ordinary capture
    // may advance graph/pose revisions or evict their anchor. Never treat a
    // historical receipt as a bound on today's graph: Correct regenerates it.
    if state.estimator.correctionRevision == 0 then
      valid := valid and state.anchor.binding.provenance == 0
        and state.selected.binding.graphRevision == 0;
    else
      valid := valid and GraphGaugeUncertainty.ValidBinding(state.selected.binding)
        and state.selected.binding.graphRevision == state.estimator.graphRevisionUsed
        and state.selected.binding.factorProvenance == state.estimator.graphRevisionUsed
        and state.selected.binding.anchorBoundProvenance == state.anchor.binding.provenance
        and state.anchor.binding.provenance == state.estimator.graphRevisionUsed
        and state.anchor.binding.id == state.selected.binding.anchorId
        and state.anchor.binding.id <= identifierLimit
        and state.anchor.binding.slot >= 1 and state.anchor.binding.slot <= nodeCapacity
        and state.anchor.binding.slot == mod(state.anchor.binding.id-1,nodeCapacity)+1
        and state.anchor.binding.epoch == state.selected.binding.anchorEpoch
        and state.anchor.binding.sequence == state.selected.binding.anchorCaptureSequence
        and state.anchor.binding.imageTime == state.selected.binding.anchorTime
        and state.anchor.binding.catalogPoseRevision == state.selected.binding.catalogPoseRevision
        and state.anchor.binding.catalogPoseRevision <= state.estimator.poses.revision;
    end if;
  end Valid;

  function Correct
    input State previous;
    input Policy policy;
    input Boolean requested;
    output Result result;
  protected
    Boolean valid; Boolean anchorAccepted; Boolean contextAccepted; Boolean changed;
    Integer oldest; Integer currentId; Integer referenceId; Integer anchorSlot;
    Integer currentSlot; Integer referenceSlot; Integer currentNode; Integer referenceNode;
    Integer contextReason; Integer slot;
    RGBDGraphMeasurements.Problem problem;
    RGBDGraphEstimatorCommit.Proposal proposal;
    RGBDGraphEstimatorCommit.Result committed;
    RGBDGraphSelectedGauge.Context context;
    RGBDGraphSelectedGauge.Result selected;
    RGBDGraphAnchorBound.Estimate anchor;
    GraphGaugeUncertainty.Binding binding;
    Real finalPosition[nodeCapacity,dimension]; Real finalRotation[nodeCapacity,dimension,dimension];
    Real activeNodes; Real activeEdges;
  algorithm
    result.next := previous; result.accepted := false; result.reason := 1;
    result.attempted := false; result.commitReason := 0; result.filterReason := 0; result.mapReason := 0;
    result.anchorReason := 0; result.selectionReason := 0; result.covarianceStatus := 0;
    result.optimizerStatus := 0; result.costBefore := 0; result.costAfter := 0;
    result.acceptedIterations := 0; result.pcgIterations := 0;
    result.projectedCount := 0; result.prunedCount := 0; result.roundoffCertified := false;
    if requested then
      result.reason := 2;
      valid := Valid(previous) and previous.estimator.localization.initialized
        and previous.estimator.localization.catalog.nextId > 2
        and previous.estimator.localization.estimator.referenceAvailable == 1
        and previous.estimator.localization.referenceBirth.catalogId > 0
        and previous.estimator.localization.graph.revision > previous.attempt.graphRevision
        and previous.estimator.localization.lastProcessedImageEpoch == previous.estimator.localization.catalog.lastEpoch
        and previous.estimator.localization.lastProcessedImageTime == previous.estimator.localization.catalog.lastTime
        and previous.estimator.localization.predictionTime == previous.estimator.localization.catalog.lastTime
        and previous.estimator.poses.revision < identifierLimit-1;
      if valid then
        oldest := max(1,previous.estimator.localization.catalog.nextId-nodeCapacity);
        currentId := previous.estimator.localization.catalog.nextId-1;
        referenceId := previous.estimator.localization.referenceBirth.catalogId;
        anchorSlot := mod(oldest-1,nodeCapacity)+1;
        currentSlot := mod(currentId-1,nodeCapacity)+1;
        referenceSlot := mod(referenceId-1,nodeCapacity)+1;
        valid := RGBDGraphMeasurements.Bound(previous.estimator.localization.catalog,referenceId,
            referenceSlot,previous.estimator.localization.referenceBirth.epoch)
          and previous.captures.sequences[currentSlot] == previous.estimator.localization.steps
          and previous.captures.sequences[referenceSlot] == previous.estimator.localization.referenceBirth.sequence;
      end if;
      if valid then
        result.reason := 3;
        problem := RGBDGraphMeasurements.PrepareProblem(previous.estimator.localization.catalog,
          previous.estimator.localization.graph,true);
        valid := problem.accepted;
      end if;
      if valid then
        // Warm-start from the durable corrected view, not immutable raw
        // captures. The chronological fixed row is mapped by catalogSlot.
        for node in 1:problem.nodeCount loop
          slot := problem.catalogSlot[node];
          problem.positions[node,:] := previous.estimator.poses.positions[slot,:];
          problem.rotations[node,:,:] := previous.estimator.poses.rotations[slot,:,:];
        end for;
        result.reason := 4;
        (finalPosition,finalRotation,result.optimizerStatus,result.costBefore,result.costAfter,
          result.acceptedIterations,result.pcgIterations,activeNodes,activeEdges) :=
          OptimizeModelicaPoseGraph(problem.positions,problem.rotations,problem.nodeMask,
            problem.edgeMask,problem.fromNode,problem.toNode,problem.measuredTranslation,
            problem.measuredRotation,problem.information,policy.maximumIterations,policy.maximumPCG,
            policy.maximumBacktracks,policy.initialDamping,policy.maximumPositionStep,
            policy.maximumAngleStep,policy.pcgTolerance);
        valid := (result.optimizerStatus == 1 or result.optimizerStatus == 2)
          and result.costAfter >= 0 and result.costAfter <= result.costBefore
          and activeNodes == problem.nodeCount and activeEdges == problem.edgeCount;
        proposal.poses := previous.estimator.poses; changed := false;
        for node in 1:problem.nodeCount loop
          slot := problem.catalogSlot[node];
          valid := valid and RGBDUncertaintyProper(finalRotation[node,:,:]);
          for axis in 1:dimension loop
            valid := valid and abs(finalPosition[node,axis]) <= 1e6;
            changed := changed or finalPosition[node,axis] <> proposal.poses.positions[slot,axis];
            for column in 1:dimension loop
              changed := changed or finalRotation[node,axis,column] <> proposal.poses.rotations[slot,axis,column];
            end for;
          end for;
          proposal.poses.positions[slot,:] := finalPosition[node,:];
          proposal.poses.rotations[slot,:,:] := finalRotation[node,:,:];
        end for;
        // The gauge is exact, not merely close after a numerical update.
        valid := valid and max(abs(proposal.poses.positions[anchorSlot,:]
          -previous.estimator.poses.positions[anchorSlot,:])) == 0
          and max(abs(proposal.poses.rotations[anchorSlot,:,:]
          -previous.estimator.poses.rotations[anchorSlot,:,:])) == 0;
        proposal.poses.revision := previous.estimator.poses.revision+(if changed then 1 else 0);
        proposal.graphRevision := previous.estimator.localization.graph.revision;
        proposal.optimizerAccepted := valid;
      end if;
      if valid then
        result.reason := 5;
        (anchor,anchorAccepted,result.anchorReason) := RGBDGraphAnchorBound.FromCapture(
          previous.anchor,previous.estimator.localization.catalog,previous.captures,
          previous.estimator.localization.sourceRevision,previous.estimator.localization.steps,
          previous.estimator.poses.revision,proposal.poses.positions[anchorSlot,:],
          proposal.poses.rotations[anchorSlot,:,:],proposal.graphRevision,
          policy.anchorWeight,policy.anchorPositionLimit,policy.anchorAngleLimit,true);
        valid := anchorAccepted;
      end if;
      if valid then
        // Context's revision binds the input pose owner. Proposal poses may
        // advance it only at atomic Commit, after all bound checks succeed.
        context.generation := previous.estimator.localization.generation;
        context.sourceRevision := previous.estimator.localization.sourceRevision;
        context.graphRevision := 0; context.catalogPoseRevision := 0;
        context.captureIds := fill(0,nodeCapacity); context.captureSequences := fill(0,nodeCapacity);
        (context,contextAccepted,contextReason) := RGBDGraphSelectedGauge.ContextFromLedger(
          context,previous.captures,previous.estimator.localization.catalog,
          previous.estimator.localization.graph,previous.estimator.localization.sourceRevision,
          previous.estimator.localization.steps,previous.estimator.poses.revision,true);
        result.reason := 6; valid := contextAccepted;
      end if;
      if valid then
        currentNode := currentId-oldest+1; referenceNode := referenceId-oldest+1;
        binding.generation := context.generation; binding.sourceRevision := context.sourceRevision;
        binding.graphRevision := context.graphRevision; binding.catalogPoseRevision := context.catalogPoseRevision;
        binding.anchorId := oldest; binding.anchorEpoch := previous.captures.epochs[anchorSlot];
        binding.anchorCaptureSequence := previous.captures.sequences[anchorSlot];
        binding.anchorTime := previous.captures.times[anchorSlot];
        binding.currentId := currentId; binding.currentEpoch := previous.captures.epochs[currentSlot];
        binding.currentCaptureSequence := previous.captures.sequences[currentSlot];
        binding.currentTime := previous.captures.times[currentSlot];
        binding.referenceId := referenceId; binding.referenceEpoch := previous.captures.epochs[referenceSlot];
        binding.referenceCaptureSequence := previous.captures.sequences[referenceSlot];
        binding.referenceTime := previous.captures.times[referenceSlot];
        binding.chart := GraphGaugeUncertainty.chartENUPositionRightLocalAttitude;
        // Revision-scoped provenance is generated here and cannot be a host
        // assertion of a successful optimizer or an arbitrary covariance.
        binding.factorProvenance := proposal.graphRevision;
        binding.anchorBoundProvenance := anchor.binding.provenance;
        selected := RGBDGraphSelectedGauge.SelectFromAnchor(previous.selected,
          previous.estimator.localization.catalog,previous.estimator.localization.graph,context,
          proposal.poses.positions,proposal.poses.rotations,currentNode,referenceNode,binding,
          anchor,proposal.graphRevision,policy.transportWeight,true,
          policy.covariancePCG,policy.covarianceTolerance);
        result.selectionReason := selected.rejectionReason; result.covarianceStatus := selected.covarianceStatus;
        result.roundoffCertified := selected.roundoffCertified; valid := selected.accepted;
      end if;
      if valid then
        result.reason := 7; proposal.selected := selected.estimate;
        committed := RGBDGraphEstimatorCommit.Commit(previous.estimator,proposal,binding,
          previous.attempt,policy.filter,true,policy.consistencyTolerance,policy.maximumConfidence);
        result.attempted := committed.attempted; result.commitReason := committed.reason;
        result.filterReason := committed.filterReason; result.mapReason := committed.mapReason;
        // An evaluated graph/filter factor is consumed even when the filter
        // or final map refuses. Preserve the whole numerical owner on refusal.
        if committed.attempted then result.next.attempt := committed.nextAttempt; end if;
        if committed.accepted then
          result.next.estimator := committed.next; result.next.anchor := anchor;
          result.next.selected := selected.estimate;
          result.projectedCount := committed.projectedCount; result.prunedCount := committed.prunedCount;
          result.accepted := true; result.reason := 0;
        end if;
      end if;
    end if;
  end Correct;
end RGBDGraphProcessing;

// Ordinary acquisition publication retains the authoritative corrected pose view.
// This owner never reconstructs a post-correction state from raw captures.
package RGBDLocalizationProcessing
  constant Integer capacity = RGBDKeyframes.keyframeCapacity;
  constant Integer dimension = RGBDKeyframes.dimension;
  constant Integer identifierLimit = RGBDKeyframes.identifierLimit;
  record Result
    RGBDGraphProcessing.State next;
    RGBDLocalizationCatalog.Result publication;
    Boolean accepted; Integer reason; Integer ledgerReason; Integer vocabularyReason;
  end Result;
  function Publish
    input RGBDGraphProcessing.State previous;
    input RGBDLocalizationCatalog.Estimator proposed "Same compiled localization invocation; no host reconstruction";
    input RGBDKeyframes.Frame measurement;
    input Real producerAccepted "Prediction accepted, or explicit initialization accepted";
    input Real observationAccepted; input Real captureAccepted;
    input Boolean imageOn; input Integer imageEpoch; input Real imageTime; input Real h;
    input Boolean initializing;
    input Boolean frameAccepted; input Integer frameRejectionReason;
    input Boolean requested;
    input Real candidatePoint[RGBDKeyframes.featureCapacity,dimension]; input Real candidateEnabled[RGBDKeyframes.featureCapacity];
    input Real minimumInterval = 0.5; input Real maximumInterval = 2.0;
    input Real translationThreshold = 0.6; input Real rotationThreshold = 0.25;
    input Integer minimumFeatures = 12;
    input Real voxelWidth = 0.25; input Real mergeRadius = 0.15;
    input Real maximumDistance = 80.0; input Real tentativeLifetime = 0.5;
    input Real confirmedLifetime = 5.0; input Real confirmationObservations = 3.0;
    input Real maximumConfidence = 8.0; input Real maximumTentative = 700.0;

    input Integer minimumMeasuredDescriptors = 8;
    input Real minimumWordDistanceSquared = 0.04;

    output Result result;
  protected
    RGBDGraphProcessing.State candidate;
    RGBDLocalizationCatalog.Result published;
    RGBDGraphCaptureLedger.State ledger;
    RGBDVisualVocabulary.State dictionary;
    Real descriptorEnabled[RGBDKeyframes.featureCapacity];
    Boolean learnAccepted; Boolean learnRequested; Integer mappingFrameReason;
    Boolean ledgerAccepted; Boolean valid; Boolean captured; Integer slot;
  algorithm
    result.next := previous; result.accepted := false; result.reason := 1; result.ledgerReason := 1; result.vocabularyReason := 0;
    dictionary := previous.vocabulary; descriptorEnabled := zeros(RGBDKeyframes.featureCapacity);
    learnAccepted := false; learnRequested := false; mappingFrameReason := frameRejectionReason;
    // Disabled call initializes only diagnostics and its held next; payload is opaque.
    result.publication := RGBDLocalizationCatalog.Publish(previous.estimator.localization,proposed,measurement,
      producerAccepted,observationAccepted,captureAccepted,imageOn,imageEpoch,imageTime,h,initializing,
      frameAccepted,frameRejectionReason,false,candidatePoint,candidateEnabled,dictionary.words,dictionary.enabled);
    if requested then
      result.reason := 2; valid := RGBDGraphProcessing.Valid(previous);
      if valid then
        // Frozen dictionaries are opaque to learning, including their padding.
        if not dictionary.ready then
          learnRequested := imageOn and frameAccepted and SLAMExactRealEqual(producerAccepted,1.0)
            and ((SLAMExactRealEqual(observationAccepted,1.0) and SLAMExactRealEqual(captureAccepted,0.0))
              or (SLAMExactRealEqual(observationAccepted,0.0) and SLAMExactRealEqual(captureAccepted,1.0)))
            and (not initializing or SLAMExactRealEqual(observationAccepted,0.0))
            and RGBDLocalizationCatalog.CanAdvance(previous.estimator.localization,imageTime,h,initializing,true)
            and RGBDLocalizationCatalog.ImageFresh(previous.estimator.localization,imageEpoch,imageTime)
            and RGBDLocalizationCatalog.ValidEstimator(proposed)
            and RGBDLocalizationCatalog.FrameBound(previous.estimator.localization,proposed,measurement,
              imageEpoch,imageTime,observationAccepted,captureAccepted,frameAccepted);
          if learnRequested then
            for feature in 1:RGBDKeyframes.featureCapacity loop
              descriptorEnabled[feature] := if measurement.enabled[feature] then 1.0 else 0.0;
            end for;
            (dictionary,learnAccepted,result.vocabularyReason) := RGBDVisualVocabulary.Learn(previous.vocabulary,
              measurement.descriptor,descriptorEnabled,measurement.count,previous.estimator.localization.generation,
              previous.estimator.localization.sourceRevision,measurement.vocabularyVersion,true,
              minimumMeasuredDescriptors,minimumWordDistanceSquared);
          end if;
        else
          result.vocabularyReason := 3;
        end if;
        if frameAccepted and not dictionary.ready then
          mappingFrameReason := if RGBDLocalizationCatalog.FrameBound(previous.estimator.localization,proposed,measurement,
            imageEpoch,imageTime,observationAccepted,captureAccepted,true) then 9 else 8;
        end if;
        result.reason := 3;
        published := RGBDLocalizationCatalog.Publish(previous.estimator.localization,proposed,measurement,
          producerAccepted,observationAccepted,captureAccepted,imageOn,imageEpoch,imageTime,h,initializing,
          frameAccepted and dictionary.ready,mappingFrameReason,true,candidatePoint,candidateEnabled,dictionary.words,dictionary.enabled,
          minimumInterval=minimumInterval,maximumInterval=maximumInterval,
          translationThreshold=translationThreshold,rotationThreshold=rotationThreshold,minimumFeatures=minimumFeatures,
          voxelWidth=voxelWidth,mergeRadius=mergeRadius,maximumDistance=maximumDistance,
          tentativeLifetime=tentativeLifetime,confirmedLifetime=confirmedLifetime,
          confirmationObservations=confirmationObservations,maximumConfidence=maximumConfidence,maximumTentative=maximumTentative,
          posePositions=previous.estimator.poses.positions,poseRotations=previous.estimator.poses.rotations,
          poseRevision=previous.estimator.poses.revision);
        result.publication := published;
        if published.accepted then
          result.reason := 4;
          (ledger,ledgerAccepted,result.ledgerReason) := RGBDGraphCaptureLedger.Advance(previous.captures,
            previous.estimator.localization.catalog,published.next.catalog,published.next.sourceRevision,published.next.steps,true,true);
          if ledgerAccepted then
            candidate := previous; candidate.estimator.localization := published.next; candidate.captures := ledger;
            candidate.vocabulary := dictionary;
            result.reason := 5;
            captured := published.next.catalog.nextId == previous.estimator.localization.catalog.nextId+1;
            valid := published.next.catalog.nextId == previous.estimator.localization.catalog.nextId or captured;
            if captured then
              valid := valid and previous.estimator.poses.revision < identifierLimit-1;
              if valid then
                slot := previous.estimator.localization.catalog.nextSlot;
                candidate.estimator.poses.catalogNextId := published.next.catalog.nextId;
                candidate.estimator.poses.revision := previous.estimator.poses.revision+1;
                candidate.estimator.poses.enabled[slot] := published.next.catalog.occupied[slot];
                candidate.estimator.poses.ids[slot] := published.next.catalog.ids[slot];
                candidate.estimator.poses.positions[slot,:] := published.next.catalog.bodyPositions[slot,:];
                candidate.estimator.poses.rotations[slot,:,:] := published.next.catalog.bodyRotations[slot,:,:];
              end if;
            end if;
            if valid then
              valid := RGBDGraphEstimatorCommit.ValidView(candidate.estimator.localization.catalog,
                candidate.estimator.poses,candidate.estimator.localization.sourceRevision);
            end if;
            if valid then
              result.reason := 6; valid := RGBDGraphProcessing.Valid(candidate);
              if valid then result.next := candidate; result.accepted := true; result.reason := 0; end if;
            end if;
          end if;
        end if;
        if not result.accepted then
          // No uncommitted inner next may escape as an authoritative receipt.
          if published.accepted then result.publication.rejectionReason := 2; end if;
          result.publication.next := previous.estimator.localization;
          result.publication.accepted := false; result.publication.imageCompleted := false; result.publication.mappingAccepted := false;
        end if;
      end if;
    end if;
  end Publish;
end RGBDLocalizationProcessing;

// Raw sensor data and the complete persistent Modelica session owner.
// Staged until exact-source Rumoca SolveIR WASM and browser qualification.
partial model RGBDFastSLAMInterface
  parameter Integer imageHeight(min=1) = RGBDKeyframes.imageHeight;
  parameter Integer imageWidth(min=1) = RGBDKeyframes.imageWidth;
  constant Integer featureCapacity = RGBDKeyframes.featureCapacity;
  constant Integer descriptorSize = RGBDKeyframes.descriptorSize;
  final parameter Real defaultRgbCalibration[4] = RGBDNominalCalibration({imageHeight,imageWidth},{69.0,42.0});
  final parameter Real defaultDepthCalibration[4] = RGBDNominalCalibration({imageHeight,imageWidth},{87.0,58.0});
  input RGBDGraphProcessing.State previous;
  parameter Integer channelCount(min=3,max=4) = 4 "RGB or historical RGBA storage";
  input Real rgb[imageHeight,imageWidth,channelCount];
  input Real depth[imageHeight,imageWidth];
  input Real depthUnits = 1.0 "Meters per depth sample";
  input Real rgbCalibration[4] = defaultRgbCalibration;
  input Real depthCalibration[4] = defaultDepthCalibration;
  input Real disparityNoise = 0.08;
  input Real noiseReferenceFx = 848.0/(2.0*tan(87.0*3.141592653589793/360.0));
  input Real baseline = 0.05;
  input Real opticalToBody[3,3] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[3] = {0.18,0.0,-0.04};
  input Real accel[3] = {0.0,0.0,9.81}; input Real gyro[3] = zeros(3);
  input Real gravity[3] = {0.0,0.0,-9.81};
  input Real density[12] = {0.06,0.06,0.06,0.006,0.006,0.006,0.002,0.002,0.002,0.0002,0.0002,0.0002};
  input Real h = 1.0/90.0;
  input Real intervalTime;
  input Integer imageEpoch;
  input Boolean imageRequested = true;
  input Boolean localCaptureRequested = true;
  input Boolean requested = true;
  parameter Integer minimumMeasuredDescriptors = 8;
  parameter Real minimumWordDistanceSquared = 0.04;
  parameter Real selectedFeatureLimit = featureCapacity;
  parameter Real absoluteThreshold = 18.0;
  parameter Boolean depthQualifiedSelection = true;
  parameter Real minimumInterval = 0.5; parameter Real maximumInterval = 2.0;
  parameter Real translationThreshold = 0.6; parameter Real rotationThreshold = 0.25;
  parameter Integer minimumFeatures = 12;
  parameter Real voxelWidth = 0.25; parameter Real mergeRadius = 0.15;
  parameter Real maximumDistance = 80.0; parameter Real tentativeLifetime = 0.5;
  parameter Real confirmedLifetime = 5.0; parameter Real confirmationObservations = 3.0;
  parameter Real maximumConfidence = 8.0; parameter Real maximumTentative = 700.0;
  input Boolean graphCorrectionRequested = true;
  input RGBDGraphProcessing.Policy graphPolicy = RGBDGraphProcessing.DefaultPolicy();
  output RGBDGraphProcessing.State next;
  output Boolean accepted; output Boolean imageCompleted; output Boolean mappingAccepted;
  output Boolean graphCorrectionAccepted; output Boolean roundoffCertified;
  output Integer publicationReason; output Integer ledgerReason; output Integer vocabularyReason; output Integer graphReason;
  output Integer graphCommitReason; output Integer graphFilterReason; output Integer covarianceStatus;
  output Real graphCostBefore; output Real graphCostAfter;
  output Real nextQuaternion[4];
  output Real selectionValid; output Real predictionAccepted; output Real initializationAccepted;
  output Real observationAccepted; output Real captureAccepted; output Real matchCount;
  output Real features[featureCapacity,3]; output Real featureEnabled[featureCapacity];
  output Real trackingCurrentPixel[featureCapacity,2]; output Real trackingReferencePixel[featureCapacity,2];
  output Real trackingEnabled[featureCapacity];
end RGBDFastSLAMInterface;

// Fresh state construction runs in the compiled Modelica program. Reload must
// restore the complete source-bound State, rather than invoking this reset.
model RGBDFastSLAMReset
  constant Integer dimension = RGBDKeyframes.dimension;
  constant Integer currentDimension = RGBDLocalizationFrame.currentDimension;
  input Integer generation = 1;
  input Integer sourceRevision = 1;
  input Integer vocabularyVersion = 1;
  input Real worldFrame = 0;
  input Real position[dimension] = zeros(dimension);
  input Real velocity[dimension] = zeros(dimension);
  input Real rotation[dimension,dimension] = identity(dimension);
  input Real accelBias[dimension] = zeros(dimension);
  input Real gyroBias[dimension] = zeros(dimension);
  input Real covariance[currentDimension,currentDimension] = diagonal({0.25,0.25,0.25,
    0.04,0.04,0.04,0.01,0.01,0.01,0.0004,0.0004,0.0004,0.000025,0.000025,0.000025});
  output RGBDGraphProcessing.State next;
equation
  next = RGBDGraphProcessing.Empty(RGBDLocalizationCatalog.Empty(
    RGBDLocalizationCatalog.EmptyEstimator(position,velocity,rotation,accelBias,gyroBias,covariance),
    generation,sourceRevision,vocabularyVersion,worldFrame));
end RGBDFastSLAMReset;

// Public lifecycle adapter; Rumoca compiles the complete Modelica implementation.
model RGBDFastSLAMInitialize
  extends RGBDFastSLAMInterface(h=0.0,intervalTime=0.0);
equation
  (next,accepted,imageCompleted,mappingAccepted,
    graphCorrectionAccepted,roundoffCertified,publicationReason,ledgerReason,
    vocabularyReason,graphReason,graphCommitReason,graphFilterReason,
    covarianceStatus,graphCostBefore,graphCostAfter,nextQuaternion,
    selectionValid,predictionAccepted,initializationAccepted,observationAccepted,
    captureAccepted,matchCount,features,featureEnabled,
    trackingCurrentPixel,trackingReferencePixel,trackingEnabled) =
    InitializeFastSLAM(
      previous=previous,
      rgb=rgb,
      depth=depth,
      rgbCalibration=rgbCalibration,
      depthCalibration=depthCalibration,
      disparityNoise=disparityNoise,
      noiseReferenceFx=noiseReferenceFx,
      baseline=baseline,
      opticalToBody=opticalToBody,
      cameraOriginBody=cameraOriginBody,
      accel=accel,
      gyro=gyro,
      gravity=gravity,
      density=density,
      h=h,
      intervalTime=intervalTime,
      imageEpoch=imageEpoch,
      imageRequested=imageRequested,
      localCaptureRequested=localCaptureRequested,
      requested=requested,
      minimumMeasuredDescriptors=minimumMeasuredDescriptors,
      minimumWordDistanceSquared=minimumWordDistanceSquared,
      selectedFeatureLimit=selectedFeatureLimit,
      absoluteThreshold=absoluteThreshold,
      depthQualifiedSelection=depthQualifiedSelection,
      minimumInterval=minimumInterval,
      maximumInterval=maximumInterval,
      translationThreshold=translationThreshold,
      rotationThreshold=rotationThreshold,
      minimumFeatures=minimumFeatures,
      voxelWidth=voxelWidth,
      mergeRadius=mergeRadius,
      maximumDistance=maximumDistance,
      tentativeLifetime=tentativeLifetime,
      confirmedLifetime=confirmedLifetime,
      confirmationObservations=confirmationObservations,
      maximumConfidence=maximumConfidence,
      maximumTentative=maximumTentative,
      graphCorrectionRequested=graphCorrectionRequested,
      graphPolicy=graphPolicy,depthUnits=depthUnits);
end RGBDFastSLAMInitialize;

// Ordered raw-camera lifecycle. Reference qualification is separate from
// compiler issuance and complete browser/runtime admission.
function InitializeFastSLAM
  input RGBDGraphProcessing.State previous;
  input Real rgb[:,:,:];
  input Real depth[size(rgb,1),size(rgb,2)];
  input Real rgbCalibration[4] = RGBDNominalCalibration({size(rgb,1),size(rgb,2)},{69.0,42.0});
  input Real depthCalibration[4] = RGBDNominalCalibration({size(rgb,1),size(rgb,2)},{87.0,58.0});
  input Real disparityNoise = 0.08;
  input Real noiseReferenceFx = 848.0/(2.0*tan(87.0*3.141592653589793/360.0));
  input Real baseline = 0.05;
  input Real opticalToBody[spaceDimension,spaceDimension] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[spaceDimension] = {0.18,0.0,-0.04};
  input Real accel[spaceDimension] = {0.0,0.0,9.81};
  input Real gyro[spaceDimension] = zeros(spaceDimension);
  input Real gravity[spaceDimension] = {0.0,0.0,-9.81};
  input Real density[noiseDimension] = {0.06,0.06,0.06,0.006,0.006,0.006,0.002,0.002,0.002,0.0002,0.0002,0.0002};
  input Real h = 0.0;
  input Real intervalTime = 0.0;
  input Integer imageEpoch;
  input Boolean imageRequested = true;
  input Boolean localCaptureRequested = true;
  input Boolean requested = true;
  input Integer minimumMeasuredDescriptors = 8;
  input Real minimumWordDistanceSquared = 0.04;
  input Real selectedFeatureLimit = featureCapacity;
  input Real absoluteThreshold = 18.0;
  input Real minimumInterval = 0.5;
  input Real maximumInterval = 2.0;
  input Real translationThreshold = 0.6;
  input Real rotationThreshold = 0.25;
  input Integer minimumFeatures = 12;
  input Real voxelWidth = 0.25;
  input Real mergeRadius = 0.15;
  input Real maximumDistance = 80.0;
  input Real tentativeLifetime = 0.5;
  input Real confirmedLifetime = 5.0;
  input Real confirmationObservations = 3.0;
  input Real maximumConfidence = 8.0;
  input Real maximumTentative = 700.0;
  input Boolean graphCorrectionRequested = true;
  input RGBDGraphProcessing.Policy graphPolicy = RGBDGraphProcessing.DefaultPolicy();
  output RGBDGraphProcessing.State next;
  output Boolean accepted;
  output Boolean imageCompleted;
  output Boolean mappingAccepted;
  output Boolean graphCorrectionAccepted;
  output Boolean roundoffCertified;
  output Integer publicationReason;
  output Integer ledgerReason;
  output Integer vocabularyReason;
  output Integer graphReason;
  output Integer graphCommitReason;
  output Integer graphFilterReason;
  output Integer covarianceStatus;
  output Real graphCostBefore;
  output Real graphCostAfter;
  output Real nextQuaternion[quaternionSize];
  output Real selectionValid;
  output Real predictionAccepted;
  output Real initializationAccepted;
  output Real observationAccepted;
  output Real captureAccepted;
  output Real matchCount;
  output Real features[featureCapacity,spaceDimension];
  output Real featureEnabled[featureCapacity];
  output Real trackingCurrentPixel[featureCapacity,2];
  output Real trackingReferencePixel[featureCapacity,2];
  output Real trackingEnabled[featureCapacity];
  input Boolean depthQualifiedSelection = true;
  input Real depthUnits = 1.0 "Meters per depth sample; 1 for metric depth, SDK scale for Z16";
protected
  constant Integer featureCapacity = RGBDKeyframes.featureCapacity;
  constant Integer descriptorSize = RGBDKeyframes.descriptorSize;
  constant Integer spaceDimension = RGBDKeyframes.dimension;
  constant Integer errorDimension = 5*spaceDimension;
  constant Integer poseDimension = 2*spaceDimension;
  constant Integer noiseDimension = 4*spaceDimension;
  constant Integer channelCount = 4;
  constant Integer quaternionSize = 4;
  Boolean transactionAllowed; Boolean imageOn;
  RGBDLocalizationCatalog.Estimator proposed;
  RGBDLocalizationProcessing.Result publication;
  RGBDKeyframes.Frame measurement;
  Boolean frameAccepted; Integer frameRejectionReason;
  Real orientationVector[spaceDimension]; Real orientationAngle; Real orientationValid;
  Real orientationQuaternion[quaternionSize];
  Real producerNextPosition[spaceDimension];
  Real producerNextVelocity[spaceDimension];
  Real producerNextRotation[spaceDimension,spaceDimension];
  Real producerNextAccelBias[spaceDimension];
  Real producerNextGyroBias[spaceDimension];
  Real producerNextCovariance[errorDimension,errorDimension];
  Real producerNextCrossCovariance[errorDimension,poseDimension];
  Real producerNextReferenceCovariance[poseDimension,poseDimension];
  Real producerNextReferencePosition[spaceDimension];
  Real producerNextReferenceRotation[spaceDimension,spaceDimension];
  Real producerNextReferenceAvailable;
  Real producerNextReferenceEpoch;
  Real producerNextReferenceUsed;
  Real producerNextLastUsedEpoch;
  Real producerNextReferenceDescriptor[featureCapacity,descriptorSize];
  Real producerNextReferencePoint[featureCapacity,spaceDimension];
  Real producerNextReferenceEnabled[featureCapacity];
  Real producerNextReferencePixels[featureCapacity,2];
  Real producerNextReferenceCount;
  Real producerNextReferenceRgbCalibration[4];
  Real producerNextReferenceDepthCalibration[4];
  Real producerNextReferenceNoiseReferenceFx;
  Real producerNextReferenceDisparityNoise;
  Real producerNextReferenceBaseline;
  Real producerNextReferenceOpticalToBody[spaceDimension,spaceDimension];
  Real producerNextReferenceCameraOriginBody[spaceDimension];
  Real producerPredictionAccepted;
  Real producerObservationAccepted;
  Real producerObservationRejected;
  Real producerCaptureAccepted;
  Real producerCaptureRejected;
  Real producerImageReuseRejected;
  Real producerImagePairEligible;
  Real producerFrameValid;
  Real producerReferenceGeometryCompatible;
  Real producerVisualValid;
  Real producerMatchCount;
  Real producerUncertaintyRejectionReason;
  Real producerCurrentDescriptor[featureCapacity,descriptorSize];
  Real producerCurrentPoint[featureCapacity,spaceDimension];
  Real producerCurrentEnabled[featureCapacity];
  Real producerCurrentCount;
  Real producerCurrentFromReference[spaceDimension,spaceDimension];
  Real producerCurrentFromReferenceTranslation[spaceDimension];
  Real producerRelativeCovariance[poseDimension,poseDimension];
  Real producerMapCandidatePoint[featureCapacity,spaceDimension];
  Real producerMapCandidateEnabled[featureCapacity];
  Real producerMapCandidateCount;
  Real producerNextQuaternion[quaternionSize];
  Real producerPositionCovariance[spaceDimension,spaceDimension];
  Real producerAttitudeCovariance[spaceDimension,spaceDimension];
  Real producerConfidence;
  Real producerFeatures[featureCapacity,spaceDimension];
  Real producerFeatureEnabled[featureCapacity];
  Real producerTrackingCurrentPixel[featureCapacity,2];
  Real producerTrackingReferencePixel[featureCapacity,2];
  Real producerTrackingEnabled[featureCapacity];
  Real producerInitializationAccepted;
  Real producerInitializationRejected;
  Real producerSelectionValid;
algorithm
  transactionAllowed := if requested then RGBDGraphProcessing.Valid(previous) and RGBDLocalizationCatalog.CanAdvance(previous.estimator.localization,intervalTime,h,true,requested) else false;
  imageOn := transactionAllowed and imageRequested
    and RGBDLocalizationCatalog.ImageFresh(previous.estimator.localization,imageEpoch,intervalTime);
  (producerNextPosition,
    producerNextVelocity,
    producerNextRotation,
    producerNextAccelBias,
    producerNextGyroBias,
    producerNextCovariance,
    producerNextCrossCovariance,
    producerNextReferenceCovariance,
    producerNextReferencePosition,
    producerNextReferenceRotation,
    producerNextReferenceAvailable,
    producerNextReferenceEpoch,
    producerNextReferenceUsed,
    producerNextLastUsedEpoch,
    producerNextReferenceDescriptor,
    producerNextReferencePoint,
    producerNextReferenceEnabled,
    producerNextReferencePixels,
    producerNextReferenceCount,
    producerNextReferenceRgbCalibration,
    producerNextReferenceDepthCalibration,
    producerNextReferenceNoiseReferenceFx,
    producerNextReferenceDisparityNoise,
    producerNextReferenceBaseline,
    producerNextReferenceOpticalToBody,
    producerNextReferenceCameraOriginBody,
    producerPredictionAccepted,
    producerObservationAccepted,
    producerObservationRejected,
    producerCaptureAccepted,
    producerCaptureRejected,
    producerImageReuseRejected,
    producerImagePairEligible,
    producerFrameValid,
    producerReferenceGeometryCompatible,
    producerVisualValid,
    producerMatchCount,
    producerUncertaintyRejectionReason,
    producerCurrentDescriptor,
    producerCurrentPoint,
    producerCurrentEnabled,
    producerCurrentCount,
    producerCurrentFromReference,
    producerCurrentFromReferenceTranslation,
    producerRelativeCovariance,
    producerMapCandidatePoint,
    producerMapCandidateEnabled,
    producerMapCandidateCount,
    producerNextQuaternion,
    producerPositionCovariance,
    producerAttitudeCovariance,
    producerConfidence,
    producerFeatures,
    producerFeatureEnabled,
    producerTrackingCurrentPixel,
    producerTrackingReferencePixel,
    producerTrackingEnabled,
    producerInitializationAccepted,
    producerInitializationRejected,
    producerSelectionValid) := InitializeFastRGBDLocalization(
    imageTime=intervalTime,
    initializationRequested=if transactionAllowed then 1.0 else 0.0,
    selectedFeatureLimit=selectedFeatureLimit,
    absoluteThreshold=absoluteThreshold,
      depthQualifiedSelection=depthQualifiedSelection,
    rgb=rgb,
    depth=depth,
    rgbCalibration=rgbCalibration,
    depthCalibration=depthCalibration,
    disparityNoise=disparityNoise,
    noiseReferenceFx=noiseReferenceFx,
    baseline=baseline,
    opticalToBody=opticalToBody,
    cameraOriginBody=cameraOriginBody,
    accel=accel,
    gyro=gyro,
    gravity=gravity,
    density=density,
    position=previous.estimator.localization.estimator.position,
    velocity=previous.estimator.localization.estimator.velocity,
    rotation=previous.estimator.localization.estimator.rotation,
    accelBias=previous.estimator.localization.estimator.accelBias,
    gyroBias=previous.estimator.localization.estimator.gyroBias,
    covariance=previous.estimator.localization.estimator.covariance,
    crossCovariance=previous.estimator.localization.estimator.crossCovariance,
    referenceCovariance=previous.estimator.localization.estimator.referenceCovariance,
    referencePosition=previous.estimator.localization.estimator.referencePosition,
    referenceRotation=previous.estimator.localization.estimator.referenceRotation,
    referenceAvailable=previous.estimator.localization.estimator.referenceAvailable,
    referenceEpoch=previous.estimator.localization.estimator.referenceEpoch,
    referenceUsed=previous.estimator.localization.estimator.referenceUsed,
    lastUsedEpoch=previous.estimator.localization.estimator.lastUsedEpoch,
    referenceDescriptor=previous.estimator.localization.estimator.referenceDescriptor,
    referencePoint=previous.estimator.localization.estimator.referencePoint,
    referenceEnabled=previous.estimator.localization.estimator.referenceEnabled,
    referencePixels=previous.estimator.localization.estimator.referencePixels,
    referenceCount=previous.estimator.localization.estimator.referenceCount,
    referenceRgbCalibration=previous.estimator.localization.estimator.referenceRgbCalibration,
    referenceDepthCalibration=previous.estimator.localization.estimator.referenceDepthCalibration,
    referenceNoiseReferenceFx=previous.estimator.localization.estimator.referenceNoiseReferenceFx,
    referenceDisparityNoise=previous.estimator.localization.estimator.referenceDisparityNoise,
    referenceBaseline=previous.estimator.localization.estimator.referenceBaseline,
    referenceOpticalToBody=previous.estimator.localization.estimator.referenceOpticalToBody,
    referenceCameraOriginBody=previous.estimator.localization.estimator.referenceCameraOriginBody,
    currentEpoch=imageEpoch,
    h=h,
    frameEnabled=if imageOn then 1.0 else 0.0,
    imageCaptureRequested=if imageOn and localCaptureRequested then 1.0 else 0.0,depthUnits=depthUnits);
  proposed.position := producerNextPosition;
  proposed.velocity := producerNextVelocity;
  proposed.rotation := producerNextRotation;
  proposed.accelBias := producerNextAccelBias;
  proposed.gyroBias := producerNextGyroBias;
  proposed.covariance := producerNextCovariance;
  proposed.crossCovariance := producerNextCrossCovariance;
  proposed.referenceCovariance := producerNextReferenceCovariance;
  proposed.referencePosition := producerNextReferencePosition;
  proposed.referenceRotation := producerNextReferenceRotation;
  proposed.referenceAvailable := producerNextReferenceAvailable;
  proposed.referenceEpoch := producerNextReferenceEpoch;
  proposed.referenceUsed := producerNextReferenceUsed;
  proposed.lastUsedEpoch := producerNextLastUsedEpoch;
  proposed.referenceDescriptor := producerNextReferenceDescriptor;
  proposed.referencePoint := producerNextReferencePoint;
  proposed.referenceEnabled := producerNextReferenceEnabled;
  proposed.referencePixels := producerNextReferencePixels;
  proposed.referenceCount := producerNextReferenceCount;
  proposed.referenceRgbCalibration := producerNextReferenceRgbCalibration;
  proposed.referenceDepthCalibration := producerNextReferenceDepthCalibration;
  proposed.referenceNoiseReferenceFx := producerNextReferenceNoiseReferenceFx;
  proposed.referenceDisparityNoise := producerNextReferenceDisparityNoise;
  proposed.referenceBaseline := producerNextReferenceBaseline;
  proposed.referenceOpticalToBody := producerNextReferenceOpticalToBody;
  proposed.referenceCameraOriginBody := producerNextReferenceCameraOriginBody;
  (measurement,frameAccepted,frameRejectionReason) := RGBDLocalizationFrame.Build(
    previous.estimator.localization.generation,previous.estimator.localization.catalog.nextId,imageEpoch,imageEpoch,intervalTime,
    producerCurrentCount,producerCurrentDescriptor,producerCurrentPoint,
    producerCurrentEnabled,producerFeatures[:,1:2],{size(rgb,1),size(rgb,2)},{size(rgb,1),size(rgb,2)},
    rgbCalibration,depthCalibration,opticalToBody,cameraOriginBody,disparityNoise,noiseReferenceFx,baseline,
    proposed.position,proposed.rotation,proposed.covariance,previous.estimator.localization.catalog.vocabularyVersion,
    if producerFrameValid > 0.5 and (producerObservationAccepted > 0.5
      or producerCaptureAccepted > 0.5) then 1.0 else 0.0,
    imageOn and producerInitializationAccepted > 0.5);
  publication := RGBDLocalizationProcessing.Publish(previous,proposed,measurement,
    producerInitializationAccepted,
    producerObservationAccepted,producerCaptureAccepted,imageOn,imageEpoch,intervalTime,h,
    true,frameAccepted,frameRejectionReason,transactionAllowed,
    producerMapCandidatePoint,producerMapCandidateEnabled,
    minimumInterval,maximumInterval,translationThreshold,rotationThreshold,minimumFeatures,
    voxelWidth,mergeRadius,maximumDistance,tentativeLifetime,confirmedLifetime,
    confirmationObservations,maximumConfidence,maximumTentative,
    minimumMeasuredDescriptors=minimumMeasuredDescriptors,minimumWordDistanceSquared=minimumWordDistanceSquared);
  accepted := publication.accepted;
  imageCompleted := publication.publication.imageCompleted;
  mappingAccepted := publication.publication.mappingAccepted;
  publicationReason := publication.reason;
  ledgerReason := publication.ledgerReason;
  vocabularyReason := publication.vocabularyReason;
  // One initialized capture cannot form a relative graph. The next Step
  // invokes correction only after a real admitted catalog capture.
  next := publication.next;
  graphCorrectionAccepted := false; graphReason := 1; graphCommitReason := 0;
  graphFilterReason := 0; covarianceStatus := 0; roundoffCertified := false;
  graphCostBefore := 0; graphCostAfter := 0;
  (orientationVector,orientationAngle,orientationValid,orientationQuaternion) :=
    SLAMRotationCoordinates(next.estimator.localization.estimator.rotation);
  nextQuaternion := if orientationValid > 0.5 then orientationQuaternion else {1.0,0.0,0.0,0.0};
  selectionValid := producerSelectionValid;
  predictionAccepted := 0.0;
  initializationAccepted := if publication.accepted then producerInitializationAccepted else 0.0;
  observationAccepted := if publication.accepted then producerObservationAccepted else 0.0;
  captureAccepted := if publication.accepted then producerCaptureAccepted else 0.0;
  matchCount := if publication.publication.imageCompleted then producerMatchCount else 0.0;
  features := if publication.publication.imageCompleted then producerFeatures else zeros(featureCapacity,3);
  featureEnabled := if publication.publication.imageCompleted then producerFeatureEnabled else zeros(featureCapacity);
  trackingCurrentPixel := if publication.publication.imageCompleted then producerTrackingCurrentPixel else zeros(featureCapacity,2);
  trackingReferencePixel := if publication.publication.imageCompleted then producerTrackingReferencePixel else zeros(featureCapacity,2);
  trackingEnabled := if publication.publication.imageCompleted then producerTrackingEnabled else zeros(featureCapacity);
end InitializeFastSLAM;

// Public lifecycle adapter; Rumoca compiles the complete Modelica implementation.
model RGBDFastSLAMStep
  extends RGBDFastSLAMInterface;
equation
  (next,accepted,imageCompleted,mappingAccepted,
    graphCorrectionAccepted,roundoffCertified,publicationReason,ledgerReason,
    vocabularyReason,graphReason,graphCommitReason,graphFilterReason,
    covarianceStatus,graphCostBefore,graphCostAfter,nextQuaternion,
    selectionValid,predictionAccepted,initializationAccepted,observationAccepted,
    captureAccepted,matchCount,features,featureEnabled,
    trackingCurrentPixel,trackingReferencePixel,trackingEnabled) =
    AdvanceFastSLAM(
      previous=previous,
      rgb=rgb,
      depth=depth,
      rgbCalibration=rgbCalibration,
      depthCalibration=depthCalibration,
      disparityNoise=disparityNoise,
      noiseReferenceFx=noiseReferenceFx,
      baseline=baseline,
      opticalToBody=opticalToBody,
      cameraOriginBody=cameraOriginBody,
      accel=accel,
      gyro=gyro,
      gravity=gravity,
      density=density,
      h=h,
      intervalTime=intervalTime,
      imageEpoch=imageEpoch,
      imageRequested=imageRequested,
      localCaptureRequested=localCaptureRequested,
      requested=requested,
      minimumMeasuredDescriptors=minimumMeasuredDescriptors,
      minimumWordDistanceSquared=minimumWordDistanceSquared,
      selectedFeatureLimit=selectedFeatureLimit,
      absoluteThreshold=absoluteThreshold,
      depthQualifiedSelection=depthQualifiedSelection,
      minimumInterval=minimumInterval,
      maximumInterval=maximumInterval,
      translationThreshold=translationThreshold,
      rotationThreshold=rotationThreshold,
      minimumFeatures=minimumFeatures,
      voxelWidth=voxelWidth,
      mergeRadius=mergeRadius,
      maximumDistance=maximumDistance,
      tentativeLifetime=tentativeLifetime,
      confirmedLifetime=confirmedLifetime,
      confirmationObservations=confirmationObservations,
      maximumConfidence=maximumConfidence,
      maximumTentative=maximumTentative,
      graphCorrectionRequested=graphCorrectionRequested,
      graphPolicy=graphPolicy,depthUnits=depthUnits);
end RGBDFastSLAMStep;

// Ordered raw-camera lifecycle. Reference qualification is separate from
// compiler issuance and complete browser/runtime admission.
function AdvanceFastSLAM
  input RGBDGraphProcessing.State previous;
  input Real rgb[:,:,:];
  input Real depth[size(rgb,1),size(rgb,2)];
  input Real rgbCalibration[4] = RGBDNominalCalibration({size(rgb,1),size(rgb,2)},{69.0,42.0});
  input Real depthCalibration[4] = RGBDNominalCalibration({size(rgb,1),size(rgb,2)},{87.0,58.0});
  input Real disparityNoise = 0.08;
  input Real noiseReferenceFx = 848.0/(2.0*tan(87.0*3.141592653589793/360.0));
  input Real baseline = 0.05;
  input Real opticalToBody[spaceDimension,spaceDimension] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[spaceDimension] = {0.18,0.0,-0.04};
  input Real accel[spaceDimension] = {0.0,0.0,9.81};
  input Real gyro[spaceDimension] = zeros(spaceDimension);
  input Real gravity[spaceDimension] = {0.0,0.0,-9.81};
  input Real density[noiseDimension] = {0.06,0.06,0.06,0.006,0.006,0.006,0.002,0.002,0.002,0.0002,0.0002,0.0002};
  input Real h = 1.0/90.0;
  input Real intervalTime;
  input Integer imageEpoch;
  input Boolean imageRequested = true;
  input Boolean localCaptureRequested = true;
  input Boolean requested = true;
  input Integer minimumMeasuredDescriptors = 8;
  input Real minimumWordDistanceSquared = 0.04;
  input Real selectedFeatureLimit = featureCapacity;
  input Real absoluteThreshold = 18.0;
  input Real minimumInterval = 0.5;
  input Real maximumInterval = 2.0;
  input Real translationThreshold = 0.6;
  input Real rotationThreshold = 0.25;
  input Integer minimumFeatures = 12;
  input Real voxelWidth = 0.25;
  input Real mergeRadius = 0.15;
  input Real maximumDistance = 80.0;
  input Real tentativeLifetime = 0.5;
  input Real confirmedLifetime = 5.0;
  input Real confirmationObservations = 3.0;
  input Real maximumConfidence = 8.0;
  input Real maximumTentative = 700.0;
  input Boolean graphCorrectionRequested = true;
  input RGBDGraphProcessing.Policy graphPolicy = RGBDGraphProcessing.DefaultPolicy();
  output RGBDGraphProcessing.State next;
  output Boolean accepted;
  output Boolean imageCompleted;
  output Boolean mappingAccepted;
  output Boolean graphCorrectionAccepted;
  output Boolean roundoffCertified;
  output Integer publicationReason;
  output Integer ledgerReason;
  output Integer vocabularyReason;
  output Integer graphReason;
  output Integer graphCommitReason;
  output Integer graphFilterReason;
  output Integer covarianceStatus;
  output Real graphCostBefore;
  output Real graphCostAfter;
  output Real nextQuaternion[quaternionSize];
  output Real selectionValid;
  output Real predictionAccepted;
  output Real initializationAccepted;
  output Real observationAccepted;
  output Real captureAccepted;
  output Real matchCount;
  output Real features[featureCapacity,spaceDimension];
  output Real featureEnabled[featureCapacity];
  output Real trackingCurrentPixel[featureCapacity,2];
  output Real trackingReferencePixel[featureCapacity,2];
  output Real trackingEnabled[featureCapacity];
  input Boolean depthQualifiedSelection = true;
  input Real depthUnits = 1.0 "Meters per depth sample; 1 for metric depth, SDK scale for Z16";
protected
  constant Integer featureCapacity = RGBDKeyframes.featureCapacity;
  constant Integer descriptorSize = RGBDKeyframes.descriptorSize;
  constant Integer spaceDimension = RGBDKeyframes.dimension;
  constant Integer errorDimension = 5*spaceDimension;
  constant Integer poseDimension = 2*spaceDimension;
  constant Integer noiseDimension = 4*spaceDimension;
  constant Integer channelCount = 4;
  constant Integer quaternionSize = 4;
  Boolean transactionAllowed; Boolean imageOn;
  RGBDLocalizationCatalog.Estimator proposed;
  RGBDLocalizationProcessing.Result publication;
  RGBDGraphProcessing.Result correction;
  RGBDKeyframes.Frame measurement;
  Boolean frameAccepted; Integer frameRejectionReason;
  Real orientationVector[spaceDimension]; Real orientationAngle; Real orientationValid;
  Real orientationQuaternion[quaternionSize];
  Real producerNextPosition[spaceDimension];
  Real producerNextVelocity[spaceDimension];
  Real producerNextRotation[spaceDimension,spaceDimension];
  Real producerNextAccelBias[spaceDimension];
  Real producerNextGyroBias[spaceDimension];
  Real producerNextCovariance[errorDimension,errorDimension];
  Real producerNextCrossCovariance[errorDimension,poseDimension];
  Real producerNextReferenceCovariance[poseDimension,poseDimension];
  Real producerNextReferencePosition[spaceDimension];
  Real producerNextReferenceRotation[spaceDimension,spaceDimension];
  Real producerNextReferenceAvailable;
  Real producerNextReferenceEpoch;
  Real producerNextReferenceUsed;
  Real producerNextLastUsedEpoch;
  Real producerNextReferenceDescriptor[featureCapacity,descriptorSize];
  Real producerNextReferencePoint[featureCapacity,spaceDimension];
  Real producerNextReferenceEnabled[featureCapacity];
  Real producerNextReferencePixels[featureCapacity,2];
  Real producerNextReferenceCount;
  Real producerNextReferenceRgbCalibration[4];
  Real producerNextReferenceDepthCalibration[4];
  Real producerNextReferenceNoiseReferenceFx;
  Real producerNextReferenceDisparityNoise;
  Real producerNextReferenceBaseline;
  Real producerNextReferenceOpticalToBody[spaceDimension,spaceDimension];
  Real producerNextReferenceCameraOriginBody[spaceDimension];
  Real producerPredictionAccepted;
  Real producerObservationAccepted;
  Real producerObservationRejected;
  Real producerCaptureAccepted;
  Real producerCaptureRejected;
  Real producerImageReuseRejected;
  Real producerImagePairEligible;
  Real producerFrameValid;
  Real producerReferenceGeometryCompatible;
  Real producerVisualValid;
  Real producerMatchCount;
  Real producerUncertaintyRejectionReason;
  Real producerCurrentDescriptor[featureCapacity,descriptorSize];
  Real producerCurrentPoint[featureCapacity,spaceDimension];
  Real producerCurrentEnabled[featureCapacity];
  Real producerCurrentCount;
  Real producerCurrentFromReference[spaceDimension,spaceDimension];
  Real producerCurrentFromReferenceTranslation[spaceDimension];
  Real producerRelativeCovariance[poseDimension,poseDimension];
  Real producerMapCandidatePoint[featureCapacity,spaceDimension];
  Real producerMapCandidateEnabled[featureCapacity];
  Real producerMapCandidateCount;
  Real producerNextQuaternion[quaternionSize];
  Real producerPositionCovariance[spaceDimension,spaceDimension];
  Real producerAttitudeCovariance[spaceDimension,spaceDimension];
  Real producerConfidence;
  Real producerFeatures[featureCapacity,spaceDimension];
  Real producerFeatureEnabled[featureCapacity];
  Real producerTrackingCurrentPixel[featureCapacity,2];
  Real producerTrackingReferencePixel[featureCapacity,2];
  Real producerTrackingEnabled[featureCapacity];
  Real producerSelectionValid;
algorithm
  transactionAllowed := if requested then RGBDGraphProcessing.Valid(previous) and RGBDLocalizationCatalog.CanAdvance(previous.estimator.localization,intervalTime,h,false,requested) else false;
  imageOn := transactionAllowed and imageRequested
    and RGBDLocalizationCatalog.ImageFresh(previous.estimator.localization,imageEpoch,intervalTime);
  (producerNextPosition,
    producerNextVelocity,
    producerNextRotation,
    producerNextAccelBias,
    producerNextGyroBias,
    producerNextCovariance,
    producerNextCrossCovariance,
    producerNextReferenceCovariance,
    producerNextReferencePosition,
    producerNextReferenceRotation,
    producerNextReferenceAvailable,
    producerNextReferenceEpoch,
    producerNextReferenceUsed,
    producerNextLastUsedEpoch,
    producerNextReferenceDescriptor,
    producerNextReferencePoint,
    producerNextReferenceEnabled,
    producerNextReferencePixels,
    producerNextReferenceCount,
    producerNextReferenceRgbCalibration,
    producerNextReferenceDepthCalibration,
    producerNextReferenceNoiseReferenceFx,
    producerNextReferenceDisparityNoise,
    producerNextReferenceBaseline,
    producerNextReferenceOpticalToBody,
    producerNextReferenceCameraOriginBody,
    producerPredictionAccepted,
    producerObservationAccepted,
    producerObservationRejected,
    producerCaptureAccepted,
    producerCaptureRejected,
    producerImageReuseRejected,
    producerImagePairEligible,
    producerFrameValid,
    producerReferenceGeometryCompatible,
    producerVisualValid,
    producerMatchCount,
    producerUncertaintyRejectionReason,
    producerCurrentDescriptor,
    producerCurrentPoint,
    producerCurrentEnabled,
    producerCurrentCount,
    producerCurrentFromReference,
    producerCurrentFromReferenceTranslation,
    producerRelativeCovariance,
    producerMapCandidatePoint,
    producerMapCandidateEnabled,
    producerMapCandidateCount,
    producerNextQuaternion,
    producerPositionCovariance,
    producerAttitudeCovariance,
    producerConfidence,
    producerFeatures,
    producerFeatureEnabled,
    producerTrackingCurrentPixel,
    producerTrackingReferencePixel,
    producerTrackingEnabled,
    producerSelectionValid) := AdvanceFastRGBDLocalization(
    selectedFeatureLimit=selectedFeatureLimit,
    absoluteThreshold=absoluteThreshold,
      depthQualifiedSelection=depthQualifiedSelection,
    rgb=rgb,
    depth=depth,
    rgbCalibration=rgbCalibration,
    depthCalibration=depthCalibration,
    disparityNoise=disparityNoise,
    noiseReferenceFx=noiseReferenceFx,
    baseline=baseline,
    opticalToBody=opticalToBody,
    cameraOriginBody=cameraOriginBody,
    accel=accel,
    gyro=gyro,
    gravity=gravity,
    density=density,
    position=previous.estimator.localization.estimator.position,
    velocity=previous.estimator.localization.estimator.velocity,
    rotation=previous.estimator.localization.estimator.rotation,
    accelBias=previous.estimator.localization.estimator.accelBias,
    gyroBias=previous.estimator.localization.estimator.gyroBias,
    covariance=previous.estimator.localization.estimator.covariance,
    crossCovariance=previous.estimator.localization.estimator.crossCovariance,
    referenceCovariance=previous.estimator.localization.estimator.referenceCovariance,
    referencePosition=previous.estimator.localization.estimator.referencePosition,
    referenceRotation=previous.estimator.localization.estimator.referenceRotation,
    referenceAvailable=previous.estimator.localization.estimator.referenceAvailable,
    referenceEpoch=previous.estimator.localization.estimator.referenceEpoch,
    referenceUsed=previous.estimator.localization.estimator.referenceUsed,
    lastUsedEpoch=previous.estimator.localization.estimator.lastUsedEpoch,
    referenceDescriptor=previous.estimator.localization.estimator.referenceDescriptor,
    referencePoint=previous.estimator.localization.estimator.referencePoint,
    referenceEnabled=previous.estimator.localization.estimator.referenceEnabled,
    referencePixels=previous.estimator.localization.estimator.referencePixels,
    referenceCount=previous.estimator.localization.estimator.referenceCount,
    referenceRgbCalibration=previous.estimator.localization.estimator.referenceRgbCalibration,
    referenceDepthCalibration=previous.estimator.localization.estimator.referenceDepthCalibration,
    referenceNoiseReferenceFx=previous.estimator.localization.estimator.referenceNoiseReferenceFx,
    referenceDisparityNoise=previous.estimator.localization.estimator.referenceDisparityNoise,
    referenceBaseline=previous.estimator.localization.estimator.referenceBaseline,
    referenceOpticalToBody=previous.estimator.localization.estimator.referenceOpticalToBody,
    referenceCameraOriginBody=previous.estimator.localization.estimator.referenceCameraOriginBody,
    currentEpoch=imageEpoch,
    h=if transactionAllowed then h else 0.0,
    frameEnabled=if imageOn then 1.0 else 0.0,
    imageCaptureRequested=if imageOn and localCaptureRequested then 1.0 else 0.0,depthUnits=depthUnits);
  proposed.position := producerNextPosition;
  proposed.velocity := producerNextVelocity;
  proposed.rotation := producerNextRotation;
  proposed.accelBias := producerNextAccelBias;
  proposed.gyroBias := producerNextGyroBias;
  proposed.covariance := producerNextCovariance;
  proposed.crossCovariance := producerNextCrossCovariance;
  proposed.referenceCovariance := producerNextReferenceCovariance;
  proposed.referencePosition := producerNextReferencePosition;
  proposed.referenceRotation := producerNextReferenceRotation;
  proposed.referenceAvailable := producerNextReferenceAvailable;
  proposed.referenceEpoch := producerNextReferenceEpoch;
  proposed.referenceUsed := producerNextReferenceUsed;
  proposed.lastUsedEpoch := producerNextLastUsedEpoch;
  proposed.referenceDescriptor := producerNextReferenceDescriptor;
  proposed.referencePoint := producerNextReferencePoint;
  proposed.referenceEnabled := producerNextReferenceEnabled;
  proposed.referencePixels := producerNextReferencePixels;
  proposed.referenceCount := producerNextReferenceCount;
  proposed.referenceRgbCalibration := producerNextReferenceRgbCalibration;
  proposed.referenceDepthCalibration := producerNextReferenceDepthCalibration;
  proposed.referenceNoiseReferenceFx := producerNextReferenceNoiseReferenceFx;
  proposed.referenceDisparityNoise := producerNextReferenceDisparityNoise;
  proposed.referenceBaseline := producerNextReferenceBaseline;
  proposed.referenceOpticalToBody := producerNextReferenceOpticalToBody;
  proposed.referenceCameraOriginBody := producerNextReferenceCameraOriginBody;
  (measurement,frameAccepted,frameRejectionReason) := RGBDLocalizationFrame.Build(
    previous.estimator.localization.generation,previous.estimator.localization.catalog.nextId,imageEpoch,imageEpoch,intervalTime,
    producerCurrentCount,producerCurrentDescriptor,producerCurrentPoint,
    producerCurrentEnabled,producerFeatures[:,1:2],{size(rgb,1),size(rgb,2)},{size(rgb,1),size(rgb,2)},
    rgbCalibration,depthCalibration,opticalToBody,cameraOriginBody,disparityNoise,noiseReferenceFx,baseline,
    proposed.position,proposed.rotation,proposed.covariance,previous.estimator.localization.catalog.vocabularyVersion,
    if producerFrameValid > 0.5 and (producerObservationAccepted > 0.5
      or producerCaptureAccepted > 0.5) then 1.0 else 0.0,
    imageOn and producerPredictionAccepted > 0.5);
  publication := RGBDLocalizationProcessing.Publish(previous,proposed,measurement,
    producerPredictionAccepted,
    producerObservationAccepted,producerCaptureAccepted,imageOn,imageEpoch,intervalTime,h,
    false,frameAccepted,frameRejectionReason,transactionAllowed,
    producerMapCandidatePoint,producerMapCandidateEnabled,
    minimumInterval,maximumInterval,translationThreshold,rotationThreshold,minimumFeatures,
    voxelWidth,mergeRadius,maximumDistance,tentativeLifetime,confirmedLifetime,
    confirmationObservations,maximumConfidence,maximumTentative,
    minimumMeasuredDescriptors=minimumMeasuredDescriptors,minimumWordDistanceSquared=minimumWordDistanceSquared);
  accepted := publication.accepted;
  imageCompleted := publication.publication.imageCompleted;
  mappingAccepted := publication.publication.mappingAccepted;
  publicationReason := publication.reason;
  ledgerReason := publication.ledgerReason;
  vocabularyReason := publication.vocabularyReason;
  correction := RGBDGraphProcessing.Correct(publication.next,graphPolicy,
    graphCorrectionRequested and publication.accepted and publication.publication.mappingAccepted
      and publication.next.estimator.localization.catalog.nextId == previous.estimator.localization.catalog.nextId+1);
  next := correction.next;
  graphCorrectionAccepted := correction.accepted;
  graphReason := correction.reason;
  graphCommitReason := correction.commitReason;
  graphFilterReason := correction.filterReason;
  covarianceStatus := correction.covarianceStatus;
  roundoffCertified := correction.roundoffCertified;
  graphCostBefore := correction.costBefore;
  graphCostAfter := correction.costAfter;
  (orientationVector,orientationAngle,orientationValid,orientationQuaternion) :=
    SLAMRotationCoordinates(next.estimator.localization.estimator.rotation);
  nextQuaternion := if orientationValid > 0.5 then orientationQuaternion else {1.0,0.0,0.0,0.0};
  selectionValid := producerSelectionValid;
  predictionAccepted := if publication.accepted then producerPredictionAccepted else 0.0;
  initializationAccepted := 0.0;
  observationAccepted := if publication.accepted then producerObservationAccepted else 0.0;
  captureAccepted := if publication.accepted then producerCaptureAccepted else 0.0;
  matchCount := if publication.publication.imageCompleted then producerMatchCount else 0.0;
  features := if publication.publication.imageCompleted then producerFeatures else zeros(featureCapacity,3);
  featureEnabled := if publication.publication.imageCompleted then producerFeatureEnabled else zeros(featureCapacity);
  trackingCurrentPixel := if publication.publication.imageCompleted then producerTrackingCurrentPixel else zeros(featureCapacity,2);
  trackingReferencePixel := if publication.publication.imageCompleted then producerTrackingReferencePixel else zeros(featureCapacity,2);
  trackingEnabled := if publication.publication.imageCompleted then producerTrackingEnabled else zeros(featureCapacity);
end AdvanceFastSLAM;

// Source-owned held-IMU batching for the complete raw-camera SLAM lifecycle.
// Not yet included in the qualified source manifest or browser runtime.
model RGBDFastSLAMIntervals
  parameter Integer imageHeight(min=1) = RGBDKeyframes.imageHeight;
  parameter Integer imageWidth(min=1) = RGBDKeyframes.imageWidth;
  parameter Boolean depthQualifiedSelection = true;
  input RGBDGraphProcessing.State previous;
  input Real rgb[imageHeight,imageWidth,channelCount];
  input Real depth[imageHeight,imageWidth];
  input Real depthUnits = 1.0 "Meters per depth sample";
  input Real rgbCalibration[4] = defaultRgbCalibration;
  input Real depthCalibration[4] = defaultDepthCalibration;
  input Real disparityNoise = 0.08;
  input Real noiseReferenceFx = 848.0/(2.0*tan(87.0*3.141592653589793/360.0));
  input Real baseline = 0.05;
  input Real opticalToBody[spaceDimension,spaceDimension] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[spaceDimension] = {0.18,0.0,-0.04};
  input Real accel[maximumIntervals,spaceDimension] = {{0.0,0.0,9.81} for interval in 1:maximumIntervals};
  input Real gyro[maximumIntervals,spaceDimension] = zeros(maximumIntervals,spaceDimension);
  input Real gravity[spaceDimension] = {0.0,0.0,-9.81};
  input Real density[noiseDimension] = {0.06,0.06,0.06,0.006,0.006,0.006,0.002,0.002,0.002,0.0002,0.0002,0.0002};
  input Real durations[maximumIntervals] = fill(1.0/90.0,maximumIntervals);
  input Real intervalTimes[maximumIntervals];
  input Integer intervalCount;
  input Real frameTime;
  input Integer imageEpoch;
  input Boolean imageRequested = true;
  input Boolean localCaptureRequested = true;
  input Boolean requested = true;
  input Integer minimumMeasuredDescriptors = 8;
  input Real minimumWordDistanceSquared = 0.04;
  input Real selectedFeatureLimit = featureCapacity;
  input Real absoluteThreshold = 18.0;
  input Real minimumInterval = 0.5;
  input Real maximumInterval = 2.0;
  input Real translationThreshold = 0.6;
  input Real rotationThreshold = 0.25;
  input Integer minimumFeatures = 12;
  input Real voxelWidth = 0.25;
  input Real mergeRadius = 0.15;
  input Real maximumDistance = 80.0;
  input Real tentativeLifetime = 0.5;
  input Real confirmedLifetime = 5.0;
  input Real confirmationObservations = 3.0;
  input Real maximumConfidence = 8.0;
  input Real maximumTentative = 700.0;
  input Boolean graphCorrectionRequested = true;
  input RGBDGraphProcessing.Policy graphPolicy = RGBDGraphProcessing.DefaultPolicy();
  output RGBDGraphProcessing.State next;
  output Boolean accepted;
  output Boolean imageCompleted;
  output Boolean mappingAccepted;
  output Boolean graphCorrectionAccepted;
  output Boolean roundoffCertified;
  output Integer publicationReason;
  output Integer ledgerReason;
  output Integer vocabularyReason;
  output Integer graphReason;
  output Integer graphCommitReason;
  output Integer graphFilterReason;
  output Integer covarianceStatus;
  output Real graphCostBefore;
  output Real graphCostAfter;
  output Real nextQuaternion[quaternionSize];
  output Real selectionValid;
  output Real predictionAccepted;
  output Real initializationAccepted;
  output Real observationAccepted;
  output Real captureAccepted;
  output Real matchCount;
  output Real features[featureCapacity,spaceDimension];
  output Real featureEnabled[featureCapacity];
  output Real trackingCurrentPixel[featureCapacity,2];
  output Real trackingReferencePixel[featureCapacity,2];
  output Real trackingEnabled[featureCapacity];
  output Integer processedIntervals "Successfully accepted calls before success or whole-batch rollback";
  output Integer failedInterval "One-based failing call; zero for preflight refusal or no failure";
  output Integer batchReason "0 success, 1 idle, 2 count, 3 chronology, 4 stale image, 5 interval refusal, 6 previous state";
protected
  constant Integer maximumIntervals = 36;
  constant Integer featureCapacity = RGBDKeyframes.featureCapacity;
  constant Integer descriptorSize = RGBDKeyframes.descriptorSize;
  final parameter Real defaultRgbCalibration[4] = RGBDNominalCalibration({imageHeight,imageWidth},{69.0,42.0});
  final parameter Real defaultDepthCalibration[4] = RGBDNominalCalibration({imageHeight,imageWidth},{87.0,58.0});
  constant Integer spaceDimension = RGBDKeyframes.dimension;
  constant Integer errorDimension = 5*spaceDimension;
  constant Integer poseDimension = 2*spaceDimension;
  constant Integer noiseDimension = 4*spaceDimension;
  parameter Integer channelCount(min=3,max=4) = 4;
  constant Integer quaternionSize = 4;
equation
  (next,accepted,imageCompleted,mappingAccepted,
    graphCorrectionAccepted,roundoffCertified,publicationReason,ledgerReason,
    vocabularyReason,graphReason,graphCommitReason,graphFilterReason,
    covarianceStatus,graphCostBefore,graphCostAfter,nextQuaternion,
    selectionValid,predictionAccepted,initializationAccepted,observationAccepted,
    captureAccepted,matchCount,features,featureEnabled,
    trackingCurrentPixel,trackingReferencePixel,trackingEnabled,processedIntervals,
    failedInterval,batchReason) =
    AdvanceFastSLAMIntervals(
      previous=previous,
      rgb=rgb,
      depth=depth,
      rgbCalibration=rgbCalibration,
      depthCalibration=depthCalibration,
      disparityNoise=disparityNoise,
      noiseReferenceFx=noiseReferenceFx,
      baseline=baseline,
      opticalToBody=opticalToBody,
      cameraOriginBody=cameraOriginBody,
      accel=accel,
      gyro=gyro,
      gravity=gravity,
      density=density,
      durations=durations,
      intervalTimes=intervalTimes,
      intervalCount=intervalCount,
      frameTime=frameTime,
      imageEpoch=imageEpoch,
      imageRequested=imageRequested,
      localCaptureRequested=localCaptureRequested,
      requested=requested,
      minimumMeasuredDescriptors=minimumMeasuredDescriptors,
      minimumWordDistanceSquared=minimumWordDistanceSquared,
      selectedFeatureLimit=selectedFeatureLimit,
      absoluteThreshold=absoluteThreshold,
                  depthQualifiedSelection=depthQualifiedSelection,
      minimumInterval=minimumInterval,
      maximumInterval=maximumInterval,
      translationThreshold=translationThreshold,
      rotationThreshold=rotationThreshold,
      minimumFeatures=minimumFeatures,
      voxelWidth=voxelWidth,
      mergeRadius=mergeRadius,
      maximumDistance=maximumDistance,
      tentativeLifetime=tentativeLifetime,
      confirmedLifetime=confirmedLifetime,
      confirmationObservations=confirmationObservations,
      maximumConfidence=maximumConfidence,
      maximumTentative=maximumTentative,
      graphCorrectionRequested=graphCorrectionRequested,
      graphPolicy=graphPolicy,depthUnits=depthUnits);
end RGBDFastSLAMIntervals;

// All active clocks are preflighted before evaluation. Only the last held
// interval can consume an image, capture a reference or attempt graph correction.
// A failed call rolls back the complete State, including graph attempt receipts.
function AdvanceFastSLAMIntervals
  input RGBDGraphProcessing.State previous;
  input Real rgb[:,:,:];
  input Real depth[size(rgb,1),size(rgb,2)];
  input Real rgbCalibration[4] = RGBDNominalCalibration({size(rgb,1),size(rgb,2)},{69.0,42.0});
  input Real depthCalibration[4] = RGBDNominalCalibration({size(rgb,1),size(rgb,2)},{87.0,58.0});
  input Real disparityNoise = 0.08;
  input Real noiseReferenceFx = 848.0/(2.0*tan(87.0*3.141592653589793/360.0));
  input Real baseline = 0.05;
  input Real opticalToBody[spaceDimension,spaceDimension] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[spaceDimension] = {0.18,0.0,-0.04};
  input Real accel[maximumIntervals,spaceDimension] = {{0.0,0.0,9.81} for interval in 1:maximumIntervals};
  input Real gyro[maximumIntervals,spaceDimension] = zeros(maximumIntervals,spaceDimension);
  input Real gravity[spaceDimension] = {0.0,0.0,-9.81};
  input Real density[noiseDimension] = {0.06,0.06,0.06,0.006,0.006,0.006,0.002,0.002,0.002,0.0002,0.0002,0.0002};
  input Real durations[maximumIntervals] = fill(1.0/90.0,maximumIntervals);
  input Real intervalTimes[maximumIntervals];
  input Integer intervalCount;
  input Real frameTime;
  input Integer imageEpoch;
  input Boolean imageRequested = true;
  input Boolean localCaptureRequested = true;
  input Boolean requested = true;
  input Integer minimumMeasuredDescriptors = 8;
  input Real minimumWordDistanceSquared = 0.04;
  input Real selectedFeatureLimit = featureCapacity;
  input Real absoluteThreshold = 18.0;
  input Real minimumInterval = 0.5;
  input Real maximumInterval = 2.0;
  input Real translationThreshold = 0.6;
  input Real rotationThreshold = 0.25;
  input Integer minimumFeatures = 12;
  input Real voxelWidth = 0.25;
  input Real mergeRadius = 0.15;
  input Real maximumDistance = 80.0;
  input Real tentativeLifetime = 0.5;
  input Real confirmedLifetime = 5.0;
  input Real confirmationObservations = 3.0;
  input Real maximumConfidence = 8.0;
  input Real maximumTentative = 700.0;
  input Boolean graphCorrectionRequested = true;
  input RGBDGraphProcessing.Policy graphPolicy = RGBDGraphProcessing.DefaultPolicy();
  output RGBDGraphProcessing.State next;
  output Boolean accepted;
  output Boolean imageCompleted;
  output Boolean mappingAccepted;
  output Boolean graphCorrectionAccepted;
  output Boolean roundoffCertified;
  output Integer publicationReason;
  output Integer ledgerReason;
  output Integer vocabularyReason;
  output Integer graphReason;
  output Integer graphCommitReason;
  output Integer graphFilterReason;
  output Integer covarianceStatus;
  output Real graphCostBefore;
  output Real graphCostAfter;
  output Real nextQuaternion[quaternionSize];
  output Real selectionValid;
  output Real predictionAccepted;
  output Real initializationAccepted;
  output Real observationAccepted;
  output Real captureAccepted;
  output Real matchCount;
  output Real features[featureCapacity,spaceDimension];
  output Real featureEnabled[featureCapacity];
  output Real trackingCurrentPixel[featureCapacity,2];
  output Real trackingReferencePixel[featureCapacity,2];
  output Real trackingEnabled[featureCapacity];
  output Integer processedIntervals "Successfully accepted calls before success or whole-batch rollback";
  output Integer failedInterval "One-based failing call; zero for preflight refusal or no failure";
  output Integer batchReason "0 success, 1 idle, 2 count, 3 chronology, 4 stale image, 5 interval refusal, 6 previous state";
  input Boolean depthQualifiedSelection = true;
  input Real depthUnits = 1.0 "Meters per depth sample; 1 for metric depth, SDK scale for Z16";
protected
  constant Integer maximumIntervals = 36;
  constant Integer featureCapacity = RGBDKeyframes.featureCapacity;
  constant Integer descriptorSize = RGBDKeyframes.descriptorSize;
  constant Integer spaceDimension = RGBDKeyframes.dimension;
  constant Integer errorDimension = 5*spaceDimension;
  constant Integer poseDimension = 2*spaceDimension;
  constant Integer noiseDimension = 4*spaceDimension;
  constant Integer channelCount = 4;
  constant Integer quaternionSize = 4;
  Boolean chronologyValid;
  Boolean continueBatch;
  Real previousEndpoint;
algorithm
  next := previous;
  accepted := false; imageCompleted := false; mappingAccepted := false;
  graphCorrectionAccepted := false; roundoffCertified := false;
  graphCostBefore := 0.0; graphCostAfter := 0.0;
  nextQuaternion := {1.0,0.0,0.0,0.0};
  selectionValid := 0.0; predictionAccepted := 0.0; initializationAccepted := 0.0;
  observationAccepted := 0.0; captureAccepted := 0.0; matchCount := 0.0;
  features := zeros(featureCapacity,spaceDimension); featureEnabled := zeros(featureCapacity);
  trackingCurrentPixel := zeros(featureCapacity,2); trackingReferencePixel := zeros(featureCapacity,2);
  trackingEnabled := zeros(featureCapacity);
  publicationReason := 1; ledgerReason := 1; vocabularyReason := 0; graphReason := 1;
  graphCommitReason := 0; graphFilterReason := 0; covarianceStatus := 0;
  processedIntervals := 0; failedInterval := 0; batchReason := 1;
  chronologyValid := false; continueBatch := false; previousEndpoint := 0.0;
  if requested then
    batchReason := 2;
    if intervalCount >= 1 and intervalCount <= maximumIntervals then
      batchReason := 6;
      if RGBDGraphProcessing.Valid(previous) and previous.estimator.localization.initialized then
        batchReason := 3;
        chronologyValid := frameTime >= 0.0 and frameTime <= 1e9;
        previousEndpoint := previous.estimator.localization.predictionTime;
        for interval in 1:intervalCount loop
          if chronologyValid then
            chronologyValid := ES15HeldIntervalValid(durations[interval])
              and intervalTimes[interval] >= 0.0 and intervalTimes[interval] <= 1e9
              and intervalTimes[interval] > previousEndpoint
              and abs(intervalTimes[interval]-previousEndpoint-durations[interval])
                <= 1e-12*max(1.0,abs(intervalTimes[interval]));
            if chronologyValid then previousEndpoint := intervalTimes[interval]; end if;
          end if;
        end for;
        if chronologyValid then
          chronologyValid := abs(previousEndpoint-frameTime) <= 1e-12*max(1.0,abs(frameTime));
        end if;
        if chronologyValid then
          batchReason := 4;
          // Image identity is checked against the original pre-batch ledger.
          // No intermediate prediction can turn a stale image into a fresh one.
          continueBatch := if imageRequested then
            RGBDLocalizationCatalog.ImageFresh(previous.estimator.localization,imageEpoch,frameTime) else true;
          if continueBatch then
            batchReason := 0;
            for interval in 1:intervalCount loop
              if continueBatch then
                (next,accepted,imageCompleted,mappingAccepted,
                  graphCorrectionAccepted,roundoffCertified,publicationReason,ledgerReason,
                  vocabularyReason,graphReason,graphCommitReason,graphFilterReason,
                  covarianceStatus,graphCostBefore,graphCostAfter,nextQuaternion,
                  selectionValid,predictionAccepted,initializationAccepted,observationAccepted,
                  captureAccepted,matchCount,features,featureEnabled,
                  trackingCurrentPixel,trackingReferencePixel,trackingEnabled) := AdvanceFastSLAM(
                  previous=next,
                  rgb=rgb,
                  depth=depth,
                  rgbCalibration=rgbCalibration,
                  depthCalibration=depthCalibration,
                  disparityNoise=disparityNoise,
                  noiseReferenceFx=noiseReferenceFx,
                  baseline=baseline,
                  opticalToBody=opticalToBody,
                  cameraOriginBody=cameraOriginBody,
                  accel=accel[interval,:],
                  gyro=gyro[interval,:],
                  gravity=gravity,
                  density=density,
                  h=durations[interval],
                  intervalTime=intervalTimes[interval],
                  imageEpoch=imageEpoch,
                  imageRequested=imageRequested and interval == intervalCount,
                  localCaptureRequested=localCaptureRequested and interval == intervalCount,
                  requested=requested,
                  minimumMeasuredDescriptors=minimumMeasuredDescriptors,
                  minimumWordDistanceSquared=minimumWordDistanceSquared,
                  selectedFeatureLimit=selectedFeatureLimit,
                  absoluteThreshold=absoluteThreshold,
                  depthQualifiedSelection=depthQualifiedSelection,
                  minimumInterval=minimumInterval,
                  maximumInterval=maximumInterval,
                  translationThreshold=translationThreshold,
                  rotationThreshold=rotationThreshold,
                  minimumFeatures=minimumFeatures,
                  voxelWidth=voxelWidth,
                  mergeRadius=mergeRadius,
                  maximumDistance=maximumDistance,
                  tentativeLifetime=tentativeLifetime,
                  confirmedLifetime=confirmedLifetime,
                  confirmationObservations=confirmationObservations,
                  maximumConfidence=maximumConfidence,
                  maximumTentative=maximumTentative,
                  graphCorrectionRequested=graphCorrectionRequested and interval == intervalCount,
                  graphPolicy=graphPolicy,depthUnits=depthUnits);
                if accepted and SLAMExactRealEqual(predictionAccepted,1.0) then
                  processedIntervals := processedIntervals+1;
                else
                  failedInterval := interval; batchReason := 5; continueBatch := false;
                end if;
              end if;
            end for;
          end if;
        end if;
      end if;
    end if;
  end if;
  if batchReason == 5 then
    // Keep only the failing call's rejection codes and batch diagnostics.
    // Neither a partial State nor an earlier image/producer/display result escapes.
    next := previous;
    accepted := false; imageCompleted := false; mappingAccepted := false;
    graphCorrectionAccepted := false; roundoffCertified := false;
    graphCostBefore := 0.0; graphCostAfter := 0.0;
    nextQuaternion := {1.0,0.0,0.0,0.0};
    selectionValid := 0.0; predictionAccepted := 0.0; initializationAccepted := 0.0;
    observationAccepted := 0.0; captureAccepted := 0.0; matchCount := 0.0;
    features := zeros(featureCapacity,spaceDimension); featureEnabled := zeros(featureCapacity);
    trackingCurrentPixel := zeros(featureCapacity,2); trackingReferencePixel := zeros(featureCapacity,2);
    trackingEnabled := zeros(featureCapacity);
  end if;
end AdvanceFastSLAMIntervals;

// Native common D435 stream mode. RGB and depth keep separate optical
// calibrations; this package specifies array extents, not alignment.
// RGB supports60 Hz, depth90 Hz; paired acquisitions use at most60 Hz.
package D435ImageProfile
  constant Integer width = 848;
  constant Integer height = 480;
  constant Integer colorChannels = 3;
  constant Real depthUnits = 0.001 "Default SDK scale, meters per Z16 unit";
end D435ImageProfile;

// Full-frame Rumoca compilation target; inherited FAST math is unchanged.
// This is a staged target, not evidence of full-SLAM browser admission.
model D435FastNativeFrame
  extends FastNativeFrame(width=D435ImageProfile.width,
    height=D435ImageProfile.height,channels=D435ImageProfile.colorChannels);
end D435FastNativeFrame;

// Native-camera entrypoints for the complete authored SLAM processing graph.
// Native RGB8/Z16 shape and depth-scale bindings: math and State are shared
// with the parameterized entrypoints. These targets still require Rumoca WASM
// issuance and end-to-end browser qualification before runtime admission.
model D435FastSLAMInitialize
  extends RGBDFastSLAMInitialize(imageHeight=D435ImageProfile.height,
    imageWidth=D435ImageProfile.width,channelCount=D435ImageProfile.colorChannels,
    depthUnits=D435ImageProfile.depthUnits);
end D435FastSLAMInitialize;

model D435FastSLAMStep
  extends RGBDFastSLAMStep(imageHeight=D435ImageProfile.height,
    imageWidth=D435ImageProfile.width,channelCount=D435ImageProfile.colorChannels,
    depthUnits=D435ImageProfile.depthUnits);
end D435FastSLAMStep;

model D435FastSLAMIntervals
  extends RGBDFastSLAMIntervals(imageHeight=D435ImageProfile.height,
    imageWidth=D435ImageProfile.width,channelCount=D435ImageProfile.colorChannels,
    depthUnits=D435ImageProfile.depthUnits);
end D435FastSLAMIntervals;
