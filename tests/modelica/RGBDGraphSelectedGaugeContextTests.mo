package RGBDGraphSelectedGaugeContextTests
  constant Integer checkCount = 16;

  function Equal
    input RGBDGraphSelectedGauge.Context a; input RGBDGraphSelectedGauge.Context b;
    output Boolean same;
  algorithm
    same := a.generation == b.generation and a.sourceRevision == b.sourceRevision
      and a.graphRevision == b.graphRevision and a.catalogPoseRevision == b.catalogPoseRevision;
    for slot in 1:128 loop
      same := same and a.captureIds[slot] == b.captureIds[slot]
        and a.captureSequences[slot] == b.captureSequences[slot];
    end for;
  end Equal;

  function Run
    input Real clock; output Boolean checks[checkCount];
  protected
    RGBDKeyframes.Catalog catalog; RGBDGraphMeasurements.State graph;
    RGBDGraphCaptureLedger.State ledger;
    RGBDGraphSelectedGauge.Context previous; RGBDGraphSelectedGauge.Context expected;
    RGBDGraphSelectedGauge.Context result;
    Boolean accepted; Boolean requested; Integer reason; Integer expectedReason;
    Integer count; Integer base; Integer slot; Integer sourceRevision; Integer step; Integer poseRevision;
  algorithm
    checks := fill(false,checkCount);
    for scenario in 1:checkCount loop
      count := if scenario == 2 then 4 else 128; base := if count == 128 then 133 else 0;
      catalog := RGBDKeyframes.Empty(2,1); graph := RGBDGraphMeasurements.Empty(2);
      catalog.nextId := base+count+1; catalog.nextSlot := mod(catalog.nextId-1,128)+1;
      catalog.lastEpoch := 300+5*count; catalog.lastTime := 20+0.02*count+clock;
      ledger := RGBDGraphCaptureLedger.Empty(2,13);
      ledger.catalogNextId := catalog.nextId; ledger.lastStep := 2000;
      // Inactive payload is deliberately poisoned; occupied metadata owns validity.
      ledger.ids := fill(-77,128); ledger.epochs := fill(-77,128);
      ledger.sequences := fill(-77,128); ledger.times := fill(1e100,128);
      for node in 1:count loop
        slot := mod(base+node-1,128)+1;
        catalog.occupied[slot] := true; catalog.ids[slot] := base+node;
        catalog.generations[slot] := 2; catalog.epochs[slot] := 300+5*node;
        catalog.imageTimes[slot] := 20+0.02*node+clock;
        ledger.ids[slot] := catalog.ids[slot]; ledger.epochs[slot] := catalog.epochs[slot];
        ledger.times[slot] := catalog.imageTimes[slot]; ledger.sequences[slot] := 1000+7*node;
      end for;
      graph.revision := 9; graph.lastCaptureId := catalog.nextId-1;
      sourceRevision := 13; step := 2000; poseRevision := 4; requested := true; expectedReason := 2;
      previous.generation := -1; previous.sourceRevision := -2; previous.graphRevision := -3;
      previous.catalogPoseRevision := -4; previous.captureIds := fill(-5,128);
      previous.captureSequences := fill(-6,128);
      expected.generation := 2; expected.sourceRevision := 13; expected.graphRevision := 9;
      expected.catalogPoseRevision := 4; expected.captureIds := ledger.ids; expected.captureSequences := ledger.sequences;
      slot := mod(catalog.nextId-2,128)+1;
      if scenario <= 2 then expectedReason := 0;
      elseif scenario == 3 then
        requested := false; expectedReason := 1; catalog.nextId := -1;
        ledger.generation := -1; graph.generation := -1; poseRevision := -1;
      elseif scenario == 4 then ledger.ids[slot] := ledger.ids[slot]-128;
      elseif scenario == 5 then ledger.epochs[slot] := ledger.epochs[slot]+1;
      elseif scenario == 6 then ledger.times[slot] := ledger.times[slot]+0.1;
      elseif scenario == 7 then ledger.sequences[slot] := 0;
      elseif scenario == 8 then step := 1999;
      elseif scenario == 9 then sourceRevision := 14;
      elseif scenario == 10 then ledger.catalogNextId := ledger.catalogNextId+1;
      elseif scenario == 11 then ledger.generation := 3;
      elseif scenario == 12 then graph.generation := 3; expectedReason := 3;
      elseif scenario == 13 then graph.revision := 0; expectedReason := 3;
      elseif scenario == 14 then graph.revision := RGBDKeyframes.identifierLimit+1; expectedReason := 3;
      elseif scenario == 15 then poseRevision := -1; expectedReason := 3;
      elseif scenario == 16 then poseRevision := RGBDKeyframes.identifierLimit; expectedReason := 3;
      end if;
      (result,accepted,reason) := RGBDGraphSelectedGauge.ContextFromLedger(
        previous,ledger,catalog,graph,sourceRevision,step,poseRevision,requested);
      checks[scenario] := reason == expectedReason and accepted == (scenario <= 2)
        and Equal(result,if scenario <= 2 then expected else previous);
      if scenario <= 2 then
        checks[scenario] := checks[scenario] and result.captureSequences[slot] <> catalog.ids[slot]
          and result.captureSequences[slot] <> catalog.epochs[slot];
      end if;
    end for;
  end Run;
end RGBDGraphSelectedGaugeContextTests;
