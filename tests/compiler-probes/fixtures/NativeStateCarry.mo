// Minimal reusable compiler/ABI fixture, not an application SLAM substitute.
// Exact nested State must cross different compiled entrypoints without routing
// Integer through a JavaScript Number or inferring fields from flattened names.
package NativeStateCarry
  record Identity
    Integer sequence;
    Boolean valid;
  end Identity;

  record State
    Identity identity;
    Real position[3];
    Real matrix[2,3];
    Integer observations[2];
    Boolean occupied[2];
  end State;

  function Empty
    output State state;
  algorithm
    state.identity.sequence := 0;
    state.identity.valid := false;
    state.position := zeros(3);
    state.matrix := zeros(2,3);
    state.observations := {0,0};
    state.occupied := {false,false};
  end Empty;

  function Seed
    output State state;
  algorithm
    state := Empty();
    state.identity.sequence := 9007199254740993;
    state.identity.valid := true;
    state.position := {-0.0,1.25,-2.5};
    state.matrix := [11,12,13;21,22,23];
    state.observations := {9007199254740993,-9007199254740993};
    state.occupied := {true,false};
  end Seed;

  function Advance
    input State previous;
    input Boolean requested;
    input Integer increment;
    output State next;
  algorithm
    next := previous;
    if requested then
      next.identity.sequence := previous.identity.sequence+increment;
      next.identity.valid := not previous.identity.valid;
      next.position := previous.position+{1,2,3};
      next.observations := previous.observations+{increment,-increment};
      next.occupied := {previous.occupied[2],previous.occupied[1]};
    end if;
  end Advance;
end NativeStateCarry;

model NativeStateCarryReset
  output NativeStateCarry.State next;
equation
  next = NativeStateCarry.Seed();
end NativeStateCarryReset;

model NativeStateCarryInitialize
  input NativeStateCarry.State previous = NativeStateCarry.Empty();
  input Boolean requested = true;
  output NativeStateCarry.State next;
equation
  next = NativeStateCarry.Advance(previous,requested,2);
end NativeStateCarryInitialize;

model NativeStateCarryStep
  input NativeStateCarry.State previous = NativeStateCarry.Empty();
  input Boolean requested = true;
  output NativeStateCarry.State next;
  output Integer receivedSequence;
equation
  next = NativeStateCarry.Advance(previous,requested,1);
  receivedSequence = previous.identity.sequence;
end NativeStateCarryStep;
