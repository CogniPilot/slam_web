// Pure Modelica browser compilation surface; querying does not mutate history.
model RGBDKeyframeRetrievalStep
  parameter Real maximumWordDistanceSquared = 0.8;
  parameter Integer minimumAssignments = 8;
  parameter Real minimumSimilarity = 0.35;
  parameter Real minimumAge = 5.0;
  input RGBDKeyframes.Catalog catalog;
  input RGBDKeyframes.Frame measurement;
  input Real vocabulary[RGBDKeyframes.wordCapacity,RGBDKeyframes.descriptorSize];
  input Real vocabularyEnabled[RGBDKeyframes.wordCapacity];
  input Boolean requested = true;
  output RGBDKeyframes.Frame prepared;
  output Boolean accepted; output Integer rejectionReason;
  output Real wordIndex[RGBDKeyframes.featureCapacity];
  output Integer candidateId[RGBDKeyframeRetrieval.proposalCapacity];
  output Integer candidateSlot[RGBDKeyframeRetrieval.proposalCapacity];
  output Real candidateScore[RGBDKeyframeRetrieval.proposalCapacity];
  output Integer candidateCount; output Real assignmentCount;
equation
  (prepared,accepted,rejectionReason,wordIndex,candidateId,candidateSlot,candidateScore,candidateCount,assignmentCount)
    = RGBDKeyframeRetrieval.PrepareCapture(catalog,measurement,vocabulary,vocabularyEnabled,requested,
      maximumWordDistanceSquared,minimumAssignments,minimumSimilarity,minimumAge);
end RGBDKeyframeRetrievalStep;
