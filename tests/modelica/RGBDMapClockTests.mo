package RGBDMapClockTests
  function Run
    input Integer slots; input Integer features;
    output Boolean checks[14];
  protected
    Real previous[slots,8]; Real expected[slots,8]; Real next[slots,8]; Real first[slots,8];
    Real candidate[features,3]; Real mask[features]; Real stats[13]; Real expectedStats[13];
    Integer receipt[slots]; Integer expectedReceipt[slots]; Integer firstReceipt[slots];
    Real oldTime; Real now; Real oldFrame; Real frame; Real oldWorld; Real world;
    Boolean accepted; Real reason; Boolean correct;
  algorithm
    assert(slots == 14400 and features == 350,"Map clock gates retain full14400/350 domains");
    checks := fill(false,14);
    for scenario in 1:14 loop
      previous := zeros(slots,8); candidate := fill(1e101,features,3); mask := zeros(features);
      candidate[features,:] := {0.4,-0.2,2.0}; mask[features] := 1;
      oldTime := 0; now := 0; oldFrame := 0; frame := 1; oldWorld := 17; world := 17;
      accepted := scenario == 1 or scenario == 2 or scenario == 9 or scenario == 10 or scenario == 11;
      reason := if accepted then 0 else if scenario == 8 or scenario == 14 then 2 else 1;
      if scenario == 2 then mask := zeros(features);
      elseif scenario == 3 then oldFrame := 1; frame := 2; mask := zeros(features);
      elseif scenario == 4 then oldTime := 1; oldFrame := 1; frame := 2;
      elseif scenario == 5 then oldTime := 1; now := 1;
      elseif scenario == 6 then frame := 2;
      elseif scenario == 7 then world := 18;
      elseif scenario == 8 or scenario == 14 then
        previous[slots,:] := {5,6,7,1,3,0,if scenario == 8 then 1 else 0,1};
        // Refusals must preserve raw payload even in inactive storage holes.
        previous[2,:] := {11,12,13,0,-7,-8,-9,0};
      elseif scenario == 9 then
        mask := ones(features);
        for feature in 1:features loop candidate[feature,:] := {(mod(feature-1,25)-12)*0.6,(div(feature-1,25)-7)*0.6,2}; end for;
      elseif scenario == 10 or scenario == 11 or scenario == 12 then
        (first,firstReceipt,stats) := RGBDLandmarkReceiptTests.Update(previous,candidate,mask,timeNow=0,
          previousWorldFrame=17,worldFrame=17);
        assert(stats[1] == 1 and firstReceipt[1] == features,"True zero-time bootstrap must seed follow-up controls");
        previous := first; oldFrame := 1; frame := 2;
        now := if scenario == 12 then 0 else 1.0/90.0;
        if scenario == 11 then mask[1] := 1; candidate[1,:] := candidate[features,:]; end if;
      elseif scenario == 13 then now := -1;
      end if;
      (next,receipt,stats) := RGBDLandmarkReceiptTests.Update(previous,candidate,mask,
        previousTime=oldTime,timeNow=now,previousFrame=oldFrame,frameNow=frame,previousWorldFrame=oldWorld,worldFrame=world);
      expected := previous; expectedReceipt := fill(0,slots);
      expectedStats := {if accepted then 1 else 0,reason,if accepted then now else oldTime,if accepted then frame else oldFrame,
        if accepted then world else oldWorld,0,0,0,0,0,0,0,0};
      if accepted then
        expected := zeros(slots,8);
        if scenario == 1 then
          expected[1,:] := {0.4,-0.2,2,1,1,0,1,0}; expectedReceipt[1] := features;
          expectedStats[6] := 1; expectedStats[8] := 1; expectedStats[9] := 1;
        elseif scenario == 9 then
          for slot in 1:features loop
            expected[slot,:] := {candidate[slot,1],candidate[slot,2],2,1,1,0,1,0}; expectedReceipt[slot] := slot;
          end for;
          expectedStats[6] := features; expectedStats[8] := features; expectedStats[9] := features;
        elseif scenario == 10 or scenario == 11 then
          expected[1,:] := {0.4,-0.2,2,1,2,now,2,0};
          expectedStats[6] := 1; expectedStats[8] := 1; expectedStats[10] := if scenario == 11 then 2 else 1;
        end if;
      elseif scenario == 8 or scenario == 14 then
        expectedStats[6] := 1; expectedStats[7] := 1;
      elseif scenario == 12 then expectedStats[6] := 1; expectedStats[8] := 1;
      end if;
      correct := true;
      for slot in 1:slots loop
        correct := correct and receipt[slot] == expectedReceipt[slot];
        for column in 1:8 loop correct := correct and next[slot,column] == expected[slot,column]; end for;
      end for;
      for scalar in 1:13 loop correct := correct and stats[scalar] == expectedStats[scalar]; end for;
      checks[scenario] := correct;
    end for;
  end Run;
  function Legacy
    output Boolean checks[29];
  protected
    Boolean passed[28]; Integer checked;
  algorithm
    (passed,checked) := RGBDLandmarkMapTests.Run(14400,350,0.0);
    for index in 1:28 loop checks[index] := passed[index]; end for;
    checks[29] := checked == 28*(14400*8+13);
  end Legacy;

  function Receipts
    output Boolean checks[17];
  protected
    Boolean passed[16]; Integer checked;
  algorithm
    (passed,checked) := RGBDLandmarkReceiptTests.Run(14400,350);
    for index in 1:16 loop checks[index] := passed[index]; end for;
    checks[17] := checked == 16*14400;
  end Receipts;
end RGBDMapClockTests;
