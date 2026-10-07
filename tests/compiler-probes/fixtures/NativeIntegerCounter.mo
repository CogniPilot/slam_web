// Focuses on exact Integer input arithmetic without any authored Real coercion.
function AdvanceIntegerCounter
  input Integer sequence;
  input Integer increment;
  output Integer next;
algorithm
  next := sequence+increment;
end AdvanceIntegerCounter;

model NativeIntegerCounter
  input Integer sequence = 7;
  input Integer increment = 1;
  output Integer received;
  output Integer next;
equation
  received = sequence;
  next = AdvanceIntegerCounter(sequence,increment);
end NativeIntegerCounter;
