// Source-issued native ABI probe. This is not a detector or SLAM preset.
function NativeContractValue
  input Real value;
  output Real result;
algorithm
  result := 0.5*value+0.25;
end NativeContractValue;

model NativeProgramContract
  input Real value = -4.0;
  output Real result;
equation
  result = NativeContractValue(value);
end NativeProgramContract;
