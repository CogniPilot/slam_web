// Language-balance regression using actual authored record/function source.
// Small capacities isolate declaration equations; full-capacity composition
// is qualified separately. OMC is a reference only, never application execution.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const app=process.cwd(),root=path.join(app,'dev/artifacts/modelica-catalog-bindings-2026-10-07');
fs.mkdirSync(root,{recursive:true});
const scratch=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(scratch,{recursive:true});
const output=fs.mkdtempSync(path.join(scratch,'catalog-bindings-'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const historical='dev/artifacts/modelica-raw-image-inputs/native-source-2026-10-07';
const manifest=JSON.parse(fs.readFileSync(historical+'/source-manifest.json')),combined=fs.readFileSync(historical+'/source.mo');
assert.equal(sha(combined),manifest.sourceSha256);let offset=0,before;
for(const entry of manifest.sources){const bytes=combined.subarray(offset,offset+entry.bytes);assert.equal(sha(bytes),entry.sha256);if(entry.path==='models/LoopClosure/RGBDKeyframes.mo')before=String(bytes);offset+=entry.bytes+1;}
assert(before);const current=fs.readFileSync('models/LoopClosure/RGBDKeyframes.mo','utf8');
const fixture=fs.readFileSync('tests/modelica/RGBDCatalogEquationBindingAcceptance.mo','utf8');
const omc=process.env.OMC_BIN??'omc',version=spawnSync(omc,['--version'],{encoding:'utf8'});assert.equal(version.status,0);
const cases=[];
for(const [name,source] of [['before',before],['after',current]]){
  const directory=path.join(output,name);fs.mkdirSync(directory);
  let reduced=source;const capacities={featureCapacity:2,descriptorSize:3,wordCapacity:4,keyframeCapacity:3};
  for(const [key,value] of Object.entries(capacities)){const pattern=new RegExp(`constant Integer ${key} = \\d+;`);assert(pattern.test(reduced));reduced=reduced.replace(pattern,`constant Integer ${key} = ${value};`);}
  fs.writeFileSync(path.join(directory,'RGBDKeyframes.mo'),reduced);fs.writeFileSync(path.join(directory,'acceptance.mo'),fixture);
  const script=path.join(directory,'check.mos');fs.writeFileSync(script,
    'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize");\n'+
    'setCommandLineOptions("--preOptModules-=evalFunc");\n'+
    `loadFile(${JSON.stringify(path.join(app,'models/Estimation/Localization/RGBDRegistrationUncertainty.mo'))});\n`+
    'loadFile("RGBDKeyframes.mo");\nloadFile("acceptance.mo");\ngetErrorString();\n'+
    'checkModel(RGBDCatalogEquationBindingAcceptance);\ngetErrorString();\n'+
    'simulate(RGBDCatalogEquationBindingAcceptance,stopTime=0.001,numberOfIntervals=1,outputFormat="csv",variableFilter="checks.*",cflags="-O0");\ngetErrorString();\n');
  const command=['dev/rumoca-bounded-run.mjs','--seconds','60','--rss-mib','4096','--log',path.join(directory,'semantics.log'),'--','nice','-n','15','taskset','-c','6,7','env','OMP_NUM_THREADS=1',`TMPDIR=${directory}`,omc,'--numProcs=2','--vectorizationLimit=1',script];
  command[0]=path.join(app,command[0]);const result=spawnSync(process.execPath,command,{cwd:directory,encoding:'utf8',maxBuffer:1024*1024});
  fs.writeFileSync(path.join(directory,'resources.json'),result.stdout??'');assert.equal(result.status,0);
  const log=fs.readFileSync(path.join(directory,'semantics.log'),'utf8'),csv=path.join(directory,'RGBDCatalogEquationBindingAcceptance_res.csv');
  const overdetermined=/Too many equations|over-determined system/.test(log),succeeded=log.includes('The simulation finished successfully.');
  let checks=[];if(fs.existsSync(csv)){
    const rows=fs.readFileSync(csv,'utf8').trim().split(/\r?\n/),header=rows.shift().split(',').map(s=>s.replaceAll('"',''));
    assert.equal(header.length,8);assert.equal(new Set(header).size,8);const columns=Array.from({length:7},(_,i)=>header.indexOf(`checks[${i+1}]`));assert(columns.every(i=>i>=0));
    const values=rows.map(row=>row.split(',').map(Number));assert(values.length>=2&&values.every(row=>row.length===8&&row.every(Number.isFinite)));
    checks=columns.map(column=>values.every(row=>row[column]===1));assert.equal(values[0][header.indexOf('time')],0);assert.equal(values.at(-1)[header.indexOf('time')],.001);
  }
  cases.push({name,sourceSha256:sha(source),diagnosticSourceSha256:sha(reduced),capacities,overdetermined,succeeded,checks,resources:JSON.parse(result.stdout),logSha256:sha(log)});
  fs.cpSync(directory,path.join(root,path.basename(output),name),{recursive:true,filter:file=>!fs.statSync(file).isFile()||/\.(?:mo|mos|json|csv|log)$/.test(file)});
}
const bookendsEqual=sha(fs.readFileSync('models/LoopClosure/RGBDKeyframes.mo'))===sha(current);
const passed=bookendsEqual&&cases[0].overdetermined&&!cases[0].succeeded&&cases[1].succeeded&&!cases[1].overdetermined&&cases[1].checks.length===7&&cases[1].checks.every(Boolean);
const report={recordedAt:new Date().toISOString(),passed,bookendsEqual,compilerVersion:version.stdout.trim(),historicalSourceSha256:manifest.sourceSha256,cases,
  scope:'OMC equation-balance regression, same actual Catalog and Empty source with explicit small diagnostic capacities. Original declaration bindings must fail model simulation; corrected source must simulate and preserve seven initialization values. Full-capacity State behavior and Rumoca WASM issuance require separate evidence.'};
const destination=path.join(root,path.basename(output),'report.json');fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({report:path.relative(app,destination),...report}));process.exitCode=passed?0:1;
