// Test-only independent dense formula oracle; never imported by application code.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {fixture,denseInformation,factor} from './graph-covariance-reference.mjs';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),model='ModelicaPoseGraphCoarseAcceptance';
const root=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(root,{recursive:true});const output=fs.mkdtempSync(path.join(root,'graph-coarse-semantics-'));
const sha=b=>createHash('sha256').update(b).digest('hex');const names=['models/ModelicaPoseGraph.mo','models/ModelicaPoseGraphCovariance.mo','tests/modelica/ModelicaPoseGraphCoarseAcceptance.mo'];
const sources=[...names,'dev/check-modelica-graph-coarse.mjs','dev/graph-covariance-reference.mjs'].map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(app,p)))}));
const script=path.join(output,'coarse.mos');fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize");\nsetCommandLineOptions("--preOptModules-=evalFunc");\n'+names.map(p=>`loadFile(${JSON.stringify(path.join(app,p))});`).join('\n')+'\ngetErrorString();\nsimulate('+model+',stopTime=0.5,numberOfIntervals=8,outputFormat="csv",variableFilter="scenario|first.*|second.*|accepted|canonicalRefusal");\ngetErrorString();\n');
const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192','--available-mib','16384','--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','8,9','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,process.env.OMC_BIN??'omc','--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');const result=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});fs.writeFileSync(path.join(output,'resources.json'),result.stdout??'');
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),solve=({L,n},b)=>{const x=b.slice();for(let i=0;i<n;i++){for(let j=0;j<i;j++)x[i]-=L[i*n+j]*x[j];x[i]/=L[i*n+i];}for(let i=n-1;i>=0;i--){for(let j=i+1;j<n;j++)x[i]-=L[j*n+i]*x[j];x[i]/=L[i*n+i];}return x;};
function denseOracle(scenario){const data=fixture(scenario===2?6:scenario===3?7:1),{H,n}=denseInformation(data),tree=factor(denseInformation(data,true));
 const mul=x=>{const y=new Float64Array(n);for(let i=0;i<n;i++)for(let j=0;j<n;j++)y[i]+=H[i*n+j]*x[j];return y;};
 const Z=Array.from({length:6},()=>new Float64Array(n));
 for(let node=1;node<data.active;node++){const p=data.p[node].map((v,i)=>v-data.p[0][i]),S=[[0,-p[2],p[1]],[p[2],0,-p[0]],[-p[1],p[0],0]];
  for(let axis=0;axis<3;axis++){Z[axis][6*(node-1)+axis]=1;for(let col=0;col<3;col++){Z[col+3][6*(node-1)+axis]=-S[axis][col];Z[col+3][6*(node-1)+axis+3]=data.R[node][col][axis];}}}
 for(let c=0;c<6;c++){const norm=Math.sqrt(dot(Z[c],Z[c]));Z[c]=Z[c].map(x=>x/norm);}
 const F=Z.map(mul),E=new Float64Array(36);for(let i=0;i<6;i++)for(let j=0;j<6;j++)E[6*i+j]=.5*(dot(Z[i],F[j])+dot(Z[j],F[i]));const small=factor({H:E,n:6});
 const Q=v=>{const a=solve(small,Float64Array.from(Z.map(z=>dot(z,v)))),x=new Float64Array(n);for(let i=0;i<n;i++)for(let c=0;c<6;c++)x[i]+=Z[c][i]*a[c];return x;};
 // Direct dense P/Q formula, deliberately not the source's precomputed-HZ apply.
 const apply=v=>{const q=Q(v),hq=mul(q),w=solve(tree,v.map((x,i)=>x-hq[i])),qhw=Q(mul(w));return w.map((x,i)=>q[i]+x-qhw[i]);};
 const f=Float64Array.from({length:n},(_,k)=>Math.sin(.071*(2+Math.floor(k/6))+.19*(k%6+1))),g=Float64Array.from({length:n},(_,k)=>Math.cos(.053*(2+Math.floor(k/6))-.13*(k%6+1)));
 return{n,f,g,first:apply(f),second:apply(g)};
}
const csv=path.join(output,model+'_res.csv'),cases=[];let csvValid=false,csvSHA256=null;
if(fs.existsSync(csv)){const raw=fs.readFileSync(csv,'utf8'),lines=raw.trim().split(/\r?\n/),header=lines.shift(),cols=[...header.matchAll(/"([^"]*)"(?:,|$)/g)].map(m=>m[1]);const rows=lines.map(l=>l.split(',').map(Number));
 const expected=['time','scenario','accepted','canonicalRefusal',...['first','second'].flatMap(p=>Array.from({length:128},(_,i)=>Array.from({length:6},(_,j)=>`${p}[${i+1},${j+1}]`)).flat())];
 csvValid=/^"[^"]*"(?:,"[^"]*")*$/.test(header)&&cols.length===expected.length&&new Set(cols).size===expected.length&&expected.every(p=>cols.includes(p))&&rows.length>=4&&rows.every(r=>r.length===expected.length&&r.every(Number.isFinite))&&lines.every(l=>l.split(',').every(v=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(v)))&&rows[0][cols.indexOf('time')]===0&&rows.at(-1)[cols.indexOf('time')]===.5;csvSHA256=sha(raw);
 if(csvValid)for(let scenario=1;scenario<=4;scenario++){const observed=rows.filter(r=>r[cols.indexOf('scenario')]===scenario),checks={observed:observed.length>0};let metrics={};
 if(observed.length){const row=observed[0],first=Array.from({length:128*6},(_,k)=>row[cols.indexOf(`first[${Math.floor(k/6)+1},${k%6+1}]`)]),second=Array.from({length:128*6},(_,k)=>row[cols.indexOf(`second[${Math.floor(k/6)+1},${k%6+1}]`)]);
  checks.stableRepeated=observed.every(r=>cols.every((p,i)=>p==='time'||r[i]===row[i]));checks.accepted=row[cols.indexOf('accepted')]===(scenario===4?0:1);
  if(scenario===4)checks.rankRefusal=row[cols.indexOf('canonicalRefusal')]===1&&[...first,...second].every(v=>v===0);
  else{const o=denseOracle(scenario),a=first.slice(6,6+o.n),b=second.slice(6,6+o.n),scale=Math.max(1,...o.first.map(Math.abs),...o.second.map(Math.abs)),tol=5e-7*scale,maxDifference=Math.max(...a.map((v,i)=>Math.abs(v-o.first[i])),...b.map((v,i)=>Math.abs(v-o.second[i]))),cross=Math.abs(dot(o.f,b)-dot(o.g,a)),crossScale=Math.max(1,Math.abs(dot(o.f,b)),Math.abs(dot(o.g,a)));
   checks.allFreeCoordinates=maxDifference<=tol;checks.gaugeAndInactiveZero=first.slice(0,6).every(v=>v===0)&&second.slice(0,6).every(v=>v===0)&&first.slice(6+o.n).every(v=>v===0)&&second.slice(6+o.n).every(v=>v===0);checks.symmetric=cross<=1e-10*crossScale;checks.positive=dot(o.f,a)>0&&dot(o.g,b)>0;
   metrics={denseFreeDimension:o.n,comparedCoordinates:2*o.n,maxDifference,tolerance:tol,crossDifference:cross,firstQuadratic:dot(o.f,a),secondQuadratic:dot(o.g,b)};}}
 cases.push({scenario,checks,metrics,pass:Object.values(checks).every(Boolean)});}}
const bookendsEqual=sources.every(s=>sha(fs.readFileSync(path.join(app,s.path)))===s.sha256),log=fs.readFileSync(path.join(output,'semantics.log'),'utf8');const pass=result.status===0&&bookendsEqual&&csvValid&&cases.length===4&&cases.every(c=>c.pass)&&log.includes('The simulation finished successfully.');
const report={status:pass?'OMC_COARSE_FORMULA_REFERENCE_PASS':'FAILED_OR_INCOMPLETE',scope:'Actual full128/256 Modelica coarse construction/apply against independent finite-difference full dense H and dense tree inverse, no production dense matrix or covariance acceptance.',sources,bookendsEqual,processStatus:result.status,csvValid,csvSHA256,cases};fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');const durable=path.join(app,'dev/artifacts/modelica-graph-covariance-semantics',path.basename(output));fs.mkdirSync(durable,{recursive:true});for(const p of ['report.json','command.json','resources.json','semantics.log','coarse.mos',model+'_res.csv'])if(fs.existsSync(path.join(output,p)))fs.copyFileSync(path.join(output,p),path.join(durable,p));console.log(JSON.stringify({directory:output,...report}));process.exitCode=pass?0:1;
