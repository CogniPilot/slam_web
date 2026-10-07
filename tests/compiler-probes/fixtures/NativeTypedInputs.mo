// Compiler-issued mixed input regression; no surrogate SLAM implementation.
function NativeTypedInputValue
  input Real value;
  input Integer sequence;
  input Boolean enabled;
  output Real result;
algorithm
  result := 0.0;
  if enabled then
    result := value+sequence;
  end if;
end NativeTypedInputValue;

model NativeTypedInputsProbe
  input Real value = 2.5;
  input Integer sequence = 7;
  input Boolean enabled = true;
  output Real result;
equation
  result = NativeTypedInputValue(value,sequence,enabled);
end NativeTypedInputsProbe;
