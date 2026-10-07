package GuardedProblem
  constant Integer capacity = 3;

  record Problem
    Boolean accepted;
    Integer nodeCount;
    Real positions[capacity];
  end Problem;

  function Prepare
    input Integer count;
    output Problem problem;
  algorithm
    problem.accepted := count >= 0 and count <= capacity;
    problem.nodeCount := count;
    problem.positions := {1,2,3};
  end Prepare;

  function Correct
    input Integer count;
    input Boolean requested;
    output Real result;
  protected
    Problem problem;
    Boolean valid;
  algorithm
    result := 0;
    if requested then
      valid := count >= 0;
      if valid then
        valid := count <= capacity;
      end if;
      if valid then
        problem := Prepare(count);
        valid := problem.accepted;
      end if;
      if valid then
        for node in 1:capacity loop
          if node <= problem.nodeCount then
            problem.positions[node] := 2*problem.positions[node];
            result := result+problem.positions[node];
          end if;
        end for;
      end if;
    end if;
  end Correct;
end GuardedProblem;

model GuardedProblemProbe
  input Integer count = 2;
  input Boolean requested = true;
  output Real result;
equation
  result = GuardedProblem.Correct(count,requested);
end GuardedProblemProbe;
