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
const output=fs.mkdtempSync(path.join(root,'spatial-index-semantics-'));
const names=['tests/modelica/RGBDLandmarkMapReference.mo','models/RGBDSpatialIndex.mo',
  'tests/modelica/RGBDSpatialIndexTests.mo'];
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const sources=names.map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
const quoted=value=>'"'+value.replaceAll('\\','\\\\').replaceAll('"','\\"')+'"';
const script=path.join(output,'spatial-index.mos');
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandOperations,-nfScalarize");\n'
  +names.map(name=>`loadFile(${quoted(path.join(app,name))});`).join('\n')
  +'\ngetErrorString();\ngenerateCode(RGBDSpatialIndexTests.Run);\ngetErrorString();\n'
  +'print("SPATIAL_RESULT_BEGIN\\n");\n'
  +'RGBDSpatialIndexTests.Run(0.0,14400,32768);\n'
  +'print("SPATIAL_RESULT_END\\n");\ngetErrorString();\n');
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
const section=log.split('SPATIAL_RESULT_BEGIN')[1]?.split('SPATIAL_RESULT_END')[0]??'';
const matched=section.match(/\{((?:true|false)(?:,\s*(?:true|false))*)\}/);
const flags=matched?matched[1].split(',').map(value=>value.trim()==='true'):[];
const counts=section.match(/\},\s*(\d+),\s*(\d+)\)/);
const indexedVisits=counts?Number(counts[1]):null;
const referenceIterations=counts?Number(counts[2]):null;
const unchanged=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256);
const passed=result.status===0&&unchanged&&flags.length===18&&flags.every(Boolean)
  &&referenceIterations===14400*350&&indexedVisits>=0&&indexedVisits<referenceIterations/10;
const report={status:passed?'OMC_MODELICA_SEMANTICS_PASS':'FAILED_OR_INCOMPLETE',
  scope:'14400 slots, 350 queries, collisions, radius/voxel semantics, free list and malformed chains',
  compilerVersion:version.stdout.trim(),sources,bookendsEqual:unchanged,flags,
  indexedVisits,referenceIterations,processStatus:result.status,signal:result.signal,
  rumocaArtifactIssued:false,browserIntegrated:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({directory:output,...report}));
process.exitCode=passed?0:1;
