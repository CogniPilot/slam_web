import {test,expect, type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

// This gate executes the branch package without changing production assets.
// Source comes from the same checkout that produced the package, not expanded
// contractions that would conceal dependent/empty reduction regressions.
const packageDirectory=process.env.RUMOCA_BRANCH_PKG;
const sourceDirectory=resolve(process.env.RUMOCA_BRANCH_SOURCE??'../rumoca-slam-perf');
type Matrix=number[][];
type Inputs=[string,number][];
const matrix=(rows:number,columns:number,f:(i:number,j:number)=>number):Matrix=>Array.from({length:rows},(_,i)=>Array.from({length:columns},(_,j)=>f(i,j)));
const multiply=(a:Matrix,b:Matrix)=>matrix(a.length,b[0].length,(i,j)=>a[i].reduce((sum,v,k)=>sum+v*b[k][j],0));
const transpose=(a:Matrix)=>matrix(a[0].length,a.length,(i,j)=>a[j][i]);
const add=(a:Matrix,b:Matrix)=>a.map((row,i)=>row.map((v,j)=>v+b[i][j]));
const scale=(a:Matrix,s:number)=>a.map(row=>row.map(v=>v*s));
const identity=(n:number)=>matrix(n,n,(i,j)=>i===j?1:0);
const norm=(a:Matrix)=>Math.max(...a.map(row=>row.reduce((sum,v)=>sum+Math.abs(v),0)));
const entries=(name:string,a:Matrix):Inputs=>a.flatMap((row,i)=>row.map((v,j)=>[`${name}[${i+1},${j+1}]`,v] as [string,number]));

async function loadCompiler(page:Page){
  page.on('console',message=>{if(message.text().startsWith('RUMOCA FILTER '))console.log(message.text());});
  await page.route('**/__rumoca-branch/*',async route=>{
    const file=new URL(route.request().url()).pathname.split('/').at(-1)!;
    if(!['rumoca_bind_wasm.js','rumoca_bind_wasm_bg.wasm'].includes(file))return route.abort();
    await route.fulfill({body:await readFile(resolve(packageDirectory!,file)),contentType:file.endsWith('.wasm')?'application/wasm':'text/javascript'});
  });
  await page.route('**/__rumoca-filter-check',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Rumoca filter numerical gate</title>'}));
  await page.goto('/__rumoca-filter-check');
}

async function runModel(page:Page,source:string,model:string,frames:Inputs[]){
  return page.evaluate(async({source,model,frames})=>{
    const url='/__rumoca-branch/rumoca_bind_wasm.js';
    const compiler:any=await import(/* @vite-ignore */ url);
    await compiler.default({module_or_path:'/__rumoca-branch/rumoca_bind_wasm_bg.wasm'});
    console.log(`RUMOCA FILTER preparing ${model}`);
    const start=performance.now();
    const session=compiler.WasmSimulationSession.withInteractiveOptions(source,model,.1,'rk-like',1e-12,1e-12,'[]');
    const coldMs=performance.now()-start;
    try{
      const results=frames.map((inputs,index)=>{
        const start=performance.now();session.set_inputs(JSON.stringify(inputs));session.advance_to((index+1)*.1);
        return {values:JSON.parse(session.state_json()).values as Record<string,number>,ms:performance.now()-start};
      });
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
      return {compiler:{version:compiler.get_version(),revision:compiler.get_git_commit()},coldMs,sourceSha256:Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join(''),results};
    }finally{session.free();}
  },{source,model,frames});
}

test('branch browser executes generic SPD6 including a first-row empty reduction',async({page})=>{
  test.skip(!packageDirectory,'Set RUMOCA_BRANCH_PKG to the full-web wasm-pack output');
  test.setTimeout(180_000);
  await loadCompiler(page);
  const source=await readFile(resolve(sourceDirectory,'crates/rumoca-compile/src/session/tests/fixtures/spd6_typed_empty.mo'),'utf8');
  const X=matrix(6,16,(i,j)=>.05*Math.sin((i+1)*(j+1)*.19));
  const cases=[1,1e-3,1e2].map(s=>{
    const L=matrix(6,6,(i,j)=>i<j?0:(i===j?[.4,.3,.2,.03,.02,.01][i]:.001*(i+1)*(j+2))*Math.sqrt(s));
    const A=multiply(L,transpose(L));return {A,B:multiply(A,X),valid:true};
  });
  const L=matrix(6,6,(i,j)=>i<j?0:i===j?[.4,.3,.2,.03,.02,.01][i]:.01*(i+1)*(j+2));
  const illA=multiply(L,transpose(L));cases.push({A:illA,B:multiply(illA,X),valid:true});
  for(const last of [0,-1])cases.push({A:matrix(6,6,(i,j)=>i===j?(i===5?last:1):0),B:X,valid:false});
  const asymmetric=identity(6);asymmetric[0][1]=.01;cases.push({A:asymmetric,B:X,valid:false});
  cases.push({A:identity(6),B:X,valid:true});
  const report=await runModel(page,source,'SPD6Solve',cases.map(({A,B})=>[...entries('A',A),...entries('B',B)]));
  const inverseL=matrix(6,6,()=>0);
  for(let column=0;column<6;column++)for(let row=0;row<6;row++){
    let rhs=row===column?1:0;for(let k=0;k<row;k++)rhs-=L[row][k]*inverseL[k][column];inverseL[row][column]=rhs/L[row][row];
  }
  const condition=norm(illA)*norm(multiply(transpose(inverseL),inverseL));expect(condition).toBeGreaterThan(1e6);
  report.results.forEach(({values},index)=>{
    const {A,B,valid}=cases[index],actual=matrix(6,16,(i,j)=>values[`X[${i+1},${j+1}]`]);
    expect(values.valid).toBe(valid?1:0);expect(actual.flat().every(Number.isFinite)).toBe(true);
    if(!valid){expect(actual.flat()).toEqual(Array(96).fill(0));return;}
    const error=norm(actual.map((row,i)=>row.map((v,j)=>v-X[i][j])));
    expect(error).toBeLessThan(index===3?64*Number.EPSILON*condition*norm(X):1e-9);
    const residual=multiply(A,actual).map((row,i)=>row.map((v,j)=>v-B[i][j]));
    expect(norm(residual)).toBeLessThan(64*Number.EPSILON*(norm(A)*norm(actual)+norm(B)));
  });
  console.log('RUMOCA SPD6 BROWSER',{compiler:report.compiler,coldMs:report.coldMs,sourceSha256:report.sourceSha256,frameMs:report.results.map(v=>v.ms),condition});
});

test('branch browser executes full generic ES15 covariance against continuous Lyapunov solutions',async({page})=>{
  test.skip(!packageDirectory,'Set RUMOCA_BRANCH_PKG to the full-web wasm-pack output');
  test.setTimeout(240_000);
  await loadCompiler(page);
  const source=await readFile(resolve(sourceDirectory,'crates/rumoca-compile/src/session/tests/fixtures/es15_nested_reductions.mo'),'utf8');
  const F=matrix(15,15,()=>0),G=matrix(15,12,()=>0);
  for(let i=0;i<3;i++){
    F[i][i+3]=1;F[i+3][i+9]=-1;F[i+6][i+12]=-1;
    G[i+3][i]=-1;G[i+6][i+3]=-1;G[i+9][i+6]=1;G[i+12][i+9]=1;
  }
  F[3][7]=9.81;F[4][6]=-9.81;
  const dense=matrix(15,15,(i,j)=>.01*Math.sin((i+1)*(j+1)*.17));
  const P=add(multiply(dense,transpose(dense)),scale(identity(15),.1));
  const density=[.06,.06,.06,.006,.006,.006,.002,.002,.002,.0002,.0002,.0002];
  const times=[1/90,1/45,.003];
  const frames=times.map(dt=>[...entries('F',F),...entries('G',G),...entries('P',P),['dt',dt] as [string,number],...density.map((v,i)=>[`density[${i+1}]`,v] as [string,number])]);
  const report=await runModel(page,source,'ES15CovariancePrediction',frames);
  // For this nilpotent F the exact exponential and continuous noise integral
  // terminate. This oracle does not reproduce the model's quadrature nodes.
  const powers=[identity(15)];for(let i=1;i<=4;i++)powers.push(multiply(powers.at(-1)!,F));
  expect(powers[4].flat().every(v=>v===0)).toBe(true);
  const factorial=[1,1,2,6],D=multiply(multiply(G,matrix(12,12,(i,j)=>i===j?density[i]**2:0)),transpose(G));
  report.results.forEach(({values},index)=>{
    const dt=times[index];let Phi=matrix(15,15,()=>0),Q=matrix(15,15,()=>0);
    for(let i=0;i<4;i++)Phi=add(Phi,scale(powers[i],dt**i/factorial[i]));
    for(let i=0;i<4;i++)for(let j=0;j<4;j++)Q=add(Q,scale(multiply(multiply(powers[i],D),transpose(powers[j])),dt**(i+j+1)/(factorial[i]*factorial[j]*(i+j+1))));
    const expected={Phi,Q,predicted:add(multiply(multiply(Phi,P),transpose(Phi)),Q)};
    const actual={} as Record<keyof typeof expected,Matrix>;
    for(const name of ['Phi','Q','predicted'] as const){
      actual[name]=matrix(15,15,(i,j)=>values[`${name}[${i+1},${j+1}]`]);
      for(let i=0;i<15;i++)for(let j=0;j<15;j++){
        expect(Number.isFinite(actual[name][i][j])).toBe(true);
        expect(Math.abs(actual[name][i][j]-expected[name][i][j]),`${name}[${i+1},${j+1}] dt=${dt}`).toBeLessThan(1e-10);
      }
    }
    expect(actual.Q[0][3]).toBeGreaterThan(0);expect(actual.Q[6][12]).toBeLessThan(0);
    for(let i=0;i<15;i++)for(let j=0;j<15;j++)expect(actual.predicted[i][j]).toBe(actual.predicted[j][i]);
    for(let direction=0;direction<16;direction++){
      const v=Array.from({length:15},(_,i)=>Math.sin((i+1)*(direction+1)*.23));
      const quadratic=(a:Matrix)=>v.reduce((sum,x,i)=>sum+x*a[i].reduce((s,y,j)=>s+y*v[j],0),0);
      expect(quadratic(actual.Q)).toBeGreaterThanOrEqual(-1e-12);expect(quadratic(actual.predicted)).toBeGreaterThan(0);
    }
  });
  console.log('RUMOCA ES15 BROWSER',{compiler:report.compiler,coldMs:report.coldMs,sourceSha256:report.sourceSha256,frameMs:report.results.map(v=>v.ms)});
});
