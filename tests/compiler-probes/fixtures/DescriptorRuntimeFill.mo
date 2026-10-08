model DescriptorRuntimeFill
  constant Integer featureCapacity = 350;
  constant Integer descriptorSize = 49;
  input Real value;
  output Real descriptor[featureCapacity,descriptorSize];
equation
  descriptor = fill(value,featureCapacity,descriptorSize);
end DescriptorRuntimeFill;
