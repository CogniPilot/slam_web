// Test-only differential geometry checks. The production path is Rumoca WASM.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.join(os.homedir(),'scratch/slam_web/tmp');
fs.mkdirSync(root,{recursive:true});
const output=fs.mkdtempSync(path.join(root,'body-edge-semantics-'));
const names=['models/RGBDRegistrationUncertainty.mo','models/ModelicaPoseGraph.mo',
  'models/RGBDBodyRelativeEdge.mo','tests/modelica/RGBDBodyEdgeTests.mo'];
const sha=value=>createHash('sha256').update(value).digest('hex');
const sources=names.map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
const quoted=value=>JSON.stringify(value);
const script=path.join(output,'body-edge.mos');
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandOperations,-nfScalarize");\n'
  +names.map(name=>`loadFile(${quoted(path.join(app,name))});`).join('\n')
  +'\ngetErrorString();\ngenerateCode(RGBDBodyEdgeTests.Run);\ngetErrorString();\n'
  +'print("BODY_EDGE_RESULT_BEGIN\\n");\nRGBDBodyEdgeTests.Run(0.0);\n'
  +'print("BODY_EDGE_RESULT_END\\n");\ngetErrorString();\n');
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
const section=log.split('BODY_EDGE_RESULT_BEGIN')[1]?.split('BODY_EDGE_RESULT_END')[0]??'';
const matched=section.match(/\{((?:true|false)(?:,\s*(?:true|false))*)\}/);
const checks=matched?matched[1].split(',').map(value=>value.trim()==='true'):[];
const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256);
const passed=processResult.status===0&&bookendsEqual&&checks.length===21&&checks.every(Boolean);
const report={status:passed?'OMC_MODELICA_SEMANTICS_PASS':'FAILED_OR_INCOMPLETE',
  scope:'Optical to body pose-graph product residual, physical point consistency, finite-difference Jacobian/covariance, SPD inverse and atomic refusals',
  compilerVersion:version.stdout.trim(),sources,bookendsEqual,checks,
  processStatus:processResult.status,signal:processResult.signal,
  rumocaArtifactIssued:false,browserIntegrated:false,loopVerification:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({directory:output,...report}));
process.exitCode=passed?0:1;
