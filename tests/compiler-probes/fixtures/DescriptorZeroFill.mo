// Isolate native zero-fill issuance at the authored descriptor capacity.
model DescriptorZeroFill
  constant Integer featureCapacity = 350;
  constant Integer descriptorSize = 49;
  output Real descriptor[featureCapacity,descriptorSize];
equation
  descriptor = zeros(featureCapacity,descriptorSize);
end DescriptorZeroFill;
