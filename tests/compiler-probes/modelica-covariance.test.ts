import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import init,* as rumoca from '@cognipilot/rumoca';

type Matrix=number[][];
const matrix=(rows:number,columns:number,value:(i:number,j:number)=>number):Matrix=>Array.from({length:rows},(_,i)=>Array.from({length:columns},(_,j)=>value(i,j)));
const multiply=(a:Matrix,b:Matrix)=>matrix(a.length,b[0].length,(i,j)=>a[i].reduce((sum,v,k)=>sum+v*b[k][j],0));
const transpose=(a:Matrix)=>matrix(a[0].length,a.length,(i,j)=>a[j][i]);
const add=(a:Matrix,b:Matrix)=>a.map((row,i)=>row.map((v,j)=>v+b[i][j]));
const scale=(a:Matrix,s:number)=>a.map(row=>row.map(v=>v*s));
const identity=(n:number)=>matrix(n,n,(i,j)=>i===j?1:0);

// Independent continuous Lyapunov solution for nilpotent F. The exponential
// and noise integral terminate exactly; this does not copy quadrature nodes.
function continuousSolution(F:Matrix,G:Matrix,P:Matrix,density:number[],dt:number){
  const powers=[identity(15)];for(let i=1;i<=4;i++)powers.push(multiply(powers.at(-1)!,F));
  expect(powers[4].flat().every(v=>v===0)).toBe(true);
  const factorial=[1,1,2,6];let phi=matrix(15,15,()=>0),Q=matrix(15,15,()=>0);
  for(let i=0;i<4;i++)phi=add(phi,scale(powers[i],dt**i/factorial[i]));
  const D=multiply(multiply(G,matrix(12,12,(i,j)=>i===j?density[i]**2:0)),transpose(G));
  for(let i=0;i<4;i++)for(let j=0;j<4;j++){
    const coefficient=dt**(i+j+1)/(factorial[i]*factorial[j]*(i+j+1));
    Q=add(Q,scale(multiply(multiply(powers[i],D),transpose(powers[j])),coefficient));
  }
  return {Phi:phi,Q,predicted:add(multiply(multiply(phi,P),transpose(phi)),Q)};
}

it('full Modelica ES15 prediction preserves covariance and inertial noise coupling',async()=>{
  await init({module_or_path:readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
  const source=readFileSync('models/Estimation/Inertial/ES15CovariancePrediction.mo','utf8');
  const session=rumoca.WasmSimulationSession.withInteractiveOptions(source,'ES15CovariancePrediction',.1,'rk-like',1e-12,1e-12,'[]');
  try {
    const F=matrix(15,15,()=>0),G=matrix(15,12,()=>0);
    for(let i=0;i<3;i++){
      F[i][i+3]=1;F[i+3][i+9]=-1;F[i+6][i+12]=-1;
      G[i+3][i]=-1;G[i+6][i+3]=-1;G[i+9][i+6]=1;G[i+12][i+9]=1;
    }
    F[3][7]=9.81;F[4][6]=-9.81;
    const dense=matrix(15,15,(i,j)=>.01*Math.sin((i+1)*(j+1)*.17));
    const P=add(multiply(dense,transpose(dense)),scale(identity(15),.1));
    const density=[.06,.06,.06,.006,.006,.006,.002,.002,.002,.0002,.0002,.0002];
    for(const [index,dt] of [1/90,1/45,.003].entries()){
      const inputs:[string,number][]=[['dt',dt]];
      for(const [name,values] of [['F',F],['G',G],['P',P]] as const)
        values.forEach((row,i)=>row.forEach((v,j)=>inputs.push([`${name}[${i+1},${j+1}]`,v])));
      density.forEach((v,i)=>inputs.push([`density[${i+1}]`,v]));
      session.set_inputs(JSON.stringify(inputs));session.advance_to((index+1)*.1);
      const values=JSON.parse(session.state_json()).values,expected=continuousSolution(F,G,P,density,dt);
      const outputs={} as Record<keyof typeof expected,Matrix>;
      for(const name of ['Phi','Q','predicted'] as const){
        outputs[name]=matrix(15,15,(i,j)=>values[`${name}[${i+1},${j+1}]`]);
        for(let i=0;i<15;i++)for(let j=0;j<15;j++){
          expect(Number.isFinite(outputs[name][i][j])).toBe(true);
          expect(Math.abs(outputs[name][i][j]-expected[name][i][j]),`${name}[${i+1},${j+1}] dt=${dt}`).toBeLessThan(1e-10);
        }
      }
      expect(outputs.Q[0][3]).toBeGreaterThan(0); // Position/velocity noise covariance.
      expect(outputs.Q[6][12]).toBeLessThan(0); // Local attitude/gyro-bias coupling.
      for(let i=0;i<15;i++)for(let j=0;j<15;j++)
        expect(outputs.predicted[i][j]).toBe(outputs.predicted[j][i]);
      for(let direction=0;direction<16;direction++){
        const v=Array.from({length:15},(_,i)=>Math.sin((i+1)*(direction+1)*.23));
        const quadratic=(a:Matrix)=>v.reduce((sum,x,i)=>sum+x*a[i].reduce((s,y,j)=>s+y*v[j],0),0);
        expect(quadratic(outputs.Q)).toBeGreaterThanOrEqual(-1e-12);
        expect(quadratic(outputs.predicted)).toBeGreaterThan(0);
      }
    }
  } finally {session.free();}
},180_000);
