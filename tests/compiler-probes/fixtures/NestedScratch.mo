// All scratch cells are defined before use, including on each outer iteration.
function RepeatedScratch
  input Real values[:];
  output Real result[size(values,1)];
protected
  Real scratch[size(values,1)];
algorithm
  for i in 1:size(values,1) loop
    for j in 1:size(values,1) loop
      scratch[j] := values[j]-values[i];
    end for;
    result[i] := sum(scratch);
  end for;
end RepeatedScratch;

function MatrixScratch
  input Real values[:,:];
  output Real result[size(values,1),size(values,2)];
protected
  Real scratch[size(values,1),size(values,2)];
algorithm
  for row in 1:size(values,1) loop
    for column in 1:size(values,2) loop
      scratch[row,column] := 2*values[row,column];
    end for;
  end for;
  result := scratch;
end MatrixScratch;

model RepeatedScratchProbe
  input Real values[3] = {-1,2,3};
  output Real result[3];
equation
  result = RepeatedScratch(values);
end RepeatedScratchProbe;

model MatrixScratchProbe
  input Real values[2,3] = [1,2,3;4,5,6];
  output Real result[2,3];
equation
  result = MatrixScratch(values);
end MatrixScratchProbe;
