// Bounded phase-local diagnosis, never a numerical acceptance gate.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const phase=process.env.OMC_COVARIANCE_PHASE??'check';if(!['check','translate'].includes(phase))throw Error('Expected check or translate');
const root=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(root,{recursive:true});
const output=fs.mkdtempSync(path.join(root,'graph-covariance-phase-'));
const names=['models/ModelicaPoseGraph.mo','models/ModelicaPoseGraphCovariance.mo','tests/modelica/ModelicaPoseGraphCovarianceTests.mo','tests/modelica/ModelicaPoseGraphCovarianceAcceptance.mo'];
const sha=b=>createHash('sha256').update(b).digest('hex'),sources=names.map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(app,p)))}));
const script=path.join(output,'phase.mos');fs.writeFileSync(script,'setDebugFlags("gen,execstat,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize");\n'
 +names.map(p=>`loadFile(${JSON.stringify(path.join(app,p))});`).join('\n')
 +'\ngetErrorString();\nwriteFile("phase.txt","loaded");\n'
 +(phase==='check'?'writeFile("check-result.txt",checkModel(ModelicaPoseGraphCovarianceAcceptance));\n':'translateModel(ModelicaPoseGraphCovarianceAcceptance);\n')
 +'writeFile("phase.txt","returned");\ngetErrorString();\n');
const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds',phase==='check'?'30':'120','--rss-mib','8192','--available-mib','16384',
 '--log',path.join(output,'phase.log'),'--','nice','-n','15','taskset','-c','8,9','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,process.env.OMC_BIN??'omc','--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
const result=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});fs.writeFileSync(path.join(output,'resources.json'),result.stdout??'');
const report={phase,processStatus:result.status,sources,bookendsEqual:sources.every(s=>sha(fs.readFileSync(path.join(app,s.path)))===s.sha256),
 frontier:fs.existsSync(path.join(output,'phase.txt'))?fs.readFileSync(path.join(output,'phase.txt'),'utf8'):null,
 checkResult:fs.existsSync(path.join(output,'check-result.txt'))?fs.readFileSync(path.join(output,'check-result.txt'),'utf8'):null,numericalAcceptance:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');const durable=path.join(app,'dev/artifacts/modelica-graph-covariance-semantics',path.basename(output));fs.mkdirSync(durable,{recursive:true});
for(const p of ['report.json','phase.log','resources.json','command.json','phase.txt','check-result.txt','phase.mos'])if(fs.existsSync(path.join(output,p)))fs.copyFileSync(path.join(output,p),path.join(durable,p));
console.log(JSON.stringify({directory:output,...report}));process.exitCode=result.status===0?0:1;
