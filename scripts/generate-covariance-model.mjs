// Maintainer specialization of fixed ES15 contraction extents. The runtime
// equations remain editable Modelica. Comprehension occurrence certification
// in the pinned compiler rejects the equivalent generic reduction source.
import {readFile,writeFile} from 'node:fs/promises';
const file=new URL('../models/Estimation/Inertial/ES15CovariancePrediction.mo',import.meta.url);
let source=await readFile(file,'utf8');
const terms=(count,term)=>Array.from({length:count},(_,i)=>term(i+1)).join('+');
source=source.replace('sum(noiseTransition[node,i,k]*G[k,j] for k in 1:15)',
  `(${terms(15,k=>`noiseTransition[node,i,${k}]*G[${k},j]`)})`);
source=source.replace('sum(B[node,i,k]*B[node,j,k] for k in 1:12)',
  `(${terms(12,k=>`B[node,i,${k}]*B[node,j,${k}]`)})`);
await writeFile(file,source);
