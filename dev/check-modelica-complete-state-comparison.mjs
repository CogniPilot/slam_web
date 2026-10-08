// Bounded OMC qualification of the test-only complete-State value comparator.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {rgbdSlamSourceManifest} from '../src/modelica-slam-source-manifest.mjs';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scratch=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(scratch,{recursive:true});
const output=fs.mkdtempSync(path.join(scratch,'complete-state-comparison-'));
const durable=path.join(app,'dev/artifacts/modelica-complete-state-comparison',path.basename(output));fs.mkdirSync(durable,{recursive:true});
const refusal=process.argv[2]==='--rendered-refusal';
if(process.argv.length>3||(process.argv.length===3&&!refusal))throw Error('Optional argument: --rendered-refusal');
const sha=value=>createHash('sha256').update(value).digest('hex');
const model=refusal?'RGBDRenderedRefusalHeldAcceptance':'RGBDCompleteStateComparisonAcceptance';
const checkNames=refusal?Array.from({length:17},(_,i)=>`checks[${i+1}]`)
  :[...Array.from({length:176},(_,i)=>[`checks[${i+1},1]`,`checks[${i+1},2]`]).flat(),...Array.from({length:30},(_,i)=>`policies[${i+1}]`)];
const metricNames=refusal?[]:Array.from({length:4},(_,i)=>`raw[${i+1}]`);
const names=[...rgbdSlamSourceManifest.paths,'tests/modelica/RGBDCompleteStateComparison.mo',
  ...(refusal?['tests/modelica/RGBDRenderedFlightSLAMAcceptance.mo','tests/modelica/RGBDRenderedRefusalHeldAcceptance.mo']
    :['tests/modelica/RGBDCompleteStateComparisonAcceptance.mo'])];
const sources=[...names,'src/modelica-slam-source-manifest.mjs','dev/check-modelica-complete-state-comparison.mjs','dev/rumoca-bounded-run.mjs']
  .map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(app,p)))}));
for(const source of sources){const p=path.join(durable,'sources',source.path);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(path.join(app,source.path),p);}
const script=path.join(output,'complete-state-comparison.mos');
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize,execstat");\n'
  +'setCommandLineOptions("--preOptModules-=evalFunc");\n'
  +names.map(p=>`loadFile(${JSON.stringify(path.join(durable,'sources',p))});`).join('\n')
  +`\ngetErrorString();\nsimulate(${model},stopTime=0.001,numberOfIntervals=1,outputFormat="csv",variableFilter="checks.*|policies.*|raw.*",cflags="-O0");\ngetErrorString();\n`);
const omc=process.env.OMC_BIN??'omc',version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const command=[path.join(durable,'sources/dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192','--available-mib','16384',
  '--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','12,13','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
const terminal=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(output,'resources.json'),terminal.stdout??'');if(terminal.stderr)fs.writeFileSync(path.join(output,'guardian-stderr.log'),terminal.stderr);
const log=fs.existsSync(path.join(output,'semantics.log'))?fs.readFileSync(path.join(output,'semantics.log'),'utf8'):'';
const csvPath=model+'_res.csv';let result=null,checks=[],metrics=[];
if(fs.existsSync(path.join(output,csvPath))){const bytes=fs.readFileSync(path.join(output,csvPath)),lines=String(bytes).trim().split(/\r?\n/);
  const header=[...lines.shift().matchAll(/"([^"]*)"/g)].map(m=>m[1]);
  const expected=['time',...checkNames,...metricNames];
  const columnsValid=header.length===expected.length&&new Set(header).size===expected.length&&expected.every(n=>header.includes(n));
  const lexicalValid=lines.every(l=>l.split(',').every(v=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(v)));
  const rows=lines.map(l=>l.split(',').map(Number)),ti=header.indexOf('time'),indices=checkNames.map(n=>header.indexOf(n));
  const rowsValid=columnsValid&&lexicalValid&&rows.length>=2&&rows.every(row=>row.length===expected.length&&row.every(Number.isFinite)&&indices.every(i=>row[i]===0||row[i]===1))
    &&rows[0][ti]===0&&rows.at(-1)[ti]===0.001;
  if(rowsValid){checks=indices.map(i=>rows.every(row=>row[i]===1));metrics=rows.map(row=>metricNames.map(name=>row[header.indexOf(name)]));}
  result={path:csvPath,sha256:sha(bytes),columnsValid,lexicalValid,rowsValid,rows:rows.length,failedChecks:checks.flatMap((pass,i)=>pass?[]:[checkNames[i]])};
}
const generated=fs.readdirSync(output).filter(p=>/\.(?:c|h)$/.test(p)).map(p=>{const bytes=fs.readFileSync(path.join(output,p));return {path:p,bytes:bytes.length,sha256:sha(bytes)};});
const bookendsEqual=sources.every(s=>sha(fs.readFileSync(path.join(app,s.path)))===s.sha256),simulationSucceeded=log.includes('The simulation finished successfully.');
const pass=terminal.status===0&&bookendsEqual&&simulationSucceeded&&result?.rowsValid&&checks.length===checkNames.length&&checks.every(Boolean)
  &&(refusal||metrics.every(row=>JSON.stringify(row)===JSON.stringify([176,17,176,176])));
let resources=null;try{resources=JSON.parse(terminal.stdout);}catch{}
const report={status:pass?(refusal?'OMC_RENDERED_REFUSAL_CONTRACT_MUTATION_PASS':'OMC_COMPLETE_STATE_COMPARATOR_MUTATION_PASS'):'FAILED_OR_INCOMPLETE',model,compilerVersion:version.stdout.trim(),
  scope:refusal?'Test-only visual-refusal State contract: exact image completion, eligible attempted-pair consumption, and rejection of estimator/reference/map/catalog/graph/vocabulary/ledger/pose mutations. No actual flight or browser execution qualification.'
    :'Test-only exhaustive Modelica value comparator. Actual fresh full-State; sequential mutation/restore controls for17reachable records/176fields including lateinactive padding, plus30scalar/fullState IEEE/tolerance/exactInteger/Boolean policies. No serializer, compiler ABI, browser, batch equivalence or rollback equivalence qualification.',
  sources,bookendsEqual,checks,result,metrics,generated,generatedScratchHomeRelative:path.relative(os.homedir(),output),processStatus:terminal.status,simulationSucceeded,resources,
  comparatorNumericallyQualified:!refusal&&!!pass,refusalContractNumericallyQualified:refusal&&!!pass,
  recordTypes:refusal?null:17,declaredFields:refusal?null:176,nanPayloadBitsCompared:false,binaryStateSerializerOrAbiQualified:false,batchEquivalenceQualified:false,rollbackEquivalenceQualified:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
for(const p of ['report.json','resources.json','command.json','guardian-stderr.log','semantics.log','complete-state-comparison.mos',csvPath,...generated.filter(g=>g.path===model+'.c'||g.path===model+'_functions.c').map(g=>g.path)])
  if(fs.existsSync(path.join(output,p)))fs.copyFileSync(path.join(output,p),path.join(durable,p));
console.log(JSON.stringify({directory:path.relative(app,durable),...report}));process.exitCode=pass?0:1;
