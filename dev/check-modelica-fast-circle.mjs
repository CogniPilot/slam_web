// Exact before/after native-grid reference and optional ABBA generated-C profile.
// OMC is an independent development reference, never a browser runtime fallback.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const scratch=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(scratch,{recursive:true});
const output=fs.mkdtempSync(path.join(scratch,'fast-circle-'));
const durable=path.join(app,'dev/artifacts/modelica-fast-circle',path.basename(output));fs.mkdirSync(durable,{recursive:true});
const baseline=process.env.SLAM_FAST_BASELINE??'square';
assert(['square','circle'].includes(baseline),'SLAM_FAST_BASELINE must be square or circle');
const baselineFile=baseline==='square'?'dev/artifacts/fast-circle-2026-10-07/before/FastNativeFrame.mo'
  :'dev/artifacts/fast-score-storage-2026-10-07/before/FastNativeFrame.mo';
const baselineSha=baseline==='square'?'924b777017afe1b50b4c0f9c9aa12dc0a6d40880ddc6602fe5613973f8099611'
  :'529c3ccb4ab90ddc92c7bb758b9e087fb214d3fde115172d5d080920dc9b49af';
const names=['models/Vision/Features/FastNativeFrame.mo',baselineFile,
  'tests/modelica/FastCircleAcceptance.mo','dev/check-modelica-fast-circle.mjs','dev/rumoca-bounded-run.mjs',
  'dev/artifacts/merged-runtime-guard/original-FastNativeFrame.mo'];
const sources=names.map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
for(const {path:name}of sources){const target=path.join(durable,'sources',name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(app,name),target);}
const original=fs.readFileSync(path.join(app,names[1]),'utf8');
assert(sha(original)===baselineSha,'Exact frozen implementation required');
const legacy=original.replace(/\bFast(CircleStencil|CircleScore|PatchScore|FrameScores|NativeFrame)\b/g,'LegacyFast$1');
fs.writeFileSync(path.join(output,'legacy.mo'),legacy);
const fixturePath='dev/artifacts/fast-native-frame/independent-fixtures.json';
const fixtureBytes=fs.readFileSync(path.join(app,fixturePath)),fixture=JSON.parse(fixtureBytes);
const fixtureSource=fs.readFileSync(path.join(app,names[5]));
assert(sha(fixtureSource)==='d42da6959fee8a629c6a9850fef31559ba692f5bafd3001ba69106200f34ea11'
  &&fixture.sourceSha256===sha(fixtureSource)&&fixture.patches.length===23,'Independent historical patch inventory required');
const matName=Buffer.from('patches\0'),header=Buffer.alloc(20),data=Buffer.alloc(23*49*8);
[0,23,49,0,matName.length].forEach((value,i)=>header.writeInt32LE(value,4*i));
for(let row=0;row<23;row++)for(let col=0;col<49;col++){
  const word=fixture.patches[row].patchBits[col];assert(/^[a-f0-9]{16}$/.test(word),'Exact patch bytes');
  Buffer.from(word,'hex').copy(data,(col*23+row)*8);
}
const fixtureMat=Buffer.concat([header,matName,data]);fs.writeFileSync(path.join(output,'fixtures.mat'),fixtureMat);
const omc=process.env.OMC_BIN??'omc',profile=process.argv.includes('--profile');
const version=spawnSync(omc,['--version'],{encoding:'utf8'});if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const script=path.join(output,'circle.mos');
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize");\n'
  +'setCommandLineOptions("--preOptModules-=evalFunc");\nloadModel(Modelica,{"4.1.0"});\n'
  +[`loadFile(${JSON.stringify(path.join(output,'legacy.mo'))});`,
    ...[names[0],names[2]].map(name=>`loadFile(${JSON.stringify(path.join(durable,'sources',name))});`)].join('\n')
  +'\ngetErrorString();\n'
  +`simulate(FastCircleAcceptance,stopTime=0.001,numberOfIntervals=1,outputFormat="csv",variableFilter="checks.*",cflags="-O2",simflags=${JSON.stringify('-override=fixtureFile='+path.join(output,'fixtures.mat')+',resultFile='+path.join(output,'scores.mat'))});\ngetErrorString();\n`
  +(profile?'buildModel(FastCircleBenchmark,stopTime=0.001,numberOfIntervals=1,outputFormat="csv",variableFilter="checksum",cflags="-O2");\ngetErrorString();\n':''));
function bounded(label,command,seconds=180){
  const args=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds',String(seconds),'--rss-mib','8192','--available-mib','16384',
    '--log',path.join(output,label+'.log'),'--','nice','-n','15','taskset','-c','8,9','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,...command];
  const result=spawnSync(process.execPath,args,{cwd:output,encoding:'utf8',maxBuffer:1024*1024});
  fs.writeFileSync(path.join(output,label+'-resources.json'),result.stdout??'');
  let resources=null;try{resources=JSON.parse(result.stdout);}catch{}
  return {exitCode:result.status,resources};
}
const terminal=bounded('reference',[omc,'--numProcs=2','--vectorizationLimit=1',script]);
let scoreResults=[],patches=[],csvValid=false,runs=[],failure=null;
function matrices(file){
  const bytes=fs.readFileSync(file),result=new Map();let offset=0;
  while(offset<bytes.length){
    assert(bytes.length-offset>=20&&bytes.readInt32LE(offset)===0&&bytes.readInt32LE(offset+12)===0,'Real MATv4 required');
    const rows=bytes.readInt32LE(offset+4),cols=bytes.readInt32LE(offset+8),length=bytes.readInt32LE(offset+16);
    assert(rows>0&&cols>0&&length>1&&length<=100&&offset+20+length+rows*cols*8<=bytes.length,'Valid bounded matrix extents');
    const name=bytes.subarray(offset+20,offset+20+length-1).toString();assert(!result.has(name),'Unique matrix name');
    offset+=20+length;result.set(name,{rows,cols,bytes:bytes.subarray(offset,offset+rows*cols*8)});offset+=rows*cols*8;
  }
  return {result,sha256:sha(bytes),bytes:bytes.length};
}
try{
  assert(terminal.exitCode===0&&terminal.resources?.exitCode===0,'Reference process success');
  const csv=fs.readFileSync(path.join(output,'FastCircleAcceptance_res.csv'),'utf8').trim().split(/\r?\n/);
  const first=csv.shift(),columns=[...first.matchAll(/"([^"]*)"/g)].map(match=>match[1]);
  const checks=Array.from({length:9},(_,i)=>Array.from({length:3},(_,j)=>`checks[${i+1},${j+1}]`)).flat();
  assert(columns.map(value=>JSON.stringify(value)).join(',')===first&&columns.length===28
    &&new Set(columns).size===28&&['time',...checks].every(x=>columns.includes(x)),'Exact CSV schema');
  assert(csv.every(row=>row.split(',').every(value=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value))),'Exact numeric CSV cells');
  const rows=csv.map(row=>row.split(',').map(Number)),time=columns.indexOf('time');
  csvValid=rows.length>=2&&rows.every(row=>row.length===28&&row.every(Number.isFinite)
    &&checks.every(name=>row[columns.indexOf(name)]===1))&&rows[0][time]===0&&rows.at(-1)[time]===.001;
  assert(csvValid,'All27 Modelica grid assertions');
  const extents=[[1,1],[6,5],[7,7],[13,17],[17,13],[90,160],[480,848],[480,848],[13,17]];
  for(let c=1;c<=9;c++){
    const before=matrices(path.join(output,'scores.mat-before-'+c+'.mat'));
    const after=matrices(path.join(output,'scores.mat-after-'+c+'.mat'));
    assert(before.result.size===1&&after.result.size===1,'One exact score matrix per file');
    const a=before.result.get('scores'),b=after.result.get('scores'),[h,w]=extents[c-1];
    assert(a.rows===1&&b.rows===1&&a.cols===h*w&&b.cols===h*w,'Exact score vector extent');
    let bitDifferences=0,nanPairs=0,negativeZeros=0;
    for(let cell=0;cell<h*w;cell++){
      const av=a.bytes.readDoubleLE(cell*8),bv=b.bytes.readDoubleLE(cell*8);
      if(Number.isNaN(av)&&Number.isNaN(bv)){nanPairs++;continue;}
      if(!a.bytes.subarray(cell*8,cell*8+8).equals(b.bytes.subarray(cell*8,cell*8+8)))bitDifferences++;
      if(Object.is(bv,-0))negativeZeros++;
      const row=Math.floor(cell/w),col=cell%w;
      if(row<3||col<3||row>=h-3||col>=w-3)assert(Object.is(bv,0),'Guarded border must be positive zero');
    }
    assert(bitDifferences===0,'Every finite/non-NaN score bit must match');
    scoreResults.push({case:c,imageSize:[h,w],channels:c===8?4:3,cells:h*w,bitDifferences,nanPairs,negativeZeros,
      beforeSha256:sha(a.bytes),afterSha256:sha(b.bytes)});
  }
  const patchMatrix=matrices(path.join(output,'scores.mat-patches.mat'));
  assert(patchMatrix.result.size===1,'One exact patch matrix');
  const p=patchMatrix.result.get('scores');assert(p.rows===1&&p.cols===23,'All23 independent patch results');
  patches=fixture.patches.map((patch,i)=>{const actual=p.bytes.subarray(i*8,i*8+8).toString('hex');
    assert(actual===patch.expectedScoreBits,`Independent patch bits: ${patch.name}`);return {name:patch.name,bits:actual};});
  if(profile){
    const perf=process.env.PERF_BIN??'perf';
    for(const [i,circle]of [false,true,true,false].entries()){
      const label='benchmark-'+i+'-'+(circle?'circle':'patch');
      const run=bounded(label,[perf,'stat','-e','task-clock,cycles,instructions,cache-misses','-x',',','-o',path.join(output,label+'-perf.csv'),
        './FastCircleBenchmark','-override=circle='+circle,'-r='+label+'.csv'],120);
      assert(run.exitCode===0&&run.resources?.exitCode===0,'Bounded profiler run');
      const lines=fs.readFileSync(path.join(output,label+'.csv'),'utf8').trim().split(/\r?\n/),values=lines.at(-1).split(',').map(Number);
      const checksum=values[1];assert(Number.isFinite(checksum),'Finite benchmark checksum');
      runs.push({label,circle,checksum,...run,perf:fs.readFileSync(path.join(output,label+'-perf.csv'),'utf8')});
    }
    assert(runs.every(run=>run.checksum===runs[0].checksum),'ABBA checksums must match');
  }
}catch(error){failure=String(error.stack??error);}
const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256)
  &&sha(fs.readFileSync(path.join(app,fixturePath)))===sha(fixtureBytes);
const report={status:!failure&&bookendsEqual?'OMC_FAST_CIRCLE_RAW_BITS_PARITY_PASS':'FAILED_OR_INCOMPLETE',
  scope:'Exact full native and historical/transposed/tiny RGB3/RGBA scoring parity against frozen production,27 grid checks,23 independent raw-bit patches, border positive zero, ignored poisoned alpha and disabled poison. OMC reference and optional generated-C ABBA profile only; no native Rumoca/WASM/fullSLAM claim.',
  baseline,baselineSha256:baselineSha,sources,fixture:{path:fixturePath,sha256:sha(fixtureBytes)},compilerVersion:version.stdout.trim(),
  terminal,csvValid,scoreResults,patches,runs,bookendsEqual,failure,scratchHomeRelative:path.relative(os.homedir(),output),
  nativeRumocaArtifactIssued:false,browserFullSlamAccepted:false};
for(const name of fs.readdirSync(output))if(/\.(?:mo|mos|json|log|csv|c|h|xml)$/.test(name)&&fs.statSync(path.join(output,name)).isFile())fs.copyFileSync(path.join(output,name),path.join(durable,name));
fs.writeFileSync(path.join(durable,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({directory:path.relative(app,durable),status:report.status,scoreResults,patches:patches.length,runs,terminal,failure}));
process.exitCode=report.status==='OMC_FAST_CIRCLE_RAW_BITS_PARITY_PASS'?0:1;
