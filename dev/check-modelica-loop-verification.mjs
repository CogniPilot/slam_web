// OMC is an independent semantics tool. Production compilation is Rumoca WASM.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.join(os.homedir(),'scratch/slam_web/tmp');
fs.mkdirSync(root,{recursive:true});
const output=fs.mkdtempSync(path.join(root,'loop-verification-semantics-'));
const names=['models/RGBDFeatureMatching.mo','models/RigidPointRegistration.mo',
  'models/RGBDRegistrationUncertainty.mo','models/RGBDKeyframes.mo','models/RGBDBodyRelativeEdge.mo',
  'models/RGBDLoopVerification.mo','models/ModelicaPoseGraph.mo','tests/modelica/RGBDLoopVerificationTests.mo'];
const sha=value=>createHash('sha256').update(value).digest('hex');
const script=path.join(output,'loop-verification.mos');
const scope=process.env.MODELICA_LOOP_CHECK_SCOPE??'proposal';
if (!['proposal','consensus'].includes(scope)) throw new Error('MODELICA_LOOP_CHECK_SCOPE must be proposal or consensus');
const functionName=scope==='proposal'?'RGBDLoopVerificationTests.Run':'RGBDLoopVerificationTests.RunConsensus';
const frontend=process.env.MODELICA_LOOP_CHECK_FRONTEND??'new';
if (!['new','old'].includes(frontend)) throw new Error('MODELICA_LOOP_CHECK_FRONTEND must be new or old');
const mode=process.env.MODELICA_LOOP_CHECK_MODE??(scope==='proposal'?'model':'native');
if (!['native','interpreter','model'].includes(mode)) throw new Error('MODELICA_LOOP_CHECK_MODE must be native, interpreter or model');
if(mode==='model'&&scope!=='proposal')throw new Error('Model fixture covers the complete proposal; use native mode for consensus');
if(mode==='model')names.push('tests/modelica/RGBDLoopProposalAcceptance.mo');
const sources=names.map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
const debugFlags=(mode==='model'?'gen,-evalfunc,-nfEvalConstArgFuncs,nfExpandFuncArgs,nfExpandOperations,nfScalarize':
  mode==='native'?'gen,-evalfunc,-nfEvalConstArgFuncs,nfExpandOperations,-nfScalarize':
    'evalfunc,-gen,nfEvalConstArgFuncs,nfExpandOperations,-nfScalarize')+(frontend==='old'?',-newInst':'');
fs.writeFileSync(script,`setDebugFlags(${JSON.stringify(debugFlags)});\n`
  +names.map(name=>`loadFile(${JSON.stringify(path.join(app,name))});`).join('\n')
  +'\ngetErrorString();\n'
  +(mode==='model'?'simulate(RGBDLoopProposalAcceptance,stopTime=0.001,numberOfIntervals=1,outputFormat="csv");\ngetErrorString();\n':
    `${mode==='native'?`generateCode(${functionName});\ngetErrorString();\n`:''}`
      +`print("LOOP_VERIFY_RESULT_BEGIN\\n");\n${functionName}(96);\n`
      +'print("LOOP_VERIFY_RESULT_END\\n");\ngetErrorString();\n'));
const omc=process.env.OMC_BIN??'omc';
const version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192',
  '--available-mib','16384','--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','6,7',
  'env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
const processResult=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(output,'resources.json'),processResult.stdout??'');
const log=fs.readFileSync(path.join(output,'semantics.log'),'utf8');
const section=log.split('LOOP_VERIFY_RESULT_BEGIN')[1]?.split('LOOP_VERIFY_RESULT_END')[0]??'';
const matched=section.match(/\{((?:true|false)(?:,\s*(?:true|false))*)\}/);
let checks=matched?matched[1].split(',').map(value=>value.trim()==='true'):[];
let modelResult=null;
if(mode==='model'){
  const filename='RGBDLoopProposalAcceptance_res.csv';
  const file=path.join(output,filename);
  if(fs.existsSync(file)){
    const raw=fs.readFileSync(file,'utf8');
    const lines=raw.trim().split(/\r?\n/);
    const columns=lines[0].split(',').map(value=>value.replace(/^"|"$/g,''));
    const rows=lines.slice(1).map(line=>line.split(',').map(Number));
    const expected=['time',...Array.from({length:29},(_,index)=>`checks[${index+1}]`)];
    const columnsValid=columns.length===expected.length&&columns.every((value,index)=>value===expected[index]);
    const rowsValid=rows.length>=2&&rows.every(row=>row.length===expected.length&&Number.isFinite(row[0])
      &&row.slice(1).every(value=>value===0||value===1))&&rows[0][0]===0&&rows.at(-1)[0]===0.001;
    if(columnsValid&&rowsValid)checks=expected.slice(1).map((_,index)=>rows.every(row=>row[index+1]===1));
    modelResult={path:filename,sha256:sha(raw),columnsValid,rowsValid,rows:rows.length,
      simulationSucceeded:log.includes('The simulation finished successfully.')};
  }
}
const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256);
const passed=processResult.status===0&&bookendsEqual&&checks.length===(scope==='proposal'?29:20)&&checks.every(Boolean)
  &&(mode!=='model'||modelResult?.simulationSucceeded===true);
const report={status:passed?'OMC_MODELICA_SEMANTICS_PASS':'FAILED_OR_INCOMPLETE',
  scope:scope==='proposal'?'Full 350-slot geometric loop proposals: matching, sparse/dense domains, 96 hypotheses, full-domain refinement, uncertainty/body transport and rejected inputs':
    'Matching and consensus component only: full 350-slot sparse/dense domains, 96 hypotheses, refinement, outliers and refusals. No proposal metadata/uncertainty/body-transport qualification.',
  compilerVersion:version.stdout.trim(),sources,bookendsEqual,checks,
  frontend,mode,debugFlags,functionName,modelResult,completeProposalQualified:passed&&scope==='proposal',
  processStatus:processResult.status,signal:processResult.signal,
  rumocaArtifactIssued:false,browserIntegrated:false,graphAdmission:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({directory:output,...report}));
process.exitCode=passed?0:1;
