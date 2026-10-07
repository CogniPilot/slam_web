package RGBDVisualVocabularyTests
  constant Integer checkCount = 43;

  function Same
    input RGBDVisualVocabulary.State a; input RGBDVisualVocabulary.State b;
    output Boolean same;
  algorithm
    same := a.generation == b.generation and a.sourceRevision == b.sourceRevision
      and a.version == b.version and a.count == b.count and a.ready == b.ready;
    for word in 1:RGBDKeyframes.wordCapacity loop
      same := same and a.enabled[word] == b.enabled[word];
      for component in 1:RGBDKeyframes.descriptorSize loop
        same := same and a.words[word,component] == b.words[word,component];
      end for;
    end for;
  end Same;

  function Run
    input Real clock;
    output Boolean checks[checkCount];
  protected
    RGBDVisualVocabulary.State empty; RGBDVisualVocabulary.State prior;
    RGBDVisualVocabulary.State result; RGBDVisualVocabulary.State learned;
    Real descriptor[350,49]; Real mask[350]; Boolean accepted; Integer reason;
    Real wordIndex[350]; Real histogram[256]; Real ids[4]; Real slots[4]; Real scores[4];
    Real history[128,256]; Real historyMask[128]; Real historyId[128]; Real historyTime[128];
    Real nextHistory[128,256]; Real nextMask[128]; Real nextId[128]; Real nextTime[128];
    Real version; Real nextSlot; Real timeNow; Real configuration; Real vocabularyCount;
    Real assignmentCount; Real retrieval; Real candidates; Real stored; Real invalidHistory;
    Real expected; Boolean normalized; Boolean indices;
  algorithm
    checks := fill(false,checkCount); empty := RGBDVisualVocabulary.Empty(1,2,3);
    descriptor := fill(1e100,350,49); mask := zeros(350);
    accepted := false; reason := 0; normalized := true; indices := true; expected := 0.0;
    wordIndex := zeros(350); histogram := zeros(256); ids := zeros(4); slots := zeros(4); scores := zeros(4);
    history := zeros(128,256); historyMask := zeros(128); historyId := zeros(128); historyTime := zeros(128);
    nextHistory := history; nextMask := historyMask; nextId := historyId; nextTime := historyTime;
    version := 0.0; nextSlot := 1.0; timeNow := 0.0; configuration := 0.0; vocabularyCount := 0.0;
    assignmentCount := 0.0; retrieval := 0.0; candidates := 0.0; stored := 0.0; invalidHistory := 0.0;
    checks[1] := RGBDVisualVocabulary.Valid(empty) and not empty.ready and empty.count == 0;
    descriptor[1,:] := zeros(49); descriptor[1,1] := 1.0+clock*0.0; mask[1] := 1.0;
    (prior,accepted,reason) := RGBDVisualVocabulary.Learn(empty,descriptor,mask,1.0,1,2,3);
    checks[2] := accepted and reason == 2 and prior.count == 1 and not prior.ready;
    for k in 1:49 loop
      expected := (if k == 1 then 48.0/49.0 else -1.0/49.0)/sqrt(48.0/49.0);
      normalized := normalized and abs(prior.words[1,k]-expected) < 1e-12;
    end for;
    checks[3] := normalized and RGBDVisualVocabulary.Valid(prior);
    descriptor[350,:] := zeros(49); descriptor[350,2] := 1.0; mask[1] := 0.0; mask[350] := 1.0;
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(prior,descriptor,mask,350.0,1,2,3);
    checks[4] := accepted and reason == 2 and result.count == 2 and not result.ready;
    // Sparse late-domain slot participates; disabled poison never normalizes.
    for feature in 1:7 loop
      descriptor[feature,:] := zeros(49); descriptor[feature,if mod(feature,2) == 1 then 1 else 2] := 1.0;
      mask[feature] := 1.0;
    end for;
    (learned,accepted,reason) := RGBDVisualVocabulary.Bootstrap(empty,descriptor,mask,350.0,1,2,3);
    checks[5] := accepted and reason == 1 and learned.ready and learned.count == 2;
    checks[6] := RGBDVisualVocabulary.Valid(learned) and learned.enabled[1] == 1.0
      and learned.enabled[2] == 1.0 and learned.enabled[256] == 0.0;
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(empty,descriptor,mask,350.0,1,2,3,true,9);
    checks[7] := accepted and result.count == 2 and not result.ready and reason == 2;
    descriptor[1,:] := zeros(49); descriptor[1,3] := 1.0;
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(learned,descriptor,mask,350.0,1,2,3);
    checks[8] := accepted and reason == 3 and Same(result,learned);
    // Whole-state refusal, including a valid early sample preceding bad slot350.
    descriptor[350,1] := 1e100;
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(prior,descriptor,mask,350.0,1,2,3);
    checks[9] := not accepted and reason == -4 and Same(result,prior);
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(learned,descriptor,mask,350.0,1,2,3);
    checks[10] := not accepted and reason == -4 and Same(result,learned);
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(empty,descriptor,mask,350.0,1,2,3,false);
    checks[11] := not accepted and reason == 0 and Same(result,empty);
    descriptor[350,:] := zeros(49); descriptor[350,2] := 1.0;
    mask[349] := 0.5;
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(prior,descriptor,mask,350.0,1,2,3);
    checks[12] := not accepted and reason == -4 and Same(result,prior);
    mask[349] := -1.0;
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(prior,descriptor,mask,350.0,1,2,3);
    checks[13] := not accepted and reason == -4 and Same(result,prior);
    mask[349] := 0.0;
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(prior,descriptor,mask,349.0,1,2,3);
    checks[14] := not accepted and reason == -4 and Same(result,prior);
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(prior,descriptor,mask,349.5,1,2,3);
    checks[15] := not accepted and reason == -4 and Same(result,prior);
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(prior,descriptor,mask,-1.0,1,2,3);
    checks[16] := not accepted and reason == -4 and Same(result,prior);
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(prior,descriptor,mask,351.0,1,2,3);
    checks[17] := not accepted and reason == -4 and Same(result,prior);
    descriptor[350,:] := zeros(49);
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(prior,descriptor,mask,350.0,1,2,3);
    checks[18] := not accepted and reason == -4 and Same(result,prior);
    descriptor[350,2] := 1.0;
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(prior,descriptor,mask,350.0,2,2,3);
    checks[19] := not accepted and reason == -2 and Same(result,prior);
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(prior,descriptor,mask,350.0,1,3,3);
    checks[20] := not accepted and reason == -2 and Same(result,prior);
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(prior,descriptor,mask,350.0,1,2,4);
    checks[21] := not accepted and reason == -2 and Same(result,prior);
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(prior,descriptor,mask,350.0,0,2,3);
    checks[22] := not accepted and reason == -2 and Same(result,prior);
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(prior,descriptor,mask,350.0,1,2,3,true,0);
    checks[23] := not accepted and reason == -3 and Same(result,prior);
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(prior,descriptor,mask,350.0,1,2,3,true,8,0.0);
    checks[24] := not accepted and reason == -3 and Same(result,prior);
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(prior,descriptor,mask,350.0,1,2,3,true,8,4.1);
    checks[25] := not accepted and reason == -3 and Same(result,prior);
    prior := learned; prior.count := 257;
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(prior,descriptor,mask,350.0,1,2,3);
    checks[26] := not accepted and reason == -1 and Same(result,prior);
    prior := learned; prior.enabled[256] := 1.0;
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(prior,descriptor,mask,350.0,1,2,3);
    checks[27] := not accepted and reason == -1 and Same(result,prior);
    prior := learned; prior.words[1,1] := 0.0;
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(prior,descriptor,mask,350.0,1,2,3);
    checks[28] := not accepted and reason == -1 and Same(result,prior);
    prior := empty; prior.ready := true;
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(prior,descriptor,mask,350.0,1,2,3);
    checks[29] := not accepted and reason == -1 and Same(result,prior);
    prior := learned; prior.words[256,:] := fill(1e100,49);
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(prior,descriptor,mask,350.0,1,2,3);
    checks[30] := accepted and reason == 3 and Same(result,prior);
    prior := RGBDVisualVocabulary.Empty(2,3,4);
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(prior,descriptor,mask,350.0,2,3,4);
    checks[31] := accepted and result.ready and result.generation == 2 and result.sourceRevision == 3 and result.version == 4;
    prior := RGBDVisualVocabulary.Empty(0,2,3);
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(prior,descriptor,mask,350.0,0,2,3);
    checks[32] := not accepted and reason == -1 and Same(result,prior);
    // Capacity is literal256, not a small surrogate or a demand for256 unique words.
    for feature in 1:350 loop
      mask[feature] := 1.0;
      for k in 1:49 loop descriptor[feature,k] := sin(feature*k); end for;
    end for;
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(empty,descriptor,mask,350.0,1,2,3);
    checks[33] := accepted and result.ready and result.count == 256 and RGBDVisualVocabulary.Valid(result);
    for feature in 1:350 loop
      descriptor[feature,:] := zeros(49); descriptor[feature,1] := 1.0;
    end for;
    (result,accepted,reason) := RGBDVisualVocabulary.Learn(empty,descriptor,mask,350.0,1,2,3,true,350);
    checks[34] := accepted and result.ready and result.count == 1;
    // Actual BoW: original measured dictionary, changed current image, revisit.
    mask := zeros(350); descriptor := fill(1e100,350,49);
    for feature in 1:7 loop
      mask[feature] := 1.0; descriptor[feature,:] := zeros(49);
      descriptor[feature,if mod(feature,2) == 1 then 1 else 2] := 1.0;
    end for;
    mask[350] := 1.0; descriptor[350,:] := zeros(49); descriptor[350,2] := 1.0;
    (wordIndex,histogram,ids,slots,scores,nextHistory,nextMask,nextId,nextTime,version,nextSlot,timeNow,
      configuration,vocabularyCount,assignmentCount,retrieval,candidates,stored,invalidHistory) :=
      RetrieveVisualWords(descriptor,mask,350.0,learned.words,learned.enabled,3.0,
        history,historyMask,historyId,historyTime,0.0,1.0,0.0,11.0,0.0,1.0,0.0,0.001,8.0,0.5,1.0);
    checks[35] := configuration == 1.0 and vocabularyCount == 2.0 and assignmentCount == 8.0
      and retrieval == 1.0 and stored == 1.0 and candidates == 0.0;
    checks[36] := abs(histogram[1]-0.5) < 1e-12 and abs(histogram[2]-0.5) < 1e-12;
    indices := wordIndex[350] == 2.0 and wordIndex[349] == 0.0;
    for feature in 1:7 loop indices := indices and wordIndex[feature] == (if mod(feature,2) == 1 then 1.0 else 2.0); end for;
    checks[37] := indices and nextMask[1] == 1.0 and nextId[1] == 11.0 and nextSlot == 2.0;
    history := nextHistory; historyMask := nextMask; historyId := nextId; historyTime := nextTime;
    for feature in 1:7 loop descriptor[feature,:] := zeros(49); descriptor[feature,2] := 1.0; end for;
    (wordIndex,histogram,ids,slots,scores,nextHistory,nextMask,nextId,nextTime,version,nextSlot,timeNow,
      configuration,vocabularyCount,assignmentCount,retrieval,candidates,stored,invalidHistory) :=
      RetrieveVisualWords(descriptor,mask,350.0,learned.words,learned.enabled,3.0,
        history,historyMask,historyId,historyTime,3.0,2.0,0.0,12.0,2.0,0.0,0.0,0.001,8.0,0.5,1.0);
    checks[38] := assignmentCount == 8.0 and histogram[1] == 0.0 and histogram[2] == 1.0 and stored == 0.0;
    checks[39] := candidates == 1.0 and ids[1] == 11.0 and slots[1] == 1.0 and abs(scores[1]-1.0/sqrt(2.0)) < 1e-12;
    for feature in 1:7 loop
      descriptor[feature,:] := zeros(49); descriptor[feature,if mod(feature,2) == 1 then 1 else 2] := 1.0;
    end for;
    (wordIndex,histogram,ids,slots,scores,nextHistory,nextMask,nextId,nextTime,version,nextSlot,timeNow,
      configuration,vocabularyCount,assignmentCount,retrieval,candidates,stored,invalidHistory) :=
      RetrieveVisualWords(descriptor,mask,350.0,learned.words,learned.enabled,3.0,
        history,historyMask,historyId,historyTime,3.0,2.0,2.0,13.0,3.0,0.0,0.0,0.001,8.0,0.99,1.0);
    checks[40] := retrieval == 1.0 and candidates == 1.0 and ids[1] == 11.0 and abs(scores[1]-1.0) < 1e-12;
    checks[41] := abs(histogram[1]-0.5) < 1e-12 and abs(histogram[2]-0.5) < 1e-12 and invalidHistory == 0.0;
    checks[42] := version == 3.0 and nextSlot == 2.0 and timeNow == 3.0 and stored == 0.0;
    checks[43] := RGBDVisualVocabulary.Valid(learned) and learned.count == 2 and learned.ready;
  end Run;
end RGBDVisualVocabularyTests;
