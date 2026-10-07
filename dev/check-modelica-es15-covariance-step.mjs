// Test-only OMC reference execution. Production Modelica compilation stays Rumoca-owned.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scratch=path.join(os.homedir(),'scratch/slam_web/tmp');
fs.mkdirSync(scratch,{recursive:true});
const output=fs.mkdtempSync(path.join(scratch,'es15-covariance-step-'));
const model='ES15CovarianceStepTests';
const files=['models/ES15CovariancePrediction.mo',
  'tests/modelica/ES15CovariancePredictionOriginal.mo','tests/modelica/ES15CovarianceStepTests.mo',
  'dev/check-modelica-es15-covariance-step.mjs','dev/rumoca-bounded-run.mjs'];
const sha=value=>createHash('sha256').update(value).digest('hex');
const sources=files.map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
for(const source of sources){
  const target=path.join(output,'sources',source.path);fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(path.join(app,source.path),target);
}
const omc=process.env.OMC_BIN??'omc';
const version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const script=path.join(output,'covariance-step.mos');
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize");\n'
  +files.filter(name=>name.endsWith('.mo')).map(name=>`loadFile(${JSON.stringify(path.join(output,'sources',name))});`).join('\n')
  +'\ngetErrorString();\n'
  +`simulate(${model},startTime=0,stopTime=0.24,numberOfIntervals=24,outputFormat="csv",variableFilter="(step|reference|adapter|zero|analytic)(Phi|Q|Predicted).*",simflags="-override=outputFormat=csv");\ngetErrorString();\n`);
const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192',
  '--available-mib','16384','--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c',process.env.MODELICA_REFERENCE_CPUS??'10,11',
  'env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
console.log(JSON.stringify({status:'RUNNING',directory:output,command}));
const result=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(output,'resources.json'),result.stdout??'');
const log=fs.readFileSync(path.join(output,'semantics.log'),'utf8');
const csvFile=path.join(output,`${model}_res.csv`);
function csv(line){
  const fields=[];let value='',quoted=false;
  for(let i=0;i<line.length;i++){
    if(line[i]==='"'){
      if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;
    }else if(line[i]===','&&!quoted){fields.push(value);value='';}else value+=line[i];
  }
  if(quoted)throw Error('Unclosed CSV quotation');fields.push(value);return fields;
}
const names=['Phi','Q','Predicted'];
const comparisons=[['step','reference'],['adapter','step'],['zero','analytic']];
const stats=comparisons.map(([actual,expected])=>({actual,expected,cells:0,bitDifferences:0,maxScaledError:0,maxAbsoluteError:0,failures:[]}));
const view=new DataView(new ArrayBuffer(8));
const bits=value=>{view.setFloat64(0,value,true);return view.getBigUint64(0,true);};
let rows=0,times=[],matrixColumns=0,symmetryChecks=0,symmetryFailures=0,zeroIntervalChecks=0;
if(fs.existsSync(csvFile)){
  const lines=fs.readFileSync(csvFile,'utf8').trim().split(/\r?\n/);
  const header=csv(lines[0]);const columns=new Map(header.map((name,index)=>[name,index]));
  matrixColumns=header.length-1;
  for(const line of lines.slice(1)){
    const row=csv(line).map(Number);rows++;const time=row[columns.get('time')];times.push(time);
    if(row.length!==header.length||row.some(value=>!Number.isFinite(value)))throw Error('Malformed/nonfinite result row');
    for(const stat of stats)for(const name of names)for(let i=1;i<=15;i++)for(let j=1;j<=15;j++){
      const label=`${name}[${i},${j}]`,a=row[columns.get(stat.actual+label)],b=row[columns.get(stat.expected+label)];
      if(!Number.isFinite(a)||!Number.isFinite(b))throw Error('Missing '+label);
      const absolute=Math.abs(a-b),scaled=absolute/Math.max(1,Math.abs(a),Math.abs(b));
      stat.cells++;stat.bitDifferences+=Number(bits(a)!==bits(b));
      stat.maxScaledError=Math.max(stat.maxScaledError,scaled);stat.maxAbsoluteError=Math.max(stat.maxAbsoluteError,absolute);
      if(scaled>5e-13&&stat.failures.length<10)stat.failures.push({time,label,actual:a,expected:b,scaled});
    }
    for(const prefix of ['step','reference','adapter','zero'])for(let i=1;i<=15;i++)for(let j=1;j<=15;j++){
      symmetryChecks++;
      if(bits(row[columns.get(`${prefix}Predicted[${i},${j}]`)])!==bits(row[columns.get(`${prefix}Predicted[${j},${i}]`)]))symmetryFailures++;
      if(time<0.04){
        zeroIntervalChecks+=2;
        if(row[columns.get(`${prefix}Phi[${i},${j}]`)]!==(i===j?1:0)||row[columns.get(`${prefix}Q[${i},${j}]`)]!==0)throw Error('Zero interval changed transition/noise');
      }
    }
  }
}
const generated=fs.readdirSync(output).filter(name=>name.endsWith('.c')).map(name=>{
  const value=fs.readFileSync(path.join(output,name),'utf8');
  return {path:name,sha256:sha(value),stepReferences:(value.match(/omc_ES15CovarianceStep\(/g)??[]).length};
}).filter(value=>value.stepReferences>0);
const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256);
const pass=result.status===0&&bookendsEqual&&rows>=25&&times[0]===0&&times.at(-1)===0.24
  &&matrixColumns===3375&&stats.every(stat=>stat.failures.length===0&&stat.cells===rows*675)
  &&stats[1].bitDifferences===0&&symmetryFailures===0&&zeroIntervalChecks>0
  &&generated.some(file=>file.stepReferences>1)&&log.includes('The simulation finished successfully.');
const report={status:pass?'OMC_FULL15_COVARIANCE_EXTRACTION_PASS':'FAILED_OR_INCOMPLETE',
  scope:'Actual pure Modelica function and unchanged-interface adapter versus frozen original equation model; dense runtime F/G/P, dt0..0.02, zero/varying noise, full15 F0 analytic case',
  compilerVersion:version.stdout.trim(),sources,bookendsEqual,rows,matrixColumns,times,comparisons:stats,
  symmetryChecks,symmetryFailures,zeroIntervalChecks,generatedFunctionExecution:generated,
  processStatus:result.status,signal:result.signal,rumocaArtifactIssued:false,browserIntegrated:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const durable=path.join(app,'dev/artifacts/modelica-es15-covariance-step',path.basename(output));fs.mkdirSync(durable,{recursive:true});
for(const name of ['report.json','semantics.log','resources.json','command.json','covariance-step.mos']){
  const file=path.join(output,name);if(fs.existsSync(file))fs.copyFileSync(file,path.join(durable,name));
}
fs.cpSync(path.join(output,'sources'),path.join(durable,'sources'),{recursive:true});
if(fs.existsSync(csvFile)){
  fs.mkdirSync(path.join(durable,'raw'),{recursive:true});fs.copyFileSync(csvFile,path.join(durable,'raw',path.basename(csvFile)));
}
fs.mkdirSync(path.join(durable,'generated'),{recursive:true});
for(const file of generated)fs.copyFileSync(path.join(output,file.path),path.join(durable,'generated',file.path));
console.log(JSON.stringify({directory:output,...report}));process.exitCode=pass?0:1;
