// Source-bound OMC reference/profiling only. No application compiler or math fallback.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const require=(ok,message)=>{if(!ok)throw Error(message);};
const scratch=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(scratch,{recursive:true});
const out=fs.mkdtempSync(path.join(scratch,'fast-score-gate-'));
const durable=path.join('dev/artifacts/modelica-fast-score-gate',path.basename(out));fs.mkdirSync(durable,{recursive:true});
const baselineKind=process.env.SLAM_FAST_GATE_BASELINE??'full';
require(['full','cardinal'].includes(baselineKind),'SLAM_FAST_GATE_BASELINE must be full or cardinal');
const baselineFile=baselineKind==='full'?'dev/artifacts/fast-score-gate-2026-10-07/before/FastNativeFrame.mo'
  :'dev/artifacts/fast-adjacent-gate-2026-10-07/before/FastNativeFrame.mo';
const baselineSha=baselineKind==='full'?'8788c590bd176b072352753d634fb5c0e98a8b776ff9833fea11497606f174e1'
  :'9f1f1ba9e8b0eb2b21ac1dd46840deee7414d55b8078c977606cea6271fa5aa7';
const names=['models/Vision/Features/FastNativeFrame.mo','models/Vision/Features/FeatureSelection.mo','tests/modelica/FastScoreGateAcceptance.mo',baselineFile,
  'dev/check-modelica-fast-score-gate.mjs','dev/rumoca-bounded-run.mjs'];
const sources=names.map(file=>({path:file,sha256:sha(fs.readFileSync(file))}));
for(const {path:file}of sources){const dest=path.join(durable,'sources',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(file,dest);}
const baseline=fs.readFileSync(names[3],'utf8');
require(sha(baseline)===baselineSha,'Exact frozen FAST source');
const before=baseline.replace(/\bFast(CircleStencil|CircleScore|PatchScore|FrameScores|NativeFrame|SelectionScoreFloor|CircleCanReachScore)\b/g,'BeforeFast$1');
// Test-only identity adapter selects the declared before function's optional
// floor. Both implementations are compiled by OMC; no host score is computed.
const adapter='\nfunction BeforeBenchmarkFrameScores\n  input Real rgb[:,:,:];\n  input Boolean enabled;\n  input Real scoreFloor;\n  output Real scores[size(rgb,1)*size(rgb,2)];\nalgorithm\n  scores := BeforeFastFrameScores(rgb,enabled'
  +(baselineKind==='cardinal'?',scoreFloor':'')+');\nend BeforeBenchmarkFrameScores;\n';
fs.writeFileSync(path.join(out,'before.mo'),before+adapter);
const capture='dev/artifacts/modelica-rendered-flight-frames/flight-p2gCED';
const manifestBytes=fs.readFileSync(path.join(capture,'manifest.json')),manifest=JSON.parse(manifestBytes);
require(manifest.status==='ACTUAL_RUMOCA_FLIGHT_RGBD_CAPTURE_PASS'&&manifest.schema==='modelica-rendered-flight-frames-v2','Actual native camera capture');
const chunks=[],frames=[];
for(const [i,index]of [0,6,12].entries()){
  const frame=manifest.frames[index],meta=frame.rgb;
  require(meta.type==='Uint8'&&JSON.stringify(meta.shape)==='[480,848,3]'&&meta.bytes===480*848*3,'Exact RGB8 native shape');
  const bytes=fs.readFileSync(path.join(capture,meta.path));require(bytes.length===meta.bytes&&sha(bytes)===meta.sha256,'Exact captured raw bytes');
  const name=Buffer.from('rgb'+(i+1)+'\0'),header=Buffer.alloc(20),matrix=Buffer.alloc(bytes.length*8);
  [0,480,848*3,0,name.length].forEach((value,j)=>header.writeInt32LE(value,j*4));
  for(let column=0;column<848*3;column++)for(let row=0;row<480;row++)matrix.writeDoubleLE(bytes[row*848*3+column],(column*480+row)*8);
  chunks.push(header,name,matrix);frames.push({index,time:frame.time,path:meta.path,sha256:sha(bytes)});
}
const fixture=path.join(out,'frames.mat');fs.writeFileSync(fixture,Buffer.concat(chunks));
const omc=process.env.OMC_BIN??'omc',perf=process.env.PERF_BIN??'perf',profile=process.argv.includes('--profile');
const version=spawnSync(omc,['--version'],{encoding:'utf8'});require(version.status===0,'OMC version available');
const script=path.join(out,'gate.mos'),resultFile=path.join(out,'features.mat');
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize");\n'
  +'setCommandLineOptions("--preOptModules-=evalFunc");\nloadModel(Modelica,{"4.1.0"});\n'
  +[path.join(out,'before.mo'),...names.slice(0,3).map(file=>path.resolve(durable,'sources',file))].map(file=>`loadFile(${JSON.stringify(file)});`).join('\n')
  +'\ngetErrorString();\n'
  +`simulate(FastScoreGateAcceptance,stopTime=0.001,numberOfIntervals=1,outputFormat="csv",variableFilter="checks.*|metrics.*",cflags="-O2",simflags=${JSON.stringify('-override=file='+fixture+',resultFile='+resultFile)});\ngetErrorString();\n`
  +(profile?'buildModel(FastScoreGateBenchmark,stopTime=0.001,numberOfIntervals=1,outputFormat="csv",variableFilter="checksum",cflags="-O2");\ngetErrorString();\n':''));
function run(label,command,seconds=180){
  const result=spawnSync(process.execPath,[path.resolve('dev/rumoca-bounded-run.mjs'),'--seconds',String(seconds),'--rss-mib','8192','--available-mib','16384',
    '--log',path.join(out,label+'.log'),'--','nice','-n','15','taskset','-c','8,9','env','OMP_NUM_THREADS=1',`TMPDIR=${out}`,...command],
    {cwd:out,encoding:'utf8',maxBuffer:1024*1024});
  fs.writeFileSync(path.join(out,label+'-resources.json'),result.stdout??'');let resources=null;try{resources=JSON.parse(result.stdout);}catch{}
  return {exitCode:result.status,resources};
}
const terminal=run('reference',[omc,'--numProcs=2','--vectorizationLimit=1',script]);
let failure=null,checks=[],metrics=[],runs=[],rawFeatureBitDifferences=null;
try{
  require(terminal.exitCode===0&&terminal.resources?.exitCode===0,'Reference process completed');
  const lines=fs.readFileSync(path.join(out,'FastScoreGateAcceptance_res.csv'),'utf8').trim().split(/\r?\n/);
  const first=lines.shift(),columns=[...first.matchAll(/"([^"]*)"/g)].map(x=>x[1]);
  const checkNames=Array.from({length:16},(_,i)=>`checks[${i+1}]`),metricNames=Array.from({length:3},(_,i)=>Array.from({length:4},(_,j)=>`metrics[${i+1},${j+1}]`)).flat();
  require(columns.map(x=>JSON.stringify(x)).join(',')===first&&columns.length===29&&new Set(columns).size===29
    &&['time',...checkNames,...metricNames].every(x=>columns.includes(x)),'Exact quoted CSV schema');
  require(lines.every(line=>line.split(',').every(x=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(x))),'Finite numeric CSV syntax');
  const rows=lines.map(line=>line.split(',').map(Number));
  require(rows.length>=2&&rows.every(row=>row.length===29&&row.every(Number.isFinite))
    &&rows[0][columns.indexOf('time')]===0&&rows.at(-1)[columns.indexOf('time')]===.001,'Complete reference interval');
  checks=checkNames.map(name=>rows.every(row=>row[columns.indexOf(name)]===1));require(checks.every(Boolean),'All16 Modelica assertions');
  metrics=Array.from({length:3},(_,i)=>Array.from({length:4},(_,j)=>rows.at(-1)[columns.indexOf(`metrics[${i+1},${j+1}]`)]));
  const mat=fs.readFileSync(resultFile),nameLength=mat.readInt32LE(16);
  require(mat.readInt32LE(0)===0&&mat.readInt32LE(4)===6&&mat.readInt32LE(8)===1050&&mat.readInt32LE(12)===0
    &&mat.subarray(20,20+nameLength).toString()==='features\0'&&mat.length===20+nameLength+6*1050*8,'Exact selected-feature matrix');
  rawFeatureBitDifferences=0;
  for(let frame=0;frame<3;frame++)for(let cell=0;cell<1050;cell++){
    const offset=20+nameLength+(cell*6+frame)*8;
    if(!mat.subarray(offset,offset+8).equals(mat.subarray(offset+24,offset+32)))rawFeatureBitDifferences++;
  }
  require(rawFeatureBitDifferences===0,'Every selected feature bit matches');
  if(profile)for(const [i,gated]of [false,true,true,false].entries()){
    const label='benchmark-'+i+'-'+(gated?'gated':'baseline'),csv=path.join(out,label+'.csv'),counters=path.join(out,label+'-perf.csv');
    const result=run(label,[perf,'stat','-e','task-clock,cycles,instructions,cache-misses','-x',',','-o',counters,
      './FastScoreGateBenchmark','-override=file='+fixture+',gated='+gated,'-r='+csv],120);
    require(result.exitCode===0&&result.resources?.exitCode===0,'Profile process completed');
    const last=fs.readFileSync(csv,'utf8').trim().split(/\r?\n/).at(-1).split(',').map(Number);
    require(last.length===2&&last.every(Number.isFinite),'Finite benchmark output');
    runs.push({gated,checksum:last[1],...result,perf:fs.readFileSync(counters,'utf8')});
  }
  require(runs.every(x=>x.checksum===runs[0].checksum),'Exact ABBA selected-feature checksums');
}catch(error){failure=String(error.stack??error);}
const bookendsEqual=sources.every(x=>sha(fs.readFileSync(x.path))===x.sha256)
  &&sha(fs.readFileSync(path.join(capture,'manifest.json')))===sha(manifestBytes)
  &&frames.every(x=>sha(fs.readFileSync(path.join(capture,x.path)))===x.sha256);
const generated=fs.readdirSync(out).filter(name=>/\.(?:c|h)$/.test(name)).map(name=>{
  const bytes=fs.readFileSync(path.join(out,name));return {path:name,bytes:bytes.length,sha256:sha(bytes),retainedInRepository:bytes.length<=4*1024*1024};
});
const report={status:!failure&&bookendsEqual?'OMC_FAST_SCORE_GATE_REFERENCE_PASS':'FAILED_OR_INCOMPLETE',
  baselineKind,baselineSha256:baselineSha,sources,frames,captureManifestSha256:sha(manifestBytes),fixtureSha256:sha(fs.readFileSync(fixture)),
  compilerVersion:version.stdout.trim(),terminal,checks,metrics,rawFeatureBitDifferences,runs,bookendsEqual,failure,generated,
  scratchHomeRelative:path.relative(os.homedir(),out),
  binaryPatterns:65536,patternComparisons:65536*2*3,nativeFeatureCellsCompared:3150,
  scope:'Three actual native RGB8 frames, conservative cardinal FAST rejection, exact selected feature bits and original rounded-rank early stop. Independent OMC reference/perf only; no full native artifact/browser/runtime speedup claim.',
  fullSlamAccepted:false,wasmQualified:false,tenTimesRealtimeQualified:false};
for(const name of fs.readdirSync(out))if(/\.(?:mo|mos|json|log|csv|c|h)$/.test(name)&&fs.statSync(path.join(out,name)).isFile()
  &&fs.statSync(path.join(out,name)).size<=4*1024*1024)fs.copyFileSync(path.join(out,name),path.join(durable,name));
fs.writeFileSync(path.join(durable,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({directory:durable,status:report.status,checks,metrics,runs,failure}));process.exitCode=report.status==='OMC_FAST_SCORE_GATE_REFERENCE_PASS'?0:1;
