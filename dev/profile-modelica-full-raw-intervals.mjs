// Profile the already qualified OMC reference executable, without recompiling.
// This can identify source/reference-runtime costs; it is NOT browser throughput.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const receiptName=process.argv[2]??'full-raw-intervals-success-Oxt6jB';
if(!/^full-raw-intervals-success-[A-Za-z0-9]+$/.test(receiptName))throw Error('Expected success receipt basename');
const receipt=path.join(app,'dev/artifacts/modelica-full-raw-intervals',receiptName);
const originalBytes=fs.readFileSync(path.join(receipt,'report.json'));
const original=JSON.parse(originalBytes),sha=value=>createHash('sha256').update(value).digest('hex');
if(original.status!=='OMC_FULL_RAW_INTERVALS_PASS')throw Error('Reference receipt must pass');
const build=path.resolve(os.homedir(),original.generatedScratchHomeRelative);
const binary=path.join(build,original.model),binarySha256=sha(fs.readFileSync(binary));
for(const file of original.generated)
  if(sha(fs.readFileSync(path.join(build,file.path)))!==file.sha256)throw Error(`Generated identity: ${file.path}`);
const profileRoot=path.join(os.homedir(),'scratch/slam_web/profiles');fs.mkdirSync(profileRoot,{recursive:true});
const output=fs.mkdtempSync(path.join(profileRoot,'full-raw-intervals-'));
const durable=path.join(app,'dev/artifacts/modelica-full-raw-intervals/profiles',path.basename(output));
fs.mkdirSync(durable,{recursive:true});
const perf=process.env.PERF_BIN??'perf',data=path.join(output,'perf.data');
const csv=path.join(output,'profile-res.csv'),log=path.join(output,'profile.log');
const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192',
  '--available-mib','16384','--log',log,'--','nice','-n','15','taskset','-c','8,9',
  'env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,perf,'record','-F','99','-e','cycles:u',
  '--call-graph','fp','-o',data,'--',binary,`-r=${csv}`];
const terminal=spawnSync(process.execPath,command,{cwd:build,encoding:'utf8',maxBuffer:4*1024*1024});
let resources=null;try{resources=JSON.parse(terminal.stdout);}catch{}
const profileLog=fs.existsSync(log)?fs.readFileSync(log,'utf8'):'';
let flat=null,callgraph=null;
if(terminal.status===0&&fs.existsSync(data)&&fs.statSync(data).size>0){
  flat=spawnSync(perf,['report','--stdio','-i',data,'--no-children','--percent-limit','0.5',
    '--sort','comm,dso,symbol'],{encoding:'utf8',maxBuffer:4*1024*1024});
  callgraph=spawnSync(perf,['report','--stdio','-i',data,'--children','--percent-limit','1',
    '--sort','symbol','-g','graph'],{encoding:'utf8',maxBuffer:4*1024*1024});
}
// The profile replays the same scenario. Require the exact complete numerical
// rows to match the accepted receipt rather than trusting a success log alone.
let numericalRowsEqual=false;
if(fs.existsSync(csv)){
  const expected=fs.readFileSync(path.join(receipt,original.result.path),'utf8').trim().split(/\r?\n/);
  const actual=fs.readFileSync(csv,'utf8').trim().split(/\r?\n/);
  numericalRowsEqual=JSON.stringify(actual)===JSON.stringify(expected);
}
const bookendsEqual=sha(fs.readFileSync(binary))===binarySha256
  &&original.generated.every(file=>sha(fs.readFileSync(path.join(build,file.path)))===file.sha256);
const pass=terminal.status===0&&flat?.status===0&&callgraph?.status===0
  &&profileLog.includes('The simulation finished successfully.')&&numericalRowsEqual&&bookendsEqual;
const report={status:pass?'REFERENCE_PERF_CAPTURE_PASS':'FAILED_OR_INCOMPLETE',
  scope:'perf cycles:u sampling of the existing O0 native OMC reference acceptance executable. Includes initialization, sequential-oracle calls, full-State comparisons and repeated complete scenario evaluation. The CSV has three rows; the OMC harness may evaluate functions additionally. This is not Rumoca native/WASM/browser execution, a GPU profile, production performance or a realtime factor.',
  receipt:receiptName,receiptSha256:sha(originalBytes),binarySha256,
  generated:original.generated,bookendsEqual,numericalRowsEqual,
  data:fs.existsSync(data)?{scratchHomeRelative:path.relative(os.homedir(),data),bytes:fs.statSync(data).size,
    sha256:sha(fs.readFileSync(data))}:null,
  resources,processStatus:terminal.status,flatStatus:flat?.status,callgraphStatus:callgraph?.status,
  scriptSha256:sha(fs.readFileSync(fileURLToPath(import.meta.url))),
  browserThroughputQualified:false,rumocaRuntimeProfiled:false};
fs.writeFileSync(path.join(durable,'report.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(durable,'command.json'),JSON.stringify(command,null,2)+'\n');
fs.writeFileSync(path.join(durable,'profile.log'),profileLog);
fs.writeFileSync(path.join(durable,'resources.json'),terminal.stdout??'');
if(terminal.stderr)fs.writeFileSync(path.join(durable,'guardian-stderr.log'),terminal.stderr);
if(flat){fs.writeFileSync(path.join(durable,'flat.txt'),flat.stdout??'');fs.writeFileSync(path.join(durable,'flat-stderr.log'),flat.stderr??'');}
if(callgraph){fs.writeFileSync(path.join(durable,'callgraph.txt'),callgraph.stdout??'');fs.writeFileSync(path.join(durable,'callgraph-stderr.log'),callgraph.stderr??'');}
console.log(JSON.stringify({directory:path.relative(app,durable),status:report.status,numericalRowsEqual,resources}));
process.exitCode=pass?0:1;
