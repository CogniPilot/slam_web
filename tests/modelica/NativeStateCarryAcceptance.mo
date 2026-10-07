// Standard Modelica reference for the small nested-State ABI fixture. This does
// not establish that Rumoca can issue or transfer its compiled State yet.
function CheckNativeStateCarry
  input Real clock;
  output Boolean checks[10];
protected
  NativeStateCarry.State seeded;
  NativeStateCarry.State initialized;
  NativeStateCarry.State stepped;
  NativeStateCarry.State held;
algorithm
  seeded := NativeStateCarry.Seed();
  initialized := NativeStateCarry.Advance(seeded,true,2);
  stepped := NativeStateCarry.Advance(initialized,true,1);
  held := NativeStateCarry.Advance(stepped,false,1);
  checks := fill(false,10);
  checks[1] := clock >= 0 and seeded.identity.sequence-9007199254740992 == 1;
  checks[2] := initialized.identity.sequence-9007199254740992 == 3;
  checks[3] := stepped.identity.sequence-9007199254740992 == 4;
  checks[4] := held.identity.sequence == stepped.identity.sequence;
  checks[5] := seeded.identity.valid and not initialized.identity.valid
    and stepped.identity.valid and held.identity.valid;
  checks[6] := seeded.observations[1]-9007199254740992 == 1
    and seeded.observations[2]+9007199254740992 == -1;
  checks[7] := held.observations[1]-9007199254740992 == 4
    and held.observations[2]+9007199254740992 == -4;
  checks[8] := held.occupied[1] and not held.occupied[2];
  checks[9] := held.position[1] == 2 and held.position[2] == 5.25 and held.position[3] == 3.5;
  checks[10] := true;
  for row in 1:2 loop
    for column in 1:3 loop
      checks[10] := checks[10] and held.matrix[row,column] == 10*row+column;
    end for;
  end for;
end CheckNativeStateCarry;

model NativeStateCarryAcceptance
  output Boolean checks[10];
algorithm
  when initial() then
    checks := CheckNativeStateCarry(time);
  end when;
end NativeStateCarryAcceptance;
