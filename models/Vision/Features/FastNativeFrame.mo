// Generated from CogniPilot/modelica_models cb132c87a9e00289bbac11642110976248734878; edit the canonical packages there.
// FAST-9 samples a radius-three circle, not every cell of a square patch.
package FastCircleStencil
  constant Integer radius = 3;
  constant Integer sampleCount = 16;
  // Row/column offsets, clockwise from the top of the radius-three circle.
  constant Integer offsets[sampleCount,2] = [
    -3,0; -3,1; -2,2; -1,3; 0,3; 1,3; 2,2; 3,1;
    3,0; 3,-1; 2,-2; 1,-3; 0,-3; -1,-3; -2,-2; -3,-1];
end FastCircleStencil;

// Ordered FAST-9 score from the sixteen circle-minus-center differences.
// Strict comparisons retain the second operand on ties, including signed zero.
function FastCircleScore

  input Real differences[FastCircleStencil.sampleCount];
  output Real score;
protected
  constant Integer circleSize = FastCircleStencil.sampleCount;
  constant Integer arcLength = 9;
  Real extended[circleSize+arcLength-1];
  Real low2[circleSize+arcLength-3];
  Real high2[circleSize+arcLength-3];
  Real low4[circleSize+arcLength-5];
  Real high4[circleSize+arcLength-5];
  Real low8;
  Real high8;
  Real bright;
  Real dark;
  Real response;
algorithm
  // Reuse ordered minima/maxima for windows of 2, 4, 8, then 9 samples.
  for i in 1:circleSize loop
    extended[i] := differences[i];
  end for;
  for i in 1:arcLength-1 loop
    extended[i+circleSize] := differences[i];
  end for;
  for i in 1:size(low2,1) loop
    low2[i] := if noEvent(extended[i] < extended[i+1]) then extended[i] else extended[i+1];
    high2[i] := if noEvent(extended[i] > extended[i+1]) then extended[i] else extended[i+1];
  end for;
  for i in 1:size(low4,1) loop
    low4[i] := if noEvent(low2[i] < low2[i+2]) then low2[i] else low2[i+2];
    high4[i] := if noEvent(high2[i] > high2[i+2]) then high2[i] else high2[i+2];
  end for;
  // Final arc stages need no intermediate arrays.
  score := 0.0;
  for arc in 1:circleSize loop
    low8 := if noEvent(low4[arc] < low4[arc+4]) then low4[arc] else low4[arc+4];
    high8 := if noEvent(high4[arc] > high4[arc+4]) then high4[arc] else high4[arc+4];
    bright := if noEvent(low8 < extended[arc+8]) then low8 else extended[arc+8];
    dark := -(if noEvent(high8 > extended[arc+8]) then high8 else extended[arc+8]);
    response := if noEvent(bright > dark) then bright else dark;
    score := if noEvent(score > response) then score else response;
  end for;
end FastCircleScore;

// Standalone patch scoring reads only the FAST circle.
function FastPatchScore

  input Real gray[2*FastCircleStencil.radius+1,2*FastCircleStencil.radius+1];
  output Real score;
protected
  constant Integer center = FastCircleStencil.radius+1;
  Real differences[FastCircleStencil.sampleCount];
algorithm
  for sample in 1:FastCircleStencil.sampleCount loop
    differences[sample] := gray[center+FastCircleStencil.offsets[sample,1],
      center+FastCircleStencil.offsets[sample,2]]-gray[center,center];
  end for;
  score := FastCircleScore(differences);
end FastPatchScore;

// Keep two rank bins below the threshold to preserve selector admission.
function FastSelectionScoreFloor
  input Real absoluteThreshold;
  input Real rankScale;
  output Real scoreFloor;
algorithm
  scoreFloor := 0.0;
  if absoluteThreshold > 0.0 and absoluteThreshold <= 255.0
      and rankScale >= 1.0 and rankScale <= 1e12 then
    scoreFloor := max(0.0,(floor(absoluteThreshold*rankScale)-2.0)/rankScale);
  end if;
end FastSelectionScoreFloor;

// Every FAST-9 arc contains adjacent cardinal samples, including wraparound.
function FastCircleCanReachScore

  input Real differences[FastCircleStencil.sampleCount];
  input Real scoreFloor;
  output Boolean possible;
protected
  constant Integer cardinalCount = 4;
  constant Integer stride = div(FastCircleStencil.sampleCount,cardinalCount);
  Integer sample;
  Boolean firstBright;
  Boolean firstDark;
  Boolean lastBright;
  Boolean lastDark;
  Boolean bright;
  Boolean dark;
algorithm
  possible := true;
  if scoreFloor > 0.0 and scoreFloor <= 255.0 then
    firstBright := differences[1] >= scoreFloor;
    firstDark := -differences[1] >= scoreFloor;
    lastBright := firstBright;
    lastDark := firstDark;
    possible := false;
    for cardinal in 2:cardinalCount loop
      sample := 1+(cardinal-1)*stride;
      bright := differences[sample] >= scoreFloor;
      dark := -differences[sample] >= scoreFloor;
      possible := possible or (lastBright and bright) or (lastDark and dark);
      lastBright := bright;
      lastDark := dark;
    end for;
    possible := possible or (lastBright and firstBright) or (lastDark and firstDark);
    if not possible then
      // Conservatively retain enormous finite values as well as NaN/infinity.
      for slot in 1:size(differences,1) loop
        possible := possible or not (abs(differences[slot]) <= 1e308);
      end for;
    end if;
  end if;
end FastCircleCanReachScore;

// Array-level acquisition guard: no grayscale or patch work on held-IMU calls.
function FastFrameScores

  input Real rgb[:,:,:];
  input Boolean enabled = true;
  input Real scoreFloor = 0.0 "Optional conservative selection floor; zero keeps every score";
  output Real scores[size(rgb,1)*size(rgb,2)];
protected
  constant Integer radius = FastCircleStencil.radius;
  Real gray[size(rgb,1),size(rgb,2)];
  Real differences[FastCircleStencil.sampleCount];
  Real center;
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
        center := gray[row,column];
        for sample in 1:FastCircleStencil.sampleCount loop
          differences[sample] := gray[row+FastCircleStencil.offsets[sample,1],
            column+FastCircleStencil.offsets[sample,2]]-center;
        end for;
        if FastCircleCanReachScore(differences,scoreFloor) then
          scores[(row-1)*size(rgb,2)+column] := FastCircleScore(differences);
        end if;
      end for;
    end for;
  end if;
end FastFrameScores;

// Row-major RGB/RGBA input; alpha is ignored.
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
