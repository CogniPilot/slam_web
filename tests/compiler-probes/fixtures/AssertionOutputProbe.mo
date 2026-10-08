record CheckedCommand
  Real rate;
  Real offset;
end CheckedCommand;

function checkCommand
  input Real command;
  output CheckedCommand checked;
algorithm
  assert(command > 0, "Command must be positive");
  checked.rate := command;
  checked.offset := command + 1;
end checkCommand;

model AssertionOutputProbe
  input Real command = 1;
  Real x(start = 1, fixed = true);
  CheckedCommand checked;
equation
  checked = checkCommand(command);
  der(x) = -checked.rate*x;
end AssertionOutputProbe;
