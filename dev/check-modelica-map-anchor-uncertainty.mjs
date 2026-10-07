// Independent reference semantics; production compilation belongs to Rumoca.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const model='RGBDMapAnchorUncertaintyAcceptance';
const checkCount=32;
const root=path.join(os.homedir(),'scratch/slam_web/tmp');
fs.mkdirSync(root,{recursive:true});
const output=fs.mkdtempSync(path.join(root,'map-anchor-uncertainty-semantics-'));
const names=['models/RGBDRegistrationUncertainty.mo','models/SchmidtRelativePoseCorrection.mo','models/GraphGaugeUncertainty.mo','models/RGBDMapAnchorUncertainty.mo','tests/modelica/GraphGaugeUncertaintyTests.mo','tests/modelica/RGBDMapAnchorUncertaintyTests.mo','tests/modelica/RGBDMapAnchorUncertaintyAcceptance.mo'];
const sha=value=>createHash('sha256').update(value).digest('hex');
const sources=[...names,'dev/check-modelica-map-anchor-uncertainty.mjs'].map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
const script=path.join(output,'map-anchor-uncertainty.mos');
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize");\n'
  +names.map(name=>`loadFile(${JSON.stringify(path.join(app,name))});`).join('\n')
  +'\ngetErrorString();\nwriteFile("phase.txt","simulation requested");\n'
  +`simulate(${model},stopTime=0.001,numberOfIntervals=1,outputFormat="csv",variableFilter="checks.*");\ngetErrorString();\n`);
const omc=process.env.OMC_BIN??'omc';
const version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192',
  '--available-mib','16384','--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','10,11',
  'env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
const result=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(output,'resources.json'),result.stdout??'');
const log=fs.readFileSync(path.join(output,'semantics.log'),'utf8');
const file=path.join(output,`${model}_res.csv`);
let checks=[],modelResult=null;
if(fs.existsSync(file)){
  const raw=fs.readFileSync(file,'utf8');
  const lines=raw.trim().split(/\r?\n/);
  const columns=lines[0].split(',').map(value=>value.replace(/^"|"$/g,''));
  const lexicalValid=lines.slice(1).every(line=>line.split(',').every(value=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)));
  const rows=lines.slice(1).map(line=>line.split(',').map(Number));
  const expected=['time',...Array.from({length:checkCount},(_,index)=>`checks[${index+1}]`)];
  const columnsValid=columns.length===expected.length&&columns.every((value,index)=>value===expected[index]);
  const rowsValid=lexicalValid&&rows.length>=2&&rows.every(row=>row.length===expected.length&&Number.isFinite(row[0])
    &&row.slice(1).every(value=>value===0||value===1))&&rows[0][0]===0&&rows.at(-1)[0]===0.001;
  if(columnsValid&&rowsValid)checks=expected.slice(1).map((_,index)=>rows.every(row=>row[index+1]===1));
  modelResult={path:path.basename(file),sha256:sha(raw),columnsValid,rowsValid,rows:rows.length,
    simulationSucceeded:log.includes('The simulation finished successfully.')};
}
const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256);
const pass=result.status===0&&bookendsEqual&&checks.length===checkCount&&checks.every(Boolean)&&modelResult?.simulationSucceeded===true;
const report={status:pass?'OMC_MODELICA_SEMANTICS_PASS':'FAILED_OR_INCOMPLETE',
  scope:'Per-landmark full3 covariance from full6 anchor and immutable local3 bound, unknown cross beta transport; independent manifold differences/all9cells/positive-negative extreme cross Gram; identity/capture/slot/revision/provenance and exact hold. Not fullmap or landmark/filter independence qualification',
  compilerVersion:version.stdout.trim(),sources,bookendsEqual,checks,modelResult,
  processStatus:result.status,signal:result.signal,rumocaArtifactIssued:false,browserIntegrated:false,
  referenceMapAnchorUncertaintyQualified:pass,callerBoundsCertified:false,productionGraphCorrectionIntegrated:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const durable=path.join(app,'dev/artifacts/modelica-map-anchor-uncertainty-semantics',path.basename(output));
fs.mkdirSync(durable,{recursive:true});
for(const name of ['report.json','semantics.log','resources.json','command.json','map-anchor-uncertainty.mos',`${model}_res.csv`]){
  const source=path.join(output,name);
  if(fs.existsSync(source))fs.copyFileSync(source,path.join(durable,name));
}
console.log(JSON.stringify({directory:output,...report}));
process.exitCode=pass?0:1;
