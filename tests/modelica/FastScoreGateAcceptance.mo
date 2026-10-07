// Development reference only. Historical scoring and feature selection are
// loaded independently; all production math remains in the authored functions.
package FastScoreGateReference
  function Image
    input String file; input Integer frame;
    output Real rgb[480,848,3];
  protected
    Real packed[480,848*3];
  algorithm
    packed := Modelica.Utilities.Streams.readRealMatrix(file,"rgb"+String(frame),480,848*3,false);
    for row in 1:size(rgb,1) loop
      for column in 1:size(rgb,2) loop
        for channel in 1:size(rgb,3) loop
          rgb[row,column,channel] := packed[row,(column-1)*size(rgb,3)+channel];
        end for;
      end for;
    end for;
  end Image;

  function Select
    input Real scores[:]; input Integer width; input Integer height;
    input Real threshold = 18.0; input Real scale = 1e8;
    output Real features[350,3]; output Real count; output Real valid;
  algorithm
    (features,count,valid) := SelectRasterFeatures(scores,width,height,350,3,
      {threshold,0.0,scale,3.0,350.0,1.0,3.0,3.0},false,true);
  end Select;

  impure function Run
    input String file; input String resultFile; input Real clock;
    output Boolean checks[16]; output Real metrics[3,4];
  protected
    Real differences[16]; Real score; Real floorScore; Real amplitude;
    Real rgb[480,848,3]; Real before[480*848]; Real after[480*848];
    Real featuresBefore[350,3]; Real featuresAfter[350,3]; Real storage[6,350*3];
    Real countBefore; Real countAfter; Real validBefore; Real validAfter;
    Real edge[6]; Real gatedEdge[6]; Real selectedBefore[6,3]; Real selectedAfter[6,3];
    Real threshold; Integer skipped; Boolean written;
  algorithm
    checks := fill(true,16); metrics := zeros(3,4); storage := zeros(6,350*3);
    // Exhaust all binary circle patterns in both signs, at and around the
    // threshold. This checks a necessary condition, not a replacement scorer.
    for pattern in 0:65535 loop
      for sign in 1:2 loop
        for level in 1:3 loop
          amplitude := if level == 1 then 18.0 else if level == 2 then 18.0-1e-8 else 18.0+1e-8;
          for sample in 1:size(differences,1) loop
            differences[sample] := (if sign == 1 then 1.0 else -1.0)
              *(if mod(div(pattern,integer(2^(sample-1))),2) == 1 then amplitude else 0.0);
          end for;
          score := BeforeFastCircleScore(differences);
          checks[1] := checks[1] and (FastCircleCanReachScore(differences,18.0) or score < 18.0);
        end for;
      end for;
    end for;
    // Nonfinite inputs keep full scoring, even away from cardinal samples.
    for slot in 1:size(differences,1) loop
      differences := zeros(size(differences,1)); differences[slot] := sin(exp(1000+clock));
      checks[2] := checks[2] and FastCircleCanReachScore(differences,18.0);
      differences[slot] := exp(1000+clock);
      checks[2] := checks[2] and FastCircleCanReachScore(differences,18.0);
      differences[slot] := -exp(1000+clock);
      checks[2] := checks[2] and FastCircleCanReachScore(differences,18.0);
    end for;
    differences := zeros(size(differences,1));
    checks[3] := FastCircleCanReachScore(differences,0.0)
      and FastCircleCanReachScore(differences,-1.0)
      and FastCircleCanReachScore(differences,256.0)
      and FastCircleCanReachScore(differences,exp(1000+clock))
      and FastCircleCanReachScore(differences,sin(exp(1000+clock)));
    checks[4] := FastSelectionScoreFloor(18.0,1e8) < 18.0-1e-9
      and FastSelectionScoreFloor(0.0,1e8) == 0.0;
    for frame in 1:3 loop
      rgb := Image(file,frame);
      before := BeforeFastFrameScores(rgb,true);
      after := FastFrameScores(rgb,true);
      for cell in 1:size(before,1) loop checks[2+3*frame] := checks[2+3*frame] and before[cell] == after[cell]; end for;
      floorScore := FastSelectionScoreFloor(18.0,1e8);
      after := FastFrameScores(rgb,true,floorScore); skipped := 0;
      for cell in 1:size(before,1) loop
        checks[3+3*frame] := checks[3+3*frame] and
          (before[cell] == after[cell] or (before[cell] < floorScore and after[cell] == 0.0));
        if before[cell] <> after[cell] then skipped := skipped+1; end if;
      end for;
      (featuresBefore,countBefore,validBefore) := Select(before,size(rgb,2),size(rgb,1));
      (featuresAfter,countAfter,validAfter) := Select(after,size(rgb,2),size(rgb,1));
      checks[4+3*frame] := countBefore == countAfter and validBefore == 1.0 and validAfter == 1.0;
      for feature in 1:size(featuresBefore,1) loop
        for axis in 1:size(featuresBefore,2) loop
          checks[4+3*frame] := checks[4+3*frame] and featuresBefore[feature,axis] == featuresAfter[feature,axis];
          storage[frame,(feature-1)*3+axis] := featuresBefore[feature,axis];
          storage[frame+3,(feature-1)*3+axis] := featuresAfter[feature,axis];
        end for;
      end for;
      metrics[frame,:] := {countBefore,countAfter,skipped,max(before)};
    end for;
    // Preserve the selector's early stop inside rounded-rank ties. Removing a
    // slightly subthreshold entry here would change the selected features.
    for level in 1:8 loop
      threshold := 18.0+(level-1)*3e-9;
      edge := {threshold-1e-9,threshold,threshold+1e-9,threshold-1e-8,threshold+1e-8,0.0};
      floorScore := FastSelectionScoreFloor(threshold,1e8);
      gatedEdge := edge;
      for cell in 1:size(edge,1) loop
        if edge[cell] < floorScore then gatedEdge[cell] := 0.0; end if;
      end for;
      (selectedBefore,countBefore,validBefore) := SelectRasterFeatures(edge,6,1,6,0,{threshold,0,1e8,0,6,1,0,0},false,true);
      (selectedAfter,countAfter,validAfter) := SelectRasterFeatures(gatedEdge,6,1,6,0,{threshold,0,1e8,0,6,1,0,0},false,true);
      checks[14] := checks[14] and countBefore == countAfter and validBefore == validAfter;
      for feature in 1:6 loop
        for axis in 1:3 loop checks[14] := checks[14] and selectedBefore[feature,axis] == selectedAfter[feature,axis]; end for;
      end for;
    end for;
    checks[15] := FastSelectionScoreFloor(-1,1e8) == 0
      and FastSelectionScoreFloor(256,1e8) == 0
      and FastSelectionScoreFloor(sin(exp(1000+clock)),1e8) == 0
      and FastSelectionScoreFloor(18,0) == 0
      and FastSelectionScoreFloor(18,exp(1000+clock)) == 0;
    // Avoid OMC expanding a fixed-size three-dimensional fill into hundreds
    // of thousands of literal array constructors in this reference harness.
    for row in 1:size(rgb,1) loop
      for column in 1:size(rgb,2) loop
        for channel in 1:size(rgb,3) loop rgb[row,column,channel] := sin(exp(1000+clock)); end for;
      end for;
    end for;
    after := FastFrameScores(rgb,false,18.0);
    for cell in 1:size(after,1) loop checks[16] := checks[16] and after[cell] == 0.0; end for;
    written := Modelica.Utilities.Streams.writeRealMatrix(resultFile,"features",storage,false);
    assert(written,"Selected feature matrix write failed");
  end Run;

  function Benchmark
    input String file; input Boolean gated; output Real checksum;
  protected
    Real rgb[480,848,3]; Real scores[480*848]; Real features[350,3]; Real count; Real valid;
  algorithm
    checksum := 0.0;
    for frame in 1:3 loop
      rgb := Image(file,frame);
      scores := if gated then FastFrameScores(rgb,true,FastSelectionScoreFloor(18.0,1e8))
        else BeforeBenchmarkFrameScores(rgb,true,FastSelectionScoreFloor(18.0,1e8));
      (features,count,valid) := Select(scores,size(rgb,2),size(rgb,1));
      checksum := checksum+sum(features)+count+valid;
    end for;
  end Benchmark;
end FastScoreGateReference;

model FastScoreGateAcceptance
  parameter String file = ""; parameter String resultFile = "";
  output Boolean checks[16]; output Real metrics[3,4];
algorithm
  when initial() then (checks,metrics) := FastScoreGateReference.Run(file,resultFile,time); end when;
end FastScoreGateAcceptance;

model FastScoreGateBenchmark
  parameter String file = ""; parameter Boolean gated = true;
  output Real checksum;
algorithm
  when initial() then checksum := FastScoreGateReference.Benchmark(file,gated); end when;
end FastScoreGateBenchmark;
