package RasterSelectionGuardTests
  constant Integer width = 160; constant Integer height = 90;
  constant Integer capacity = width*height;
  function Check
    input Integer scenario;
    output Boolean checks[6];
  protected
    Real scores[capacity]; Real settings[8]; Boolean grid; Boolean enabled;
    Real features[capacity,3]; Real count; Real valid;
    Real expected[capacity,3]; Real expectedCount; Real expectedValid;
  algorithm
    for index in 1:capacity loop scores[index] := mod(index*37,256); end for;
    settings := {18.0,0.0,1e8,3.0,350.0,1.0,3.0,3.0}; grid := false;
    enabled := scenario <> 1 and scenario <> 3 and scenario <> 5 and scenario <> 7;
    if not enabled then scores := fill(1e200,capacity); end if;
    if scenario == 3 then settings[1] := 0.0;
    elseif scenario == 5 then settings[5] := 0.0;
    elseif scenario == 6 or scenario == 7 then
      grid := true; settings := {0.0,0.0,1.0,0.0,350.0,6.0,5.0,5.0};
    elseif scenario == 8 then settings[1] := 257.0;
    elseif scenario == 9 then settings[1] := 0.0; settings[4] := 0.0; settings[5] := capacity;
    elseif scenario == 10 then scores[1] := 1e200;
    elseif scenario == 11 then scores := fill(25.0,capacity); settings[4] := 0.0;
    elseif scenario == 12 then scores[1] := 500.0; settings[2] := 1.0;
    elseif scenario == 13 then settings[5] := 350.5;
    elseif scenario == 14 then scores := fill(-1.0,capacity);
    elseif scenario == 15 then
      grid := true; settings := {0.0,0.0,1.0,0.0,1.0,6.0,5.0,5.0};
      scores[capacity] := 1e200;
    end if;
    if scenario == 16 then
      (features,count,valid) := SelectRasterFeatures(scores,width,height,capacity,3,settings,grid);
    else
      (features,count,valid) := SelectRasterFeatures(scores,width,height,capacity,3,settings,grid,enabled);
    end if;
    if enabled then
      (expected,expectedCount,expectedValid) := SelectRasterFeaturesReference(scores,width,height,capacity,3,settings,grid);
    else
      expected := zeros(capacity,3); expectedCount := 0.0;
      // Disabled acquisitions still report malformed configuration, while
      // poisoned score payload is intentionally outside the processing clock.
      expectedValid := if scenario == 5 then 0.0 else 1.0;
    end if;
    checks := fill(true,6); checks[1] := count == expectedCount; checks[2] := valid == expectedValid;
    for slot in 1:capacity loop
      for coordinate in 1:3 loop
        checks[3] := checks[3] and features[slot,coordinate] == expected[slot,coordinate];
      end for;
    end for;
    if scenario == 9 then checks[4] := count == (width-6)*(height-6) and valid == 1.0;
    elseif scenario == 11 then
      checks[4] := count == 350 and valid == 1.0 and features[1,1] == 3 and features[1,2] == 3
        and features[350,1] == 44 and features[350,2] == 5;
    elseif scenario == 12 or scenario == 14 or not enabled then checks[4] := count == 0.0;
    elseif scenario == 15 then checks[4] := count == 1.0 and valid == 1.0;
    end if;
    checks[5] := scenario >= 1 and scenario <= 16;
    checks[6] := count >= 0.0 and count <= capacity and floor(count) == count;
  end Check;
end RasterSelectionGuardTests;

model RasterSelectionGuardAcceptance
  output Integer scenario;
  output Boolean checks[6];
equation
  scenario = min(16,integer(floor(time))+1);
  checks = RasterSelectionGuardTests.Check(scenario);
end RasterSelectionGuardAcceptance;
