// Emit the fixed six-dimensional teaching kernel without dependent reduction
// domains, which the pinned compiler cannot yet specialize. Runtime math
// remains visible, editable Modelica; this script is only a maintainer tool.
import {writeFile} from 'node:fs/promises';

const terms=(values)=>values.length?values.join('+'):'0.0';
const sequence=(count)=>Array.from({length:count},(_,i)=>i+1);
const equations=[];
for(const i of sequence(6)){
  for(const j of sequence(i-1))equations.push(`  L[${i},${j}] = (A[${i},${j}]-(${terms(sequence(j-1).map(k=>`L[${i},${k}]*L[${j},${k}]`))}))/L[${j},${j}];`);
  equations.push(`  pivot[${i}] = A[${i},${i}]-(${terms(sequence(i-1).map(k=>`L[${i},${k}]*L[${i},${k}]`))});`);
  equations.push(`  L[${i},${i}] = sqrt(if noEvent(pivot[${i}] > pivot_floor) then pivot[${i}] else 1.0);`);
  for(let j=i+1;j<=6;j++)equations.push(`  L[${i},${j}] = 0.0;`);
}
equations.push(`  valid = if noEvent(symmetry_errors < 0.5 and\n    ${sequence(6).map(i=>`pivot[${i}] > pivot_floor`).join(' and ')}) then 1.0 else 0.0;`);
equations.push('  for column in 1:16 loop');
for(const i of sequence(6))equations.push(`    Z[${i},column] = (B[${i},column]-(${terms(sequence(i-1).map(k=>`L[${i},${k}]*Z[${k},column]`))}))/L[${i},${i}];`);
for(const i of sequence(6).reverse())equations.push(`    solution[${i},column] = (Z[${i},column]-(${terms(sequence(6-i).map(k=>`L[${k+i},${i}]*solution[${k+i},column]`))}))/L[${i},${i}];`);
equations.push('    for i in 1:6 loop','      X[i,column] = if noEvent(valid > 0.5) then solution[i,column] else 0.0;','    end for;','  end for;');
const source=`// Shared Cholesky factorization of a 6×6 geometric innovation covariance.
// Sixteen RHS carry cross-covariance transpose plus innovation; inputs are finite.
// valid=0 rejects nonsymmetric/nonpositive covariance and returns zero solutions.
// Invalid diagonal factors use a unit value to keep following arithmetic bounded.
// Fixed six-row formulas avoid a dependent reduction-domain compiler limitation.
// Regenerate with scripts/generate-spd6-model.mjs; students can edit this source.
model SPD6Solve
  parameter Real pivot_floor = 1e-12;
  parameter Real symmetry_absolute = 1e-12;
  parameter Real symmetry_relative = 1e-8;
  input Real A[6,6] = identity(6);
  input Real B[6,16] = fill(0.0,6,16);
  output Real X[6,16];
  output Real valid;
protected
  Real L[6,6]; Real pivot[6]; Real Z[6,16]; Real solution[6,16];
  Real symmetryChecks[6,6]; Real symmetry_errors;
equation
  for i in 1:6 loop
    for j in 1:6 loop
      symmetryChecks[i,j] = if noEvent(abs(A[i,j]-A[j,i]) <=
        symmetry_absolute+symmetry_relative*abs(A[j,i])) then 0.0 else 1.0;
    end for;
  end for;
  symmetry_errors = sum(symmetryChecks[i,j] for i in 1:6, j in 1:6);
${equations.join('\n')}
end SPD6Solve;
`;
await writeFile(new URL('../models/SPD6Solve.mo',import.meta.url),source);
