// Independent semantics only; the production compiler/runtime is Rumoca WASM.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.join(os.homedir(),'scratch/slam_web/tmp');
fs.mkdirSync(root,{recursive:true});
const output=fs.mkdtempSync(path.join(root,'map-anchor-semantics-'));
const names=['models/Mapping/RGBDMapAnchors.mo','tests/modelica/RGBDMapAnchorTests.mo'];
const sha=value=>createHash('sha256').update(value).digest('hex');
const sources=names.map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
const script=path.join(output,'map-anchors.mos');
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,nfExpandOperations,-nfScalarize");\n'
  +names.map(name=>`loadFile(${JSON.stringify(path.join(app,name))});`).join('\n')
  +'\ngetErrorString();\nwriteFile("phase.txt","loaded");\ngenerateCode(RGBDMapAnchorTests.Run);\ngetErrorString();\n'
  +'writeFile("phase.txt","execution requested");\n'
  +'print("MAP_ANCHOR_RESULT_BEGIN\\n");\nRGBDMapAnchorTests.Run(RGBDMapAnchors.mapCapacity,RGBDMapAnchors.keyframeCapacity);\n'
  +'print("MAP_ANCHOR_RESULT_END\\n");\ngetErrorString();\n');
const omc=process.env.OMC_BIN??'omc';
const version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192',
  '--available-mib','16384','--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','6,7',
  'env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
const result=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(output,'resources.json'),result.stdout??'');
const log=fs.readFileSync(path.join(output,'semantics.log'),'utf8');
const section=log.split('MAP_ANCHOR_RESULT_BEGIN')[1]?.split('MAP_ANCHOR_RESULT_END')[0]??'';
const match=section.match(/\{((?:true|false)(?:,\s*(?:true|false))*)\}/);
const checks=match?match[1].split(',').map(value=>value.trim()==='true'):[];
const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256);
const pass=result.status===0&&bookendsEqual&&checks.length===28&&checks.every(Boolean);
const report={status:pass?'OMC_MODELICA_SEMANTICS_PASS':'FAILED_OR_INCOMPLETE',
  scope:'Full 14400 landmarks / 128 keyframes: independent owner transforms, final slots, noncompounding revisions, eviction/reuse, metadata and atomic refusals',
  compilerVersion:version.stdout.trim(),sources,bookendsEqual,checks,
  lastPhase:fs.existsSync(path.join(output,'phase.txt'))?fs.readFileSync(path.join(output,'phase.txt'),'utf8'):null,
  processStatus:result.status,signal:result.signal,
  rumocaArtifactIssued:false,browserIntegrated:false,graphFilterCommit:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({directory:output,...report}));
process.exitCode=pass?0:1;
