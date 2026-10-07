// Minimal nested function-result lvalue regression; standard Modelica.
package NativeNestedRecordAssignment
  record Identity
    Integer sequence;
  end Identity;
  record State
    Identity identity;
  end State;
  function Seed
    output State state;
  algorithm
    state.identity.sequence := 7;
  end Seed;
end NativeNestedRecordAssignment;

model NativeNestedRecordAssignmentProbe
  output NativeNestedRecordAssignment.State next;
equation
  next = NativeNestedRecordAssignment.Seed();
end NativeNestedRecordAssignmentProbe;
