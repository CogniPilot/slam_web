// Appearance retrieval only. A returned candidate is NEVER a loop constraint:
// full descriptor matching and geometric registration must verify every proposal.
// The explicit vocabulary contains learned/configured measured-image descriptors.
// No position, orientation, trajectory truth or scene-specific signature enters here.
function NormalizeVisualWord
  input Real descriptor[49]; input Real enabled;
  output Real normalized[49]; output Boolean valid;
protected
  Real mean; Real energy; Real value; Real scale;
algorithm
  normalized := zeros(49); mean := 0.0; energy := 0.0; value := 0.0; scale := 1.0;
  valid := enabled >= 1.0 and enabled <= 1.0;
  for k in 1:49 loop
    valid := valid and abs(descriptor[k]) <= 1e3;
    value := if abs(descriptor[k]) <= 1e3 then descriptor[k] else 0.0;
    normalized[k] := value; mean := mean+value/49.0;
  end for;
  for k in 1:49 loop
    normalized[k] := normalized[k]-mean;
    energy := energy+normalized[k]*normalized[k];
  end for;
  valid := valid and energy > 1e-12 and energy <= 1e9;
  scale := if valid then sqrt(max(energy,1e-12)) else 1.0;
  for k in 1:49 loop
    normalized[k] := if valid then normalized[k]/scale else 0.0;
  end for;
end NormalizeVisualWord;

function RetrieveVisualWords
  input Real descriptor[350,49]; input Real descriptorEnabled[350]; input Real descriptorCount;
  input Real vocabulary[256,49]; input Real vocabularyEnabled[256]; input Real vocabularyVersion;
  input Real previousHistogram[128,256]; input Real previousEnabled[128];
  input Real previousKeyframeId[128]; input Real previousKeyframeTime[128];
  input Real previousVersion; input Real previousNextSlot; input Real previousTime;
  input Real queryKeyframeId; input Real timeNow; input Real storeKeyframe; input Real resetRequested;
  input Real maximumWordDistanceSquared; input Real minimumAssignments;
  input Real minimumSimilarity; input Real minimumAge;
  output Real wordIndex[350]; output Real histogram[256];
  output Real candidateId[4]; output Real candidateSlot[4]; output Real candidateScore[4];
  output Real nextHistogram[128,256]; output Real nextEnabled[128];
  output Real nextKeyframeId[128]; output Real nextKeyframeTime[128];
  output Real nextVersion; output Real nextSlot; output Real nextTime;
  output Real configurationValid; output Real vocabularyCount; output Real assignmentCount;
  output Real retrievalValid; output Real candidateCount; output Real stored; output Real invalidHistoryCount;
protected
  Real words[256,49]; Real usableWord[256]; Real sample[49]; Boolean sampleValid;
  Real distance; Real nearest; Integer nearestWord; Real mass; Real candidateMass;
  Real idf[256]; Real documentFrequency; Real documentCount; Real queryNorm;
  Real dot; Real candidateNorm; Real weighted; Real score[128]; Real selected[128];
  Real bestScore; Real bestId; Integer bestSlot; Integer destination; Integer existingSlot;
  Boolean configuration; Boolean stateValid; Boolean reset; Boolean rowValid; Boolean eligible;
algorithm
  wordIndex := zeros(350); histogram := zeros(256); candidateId := zeros(4);
  candidateSlot := zeros(4); candidateScore := zeros(4); words := zeros(256,49);
  usableWord := zeros(256); sample := zeros(49); sampleValid := false;
  nextHistogram := zeros(128,256); nextEnabled := zeros(128);
  nextKeyframeId := zeros(128); nextKeyframeTime := zeros(128);
  idf := zeros(256); score := zeros(128); selected := zeros(128);
  nextVersion := 0.0; nextSlot := 1.0; nextTime := 0.0;
  configurationValid := 0.0; vocabularyCount := 0.0; assignmentCount := 0.0;
  retrievalValid := 0.0; candidateCount := 0.0; stored := 0.0; invalidHistoryCount := 0.0;
  distance := 0.0; nearest := 5.0; nearestWord := 0; mass := 0.0; candidateMass := 0.0;
  documentFrequency := 0.0; documentCount := 0.0; queryNorm := 0.0;
  dot := 0.0; candidateNorm := 0.0; weighted := 0.0;
  bestScore := -1.0; bestId := 1e9+1.0; bestSlot := 0; destination := 1; existingSlot := 0;
  rowValid := false; eligible := false;
  stateValid := previousVersion >= 0.0 and previousVersion <= 1e9 and floor(previousVersion) == previousVersion
    and previousNextSlot >= 1.0 and previousNextSlot <= 128.0 and floor(previousNextSlot) == previousNextSlot
    and previousTime >= 0.0 and previousTime <= 1e9;
  configuration := descriptorCount >= 0.0 and descriptorCount <= 350.0 and floor(descriptorCount) == descriptorCount
    and vocabularyVersion >= 1.0 and vocabularyVersion <= 1e9 and floor(vocabularyVersion) == vocabularyVersion
    and queryKeyframeId >= 0.0 and queryKeyframeId <= 1e9 and floor(queryKeyframeId) == queryKeyframeId
    and timeNow >= 0.0 and timeNow <= 1e9 and (timeNow >= previousTime or resetRequested == 1.0)
    and (storeKeyframe == 0.0 or storeKeyframe == 1.0) and (storeKeyframe == 0.0 or queryKeyframeId >= 1.0)
    and (resetRequested == 0.0 or resetRequested == 1.0) and (stateValid or resetRequested == 1.0)
    and maximumWordDistanceSquared >= 0.0 and maximumWordDistanceSquared <= 4.0
    and minimumAssignments >= 1.0 and minimumAssignments <= 350.0 and floor(minimumAssignments) == minimumAssignments
    and minimumSimilarity >= 0.0 and minimumSimilarity <= 1.0 and minimumAge >= 0.0 and minimumAge <= 1e6;
  reset := configuration and (resetRequested == 1.0 or vocabularyVersion <> previousVersion);
  nextVersion := if configuration then vocabularyVersion else if stateValid then previousVersion else 0.0;
  nextSlot := if stateValid and not reset then previousNextSlot else 1.0;
  nextTime := if configuration then timeNow else if stateValid then previousTime else 0.0;
  // Copied state is checked in Modelica. Disabled padding is not a measurement.
  for frame in 1:128 loop
    mass := 0.0;
    rowValid := stateValid and not reset and previousEnabled[frame] == 1.0
      and previousKeyframeId[frame] >= 1.0 and previousKeyframeId[frame] <= 1e9
      and floor(previousKeyframeId[frame]) == previousKeyframeId[frame]
      and previousKeyframeTime[frame] >= 0.0 and previousKeyframeTime[frame] <= previousTime;
    for word in 1:256 loop
      rowValid := rowValid and previousHistogram[frame,word] >= 0.0 and previousHistogram[frame,word] <= 1.0;
      mass := mass+(if previousHistogram[frame,word] >= 0.0 and previousHistogram[frame,word] <= 1.0
        then previousHistogram[frame,word] else 0.0);
    end for;
    rowValid := rowValid and abs(mass-1.0) <= 1e-6;
    invalidHistoryCount := invalidHistoryCount+(if not reset and previousEnabled[frame] <> 0.0 and not rowValid then 1.0 else 0.0);
    nextEnabled[frame] := if rowValid then 1.0 else 0.0;
    nextKeyframeId[frame] := if rowValid then previousKeyframeId[frame] else 0.0;
    nextKeyframeTime[frame] := if rowValid then previousKeyframeTime[frame] else 0.0;
    for word in 1:256 loop
      nextHistogram[frame,word] := if rowValid then previousHistogram[frame,word] else 0.0;
    end for;
    documentCount := documentCount+nextEnabled[frame];
    if nextEnabled[frame] == 1.0 and nextKeyframeId[frame] == queryKeyframeId and existingSlot == 0 then
      existingSlot := frame;
    end if;
  end for;
  for word in 1:256 loop
    (sample,sampleValid) := NormalizeVisualWord(vocabulary[word,:],if configuration then vocabularyEnabled[word] else 0.0);
    words[word,:] := sample; usableWord[word] := if sampleValid then 1.0 else 0.0;
    vocabularyCount := vocabularyCount+usableWord[word];
  end for;
  // Exhaustive nearest learned/configured word; exact distance ties use lower word index.
  for feature in 1:350 loop
    (sample,sampleValid) := NormalizeVisualWord(descriptor[feature,:],
      if configuration and feature <= descriptorCount then descriptorEnabled[feature] else 0.0);
    nearest := 5.0; nearestWord := 0;
    for word in 1:256 loop
      if sampleValid and usableWord[word] == 1.0 then
        distance := 0.0;
        for k in 1:49 loop
          distance := distance+(sample[k]-words[word,k])*(sample[k]-words[word,k]);
        end for;
        if distance < nearest then
          nearest := distance; nearestWord := word;
        end if;
      end if;
    end for;
    if nearestWord > 0 and nearest <= maximumWordDistanceSquared then
      wordIndex[feature] := nearestWord; histogram[nearestWord] := histogram[nearestWord]+1.0;
      assignmentCount := assignmentCount+1.0;
    end if;
  end for;
  for word in 1:256 loop
    histogram[word] := if assignmentCount > 0.0 then histogram[word]/max(assignmentCount,1.0) else 0.0;
    documentFrequency := 0.0;
    for frame in 1:128 loop
      documentFrequency := documentFrequency+(if nextEnabled[frame] == 1.0 and nextHistogram[frame,word] > 0.0 then 1.0 else 0.0);
    end for;
    idf[word] := 1.0+log((1.0+documentCount)/(1.0+documentFrequency));
    weighted := histogram[word]*idf[word]; queryNorm := queryNorm+weighted*weighted;
  end for;
  configurationValid := if configuration then 1.0 else 0.0;
  retrievalValid := if configuration and vocabularyCount > 0.0 and assignmentCount >= minimumAssignments and queryNorm > 1e-12 then 1.0 else 0.0;
  for frame in 1:128 loop
    eligible := retrievalValid == 1.0 and nextEnabled[frame] == 1.0
      and timeNow-nextKeyframeTime[frame] >= minimumAge and queryKeyframeId <> nextKeyframeId[frame];
    dot := 0.0; candidateNorm := 0.0;
    for word in 1:256 loop
      weighted := nextHistogram[frame,word]*idf[word]; candidateNorm := candidateNorm+weighted*weighted;
      dot := dot+weighted*histogram[word]*idf[word];
    end for;
    score[frame] := if eligible and candidateNorm > 1e-12 then min(1.0,max(0.0,dot/sqrt(max(queryNorm*candidateNorm,1e-24)))) else -1.0;
  end for;
  for rank in 1:4 loop
    bestScore := -1.0; bestId := 1e9+1.0; bestSlot := 0;
    for frame in 1:128 loop
      if selected[frame] == 0.0 and score[frame] >= minimumSimilarity
        and (score[frame] > bestScore or (score[frame] == bestScore and
          (nextKeyframeId[frame] < bestId or (nextKeyframeId[frame] == bestId and frame < bestSlot)))) then
        bestScore := score[frame]; bestId := nextKeyframeId[frame]; bestSlot := frame;
      end if;
    end for;
    if bestSlot > 0 then
      candidateId[rank] := bestId; candidateSlot[rank] := bestSlot; candidateScore[rank] := bestScore;
      selected[bestSlot] := 1.0; candidateCount := candidateCount+1.0;
    end if;
  end for;
  // Retrieval precedes insertion. Modelica owns the bounded FIFO state update;
  // storeKeyframe is the upstream geometric keyframe-admission decision.
  destination := if existingSlot > 0 then existingSlot else if nextSlot >= 1.0 and nextSlot <= 128.0 then integer(nextSlot) else 1;
  stored := if retrievalValid == 1.0 and storeKeyframe == 1.0 then 1.0 else 0.0;
  if stored == 1.0 then
    nextHistogram[destination,:] := histogram; nextEnabled[destination] := 1.0;
    nextKeyframeId[destination] := queryKeyframeId; nextKeyframeTime[destination] := timeNow;
    nextSlot := if existingSlot > 0 then nextSlot else if destination < 128 then destination+1.0 else 1.0;
  end if;
end RetrieveVisualWords;

model RGBDBagOfWords
  constant Integer featureCapacity = 350; constant Integer descriptorSize = 49;
  constant Integer vocabularyCapacity = 256; constant Integer keyframeCapacity = 128;
  parameter Real maximumWordDistanceSquared = 0.8;
  parameter Real minimumAssignments = 8.0;
  parameter Real minimumSimilarity = 0.35;
  parameter Real minimumAge = 2.0 "Simulation seconds; independent of frame rate";
  input Real descriptor[featureCapacity,descriptorSize] = zeros(featureCapacity,descriptorSize);
  input Real descriptorEnabled[featureCapacity] = zeros(featureCapacity); input Real descriptorCount = 0.0;
  input Real vocabulary[vocabularyCapacity,descriptorSize] = zeros(vocabularyCapacity,descriptorSize);
  input Real vocabularyEnabled[vocabularyCapacity] = zeros(vocabularyCapacity); input Real vocabularyVersion = 1.0;
  input Real previousHistogram[keyframeCapacity,vocabularyCapacity] = zeros(keyframeCapacity,vocabularyCapacity);
  input Real previousEnabled[keyframeCapacity] = zeros(keyframeCapacity);
  input Real previousKeyframeId[keyframeCapacity] = zeros(keyframeCapacity);
  input Real previousKeyframeTime[keyframeCapacity] = zeros(keyframeCapacity);
  input Real previousVersion = 0.0; input Real previousNextSlot = 1.0; input Real previousTime = 0.0;
  input Real queryKeyframeId = 0.0; input Real timeNow = 0.0;
  input Real storeKeyframe = 0.0; input Real resetRequested = 0.0;
  output Real wordIndex[featureCapacity]; output Real histogram[vocabularyCapacity];
  output Real candidateId[4]; output Real candidateSlot[4]; output Real candidateScore[4];
  output Real nextHistogram[keyframeCapacity,vocabularyCapacity]; output Real nextEnabled[keyframeCapacity];
  output Real nextKeyframeId[keyframeCapacity]; output Real nextKeyframeTime[keyframeCapacity];
  output Real nextVersion; output Real nextSlot; output Real nextTime;
  output Real configurationValid; output Real vocabularyCount; output Real assignmentCount;
  output Real retrievalValid; output Real candidateCount; output Real stored; output Real invalidHistoryCount;
equation
  (wordIndex,histogram,candidateId,candidateSlot,candidateScore,nextHistogram,nextEnabled,nextKeyframeId,nextKeyframeTime,
    nextVersion,nextSlot,nextTime,configurationValid,vocabularyCount,assignmentCount,retrievalValid,candidateCount,stored,invalidHistoryCount) =
    RetrieveVisualWords(descriptor,descriptorEnabled,descriptorCount,vocabulary,vocabularyEnabled,vocabularyVersion,
      previousHistogram,previousEnabled,previousKeyframeId,previousKeyframeTime,previousVersion,previousNextSlot,previousTime,
      queryKeyframeId,timeNow,storeKeyframe,resetRequested,maximumWordDistanceSquared,minimumAssignments,minimumSimilarity,minimumAge);
end RGBDBagOfWords;
