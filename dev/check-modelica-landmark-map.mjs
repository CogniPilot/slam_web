// OMC is a differential semantics tool only; production must use Rumoca WASM.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.join(os.homedir(),'scratch/slam_web/tmp');
fs.mkdirSync(root,{recursive:true});
const output=fs.mkdtempSync(path.join(root,'landmark-map-semantics-'));
const scope=process.env.MODELICA_MAP_CHECK_SCOPE??'legacy';
if(!['legacy','receipts'].includes(scope))throw Error('MODELICA_MAP_CHECK_SCOPE must be legacy or receipts');
const names=['models/RGBDSpatialIndex.mo','models/RGBDLandmarkMap.mo',
  ...(scope==='legacy'?['tests/modelica/RGBDLandmarkMapReference.mo','tests/modelica/RGBDLandmarkMapTests.mo']:
    ['tests/modelica/RGBDLandmarkReceiptTests.mo'])];
const functionName=scope==='legacy'?'RGBDLandmarkMapTests.Run':'RGBDLandmarkReceiptTests.Run';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const sources=names.map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
const quoted=value=>'"'+value.replaceAll('\\','\\\\').replaceAll('"','\\"')+'"';
const script=path.join(output,'landmark-map.mos');
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandOperations,-nfScalarize");\n'
  +names.map(name=>`loadFile(${quoted(path.join(app,name))});`).join('\n')
  +`\ngetErrorString();\ngenerateCode(${functionName});\ngetErrorString();\n`
  +'print("MAP_RESULT_BEGIN\\n");\n'
  +`${functionName}(14400,350${scope==='legacy'?',0.0':''});\n`
  +'print("MAP_RESULT_END\\n");\ngetErrorString();\n');
const omc=process.env.OMC_BIN??'omc';
const version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','120',
  '--rss-mib','8192','--available-mib','16384','--log',path.join(output,'semantics.log'),'--',
  'nice','-n','15','taskset','-c','6,7','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
const result=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(output,'resource.json'),result.stdout??'');
const log=fs.readFileSync(path.join(output,'semantics.log'),'utf8');
const section=log.split('MAP_RESULT_BEGIN')[1]?.split('MAP_RESULT_END')[0]??'';
const matched=section.match(/\{((?:true|false)(?:,\s*(?:true|false))*)\}/);
const flags=matched?matched[1].split(',').map(value=>value.trim()==='true'):[];
const counts=section.match(/\},\s*(\d+)\)/);
const outputScalarsChecked=counts?Number(counts[1]):null;
const unchanged=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256);
const passed=result.status===0&&unchanged&&flags.length===(scope==='legacy'?28:16)&&flags.every(Boolean)
  &&outputScalarsChecked===(scope==='legacy'?28*(14400*8+13):16*14400);
const report={status:passed?'OMC_MODELICA_SEMANTICS_PASS':'FAILED_OR_INCOMPLETE',
  scope:scope==='legacy'?'14400 map slots, 350 candidates, 28 full-output differential cases against frozen pre-index Modelica':
    '14400 map slots, 350 candidates, 16 insertion-receipt cases with unique candidate identities, sparse final slots, merge/prune/reuse/reset/refusals',
  functionName,checkScope:scope,
  compilerVersion:version.stdout.trim(),sources,bookendsEqual:unchanged,flags,
  ...(scope==='legacy'?{outputScalarsChecked}:{receiptSlotsValidated:outputScalarsChecked}),
  processStatus:result.status,signal:result.signal,
  rumocaArtifactIssued:false,browserIntegrated:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({directory:output,...report}));
process.exitCode=passed?0:1;
