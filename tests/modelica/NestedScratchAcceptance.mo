function CheckNestedScratch
  input Real clock;
  output Boolean checks[8];
protected
  Real values[3]; Real result[3]; Real matrix[2,3];
algorithm
  values := {-1+clock,2+clock,3+clock};
  checks := fill(true,8);
  checks[1] := clock >= 0 and clock <= 0.001;
  result := ConditionalArrayUpdate(values,true);
  checks[2] := abs(result[1]) < 1e-12 and abs(result[2]-(2+clock)) < 1e-12
    and abs(result[3]-(3+clock)) < 1e-12;
  result := ConditionalArrayScratchUpdate(values,true);
  checks[3] := abs(result[1]) < 1e-12 and abs(result[2]-(4+2*clock)) < 1e-12
    and abs(result[3]-(6+2*clock)) < 1e-12;
  result := ConditionalArrayRepeatedScratchUpdate(values,true);
  checks[4] := abs(result[1]) < 1e-12 and abs(result[2]+2) < 1e-12 and abs(result[3]+5) < 1e-12;
  result := RepeatedScratch(values);
  checks[5] := abs(result[1]-7) < 1e-12 and abs(result[2]+2) < 1e-12 and abs(result[3]+5) < 1e-12;
  matrix := MatrixScratch([1+clock,2+clock,3+clock;4+clock,5+clock,6+clock]);
  for row in 1:size(matrix,1) loop
    for column in 1:size(matrix,2) loop
      checks[6] := checks[6] and abs(matrix[row,column]-2*((row-1)*size(matrix,2)+column+clock)) < 1e-12;
    end for;
  end for;
  result := ConditionalArrayRepeatedScratchUpdate(values,false);
  for i in 1:size(result,1) loop checks[7] := checks[7] and result[i] == 0; end for;
  result := ConditionalArrayUpdate(values,false);
  for i in 1:size(result,1) loop checks[8] := checks[8] and result[i] == 0; end for;
end CheckNestedScratch;

model NestedScratchAcceptance
  output Boolean checks[8];
equation
  checks = CheckNestedScratch(time);
end NestedScratchAcceptance;
