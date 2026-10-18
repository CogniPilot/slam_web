package RGBDGraphCaptureLedgerTests
  constant Integer capacity = RGBDKeyframes.keyframeCapacity;

  function Catalog
    input Integer nextId; output RGBDKeyframes.Catalog catalog;
  protected Integer id;
  algorithm
    catalog := RGBDKeyframes.Empty(3,1); catalog.nextId := nextId;
    catalog.nextSlot := mod(nextId-1,RGBDKeyframes.keyframeCapacity)+1;
    catalog.lastEpoch := if nextId == 1 then -1 else 1000+3*(nextId-1);
    catalog.lastTime := if nextId == 1 then 0 else (nextId-1)/8.0;
    for slot in 1:RGBDKeyframes.keyframeCapacity loop
      id := max(1,nextId-RGBDKeyframes.keyframeCapacity)+mod(slot-max(1,nextId-RGBDKeyframes.keyframeCapacity),RGBDKeyframes.keyframeCapacity);
      if id < nextId then
        catalog.occupied[slot] := true; catalog.ids[slot] := id;
        catalog.generations[slot] := 3; catalog.vocabularyVersions[slot] := 1;
        catalog.epochs[slot] := 1000+3*id; catalog.imageTimes[slot] := id/8.0;
      end if;
    end for;
  end Catalog;

  function Equal
    input RGBDGraphCaptureLedger.State a; input RGBDGraphCaptureLedger.State b;
    output Boolean same;
  algorithm
    same := a.generation == b.generation and a.sourceRevision == b.sourceRevision
      and a.catalogNextId == b.catalogNextId and a.lastStep == b.lastStep
      and sum(abs(a.ids-b.ids)) == 0 and sum(abs(a.epochs-b.epochs)) == 0
      and sum(abs(a.sequences-b.sequences)) == 0 and sum(abs(a.times-b.times)) == 0;
  end Equal;

  function Run
    output Boolean checks[16];
  protected
    RGBDKeyframes.Catalog catalog; RGBDKeyframes.Catalog nextCatalog;
    RGBDGraphCaptureLedger.State base; RGBDGraphCaptureLedger.State previous;
    RGBDGraphCaptureLedger.State result; RGBDGraphCaptureLedger.State expected;
    Boolean accepted; Boolean wanted; Boolean requested; Boolean published;
    Integer reason; Integer step; Integer sourceRevision;
  algorithm
    catalog := Catalog(capacity+1); base := RGBDGraphCaptureLedger.Empty(3,17);
    base.catalogNextId := capacity+1; base.lastStep := 400;
    for slot in 1:RGBDKeyframes.keyframeCapacity loop
      base.ids[slot] := catalog.ids[slot]; base.epochs[slot] := catalog.epochs[slot];
      base.times[slot] := catalog.imageTimes[slot]; base.sequences[slot] := 2*catalog.ids[slot]+7;
    end for;
    checks := fill(false,16);
    for scenario in 1:16 loop
      catalog := Catalog(capacity+1); nextCatalog := catalog; previous := base;
      step := 401; sourceRevision := 17; requested := true; published := true;
      wanted := scenario == 1 or scenario == 2 or scenario == 10 or scenario == 14 or scenario == 15;
      if scenario == 2 or scenario == 7 or scenario == 10 then nextCatalog := Catalog(capacity+2); end if;
      if scenario == 3 then nextCatalog.generation := 4;
      elseif scenario == 4 then sourceRevision := 18;
      elseif scenario == 5 then step := 402;
      elseif scenario == 6 then previous.epochs[capacity] := previous.epochs[capacity]-1;
      elseif scenario == 7 then nextCatalog.imageTimes[div(capacity,2)] := nextCatalog.imageTimes[div(capacity,2)]+0.001;
      elseif scenario == 8 then nextCatalog := Catalog(capacity+3);
      elseif scenario == 9 then previous.sequences[capacity] := previous.sequences[capacity-1];
      elseif scenario == 10 then previous.lastStep := 2*capacity+7; step := 2*capacity+8;
      elseif scenario == 11 then
        requested := false; previous.generation := -8; previous.times[capacity] := 1e100;
        catalog.nextId := -1; nextCatalog.nextId := -1; step := -1;
      elseif scenario == 12 then published := false;
      elseif scenario == 13 then previous.lastStep := RGBDKeyframes.identifierLimit-1; step := RGBDKeyframes.identifierLimit;
      elseif scenario == 14 or scenario == 15 then
        catalog := Catalog(1); previous := RGBDGraphCaptureLedger.Empty(3,17); step := 1;
        nextCatalog := if scenario == 14 then Catalog(2) else catalog;
        if scenario == 14 then nextCatalog.lastTime := 0; nextCatalog.imageTimes[1] := 0; end if;
      elseif scenario == 16 then previous.ids[1] := capacity+1;
      end if;
      expected := previous;
      if wanted then
        expected.lastStep := step; expected.catalogNextId := nextCatalog.nextId;
        if scenario == 2 or scenario == 10 or scenario == 14 then
          expected.ids[1] := nextCatalog.ids[1]; expected.epochs[1] := nextCatalog.epochs[1];
          expected.times[1] := nextCatalog.imageTimes[1]; expected.sequences[1] := step;
        end if;
      end if;
      (result,accepted,reason) := RGBDGraphCaptureLedger.Advance(previous,catalog,nextCatalog,sourceRevision,step,published,requested);
      checks[scenario] := accepted == wanted and Equal(result,expected)
        and (if wanted then reason == 0 else reason > 0);
      if scenario == 2 then
        checks[scenario] := checks[scenario] and result.ids[1] == capacity+1
          and result.epochs[1] == 1000+3*(capacity+1) and result.sequences[1] == 401
          and result.sequences[capacity] == 2*capacity+7;
      end if;
    end for;
  end Run;
end RGBDGraphCaptureLedgerTests;
