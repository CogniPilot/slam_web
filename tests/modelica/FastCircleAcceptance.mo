// Test-only comparison to the frozen pre-change implementation. The runner
// loads that source with historical entry points renamed LegacyFast*.
package FastCircleReference
  function Image
    input Integer imageSize[2]; input Integer channels; input Integer phase = 0;
    output Real rgb[imageSize[1],imageSize[2],channels];
  algorithm
    for row in 1:imageSize[1] loop
      for column in 1:imageSize[2] loop
        for channel in 1:channels loop
          rgb[row,column,channel] := if channel == 4 then sin(exp(1000.0+phase))
            else mod(17*row+31*column+7*row*column+13*channel+phase,256);
        end for;
      end for;
    end for;
  end Image;

  function Equal
    input Real left[:]; input Real right[size(left,1)]; output Boolean equal;
  algorithm
    equal := true;
    for cell in 1:size(left,1) loop
      equal := equal and ((left[cell] <= right[cell] and right[cell] <= left[cell])
        or (not (left[cell] <= 0 or left[cell] >= 0) and not (right[cell] <= 0 or right[cell] >= 0)));
    end for;
  end Equal;

  impure function Grid
    input Integer imageSize[2]; input Integer channels; input Integer caseId;
    input String resultFile; input Real clock;
    output Boolean checks[3];
  protected
    Real rgb[imageSize[1],imageSize[2],channels];
    Real oldScores[imageSize[1]*imageSize[2]]; Real scores[size(oldScores,1)];
    Real storage[1,size(oldScores,1)]; Boolean written;
  algorithm
    rgb := Image(imageSize,channels);
    if caseId == 9 then
      rgb[5,5,1] := sin(exp(1000+clock));
      rgb[6,6,2] := exp(1000+clock); rgb[7,7,3] := -exp(1000+clock);
    end if;
    oldScores := LegacyFastFrameScores(rgb,true); scores := FastFrameScores(rgb,true);
    checks := {Equal(oldScores,scores),true,true};
    for row in 1:imageSize[1] loop
      for column in 1:imageSize[2] loop
        if row <= FastCircleStencil.radius or column <= FastCircleStencil.radius
          or row > imageSize[1]-FastCircleStencil.radius or column > imageSize[2]-FastCircleStencil.radius then
          checks[2] := checks[2] and scores[(row-1)*imageSize[2]+column] == 0;
        end if;
      end for;
    end for;
    for cell in 1:size(scores,1) loop storage[1,cell] := oldScores[cell]; end for;
    written := Modelica.Utilities.Streams.writeRealMatrix(resultFile+"-before-"+String(caseId)+".mat","scores",storage,false);
    assert(written,"Historical score matrix write failed");
    for cell in 1:size(scores,1) loop storage[1,cell] := scores[cell]; end for;
    written := Modelica.Utilities.Streams.writeRealMatrix(resultFile+"-after-"+String(caseId)+".mat","scores",storage,false);
    assert(written,"Circle score matrix write failed");
    // Disabled inputs are opaque regardless of channels, image extent or poison.
    rgb := fill(sin(exp(1000+clock)),imageSize[1],imageSize[2],channels);
    scores := FastFrameScores(rgb,false);
    for cell in 1:size(scores,1) loop checks[3] := checks[3] and scores[cell] == 0; end for;
  end Grid;

  impure function Run
    input String fixtureFile; input String resultFile; input Real clock;
    output Boolean checks[9,3];
  protected
    Integer imageSize[2]; Integer channels;
    Real patches[23,49]; Real patch[7,7]; Real outputScores[1,23];
    Boolean written;
  algorithm
    for caseId in 1:9 loop
      imageSize := if caseId == 1 then {1,1} else if caseId == 2 then {6,5}
        else if caseId == 3 then {7,7} else if caseId == 4 then {13,17}
        else if caseId == 5 then {17,13} else if caseId == 6 then {90,160}
        else if caseId == 7 or caseId == 8 then {480,848} else {13,17};
      channels := if caseId == 8 then 4 else 3;
      checks[caseId,:] := Grid(imageSize,channels,caseId,resultFile,clock);
    end for;
    // Independent historical patch goldens include ties and signed zeros.
    patches := Modelica.Utilities.Streams.readRealMatrix(fixtureFile,"patches",23,49,false);
    for sample in 1:size(patches,1) loop
      for row in 1:size(patch,1) loop
        for column in 1:size(patch,2) loop patch[row,column] := patches[sample,(row-1)*size(patch,2)+column]; end for;
      end for;
      outputScores[1,sample] := FastPatchScore(patch);
    end for;
    written := Modelica.Utilities.Streams.writeRealMatrix(resultFile+"-patches.mat","scores",outputScores,false);
    assert(written,"Patch score matrix write failed");
  end Run;

  function Benchmark
    input Boolean circle; input Integer repetitions; input Real clock;
    output Real checksum;
  protected
    constant Integer imageSize[2] = {480,848};
    Real rgb[imageSize[1],imageSize[2],3]; Real scores[imageSize[1]*imageSize[2]];
  algorithm
    checksum := clock;
    for iteration in 1:repetitions loop
      rgb := Image(imageSize,3,iteration);
      scores := if circle then FastFrameScores(rgb,true) else LegacyFastFrameScores(rgb,true);
      for cell in 1:size(scores,1) loop checksum := checksum+scores[cell]; end for;
    end for;
  end Benchmark;
end FastCircleReference;

model FastCircleAcceptance
  parameter String fixtureFile = ""; parameter String resultFile = "";
  output Boolean checks[9,3];
algorithm
  when initial() then
    (checks) := FastCircleReference.Run(fixtureFile,resultFile,time);
  end when;
end FastCircleAcceptance;

model FastCircleBenchmark
  parameter Boolean circle = true; parameter Integer repetitions = 3;
  output Real checksum;
algorithm
  when initial() then checksum := FastCircleReference.Benchmark(circle,repetitions,time); end when;
end FastCircleBenchmark;
