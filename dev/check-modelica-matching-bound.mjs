// Source-bound reference and perf only; no application numerical fallback.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const require=(ok,message)=>{if(!ok)throw Error(message);};
const scratch=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(scratch,{recursive:true});
const out=fs.mkdtempSync(path.join(scratch,'matching-bound-'));
const durable=path.join('dev/artifacts/modelica-matching-bound',path.basename(out));fs.mkdirSync(durable,{recursive:true});
const baselinePath='dev/artifacts/descriptor-matching-bound-2026-10-07/before/RGBDFeatureMatching.mo';
const baselineSha='d419269d34302d8ef5ee3fc8a723482126e291879096295ab670f419bdb8df78';
const names=['models/RGBDFeatureMatching.mo','models/FastNativeFrame.mo','models/FeatureSelection.mo',
  'tests/modelica/RGBDMatchingBoundAcceptance.mo',baselinePath,'dev/check-modelica-matching-bound.mjs','dev/rumoca-bounded-run.mjs'];
const sources=names.map(file=>({path:file,sha256:sha(fs.readFileSync(file))}));
for(const {path:file}of sources){const target=path.join(durable,'sources',file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target);}
const baseline=fs.readFileSync(baselinePath,'utf8');require(sha(baseline)===baselineSha,'Exact preceding active-domain matcher');
const matcher=baseline.match(/^function MatchRGBDDescriptors\n[\s\S]*?^end MatchRGBDDescriptors;/m)?.[0];
require(matcher,'Exact baseline function extraction');
fs.writeFileSync(path.join(out,'before.mo'),matcher.replace(/\bMatchRGBDDescriptors\b/g,'MatchRGBDDescriptorsUnboundedReference')+'\n');
const capture='dev/artifacts/modelica-rendered-flight-frames/flight-p2gCED';
const manifestBytes=fs.readFileSync(path.join(capture,'manifest.json')),manifest=JSON.parse(manifestBytes);
require(manifest.status==='ACTUAL_RUMOCA_FLIGHT_RGBD_CAPTURE_PASS'&&manifest.schema==='modelica-rendered-flight-frames-v2','Actual native camera capture');
const calibration=manifest.calibration;require(calibration.height===480&&calibration.width===848,'Native image dimensions');
const matrixParts=[],frames=[];
function matrix(name,rows,columns,value){
  const label=Buffer.from(name+'\0'),header=Buffer.alloc(20),data=Buffer.alloc(rows*columns*8);
  [0,rows,columns,0,label.length].forEach((x,i)=>header.writeInt32LE(x,i*4));
  for(let col=0;col<columns;col++)for(let row=0;row<rows;row++)data.writeDoubleLE(value(row,col),(col*rows+row)*8);
  matrixParts.push(header,label,data);
}
for(const index of [0,6,12]){
  const frame=manifest.frames[index];require(frame.sequence===index,'Exact camera sequence');
  for(const [kind,channels,byteWidth]of [['rgb',3,1],['depth',1,2]]){
    const meta=frame[kind],bytes=fs.readFileSync(path.join(capture,meta.path));
    require(bytes.length===meta.bytes&&sha(bytes)===meta.sha256&&bytes.length===480*848*channels*byteWidth,'Captured raw image bytes');
    require(meta.type===(kind==='rgb'?'Uint8':'Uint16')&&JSON.stringify(meta.shape)===JSON.stringify(kind==='rgb'?[480,848,3]:[480,848]),'Raw image type/shape');
    if(kind==='depth')require(meta.unitsMeters===0.001&&meta.endianness==='little','Exact Z16 depth scale');
    matrix(`${kind}_${index+1}`,480,848*channels,(r,c)=>kind==='rgb'?bytes[r*848*channels+c]:bytes.readUInt16LE((r*848+c)*2));
    frames.push({index,time:frame.time,kind,path:meta.path,sha256:sha(bytes)});
  }
}
const fields=[calibration.fx,calibration.fy,calibration.cx,calibration.cy,calibration.rgbFx,calibration.rgbFy,
  calibration.baseline,calibration.depthNoiseDisparityPx,calibration.depthNoiseReferenceFx,
  ...calibration.originFlu,calibration.near,calibration.far];
require(fields.length===14&&fields.every(Number.isFinite),'Finite captured calibration');
matrix('calibration',1,14,(_,c)=>fields[c]);
const fixture=path.join(out,'frames.mat');fs.writeFileSync(fixture,Buffer.concat(matrixParts));
const resultFile=path.join(out,'matching.mat'),descriptorFile=path.join(out,'descriptors.mat');
const omc=process.env.OMC_BIN??'omc',perf=process.env.PERF_BIN??'perf',profile=process.argv.includes('--profile');
const version=spawnSync(omc,['--version'],{encoding:'utf8'});require(version.status===0,'OMC version available');
const script=path.join(out,'matching.mos');
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize");\n'
  +'setCommandLineOptions("--preOptModules-=evalFunc");\nloadModel(Modelica,{"4.1.0"});\n'
  +[path.join(out,'before.mo'),...names.slice(0,4).map(file=>path.resolve(durable,'sources',file))].map(file=>`loadFile(${JSON.stringify(file)});`).join('\n')
  +'\ngetErrorString();\n'
  +`simulate(RGBDMatchingBoundAcceptance,stopTime=0.001,numberOfIntervals=1,outputFormat="csv",variableFilter="checks.*|matches.*",cflags="-O2",simflags=${JSON.stringify('-override=file='+fixture+',resultFile='+resultFile+',fixtureFile='+descriptorFile)});\ngetErrorString();\n`
  +(profile?'buildModel(RGBDMatchingBoundBenchmark,stopTime=0.001,numberOfIntervals=1,outputFormat="csv",variableFilter="checksum",cflags="-O2");\ngetErrorString();\n':''));
function run(label,command,seconds=180){
  const result=spawnSync(process.execPath,[path.resolve('dev/rumoca-bounded-run.mjs'),'--seconds',String(seconds),'--rss-mib','8192','--available-mib','16384',
    '--log',path.join(out,label+'.log'),'--','nice','-n','15','taskset','-c','8,9','env','OMP_NUM_THREADS=1',`TMPDIR=${out}`,...command],
    {cwd:out,encoding:'utf8',maxBuffer:1024*1024});
  fs.writeFileSync(path.join(out,label+'-resources.json'),result.stdout??'');let resources=null;try{resources=JSON.parse(result.stdout);}catch{}
  return {exitCode:result.status,resources};
}
function csv(file,expected){
  const lines=fs.readFileSync(file,'utf8').trim().split(/\r?\n/),first=lines.shift(),columns=[...first.matchAll(/"([^"]*)"/g)].map(x=>x[1]);
  require(columns.map(x=>JSON.stringify(x)).join(',')===first&&columns.length===expected.length&&new Set(columns).size===expected.length
    &&expected.every(x=>columns.includes(x)),'Exact quoted CSV schema');
  require(lines.every(line=>line.split(',').every(x=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(x))),'Finite numeric CSV syntax');
  const rows=lines.map(line=>line.split(',').map(Number));require(rows.length>=2&&rows.every(row=>row.length===expected.length&&row.every(Number.isFinite))
    &&rows[0][columns.indexOf('time')]===0&&rows.at(-1)[columns.indexOf('time')]===.001,'Complete reference interval');
  return {columns,rows};
}
const terminal=run('reference',[omc,'--numProcs=2','--vectorizationLimit=1',script]);
let failure=null,checks=[],matches=[],rawOutputBitDifferences=null,runs=[];
try{
  require(terminal.exitCode===0&&terminal.resources?.exitCode===0,'Reference process completed');
  const checkNames=Array.from({length:16},(_,i)=>`checks[${i+1}]`),matchNames=Array.from({length:4},(_,i)=>`matches[${i+1}]`);
  const {columns,rows}=csv(path.join(out,'RGBDMatchingBoundAcceptance_res.csv'),['time',...checkNames,...matchNames]);
  checks=checkNames.map(name=>rows.every(row=>row[columns.indexOf(name)]===1));require(checks.every(Boolean),'All16 independent Modelica checks');
  matches=matchNames.map(name=>rows.at(-1)[columns.indexOf(name)]);require(matches.every(x=>x>=2&&Number.isInteger(x)),'Measured captured pairs have correspondences');
  const bytes=fs.readFileSync(resultFile),nameLength=bytes.readInt32LE(16),resultSize=3504;
  require(bytes.readInt32LE(0)===0&&bytes.readInt32LE(4)===32&&bytes.readInt32LE(8)===resultSize&&bytes.readInt32LE(12)===0
    &&bytes.subarray(20,20+nameLength).toString()==='matching\0'&&bytes.length===20+nameLength+32*resultSize*8,'Every-output matrix layout');
  rawOutputBitDifferences=0;
  for(let scenario=0;scenario<16;scenario++)for(let cell=0;cell<resultSize;cell++){
    const offset=20+nameLength+(cell*32+scenario*2)*8;
    require(Number.isFinite(bytes.readDoubleLE(offset))&&Number.isFinite(bytes.readDoubleLE(offset+8)),'Finite comparison outputs');
    if(!bytes.subarray(offset,offset+8).equals(bytes.subarray(offset+8,offset+16)))rawOutputBitDifferences++;
  }
  require(rawOutputBitDifferences===0,'Every published matching output bit matches');
  if(profile)for(const [index,bounded]of [false,true,true,false].entries()){
    const label='benchmark-'+index+'-'+(bounded?'bounded':'baseline'),outputCsv=path.join(out,label+'.csv'),counters=path.join(out,label+'-perf.csv');
    const result=run(label,[perf,'stat','-e','task-clock,cycles,instructions,cache-misses','-x',',','-o',counters,
      './RGBDMatchingBoundBenchmark','-override=fixtureFile='+descriptorFile+',bounded='+bounded,'-r='+outputCsv],120);
    require(result.exitCode===0&&result.resources?.exitCode===0,'Profile process completed');
    const data=csv(outputCsv,['time','checksum']);runs.push({bounded,checksum:data.rows.at(-1)[data.columns.indexOf('checksum')],...result,perf:fs.readFileSync(counters,'utf8')});
  }
  require(runs.every(x=>x.checksum===runs[0].checksum),'Exact ABBA benchmark checksums');
}catch(error){failure=String(error.stack??error);}
const bookendsEqual=sources.every(x=>sha(fs.readFileSync(x.path))===x.sha256)&&sha(fs.readFileSync(path.join(capture,'manifest.json')))===sha(manifestBytes)
  &&frames.every(x=>sha(fs.readFileSync(path.join(capture,x.path)))===x.sha256);
const generated=fs.readdirSync(out).filter(name=>/\.(?:c|h)$/.test(name)).map(name=>{const bytes=fs.readFileSync(path.join(out,name));return {path:name,bytes:bytes.length,sha256:sha(bytes),retainedInRepository:bytes.length<=4*1024*1024};});
const report={status:!failure&&bookendsEqual?'OMC_BOUNDED_MATCHING_REFERENCE_PASS':'FAILED_OR_INCOMPLETE',baselineSha256:baselineSha,sources,frames,
  captureManifestSha256:sha(manifestBytes),fixtureSha256:sha(fs.readFileSync(fixture)),compilerVersion:version.stdout.trim(),terminal,checks,matches,
  rawOutputBitDifferences,outputCellsCompared:16*3504,runs,bookendsEqual,failure,generated,scratchHomeRelative:path.relative(os.homedir(),out),
  scope:'Full350x49 descriptors. Twelve adversarial scenarios and four measured image-pair/prediction variants compare every published output bit against the exact preceding active-domain matcher. ABBA replays128 matches on descriptors generated by Modelica from three native RGB8/Z16 frames. Reference OMC -O2 process counters include fixture reads and output publication; not Rumoca WASM or whole-browser performance.',
  fullSlamAccepted:false,wasmQualified:false,tenTimesRealtimeQualified:false};
for(const name of fs.readdirSync(out))if(/\.(?:mo|mos|mat|json|log|csv|c|h)$/.test(name)&&fs.statSync(path.join(out,name)).isFile()
  &&fs.statSync(path.join(out,name)).size<=4*1024*1024)fs.copyFileSync(path.join(out,name),path.join(durable,name));
fs.writeFileSync(path.join(durable,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({directory:durable,status:report.status,checks,matches,rawOutputBitDifferences,runs,failure}));process.exitCode=report.status==='OMC_BOUNDED_MATCHING_REFERENCE_PASS'?0:1;
