import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import init,* as rumoca from '@cognipilot/rumoca';

type Matrix=number[][];
const identity=()=>[[1,0,0],[0,1,0],[0,0,1]];
const transpose=(a:Matrix)=>a[0].map((_,j)=>a.map(row=>row[j]));
const multiply=(a:Matrix,b:Matrix)=>a.map(row=>b[0].map((_,j)=>row.reduce((sum,v,k)=>sum+v*b[k][j],0)));
const skew=([x,y,z]:number[])=>[[0,-z,y],[z,0,-x],[-y,x,0]];
const vector=(a:Matrix,b:number[])=>a.map(row=>row.reduce((sum,v,k)=>sum+v*b[k],0));
function exp(w:number[]):Matrix {
  const angle=Math.hypot(...w),W=skew(w),W2=multiply(W,W);
  const a=angle<1e-7?1:Math.sin(angle)/angle,b=angle<1e-7?.5:(1-Math.cos(angle))/(angle*angle);
  return identity().map((row,i)=>row.map((v,j)=>v+a*W[i][j]+b*W2[i][j]));
}

/** Derive the error-rate Jacobian by perturbing actual nominal/true rigid-body
 * dynamics. This oracle never constructs the analytic F/G block formulas. */
function difference(rotation:Matrix,force:number[],omega:number[],error:number[],noise:number[]):number[] {
  const trueRotation=multiply(rotation,exp(error.slice(6,9)));
  const trueForce=force.map((v,i)=>v-error[i+9]),trueOmega=omega.map((v,i)=>v-error[i+12]);
  const nominalForce=force.map((v,i)=>v+noise[i]),nominalOmega=omega.map((v,i)=>v+noise[i+3]);
  const trueAcceleration=vector(trueRotation,trueForce),nominalAcceleration=vector(rotation,nominalForce);
  const nominalRotationRate=multiply(rotation,skew(nominalOmega)),trueRotationRate=multiply(trueRotation,skew(trueOmega));
  const left=multiply(transpose(nominalRotationRate),trueRotation),right=multiply(transpose(rotation),trueRotationRate);
  const relativeRate=left.map((row,i)=>row.map((v,j)=>v+right[i][j]));
  const attitude=[relativeRate[2][1]-relativeRate[1][2],relativeRate[0][2]-relativeRate[2][0],relativeRate[1][0]-relativeRate[0][1]].map(v=>v/2);
  return [...error.slice(3,6),...trueAcceleration.map((v,i)=>v-nominalAcceleration[i]),...attitude,...noise.slice(6,12)];
}
function numericalJacobian(rotation:Matrix,force:number[],omega:number[],input:'state'|'noise'):Matrix {
  const count=input==='state'?15:12,epsilon=1e-5;
  const columns=Array.from({length:count},(_,column)=>{
    const plus=Array(count).fill(0),minus=Array(count).fill(0);plus[column]=epsilon;minus[column]=-epsilon;
    const zeroState=Array(15).fill(0),zeroNoise=Array(12).fill(0);
    const a=difference(rotation,force,omega,input==='state'?plus:zeroState,input==='noise'?plus:zeroNoise);
    const b=difference(rotation,force,omega,input==='state'?minus:zeroState,input==='noise'?minus:zeroNoise);
    return a.map((v,i)=>(v-b[i])/(2*epsilon));
  });
  return transpose(columns);
}

it('Modelica ES15 dynamics match finite-differenced true/nominal motion with the declared error convention',async()=>{
  await init({module_or_path:readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
  const source=readFileSync('models/Estimation/Inertial/ES15Dynamics.mo','utf8');
  const session=rumoca.WasmSimulationSession.withInteractiveOptions(source,'ES15Dynamics',.1,'rk-like',1e-8,1e-6,'[]');
  try {
    const cases=[
      {rotation:identity(),force:[0,0,9.81],omega:[0,0,0]},
      {rotation:exp([.23,-.38,.47]),force:[1.7,-2.3,8.9],omega:[.4,-.27,.73]},
      {rotation:exp([-1.3,.7,.4]),force:[-3.6,.7,6.2],omega:[-1.1,.39,-.54]}
    ];
    for(const [index,fixture] of cases.entries()) {
      const inputs:[string,number][]=[];
      fixture.rotation.forEach((row,i)=>row.forEach((v,j)=>inputs.push([`rotation[${i+1},${j+1}]`,v])));
      for(const name of ['force','omega'] as const)fixture[name].forEach((v,i)=>inputs.push([`${name}[${i+1}]`,v]));
      session.set_inputs(JSON.stringify(inputs));session.advance_to((index+1)*.1);
      const values=JSON.parse(session.state_json()).values;
      for(const [name,input] of [['F','state'],['G','noise']] as const) {
        const expected=numericalJacobian(fixture.rotation,fixture.force,fixture.omega,input);
        for(let row=0;row<15;row++)for(let column=0;column<expected[0].length;column++){
          const actual=values[`${name}[${row+1},${column+1}]`];
          expect(Number.isFinite(actual)).toBe(true);
          expect(Math.abs(actual-expected[row][column]),`${name}[${row+1},${column+1}] case ${index}`).toBeLessThan(2e-8);
        }
      }
    }
  } finally {session.free();}
},30_000);
