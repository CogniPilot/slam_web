// Independent reference for small compiler definedness regressions, not SLAM.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const scratch=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(scratch,{recursive:true});
const build=fs.mkdtempSync(path.join(scratch,'nested-scratch-'));
const out=path.resolve('dev/artifacts/modelica-nested-scratch',path.basename(build));fs.mkdirSync(out,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const model='NestedScratchAcceptance',files=['tests/compiler-probes/fixtures/ConditionalArrayUpdate.mo',
  'tests/compiler-probes/fixtures/NestedScratch.mo','tests/modelica/NestedScratchAcceptance.mo'];
const sources=[...files,'dev/check-modelica-nested-scratch.mjs','dev/rumoca-bounded-run.mjs'].map(file=>{
  const bytes=fs.readFileSync(file),target=path.join(out,'sources',file);fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,bytes);return {path:file,sha256:sha(bytes)};
});
const script='setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize");\n'
  +'setCommandLineOptions("--preOptModules-=evalFunc");\n'
  +files.map(file=>`loadFile(${JSON.stringify(path.join(out,'sources',file))});`).join('\n')
  +`\ngetErrorString();\nsimulate(${model},stopTime=0.001,numberOfIntervals=1,outputFormat="csv",variableFilter="checks.*",cflags="-O2");\ngetErrorString();\n`;
fs.writeFileSync(path.join(out,'reference.mos'),script);
const omc=process.env.OMC_BIN??'omc',version=spawnSync(omc,['--version'],{encoding:'utf8'});
if(version.status!==0)throw version.error??Error(version.stderr);
const command=[path.resolve('dev/rumoca-bounded-run.mjs'),'--seconds','60','--rss-mib','2048','--available-mib','16384',
  '--log',path.join(out,'reference.log'),'--','nice','-n','15','taskset','-c','8,9','env','OMP_NUM_THREADS=1',`TMPDIR=${build}`,
  omc,'--numProcs=2','--vectorizationLimit=1',path.join(out,'reference.mos')];
const terminal=spawnSync(process.execPath,command,{cwd:build,encoding:'utf8',maxBuffer:1024*1024});
fs.writeFileSync(path.join(out,'resources.json'),terminal.stdout??'');
if(terminal.stderr)fs.writeFileSync(path.join(out,'guardian-stderr.log'),terminal.stderr);
let checks=[],csvSha256=null;
const csv=path.join(build,model+'_res.csv');
if(fs.existsSync(csv)){
  const bytes=fs.readFileSync(csv),lines=String(bytes).trim().split(/\r?\n/),header=lines.shift().split(',').map(name=>name.replace(/^"|"$/g,''));
  const names=['time',...Array.from({length:8},(_,i)=>`checks[${i+1}]`)];
  const rows=lines.map(line=>line.split(',').map(Number));
  if(header.length===names.length&&new Set(header).size===names.length&&names.every(name=>header.includes(name))
    &&rows.length>=2&&rows.every(row=>row.length===names.length&&row.every(Number.isFinite))
    &&rows[0][header.indexOf('time')]===0&&rows.at(-1)[header.indexOf('time')]===0.001)
    checks=names.slice(1).map(name=>rows.every(row=>row[header.indexOf(name)]===1));
  csvSha256=sha(bytes);fs.writeFileSync(path.join(out,path.basename(csv)),bytes);
}
const generated=fs.readdirSync(build).filter(name=>/_functions\.c$/.test(name)).map(name=>{
  const bytes=fs.readFileSync(path.join(build,name));fs.writeFileSync(path.join(out,name),bytes);return {path:name,sha256:sha(bytes)};
});
const bookendsEqual=sources.every(file=>sha(fs.readFileSync(file.path))===file.sha256);
const log=fs.readFileSync(path.join(out,'reference.log'),'utf8');
const pass=terminal.status===0&&checks.length===8&&checks.every(Boolean)&&bookendsEqual&&log.includes('The simulation finished successfully.');
const report={status:pass?'OMC_NESTED_SCRATCH_DEFINEDNESS_REFERENCE_PASS':'FAILED_OR_INCOMPLETE',
  recordedAt:new Date().toISOString(),compiler:version.stdout.trim(),sources,bookendsEqual,checks,csvSha256,generated,
  processExitCode:terminal.status,buildHomeRelative:path.relative(os.homedir(),build),
  scope:'Independent standard Modelica reference of guarded array writes, repeated per-iteration scratch definitions, and rectangular array initialization. No compiler fix, production math change or browser SLAM claim.'};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({directory:out,status:report.status,checks}));process.exitCode=pass?0:1;
