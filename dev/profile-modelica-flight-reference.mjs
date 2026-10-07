// Profile an already qualified native reference executable in a fresh directory.
// This is not Rumoca/WASM timing and never recompiles or activates an estimator.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
const [receiptFile]=process.argv.slice(2);if(!receiptFile)throw Error('Expected passing rendered-flight reference receipt');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');const require=(ok,message)=>{if(!ok)throw Error(message);};
const receiptBytes=fs.readFileSync(receiptFile),receipt=JSON.parse(receiptBytes);
require(receipt.status==='OMC_RENDERED_FLIGHT_SLAM_REFERENCE_PASS'&&receipt.bookendsEqual
  &&receipt.result.checks.length===24&&receipt.result.checks.every(Boolean),'Qualified full native flight reference required');
const home=os.homedir(),scratchRoot=fs.realpathSync(path.join(home,'scratch/slam_web'));
const base=fs.realpathSync(path.join(home,receipt.generatedScratchHomeRelative));
require(base.startsWith(scratchRoot+path.sep),'Owned scratch reference directory');
const executable=path.join(base,receipt.model),mat=fs.realpathSync(path.join(home,receipt.mat.scratchHomeRelative)),init=path.join(base,receipt.model+'_init.xml');
require(mat.startsWith(scratchRoot+path.sep),'Owned scratch reference inputs');
require(sha(fs.readFileSync(mat))===receipt.mat.sha256,'Exact rendered inputs');
require(receipt.sources.every(x=>sha(fs.readFileSync(x.path))===x.sha256)
  &&receipt.generated.every(x=>sha(fs.readFileSync(path.join(base,x.path)))===x.sha256),'Exact current and generated source bindings');
const binarySha256=sha(fs.readFileSync(executable)),initSha256=sha(fs.readFileSync(init));
const parent=path.join(home,'scratch/slam_web/profiles');fs.mkdirSync(parent,{recursive:true});
const output=fs.mkdtempSync(path.join(parent,'slam-reference-hotspots-'));
const durable=path.join('dev/artifacts/modelica-flight-hotspots',path.basename(output));fs.mkdirSync(durable,{recursive:true});
const perf=process.env.PERF_BIN??'perf',data=path.join(output,'perf.data'),csv=path.join(output,'result.csv');
const command=[path.resolve('dev/rumoca-bounded-run.mjs'),'--seconds','150','--rss-mib','8192','--available-mib','16384',
  '--log',path.join(output,'profile.log'),'--','nice','-n','15','taskset','-c','8,9','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,
  perf,'record','-e','cycles:u','-F','99','--call-graph','dwarf,4096','-o',data,'--',executable,
  '-inputPath='+base,'-override=datasetFile='+mat,'-r='+csv];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
const result=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:1024*1024});
fs.writeFileSync(path.join(output,'resources.json'),result.stdout??'');let resources=null;try{resources=JSON.parse(result.stdout);}catch{}
let failure=null,profileText='';
try{
  require(result.status===0&&resources?.exitCode===0,'Owned profiling process completed');
  require(sha(fs.readFileSync(csv))===receipt.result.sha256,'All published numerical output bytes unchanged');
  const report=spawnSync(perf,['report','-i',data,'--stdio','--percent-limit','0.5','--sort','symbol','-g','none','--children'],{encoding:'utf8',maxBuffer:4*1024*1024});
  require(report.status===0&&report.stdout.includes('Event count'),'Sampling report present');profileText=report.stdout;
  fs.writeFileSync(path.join(output,'perf-report.txt'),profileText);
}catch(error){failure=String(error.stack??error);}
const bookendsEqual=sha(fs.readFileSync(receiptFile))===sha(receiptBytes)&&sha(fs.readFileSync(executable))===binarySha256
  &&sha(fs.readFileSync(init))===initSha256&&sha(fs.readFileSync(mat))===receipt.mat.sha256
  &&receipt.sources.every(x=>sha(fs.readFileSync(x.path))===x.sha256)
  &&receipt.generated.every(x=>sha(fs.readFileSync(path.join(base,x.path)))===x.sha256);
const report={status:!failure&&bookendsEqual?'QUALIFIED_OMC_FLIGHT_REFERENCE_PROFILE_COMPLETE':'FAILED_OR_INCOMPLETE',
  receipt:{path:receiptFile,sha256:sha(receiptBytes)},binarySha256,initSha256,matSha256:receipt.mat.sha256,
  referenceCflags:receipt.referenceCflags,sourceBindings:receipt.sources,bookendsEqual,resources,failure,
  outputSha256:fs.existsSync(csv)?sha(fs.readFileSync(csv)):null,publishedOutputBytesEqual:fs.existsSync(csv)&&sha(fs.readFileSync(csv))===receipt.result.sha256,
  profileData:fs.existsSync(data)?{bytes:fs.statSync(data).size,sha256:sha(fs.readFileSync(data))}:null,
  scratchHomeRelative:path.relative(home,output),profilerSha256:sha(fs.readFileSync(import.meta.filename)),
  scope:'User-cycle sampling of unchanged OMC reference execution including MAT reading and test assertions. No compilation in the measured process. Native C -O0 reference costs cannot establish Rumoca WASM, GPU transport or browser SLAM throughput.',
  fullSlamAccepted:false,rumocaRuntimeProfiled:false,tenTimesRealtimeQualified:false};
for(const name of ['command.json','resources.json','profile.log','perf-report.txt','result.csv'])if(fs.existsSync(path.join(output,name)))fs.copyFileSync(path.join(output,name),path.join(durable,name));
fs.writeFileSync(path.join(durable,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({directory:durable,status:report.status,resources,failure}));process.exitCode=report.status==='QUALIFIED_OMC_FLIGHT_REFERENCE_PROFILE_COMPLETE'?0:1;
