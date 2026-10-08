function CheckedSample
  input Real values[:];
  input Integer index;
  output Real value;
algorithm
  value := values[index];
end CheckedSample;

function ConditionalReads
  input Real values[3];
  input Integer firstIndex;
  input Integer secondIndex;
  input Boolean enabled;
  output Real result[2];
algorithm
  result := {-10.0,-20.0};
  for iteration in 1:2 loop
    if enabled then
      result[1] := values[firstIndex+iteration-1];
      result[2] := CheckedSample(values,secondIndex+iteration-1);
    end if;
  end for;
end ConditionalReads;

model ConditionalCallFaultOrder
  input Real values[3] = {11.0,22.0,33.0};
  input Integer firstIndex = 1;
  input Integer secondIndex = 1;
  input Boolean enabled = true;
  output Real result[2];
equation
  result = ConditionalReads(values,firstIndex,secondIndex,enabled);
end ConditionalCallFaultOrder;
