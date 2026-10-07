// Numerical reference gate only. Production never allocates a dense graph matrix.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {fixture,denseInformation,factor,selectedInverse,eigenvalues,difference,maxAbs} from './graph-covariance-reference.mjs';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const model='ModelicaPoseGraphCovarianceAcceptance',count=19,stopTime=19/8;
const root=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(root,{recursive:true});
const recheck=process.env.OMC_COVARIANCE_RECHECK_DIR;
const output=recheck?path.resolve(recheck):fs.mkdtempSync(path.join(root,'graph-covariance-semantics-'));
const original=recheck?JSON.parse(fs.readFileSync(path.join(output,'report.json'),'utf8')):null;
const names=['models/Optimization/ModelicaPoseGraph.mo','models/Optimization/ModelicaPoseGraphCovariance.mo','tests/modelica/ModelicaPoseGraphCovarianceTests.mo','tests/modelica/ModelicaPoseGraphCovarianceAcceptance.mo'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const sources=[...names,'dev/check-modelica-graph-covariance.mjs','dev/graph-covariance-reference.mjs'].map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
if(!recheck){const preimages=path.join(app,'dev/artifacts/modelica-graph-covariance-semantics',path.basename(output),'source-preimages');
for(const entry of sources){const target=path.join(preimages,entry.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(app,entry.path),target);}}
const script=path.join(output,'graph-covariance.mos');
if(!recheck)fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize");\n'
 +'setCommandLineOptions("--preOptModules-=evalFunc");\n'
 +names.map(name=>`loadFile(${JSON.stringify(path.join(app,name))});`).join('\n')
 +`\ngetErrorString();\nsimulate(${model},stopTime=${stopTime},numberOfIntervals=38,outputFormat="csv",variableFilter="upper.*|lower.*|residualUpper.*|residualNorm.*|accepted|status|scenario|treeEdges|activeNodes|roundoffCertified|converged.*|iterations.*");\ngetErrorString();\n`);
const omc=process.env.OMC_BIN??'omc',version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192','--available-mib','16384',
 '--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','10,11','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,omc,'--numProcs=2','--vectorizationLimit=1',script];
if(!recheck)fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
const processResult=recheck?{status:original.processStatus}:spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
if(!recheck)fs.writeFileSync(path.join(output,'resources.json'),processResult.stdout??'');
const log=fs.readFileSync(path.join(output,'semantics.log'),'utf8'),csv=path.join(output,`${model}_res.csv`);
const cases=[];let csvValid=false,csvReport=null;const denseCache=new Map();
if(fs.existsSync(csv)){
 const raw=fs.readFileSync(csv,'utf8'),lines=raw.trim().split(/\r?\n/),columns=[...lines[0].matchAll(/"([^"]*)"(?:,|$)/g)].map(m=>m[1]);
 if(recheck&&(sha(raw)!==original.csvReport?.sha256||!original.bookendsEqual||original.sources.filter(s=>s.path!=='dev/check-modelica-graph-covariance.mjs').some(s=>sha(fs.readFileSync(path.join(app,s.path)))!==s.sha256)))throw Error('Original immutable CSV/source receipt mismatch');
 const matrixNames=['upper','lower','residualUpper'].flatMap(name=>Array.from({length:12},(_,r)=>Array.from({length:12},(_,c)=>`${name}[${r+1},${c+1}]`)).flat());
 const expected=['time','scenario','accepted','status','treeEdges','activeNodes','roundoffCertified',...matrixNames,
  ...Array.from({length:12},(_,i)=>`converged[${i+1}]`),...Array.from({length:12},(_,i)=>`iterations[${i+1}]`),
  ...Array.from({length:12},(_,i)=>`residualNorm[${i+1}]`)];
 const rows=lines.slice(1).map(line=>line.split(',').map(Number));
 csvValid=/^"[^"]*"(?:,"[^"]*")*$/.test(lines[0])&&columns.length===expected.length&&new Set(columns).size===expected.length&&expected.every(name=>columns.includes(name))
  &&lines.slice(1).every(line=>line.split(',').every(value=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)))
  &&rows.length>=count&&rows.every(row=>row.length===expected.length&&row.every(Number.isFinite))
  &&rows[0][columns.indexOf('time')]===0&&rows.at(-1)[columns.indexOf('time')]===stopTime;
 const get=(row,name)=>row[columns.indexOf(name)],matrix=(row,name)=>Array.from({length:12},(_,r)=>Array.from({length:12},(_,c)=>get(row,`${name}[${r+1},${c+1}]`)));
 if(csvValid)for(let scenario=1;scenario<=count;scenario++){
  const observed=rows.filter(row=>get(row,'scenario')===scenario);const checks={observed:observed.length>0};let metrics={};
  if(observed.length){const row=observed[0],upper=matrix(row,'upper'),lower=matrix(row,'lower'),error=matrix(row,'residualUpper');
   const residualNorm=Array.from({length:12},(_,i)=>get(row,`residualNorm[${i+1}]`));
   metrics={residualNorm,minimumResidualNorm:Math.min(...residualNorm),maximumResidualNorm:Math.max(...residualNorm),
    minimumPositiveResidualNorm:residualNorm.some(n=>n>0)?Math.min(...residualNorm.filter(n=>n>0)):null,
    iterations:Array.from({length:12},(_,i)=>get(row,`iterations[${i+1}]`)),
    convergedColumns:Array.from({length:12},(_,i)=>get(row,`converged[${i+1}]`))};
   checks.roundoffUncertified=observed.every(r=>get(r,'roundoffCertified')===0);
   checks.stableRepeatedRows=observed.every(r=>expected.filter(name=>name!=='time').every(name=>get(r,name)===get(row,name)));
   const success=scenario<=7||scenario===17||scenario===19;
   checks.status=get(row,'status')===(success?1:scenario===15?0:scenario===18?18:scenario===12||scenario===13||scenario===14?-1:scenario===10||scenario===11?-4:-2);
   checks.accepted=get(row,'accepted')===(success?1:0);
   if(success){
    checks.symmetry=maxAbs(difference(upper,upper[0].map((_,c)=>upper.map(r=>r[c]))))<1e-10;
    checks.boundIdentity=maxAbs(difference(upper,lower.map((r,i)=>r.map((v,j)=>v+error[i][j]))))<1e-10;
    const active=scenario===17?1:scenario===7?96:128;
    checks.fullTree=get(row,'activeNodes')===active&&get(row,'treeEdges')===active-1;
    if(scenario===17)checks.anchorOnlyZero=maxAbs(upper)===0&&maxAbs(lower)===0&&maxAbs(error)===0;
    else{
     const family=scenario===6?6:scenario===7?7:1;
     if(!denseCache.has(family)){const data=fixture(family),full=denseInformation(data);denseCache.set(family,{data,factor:factor(full),dimension:full.n});}
     const dense=denseCache.get(family),current=scenario===3?1:scenario===7?95:128,reference=scenario===4?1:scenario===5?128:64;
     const exact=selectedInverse(dense.factor,current,reference),scale=Math.max(1,maxAbs(exact)),tolerance=3e-5*scale;
     const lowerGap=Math.min(...eigenvalues(difference(exact,lower))),upperGap=Math.min(...eigenvalues(difference(upper,exact)));
     metrics={...metrics,denseFreeDimension:dense.dimension,all144Compared:true,maxUpperDifference:maxAbs(difference(upper,exact)),minimumLowerGapEigenvalue:lowerGap,minimumUpperGapEigenvalue:upperGap,tolerance};
     checks.lowerPSDGap=lowerGap>=-tolerance;checks.upperPSDGap=upperGap>=-tolerance;
     checks.upperPSD=Math.min(...eigenvalues(upper))>=-tolerance;
     checks.residualPSD=Math.min(...eigenvalues(error))>=-tolerance;
     if(scenario===2){const tree=selectedInverse(factor(denseInformation(dense.data,true)),current,reference);
      checks.zeroIterate=maxAbs(lower)===0&&Array.from({length:12},(_,i)=>get(row,`iterations[${i+1}]`)).every(n=>n===0);
      checks.all144TreeValues=maxAbs(difference(upper,tree))<=tolerance;}
     else if(scenario===19)checks.earlyNonzero=Array.from({length:12},(_,i)=>get(row,`iterations[${i+1}]`)).every(n=>n===2)&&maxAbs(lower)>0;
     else{checks.tightAll144=maxAbs(difference(upper,exact))<=tolerance;
      checks.converged=Array.from({length:12},(_,i)=>get(row,`converged[${i+1}]`)).every(n=>n===1);}
     if(scenario===3)checks.currentAnchorZero=upper.slice(0,6).every(r=>r.every(v=>v===0));
     if(scenario===4)checks.referenceAnchorZero=upper.slice(6).every(r=>r.every(v=>v===0));
     if(scenario===5)checks.duplicateJoint=upper.every((r,i)=>r.every((v,j)=>Math.abs(v-upper[i%6][j%6])<1e-10));
    }
   }else checks.canonicalRefusal=maxAbs(upper)===0&&maxAbs(lower)===0&&maxAbs(error)===0&&get(row,'treeEdges')===0&&get(row,'activeNodes')===0;
  }
  cases.push({scenario,rows:observed.length,checks,metrics,pass:Object.values(checks).every(Boolean)});
 }
 csvReport={sha256:sha(raw),columns:columns.length,rows:rows.length,csvValid};
}
const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256);
const pass=processResult.status===0&&bookendsEqual&&csvValid&&cases.length===count&&cases.every(c=>c.pass)&&log.includes('The simulation finished successfully.');
const report={status:pass?'OMC_MODELICA_NUMERICAL_REFERENCE_PASS':'FAILED_OR_INCOMPLETE',compilerVersion:version.stdout.trim(),sources,bookendsEqual,
 scope:'Full128-node/256-edge source; independent central-difference Jacobians and dense762 solve test only; selected12D full144-cell/tangent/cross/early-error/anchor/refusal checks. Numerical float scope, not directed-rounding certification.',
 cases,csvReport,processStatus:processResult.status,recheckedOriginalReceipt:recheck?{reportSHA256:sha(fs.readFileSync(path.join(output,'report.json'))),originalSources:original.sources}:null,roundoffCertified:false,rumocaArtifactIssued:false,browserIntegrated:false,fullSlamAccepted:false};
const reportName=recheck?'recheck-report.json':'report.json';
fs.writeFileSync(path.join(output,reportName),JSON.stringify(report,null,2)+'\n');
const durable=path.join(app,'dev/artifacts/modelica-graph-covariance-semantics',path.basename(output));fs.mkdirSync(durable,{recursive:true});
for(const name of [reportName,'semantics.log','resources.json','command.json','graph-covariance.mos',`${model}_res.csv`])if(fs.existsSync(path.join(output,name)))fs.copyFileSync(path.join(output,name),path.join(durable,name));
console.log(JSON.stringify({directory:output,...report}));process.exitCode=pass?0:1;
