// Independent development reference. The unbounded function is loaded from
// an exact frozen preimage; production compilation remains owned by Rumoca.
package RGBDMatchingBoundReference
  constant Integer capacity = 350;
  constant Integer descriptorSize = 49;
  constant Integer height = 480;
  constant Integer width = 848;
  constant Integer resultSize = capacity*10+4;
  constant Integer fixtureSize = capacity*(descriptorSize+4)+1;

  function Results
    input Real referenceDescriptor[capacity,descriptorSize]; input Real currentDescriptor[capacity,descriptorSize];
    input Real referencePoint[capacity,3]; input Real currentPoint[capacity,3];
    input Real referenceEnabled[capacity]; input Real currentEnabled[capacity];
    input Real referenceCount; input Real currentCount; input Boolean bounded;
    input Boolean predict = false;
    output Real values[resultSize];
  protected
    Real index[capacity]; Real pair[capacity]; Real source[capacity,3]; Real target[capacity,3];
    Real count; Real configuration; Real invalidReference; Real invalidCurrent;
    Real nearest[capacity]; Real second[capacity]; Integer offset;
  algorithm
    if bounded then
      (index,pair,source,target,count,configuration,invalidReference,invalidCurrent,nearest,second) :=
        MatchRGBDDescriptors(referenceDescriptor,currentDescriptor,referencePoint,currentPoint,
          referenceEnabled,currentEnabled,referenceCount,currentCount,0.8,0.8,
          if predict then 1.0 else 0.0,identity(3),zeros(3),0.5);
    else
      (index,pair,source,target,count,configuration,invalidReference,invalidCurrent,nearest,second) :=
        MatchRGBDDescriptorsUnboundedReference(referenceDescriptor,currentDescriptor,referencePoint,currentPoint,
          referenceEnabled,currentEnabled,referenceCount,currentCount,0.8,0.8,
          if predict then 1.0 else 0.0,identity(3),zeros(3),0.5);
    end if;
    for slot in 1:capacity loop
      offset := (slot-1)*10;
      values[offset+1] := index[slot]; values[offset+2] := pair[slot];
      for axis in 1:3 loop
        values[offset+2+axis] := source[slot,axis]; values[offset+5+axis] := target[slot,axis];
      end for;
      values[offset+9] := nearest[slot]; values[offset+10] := second[slot];
    end for;
    values[resultSize-3:resultSize] := {count,configuration,invalidReference,invalidCurrent};
  end Results;

  impure function Describe
    input String file; input Integer frame;
    output Real descriptor[capacity,descriptorSize]; output Real point[capacity,3];
    output Real enabled[capacity]; output Real count;
  protected
    Real packed[height,width*3]; Real rgb[height,width,3]; Real depth[height,width];
    Real calibration[1,14]; Real scores[height*width]; Real features[capacity,3];
    Real valid; Real invalid;
  algorithm
    packed := Modelica.Utilities.Streams.readRealMatrix(file,"rgb_"+String(frame),height,width*3,false);
    depth := Modelica.Utilities.Streams.readRealMatrix(file,"depth_"+String(frame),height,width,false);
    calibration := Modelica.Utilities.Streams.readRealMatrix(file,"calibration",1,14,false);
    for row in 1:height loop
      for column in 1:width loop
        for channel in 1:3 loop rgb[row,column,channel] := packed[row,(column-1)*3+channel]; end for;
      end for;
    end for;
    scores := FastFrameScores(rgb,true,FastSelectionScoreFloor(18.0,1e8));
    scores := RGBDDepthQualifiedScores(depth,scores,
      {calibration[1,5],calibration[1,6],calibration[1,3],calibration[1,4]},calibration[1,1:4],
      0.28,10.0,calibration[1,8],calibration[1,9],calibration[1,7],depthUnits=0.001);
    (features,count,valid) := SelectRasterFeatures(scores,width,height,capacity,3,
      {18.0,0.0,1e8,3.0,350.0,1.0,3.0,3.0},false,true);
    assert(valid == 1.0 and count >= 2.0,"Actual captured image needs selected features");
    (descriptor,point,enabled,invalid) := DescribeRGBDFrame(rgb,depth,features[:,1:2],count,
      {calibration[1,5],calibration[1,6],calibration[1,3],calibration[1,4]},calibration[1,1:4],
      calibration[1,8],calibration[1,9],calibration[1,7],0.28,10.0,1e-6,depthUnits=0.001);
  end Describe;

  impure function Run
    input String file; input String resultFile; input String fixtureFile;
    output Boolean checks[16]; output Real matches[4];
  protected
    Real first[capacity,descriptorSize]; Real second[capacity,descriptorSize];
    Real firstPoint[capacity,3]; Real secondPoint[capacity,3];
    Real firstEnabled[capacity]; Real secondEnabled[capacity];
    Real firstCount; Real secondCount; Real fixture[3,fixtureSize];
    Real storage[32,resultSize]; Real before[resultSize]; Real after[resultSize];
    Real patch[descriptorSize]; Real norm; Real values[3,capacity,descriptorSize];
    Real points[3,capacity,3]; Real enabled[3,capacity]; Real counts[3];
    Integer coordinate; Integer destination; Boolean written; Integer referenceFrame; Integer currentFrame;
  algorithm
    checks := fill(true,16); matches := zeros(4); storage := zeros(32,resultSize);
    firstPoint := zeros(capacity,3); secondPoint := zeros(capacity,3);
    for slot in 1:capacity loop
      firstPoint[slot,:] := {slot/100.0,-0.0,2.0};
      secondPoint[slot,:] := firstPoint[slot,:]+{0.05,0.0,0.0};
    end for;
    for scenario in 1:12 loop
      first := zeros(capacity,descriptorSize); second := zeros(capacity,descriptorSize);
      firstEnabled := ones(capacity); secondEnabled := ones(capacity);
      firstCount := capacity; secondCount := capacity;
      for slot in 1:capacity loop
        coordinate := if scenario <= 4 then 1 else descriptorSize;
        first[slot,coordinate] := 1.0;
        second[slot,coordinate] := if scenario == 2 or scenario == 6 then -1.0 else 1.0;
        if scenario == 3 or scenario == 7 then
          second[slot,coordinate] := 0.0; second[slot,descriptorSize+1-coordinate] := 1.0;
        elseif scenario == 4 or scenario == 8 then
          second[slot,coordinate] := cos(slot*1e-4);
          second[slot,descriptorSize+1-coordinate] := sin(slot*1e-4);
        elseif scenario >= 9 then
          // Reverse correspondence, then exact repeated descriptors: both
          // directions must retain their original lowest physical slot.
          for sample in 1:descriptorSize loop patch[sample] := sin(0.011*slot*sample^2); end for;
          norm := sqrt(patch*patch); first[slot,:] := patch/norm;
        end if;
      end for;
      if scenario >= 9 then
        for slot in 1:capacity loop
          destination := capacity+1-slot; second[destination,:] := first[slot,:];
        end for;
      end if;
      if scenario == 9 then second[1,:] := second[capacity,:];
      elseif scenario == 10 then
        firstCount := 1.0; secondCount := 2.0;
        second[1,:] := first[1,:]; second[2,:] := -first[1,:];
      elseif scenario == 11 then
        firstEnabled[1] := 0.0; secondEnabled[capacity] := 0.0;
        first[1,:] := fill(1e101,descriptorSize); second[capacity,:] := fill(1e101,descriptorSize);
      elseif scenario == 12 then firstCount := 0.0; end if;
      before := Results(first,second,firstPoint,secondPoint,firstEnabled,secondEnabled,firstCount,secondCount,false);
      after := Results(first,second,firstPoint,secondPoint,firstEnabled,secondEnabled,firstCount,secondCount,true);
      for cell in 1:resultSize loop checks[scenario] := checks[scenario] and before[cell] == after[cell]; end for;
      // Explicit answers for zero-distance, distance2/distance4 ties, and
      // the singleton reference with two genuinely distinct candidates.
      if scenario == 1 or scenario == 5 then
        checks[scenario] := checks[scenario] and after[9] == 0.0 and after[10] == 0.0 and after[resultSize-3] == 0.0;
      elseif scenario == 2 or scenario == 6 then
        checks[scenario] := checks[scenario] and after[9] == 4.0 and after[10] == 4.0 and after[resultSize-3] == 0.0;
      elseif scenario == 3 or scenario == 7 then
        checks[scenario] := checks[scenario] and after[9] == 2.0 and after[10] == 2.0 and after[resultSize-3] == 0.0;
      elseif scenario == 10 then checks[scenario] := checks[scenario] and after[1] == 1.0 and after[resultSize-3] == 1.0;
      end if;
      storage[2*scenario-1,:] := before; storage[2*scenario,:] := after;
    end for;
    for frame in 1:3 loop
      (first,firstPoint,firstEnabled,firstCount) := Describe(file,1+(frame-1)*6);
      values[frame,:,:] := first; points[frame,:,:] := firstPoint;
      enabled[frame,:] := firstEnabled; counts[frame] := firstCount;
      for slot in 1:capacity loop
        for sample in 1:descriptorSize loop
          fixture[frame,(slot-1)*(descriptorSize+4)+sample] := first[slot,sample];
        end for;
        for axis in 1:3 loop
          fixture[frame,(slot-1)*(descriptorSize+4)+descriptorSize+axis] := firstPoint[slot,axis];
        end for;
        fixture[frame,slot*(descriptorSize+4)] := firstEnabled[slot];
      end for;
      fixture[frame,fixtureSize] := firstCount;
    end for;
    for pair in 1:4 loop
      referenceFrame := if pair <= 2 then 1 else 2; currentFrame := referenceFrame+1;
      before := Results(values[referenceFrame,:,:],values[currentFrame,:,:],points[referenceFrame,:,:],points[currentFrame,:,:],
        enabled[referenceFrame,:],enabled[currentFrame,:],counts[referenceFrame],counts[currentFrame],false,mod(pair,2) == 0);
      after := Results(values[referenceFrame,:,:],values[currentFrame,:,:],points[referenceFrame,:,:],points[currentFrame,:,:],
        enabled[referenceFrame,:],enabled[currentFrame,:],counts[referenceFrame],counts[currentFrame],true,mod(pair,2) == 0);
      for cell in 1:resultSize loop checks[12+pair] := checks[12+pair] and before[cell] == after[cell]; end for;
      matches[pair] := after[resultSize-3];
      storage[24+2*pair-1,:] := before; storage[24+2*pair,:] := after;
    end for;
    written := Modelica.Utilities.Streams.writeRealMatrix(resultFile,"matching",storage,false);
    assert(written,"Every-output comparison write failed");
    written := Modelica.Utilities.Streams.writeRealMatrix(fixtureFile,"descriptors",fixture,false);
    assert(written,"Measured descriptor fixture write failed");
  end Run;

  impure function Benchmark
    input String fixtureFile; input Boolean bounded; output Real checksum;
  protected
    Real descriptor[3,capacity,descriptorSize]; Real point[3,capacity,3]; Real enabled[3,capacity]; Real counts[3];
    Real fixture[3,fixtureSize]; Real result[resultSize]; Integer referenceFrame;
  algorithm
    fixture := Modelica.Utilities.Streams.readRealMatrix(fixtureFile,"descriptors",3,fixtureSize,false);
    for frame in 1:3 loop
      for slot in 1:capacity loop
        for sample in 1:descriptorSize loop
          descriptor[frame,slot,sample] := fixture[frame,(slot-1)*(descriptorSize+4)+sample];
        end for;
        for axis in 1:3 loop
          point[frame,slot,axis] := fixture[frame,(slot-1)*(descriptorSize+4)+descriptorSize+axis];
        end for;
        enabled[frame,slot] := fixture[frame,slot*(descriptorSize+4)];
      end for;
      counts[frame] := fixture[frame,fixtureSize];
    end for;
    checksum := 0.0;
    for repeat in 1:32 loop
      for pair in 1:4 loop
        referenceFrame := if pair <= 2 then 1 else 2;
        result := Results(descriptor[referenceFrame,:,:],descriptor[referenceFrame+1,:,:],point[referenceFrame,:,:],point[referenceFrame+1,:,:],
          enabled[referenceFrame,:],enabled[referenceFrame+1,:],counts[referenceFrame],counts[referenceFrame+1],bounded,mod(pair,2) == 0);
        checksum := checksum+sum(result[1:capacity*10])+result[resultSize-3];
      end for;
    end for;
  end Benchmark;
end RGBDMatchingBoundReference;

model RGBDMatchingBoundAcceptance
  parameter String file = ""; parameter String resultFile = ""; parameter String fixtureFile = "";
  output Boolean checks[16]; output Real matches[4];
algorithm
  when initial() then (checks,matches) := RGBDMatchingBoundReference.Run(file,resultFile,fixtureFile); end when;
end RGBDMatchingBoundAcceptance;

model RGBDMatchingBoundBenchmark
  parameter String fixtureFile = ""; parameter Boolean bounded = true;
  output Real checksum;
algorithm
  when initial() then checksum := RGBDMatchingBoundReference.Benchmark(fixtureFile,bounded); end when;
end RGBDMatchingBoundBenchmark;
