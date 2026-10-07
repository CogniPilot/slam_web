// A scratch variable need only be defined on paths where it is consumed.
// Matches the acquisition guard in FastFrameScores without image-size work.
function ConditionalScratchArray
  input Real image[3];
  input Boolean enabled;
  output Real result[3];
protected
  Real gray[3];
algorithm
  result := zeros(3);
  if enabled then
    for i in 1:size(image,1) loop
      gray[i] := image[i];
    end for;
    for i in 1:size(image,1) loop
      result[i] := 2*gray[i];
    end for;
  end if;
end ConditionalScratchArray;

function ConditionalScratchScalar
  input Real value;
  input Boolean enabled;
  output Real result;
protected
  Real scratch;
algorithm
  result := 0;
  if enabled then
    scratch := value;
    result := 2*scratch;
  end if;
end ConditionalScratchScalar;

model ConditionalScratchArrayProbe
  input Real image[3] = {1,2,3};
  input Boolean enabled = true;
  output Real result[3];
equation
  result = ConditionalScratchArray(image,enabled);
end ConditionalScratchArrayProbe;

model ConditionalScratchScalarProbe
  input Real value = 3;
  input Boolean enabled = true;
  output Real result;
equation
  result = ConditionalScratchScalar(value,enabled);
end ConditionalScratchScalarProbe;
