import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import init,* as rumoca from '@cognipilot/rumoca';

type Matrix=number[][];
const matrix=(rows:number,columns:number,value:(i:number,j:number)=>number):Matrix=>Array.from({length:rows},(_,i)=>Array.from({length:columns},(_,j)=>value(i,j)));
const multiply=(a:Matrix,b:Matrix)=>matrix(a.length,b[0].length,(i,j)=>a[i].reduce((sum,v,k)=>sum+v*b[k][j],0));
const transpose=(a:Matrix)=>matrix(a[0].length,a.length,(i,j)=>a[j][i]);
const infinityNorm=(a:Matrix)=>Math.max(...a.map(row=>row.reduce((sum,v)=>sum+Math.abs(v),0)));

// The known factor gives an independent condition estimate, without deriving
// it from the Modelica outputs. Forward error must account for conditioning;
// the residual still has to satisfy a strict backward-error bound.
function inverseFromFactor(L:Matrix):Matrix {
  const inverse=matrix(6,6,()=>0);
  for(let column=0;column<6;column++)for(let row=0;row<6;row++){
    let rhs=row===column?1:0;
    for(let k=0;k<row;k++)rhs-=L[row][k]*inverse[k][column];
    inverse[row][column]=rhs/L[row][row];
  }
  return multiply(transpose(inverse),inverse);
}

it('Modelica shared SPD solve recovers all sixteen RHS and rejects unusable covariance',async()=>{
  await init({module_or_path:readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
  const source=readFileSync('models/Math/SPD6Solve.mo','utf8');
  const session=rumoca.WasmSimulationSession.withInteractiveOptions(source,'SPD6Solve',.1,'rk-like',1e-12,1e-12,'[]');
  let time=0;
  const evaluate=(A:Matrix,B:Matrix)=>{
    const inputs:[string,number][]=[];
    for(const [name,values] of [['A',A],['B',B]] as const)values.forEach((row,i)=>row.forEach((v,j)=>inputs.push([`${name}[${i+1},${j+1}]`,v])));
    session.set_inputs(JSON.stringify(inputs));session.advance_to(time+=.1);
    const values=JSON.parse(session.state_json()).values;
    return {valid:values.valid,X:matrix(6,16,(i,j)=>values[`X[${i+1},${j+1}]`])};
  };
  try {
    const expected=matrix(6,16,(i,j)=>.05*Math.sin((i+1)*(j+1)*.19));
    for(const scale of [1,1e-3,1e2]){
      const diagonal=[.4,.3,.2,.03,.02,.01];
      const L=matrix(6,6,(i,j)=>i<j?0:i===j?diagonal[i]*Math.sqrt(scale):.001*(i+1)*(j+2)*Math.sqrt(scale));
      const A=multiply(L,transpose(L)),B=multiply(A,expected),result=evaluate(A,B);
      expect(result.valid).toBe(1);
      for(let i=0;i<6;i++)for(let j=0;j<16;j++)expect(result.X[i][j]).toBeCloseTo(expected[i][j],9);
      const residual=multiply(A,result.X);
      for(let i=0;i<6;i++)for(let j=0;j<16;j++)expect(Math.abs(residual[i][j]-B[i][j])).toBeLessThan(1e-10*Math.max(1,Math.abs(B[i][j])));
    }
    const illConditionedFactor=matrix(6,6,(i,j)=>i<j?0:i===j?[.4,.3,.2,.03,.02,.01][i]:.01*(i+1)*(j+2));
    const illA=multiply(illConditionedFactor,transpose(illConditionedFactor)),illB=multiply(illA,expected),ill=evaluate(illA,illB);
    const condition=infinityNorm(illA)*infinityNorm(inverseFromFactor(illConditionedFactor));
    expect(condition).toBeGreaterThan(1e6);expect(ill.valid).toBe(1);
    const forwardError=infinityNorm(ill.X.map((row,i)=>row.map((v,j)=>v-expected[i][j])));
    expect(forwardError).toBeLessThan(64*Number.EPSILON*condition*infinityNorm(expected));
    const illResidual=multiply(illA,ill.X).map((row,i)=>row.map((v,j)=>v-illB[i][j]));
    expect(infinityNorm(illResidual)).toBeLessThan(64*Number.EPSILON*(infinityNorm(illA)*infinityNorm(ill.X)+infinityNorm(illB)));
    for(const lastDiagonal of [0,-1]){
      const A=matrix(6,6,(i,j)=>i===j?(i===5?lastDiagonal:1):0),result=evaluate(A,expected);
      expect(result.valid).toBe(0);expect(result.X.flat()).toEqual(Array(96).fill(0));
    }
    const asymmetric=matrix(6,6,(i,j)=>i===j?1:0);asymmetric[0][1]=.01;
    const invalid=evaluate(asymmetric,expected);expect(invalid.valid).toBe(0);expect(invalid.X.flat()).toEqual(Array(96).fill(0));
    // A rejected frame must not leave stale solutions or poison recovery.
    const identity=matrix(6,6,(i,j)=>i===j?1:0),recovered=evaluate(identity,expected);
    expect(recovered.valid).toBe(1);expect(recovered.X).toEqual(expected);
  } finally {session.free();}
},60_000);
