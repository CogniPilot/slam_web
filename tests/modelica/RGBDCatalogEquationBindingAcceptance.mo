// Exercise the model-level record equation used by RGBDFastSLAMReset.
// This differs from assigning a function output in an algorithm section.
model RGBDCatalogEquationBindingAcceptance
  input Integer generation = 2;
  input Integer vocabularyVersion = 3;
  output RGBDKeyframes.Catalog next;
  output Boolean checks[7];
equation
  next = RGBDKeyframes.Empty(generation,vocabularyVersion);
  checks = {next.generation == generation,
    next.vocabularyVersion == vocabularyVersion,
    next.nextId == 1, next.nextSlot == 1, next.lastEpoch == -1,
    abs(next.lastTime) < 1e-12,
    sum({if next.occupied[slot] then 1 else 0 for slot in 1:RGBDKeyframes.keyframeCapacity}) == 0};
end RGBDCatalogEquationBindingAcceptance;
