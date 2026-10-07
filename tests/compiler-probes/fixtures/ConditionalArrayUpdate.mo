// Small control-flow probes for the FastFrameScores definedness refusal.
function ConditionalArrayUpdate
  input Real values[:];
  input Boolean enabled;
  output Real result[size(values,1)];
algorithm
  result := zeros(size(values,1));
  if enabled then
    for i in 1:size(values,1) loop
      if values[i] > 0 then
        result[i] := values[i];
      end if;
    end for;
  end if;
end ConditionalArrayUpdate;

function ConditionalArrayScratchUpdate
  input Real values[:];
  input Boolean enabled;
  output Real result[size(values,1)];
protected
  Real scratch[size(values,1)];
  Real center;
algorithm
  result := zeros(size(values,1));
  if enabled then
    for i in 1:size(values,1) loop
      scratch[i] := 2*values[i];
    end for;
    for i in 1:size(values,1) loop
      center := scratch[i];
      if center > 0 then
        result[i] := center;
      end if;
    end for;
  end if;
end ConditionalArrayScratchUpdate;

function ConditionalArrayRepeatedScratchUpdate
  input Real values[:];
  input Boolean enabled;
  output Real result[size(values,1)];
protected
  Real scratch[size(values,1)];
algorithm
  result := zeros(size(values,1));
  if enabled then
    for i in 1:size(values,1) loop
      for j in 1:size(values,1) loop
        scratch[j] := values[j]-values[i];
      end for;
      if values[i] > 0 then
        result[i] := sum(scratch);
      end if;
    end for;
  end if;
end ConditionalArrayRepeatedScratchUpdate;

model ConditionalArrayUpdateProbe
  input Real values[3] = {-1,2,3};
  input Boolean enabled = true;
  output Real result[3];
equation
  result = ConditionalArrayUpdate(values,enabled);
end ConditionalArrayUpdateProbe;

model ConditionalArrayScratchUpdateProbe
  input Real values[3] = {-1,2,3};
  input Boolean enabled = true;
  output Real result[3];
equation
  result = ConditionalArrayScratchUpdate(values,enabled);
end ConditionalArrayScratchUpdateProbe;

model ConditionalArrayRepeatedScratchUpdateProbe
  input Real values[3] = {-1,2,3};
  input Boolean enabled = true;
  output Real result[3];
equation
  result = ConditionalArrayRepeatedScratchUpdate(values,enabled);
end ConditionalArrayRepeatedScratchUpdateProbe;
