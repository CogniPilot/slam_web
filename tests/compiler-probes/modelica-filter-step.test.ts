import {modelicaSourcePath} from '../../src/modelica-source-locations.mjs';
import {it,expect} from 'vitest';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const directory=process.env.RUMOCA_BRANCH_PKG;
type Matrix=number[][];
const matrix=(n:number,m:number,f:(i:number,j:number)=>number):Matrix=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>f(i,j)));
const identity=(n:number)=>matrix(n,n,(i,j)=>+(i===j));
const multiply=(a:Matrix,b:Matrix)=>matrix(a.length,b[0].length,(i,j)=>a[i].reduce((s,v,k)=>s+v*b[k][j],0));
const transpose=(a:Matrix)=>matrix(a[0].length,a.length,(i,j)=>a[j][i]);
const add=(a:Matrix,b:Matrix)=>matrix(a.length,a[0].length,(i,j)=>a[i][j]+b[i][j]);
const scale=(a:Matrix,s:number)=>a.map(row=>row.map(v=>v*s));
const entries=(name:string,a:Matrix):[string,number][]=>a.flatMap((row,i)=>row.map((v,j)=>[`${name}[${i+1},${j+1}]`,v] as [string,number]));
const vector=(name:string,a:number[]):[string,number][]=>a.map((v,i)=>[`${name}[${i+1}]`,v]);

// Gaussian elimination with pivoting is independent of the Modelica Cholesky.
function solve(a:Matrix,b:Matrix){
  const n=a.length,m=b[0].length,rows=a.map((row,i)=>[...row,...b[i]]);
  for(let k=0;k<n;k++){
    let pivot=k;for(let i=k+1;i<n;i++)if(Math.abs(rows[i][k])>Math.abs(rows[pivot][k]))pivot=i;
    [rows[k],rows[pivot]]=[rows[pivot],rows[k]];
    for(let i=k+1;i<n;i++){const ratio=rows[i][k]/rows[k][k];for(let j=k;j<n+m;j++)rows[i][j]-=ratio*rows[k][j];}
  }
  const result=matrix(n,m,()=>0);
  for(let i=n-1;i>=0;i--)for(let j=0;j<m;j++)result[i][j]=(rows[i][n+j]-rows[i].slice(i+1,n).reduce((s,v,k)=>s+v*result[i+1+k][j],0))/rows[i][i];
  return result;
}

it.skipIf(!directory)('composed Modelica filter step predicts, corrects and rejects without host numerical solves',async()=>{
  const files=['ES15NominalPrediction','ES15Dynamics','ES15CovariancePrediction','SPD6Solve','ES15PoseCorrection'];
  const source=(await Promise.all([...files.map(name=>readFile(modelicaSourcePath(name),'utf8')),readFile('tests/compiler-probes/fixtures/components/ES15FilterStep.mo','utf8')])).join('\n');
  const reportPath=process.env.RUMOCA_FILTER_STEP_REPORT;
  const report=async(value:unknown)=>{if(reportPath)await writeFile(reportPath,JSON.stringify(value,null,2)+'\n');};
  await report({phase:'initializing compiler',sourceSha256:createHash('sha256').update(source).digest('hex')});
  const compiler=await import(/* @vite-ignore */ pathToFileURL(resolve(directory!,'rumoca_bind_wasm.js')).href);
  await compiler.default({module_or_path:await readFile(resolve(directory!,'rumoca_bind_wasm_bg.wasm'))});
  const initial=[...entries('covariance',scale(identity(15),.1)),...entries('observation_covariance',scale(identity(6),.04))];
  const started=performance.now(),session=compiler.WasmSimulationSession.withInteractiveOptions(source,'ES15FilterStep',.1,'rk-like',1e-12,1e-12,JSON.stringify(initial));
  const coldMs=performance.now()-started;
  await report({phase:'session prepared',coldMs});
  try{
    const P=scale(identity(15),.1),C=scale(identity(6),.04),F=matrix(15,15,()=>0),G=matrix(15,12,()=>0);
    const density=[.06,.06,.06,.006,.006,.006,.002,.002,.002,.0002,.0002,.0002];
    for(let i=0;i<3;i++){F[i][i+3]=1;F[i+3][i+9]=-1;F[i+6][i+12]=-1;G[i+3][i]=-1;G[i+6][i+3]=-1;G[i+9][i+6]=1;G[i+12][i+9]=1;}
    F[3][7]=9.81;F[4][6]=-9.81;
    const powers=[identity(15)];for(let i=1;i<=4;i++)powers.push(multiply(powers.at(-1)!,F));
    expect(powers[4].flat()).toEqual(Array(225).fill(0));
    // Exact continuous Lyapunov solution for nilpotent F, independent of the
    // model's three quadrature nodes and polynomial implementation.
    const predicted=(h:number)=>{
      const factorial=[1,1,2,6],D=multiply(multiply(G,matrix(12,12,(i,j)=>i===j?density[i]**2:0)),transpose(G));
      let transition=matrix(15,15,()=>0),Q=matrix(15,15,()=>0);
      for(let i=0;i<4;i++)transition=add(transition,scale(powers[i],h**i/factorial[i]));
      for(let i=0;i<4;i++)for(let j=0;j<4;j++)Q=add(Q,scale(multiply(multiply(powers[i],D),transpose(powers[j])),h**(i+j+1)/(factorial[i]*factorial[j]*(i+j+1))));
      return add(multiply(multiply(transition,P),transpose(transition)),Q);
    };
    const scenarios=[
      {name:'prediction only',enabled:0,h:1/90,offset:.02,accepted:false,rejected:false,valid:true},
      {name:'pose correction',enabled:1,h:1/90,offset:.02,accepted:true,rejected:false,valid:true},
      {name:'NIS rejection',enabled:1,h:1/90,offset:100,accepted:false,rejected:true,valid:true},
      {name:'invalid covariance',enabled:1,h:1/90,offset:.02,accepted:false,rejected:true,valid:true,badCovariance:true},
      {name:'invalid flag',enabled:2,h:1/90,offset:.02,accepted:false,rejected:true,valid:true},
      {name:'zero substep',enabled:1,h:0,offset:.02,accepted:false,rejected:false,valid:false},
      {name:'oversized substep',enabled:1,h:.021,offset:.02,accepted:false,rejected:false,valid:false},
      {name:'invalid density',enabled:1,h:1/90,offset:.02,accepted:false,rejected:false,valid:false,badDensity:true},
      {name:'recovery',enabled:1,h:1/90,offset:.02,accepted:true,rejected:false,valid:true},
    ];
    const frames=[];
    for(const [index,scenario] of scenarios.entries()){
      const measured=scenario.badCovariance?matrix(6,6,(i,j)=>i===j?(i===5?-.04:.04):0):C;
      const inputs:[string,number][]=[['h',scenario.h],['observation_enabled',scenario.enabled],['accepted_count',3],['rejected_count',4],['last_nis',.75],
        ...entries('rotation',identity(3)),...entries('observed_rotation',identity(3)),...entries('covariance',P),...entries('observation_covariance',measured),
        ...vector('position',[1,-2,3]),...vector('velocity',[0,0,0]),...vector('accel_bias',[0,0,0]),...vector('gyro_bias',[0,0,0]),
        ...vector('accel',[0,0,9.81]),...vector('gyro',[0,0,0]),...vector('gravity',[0,0,-9.81]),...vector('observed_position',[1,-2,3+scenario.offset]),
        ...vector('density',scenario.badDensity?density.map((v,i)=>i===0?-v:v):density)];
      const start=performance.now();session.set_inputs(JSON.stringify(inputs));session.advance_to((index+1)*.1);
      const values=JSON.parse(session.state_json()).values as Record<string,number>;
      const prior=scenario.valid?predicted(scenario.h):P,selected=[0,1,2,6,7,8];
      const H=matrix(6,15,(i,j)=>+(selected[i]===j)),S=matrix(6,6,(i,j)=>prior[selected[i]][selected[j]]+C[i][j]);
      const K=transpose(solve(S,transpose(multiply(prior,transpose(H)))));
      const innovation=[0,0,scenario.offset,0,0,0],delta=K.map(row=>row.reduce((s,v,j)=>s+v*innovation[j],0));
      // Vertical observations of this stationary isotropic prior have zero
      // attitude correction, so the posterior needs no copied reset formula.
      expect(Math.max(...delta.slice(6,9).map(Math.abs))).toBeLessThan(1e-14);
      const residual=add(identity(15),scale(multiply(K,H),-1));
      const posterior=add(multiply(multiply(residual,prior),transpose(residual)),multiply(multiply(K,C),transpose(K)));
      const covariance=scenario.accepted?posterior:prior;
      for(let i=0;i<15;i++)for(let j=0;j<15;j++){
        const actual=values[`next_covariance[${i+1},${j+1}]`];expect(Number.isFinite(actual)).toBe(true);
        expect(Math.abs(actual-covariance[i][j]),`${scenario.name} covariance[${i},${j}]`).toBeLessThan(1e-10);
        expect(actual).toBe(values[`next_covariance[${j+1},${i+1}]`]);
      }
      for(const [name,base,begin] of [['next_position',[1,-2,3],0],['next_velocity',[0,0,0],3],['next_accel_bias',[0,0,0],9],['next_gyro_bias',[0,0,0],12]] as const){
        for(let i=0;i<3;i++)expect(values[`${name}[${i+1}]`]).toBeCloseTo(base[i]+(scenario.accepted?delta[begin+i]:0),10);
      }
      for(let i=0;i<3;i++)for(let j=0;j<3;j++)expect(values[`next_rotation[${i+1},${j+1}]`]).toBeCloseTo(+(i===j),12);
      expect(values.prediction_valid).toBe(+scenario.valid);expect(values.observation_accepted).toBe(+scenario.accepted);expect(values.observation_rejected).toBe(+scenario.rejected);
      expect(values.next_accepted_count).toBe(3+ +scenario.accepted);expect(values.next_rejected_count).toBe(4+ +scenario.rejected);
      if(scenario.enabled===0||scenario.enabled===2||!scenario.valid||scenario.badCovariance)expect(values.next_last_nis).toBe(.75);
      else expect(values.next_last_nis).toBeCloseTo(scenario.offset**2/S[2][2],10);
      frames.push({name:scenario.name,ms:performance.now()-start});
      await report({phase:'numerical checks running',coldMs,frames});
    }
    const result={status:'NUMERICAL_PASS',compiler:{version:compiler.get_version(),revision:compiler.get_git_commit()},sourceSha256:createHash('sha256').update(source).digest('hex'),coldMs,frames,scope:'One composed filter core; interpreted session, no RGB-D frontend or full SLAM integration'};
    await report(result);console.log('COMPOSED MODELICA FILTER',JSON.stringify(result));
  }finally{session.free();}
},180_000);
