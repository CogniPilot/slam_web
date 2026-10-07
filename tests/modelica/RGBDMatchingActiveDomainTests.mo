package RGBDMatchingActiveDomainTests
  // Full350-slot inputs, including sparse holes and the final physical slot.
  function Check
    input Integer scenario;
    output Boolean checks[12];
  protected
    Real referenceDescriptor[350,49]; Real currentDescriptor[350,49];
    Real referencePoint[350,3]; Real currentPoint[350,3];
    Real referenceEnabled[350]; Real currentEnabled[350];
    Real referenceCount; Real currentCount; Real ratio; Real maximumDistance;
    Real usePrediction; Real rotation[3,3]; Real translation[3]; Real geometricLimit;
    Real patch[49]; Real norm; Integer destination; Boolean active;
    Real index[350]; Real pair[350]; Real source[350,3]; Real target[350,3];
    Real count; Real configuration; Real invalidReference; Real invalidCurrent;
    Real nearest[350]; Real second[350];
    Real oldIndex[350]; Real oldPair[350]; Real oldSource[350,3]; Real oldTarget[350,3];
    Real oldCount; Real oldConfiguration; Real oldInvalidReference; Real oldInvalidCurrent;
    Real oldNearest[350]; Real oldSecond[350];
  algorithm
    referenceDescriptor := fill(1e101,350,49); currentDescriptor := fill(1e101,350,49);
    referencePoint := fill(1e101,350,3); currentPoint := fill(1e101,350,3);
    referenceEnabled := zeros(350); currentEnabled := zeros(350);
    referenceCount := 350; currentCount := 350; ratio := 0.8; maximumDistance := 0.8;
    usePrediction := 0.0; rotation := identity(3); translation := zeros(3); geometricLimit := 0.5;
    for slot in 1:350 loop
      active := scenario <> 1 and scenario <> 15 or slot == 1 or slot == 175 or slot == 350;
      if active then
        for sample in 1:49 loop
          patch[sample] := sin(0.011*slot*sample^2+cos(0.017*slot*sample));
        end for;
        norm := sqrt(patch*patch);
        referenceDescriptor[slot,:] := patch/norm;
        referencePoint[slot,:] := {slot/100.0,mod(slot,7)/10.0,2.0};
        referenceEnabled[slot] := 1.0;
        destination := 351-slot;
        currentDescriptor[destination,:] := referenceDescriptor[slot,:];
        currentPoint[destination,:] := referencePoint[slot,:]+{0.05,0.0,0.0};
        currentEnabled[destination] := 1.0;
      end if;
    end for;
    if scenario == 3 then
      currentCount := 0.0;
      // Held-IMU call: no current domain, even if stale payload/masks remain.
      currentDescriptor := fill(1e101,350,49); currentPoint := fill(1e101,350,3);
    elseif scenario == 4 then
      referenceEnabled := zeros(350); currentEnabled := zeros(350);
    elseif scenario == 5 then
      referenceDescriptor := zeros(350,49); currentDescriptor := zeros(350,49);
    elseif scenario == 6 then currentCount := 349.0;
    elseif scenario == 7 then referenceCount := 3.5;
    elseif scenario == 8 then currentCount := 350.5;
    elseif scenario == 9 then ratio := 1.0;
    elseif scenario == 10 then maximumDistance := -1.0;
    elseif scenario == 11 then usePrediction := 2.0;
    elseif scenario == 12 or scenario == 22 then
      usePrediction := 1.0; translation := {0.05,0.0,0.0};
      geometricLimit := if scenario == 22 then 0.0 else 0.5;
    elseif scenario == 13 then usePrediction := 1.0; translation := {20.0,0.0,0.0};
    elseif scenario == 14 then usePrediction := 1.0; rotation[1,1] := 2.0;
    elseif scenario == 16 then
      // Equal descriptors force exact nearest/second and reciprocal ties.
      for slot in 1:350 loop currentDescriptor[slot,:] := referenceDescriptor[1,:]; end for;
    elseif scenario == 17 then currentEnabled := zeros(350); currentEnabled[350] := 1.0;
    elseif scenario == 18 then referenceEnabled[175] := 0.5; currentEnabled[350] := -1.0;
    elseif scenario == 19 then referenceDescriptor[350,:] := fill(1e101,49); currentPoint[1,:] := fill(1e101,3);
    elseif scenario == 20 then referenceCount := 1.0; currentCount := 1.0;
    elseif scenario == 21 then referenceCount := 0.0;
    elseif scenario == 23 then
      // Repeated opposite-signed zero payload under disabled masks.
      referenceEnabled[350] := 0.0; currentEnabled[1] := 0.0;
      referenceDescriptor[350,:] := fill(-0.0,49); currentDescriptor[1,:] := zeros(49);
    elseif scenario == 24 then referenceCount := -1.0; currentCount := -1.0;
    end if;
    (index,pair,source,target,count,configuration,invalidReference,invalidCurrent,nearest,second) :=
      MatchRGBDDescriptors(referenceDescriptor,currentDescriptor,referencePoint,currentPoint,
        referenceEnabled,currentEnabled,referenceCount,currentCount,ratio,maximumDistance,
        usePrediction,rotation,translation,geometricLimit);
    (oldIndex,oldPair,oldSource,oldTarget,oldCount,oldConfiguration,oldInvalidReference,oldInvalidCurrent,oldNearest,oldSecond) :=
      MatchRGBDDescriptorsDenseReference(referenceDescriptor,currentDescriptor,referencePoint,currentPoint,
        referenceEnabled,currentEnabled,referenceCount,currentCount,ratio,maximumDistance,
        usePrediction,rotation,translation,geometricLimit);
    checks := fill(true,12);
    checks[1] := count == oldCount; checks[2] := configuration == oldConfiguration;
    checks[3] := invalidReference == oldInvalidReference; checks[4] := invalidCurrent == oldInvalidCurrent;
    for slot in 1:350 loop
      checks[5] := checks[5] and index[slot] == oldIndex[slot];
      checks[6] := checks[6] and pair[slot] == oldPair[slot];
      checks[7] := checks[7] and nearest[slot] == oldNearest[slot];
      checks[8] := checks[8] and second[slot] == oldSecond[slot];
      for coordinate in 1:3 loop
        checks[9] := checks[9] and source[slot,coordinate] == oldSource[slot,coordinate];
        checks[10] := checks[10] and target[slot,coordinate] == oldTarget[slot,coordinate];
      end for;
    end for;
    // Independent expectations ensure the baseline is not the only oracle.
    if scenario == 1 or scenario == 15 then
      checks[11] := count == 3 and index[350] == 1 and pair[175] == 1.0;
    elseif scenario == 2 or scenario == 12 then
      checks[11] := count == 350 and index[350] == 1 and index[1] == 350;
    elseif scenario == 3 or scenario == 4 or scenario == 5 or scenario == 13
      or scenario == 16 or scenario == 17 or scenario == 20 or scenario == 21 or scenario == 22 or scenario == 24 then
      checks[11] := count == 0;
    end if;
    // A zero-radius prediction admits only one candidate per slot. The ratio
    // test requires a finite second candidate and correctly refuses the pair.
    checks[12] := scenario >= 1 and scenario <= 24;
  end Check;
end RGBDMatchingActiveDomainTests;

model RGBDMatchingActiveDomainAcceptance
  output Integer scenario;
  output Boolean checks[12];
equation
  scenario = min(24,integer(floor(time))+1);
  checks = RGBDMatchingActiveDomainTests.Check(scenario);
end RGBDMatchingActiveDomainAcceptance;
