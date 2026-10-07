// Test-only native OMC MATv4 raw-image import qualification; no SLAM/ABI implementation.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),home=os.homedir();
const scratch=path.join(home,'scratch/slam_web/tmp');fs.mkdirSync(scratch,{recursive:true});
const output=fs.mkdtempSync(path.join(scratch,'rendered-frame-input-'));
const durable=path.join(app,'dev/artifacts/modelica-rendered-frame-input',path.basename(output));fs.mkdirSync(durable,{recursive:true});
const sha=x=>createHash('sha256').update(x).digest('hex'),assert=(x,m)=>{if(!x)throw Error(m);};
const height=90,width=160,channels=4,frames=[],matParts=[];
function matrix(name,rows,columns,read){const n=Buffer.from(name+'\0','ascii'),header=Buffer.alloc(20),data=Buffer.alloc(rows*columns*8);
  for(const [i,v]of[0,rows,columns,0,n.length].entries())header.writeInt32LE(v,i*4);
  for(let c=0;c<columns;c++)for(let r=0;r<rows;r++)data.writeDoubleLE(read(r,c),(c*rows+r)*8);
  matParts.push(header,n,data);
}
function depthValue(frame,row,column){const linear=(row-1)*width+column;switch((linear+frame)%8){case 0:return 0;case 1:return -1.5;
  case 2:return .03125*((linear*7+frame*11)%1024);case 3:return -.015625*((linear*3+frame*17)%512);
  case 4:return 2**-149;case 5:return 16777216;case 6:return Math.fround(.1);case 7:return 16777215;}}
for(let frame=1;frame<=3;frame++){
  const rgb=Buffer.alloc(height*width*channels),depth=Buffer.alloc(height*width*4);
  for(let row=1;row<=height;row++)for(let column=1;column<=width;column++){
    const pixel=(row-1)*width+column-1;
    for(let channel=1;channel<=channels;channel++)rgb[pixel*channels+channel-1]=(frame*37+row*13+column*7+channel*61)%256;
    let d=depthValue(frame,row,column);if(frame===3&&row===1){if(column===1)d=NaN;else if(column===2)d=Infinity;else if(column===3)d=-Infinity;else if(column===4)d=-0;}
    depth.writeFloatLE(d,pixel*4);
  }
  const rgbName=`frame-${frame}.rgba.u8`,depthName=`frame-${frame}.depth.f32le`;
  fs.writeFileSync(path.join(output,rgbName),rgb);fs.writeFileSync(path.join(output,depthName),depth);
  matrix(`rgb_${frame}`,height,width*channels,(r,c)=>rgb[(r*width*channels)+c]);
  matrix(`depth_${frame}`,height,width,(r,c)=>depth.readFloatLE((r*width+c)*4));
  frames.push({frame,rgbName,depthName,rgb,depth,rgbSum:rgb.reduce((a,b)=>a+b,0)});
}
const mat=Buffer.concat(matParts),matName='rendered-sentinel.mat';fs.writeFileSync(path.join(output,matName),mat);
// Separate MAT decoder verifies every stored f64 cell against original raw typed lanes.
let offset=0,matrixCount=0,cellCount=0;
while(offset<mat.length){const type=mat.readInt32LE(offset),rows=mat.readInt32LE(offset+4),columns=mat.readInt32LE(offset+8),imag=mat.readInt32LE(offset+12),length=mat.readInt32LE(offset+16);
  assert(type===0&&rows===height&&imag===0,'MATv4 f64 real matrix header');const name=mat.subarray(offset+20,offset+20+length-1).toString('ascii');
  assert(mat[offset+20+length-1]===0,'Terminated MAT variable');offset+=20+length;
  const match=/^(rgb|depth)_([1-3])$/.exec(name);assert(match,'Exact MAT variable inventory');const frame=frames[Number(match[2])-1],rgb=match[1]==='rgb';
  assert(columns===(rgb?width*channels:width),'Exact matrix columns');
  for(let c=0;c<columns;c++)for(let r=0;r<rows;r++){const actual=mat.readDoubleLE(offset+(c*rows+r)*8),expected=rgb?frame.rgb[r*columns+c]:frame.depth.readFloatLE((r*columns+c)*4);
    assert(Object.is(actual,expected)||(Number.isNaN(actual)&&Number.isNaN(expected)),'Raw typed lane preserved in MAT');cellCount++;}
  offset+=rows*columns*8;matrixCount++;
}
assert(offset===mat.length&&matrixCount===6&&cellCount===216000,'Complete independent MAT inventory');
const sourceNames=['tests/modelica/RGBDRenderedFrameInput.mo','dev/check-modelica-rendered-frame-input.mjs','dev/rumoca-bounded-run.mjs'];
const sources=sourceNames.map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(app,p)))}));
for(const s of sources){const dst=path.join(durable,'sources',s.path);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(path.join(app,s.path),dst);}
const rawFiles=[...frames.flatMap(f=>[f.rgbName,f.depthName]),matName].map(p=>({path:p,bytes:fs.statSync(path.join(output,p)).size,sha256:sha(fs.readFileSync(path.join(output,p)))}));
for(const f of rawFiles)fs.copyFileSync(path.join(output,f.path),path.join(durable,f.path));
const library=path.join(home,'.openmodelica/libraries/Modelica 4.1.0+maint.om');
const librarySources=['package.mo','Utilities/Streams.mo'].map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(library,p)))}));
for(const s of librarySources){const dst=path.join(durable,'installed-msl',s.path);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(path.join(library,s.path),dst);}
const models=['RGBDRenderedFrameInputFiniteAcceptance','RGBDRenderedFrameInputNonfiniteAcceptance'];
const script=path.join(output,'rendered-frame-input.mos');
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize,execstat");\nsetCommandLineOptions("--preOptModules-=evalFunc");\n'
  +'loadModel(Modelica,{"4.1.0"});\ngetVersion(Modelica);\n'
  +`loadFile(${JSON.stringify(path.join(durable,'sources/tests/modelica/RGBDRenderedFrameInput.mo'))});\ngetErrorString();\n`
  +models.map(model=>`simulate(${model},stopTime=0.001,numberOfIntervals=1,outputFormat="csv",variableFilter="checks.*|raw.*",cflags="-O0");\ngetErrorString();`).join('\n')+'\n');
const omc=process.env.OMC_BIN??'omc',version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const command=[path.join(durable,'sources/dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192','--available-mib','16384','--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','12,13','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
const terminal=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});fs.writeFileSync(path.join(output,'resources.json'),terminal.stdout??'');if(terminal.stderr)fs.writeFileSync(path.join(output,'guardian-stderr.log'),terminal.stderr);
const results=models.map((model,phase)=>{const csv=model+'_res.csv';if(!fs.existsSync(path.join(output,csv)))return {model,pass:false,csv:null};
  const bytes=fs.readFileSync(path.join(output,csv)),lines=String(bytes).trim().split(/\r?\n/),header=[...lines.shift().matchAll(/"([^"]*)"/g)].map(m=>m[1]);
  const ids=phase===0?[1,2]:[3],names=ids.flatMap((id,index)=>Array.from({length:4},(_,i)=>phase===0?`checks[${index+1},${i+1}]`:`checks[${i+1}]`));
  const rawNames=ids.flatMap((id,index)=>Array.from({length:4},(_,i)=>phase===0?`raw[${index+1},${i+1}]`:`raw[${i+1}]`));
  const expectedColumns=['time',...names,...rawNames],columnValid=header.length===expectedColumns.length&&new Set(header).size===header.length&&expectedColumns.every(n=>header.includes(n));
  const lexicalValid=lines.every(l=>l.split(',').every(v=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(v))),rows=lines.map(l=>l.split(',').map(Number));
  const rowsValid=columnValid&&lexicalValid&&rows.length>=2&&rows.every(r=>r.length===header.length&&r.every(Number.isFinite))&&rows[0][header.indexOf('time')]===0&&rows.at(-1)[header.indexOf('time')]===.001;
  const expectedRaw=ids.flatMap(id=>[57600,14400,id,frames[id-1].rgbSum]);
  const checks=rowsValid?names.map(n=>rows.every(r=>r[header.indexOf(n)]===1)):[],metrics=rowsValid?rows.map(r=>rawNames.map(n=>r[header.indexOf(n)])):[];
  return {model,csv,sha256:sha(bytes),columnValid,rowsValid,rows:rows.length,checks,metrics,pass:rowsValid&&checks.every(Boolean)&&metrics.every(r=>JSON.stringify(r)===JSON.stringify(expectedRaw))};
});
const generated=fs.readdirSync(output).filter(p=>/\.(?:c|h)$/.test(p)).map(p=>({path:p,bytes:fs.statSync(path.join(output,p)).size,sha256:sha(fs.readFileSync(path.join(output,p)))}));
const bookendsEqual=sources.every(s=>sha(fs.readFileSync(path.join(app,s.path)))===s.sha256)&&librarySources.every(s=>sha(fs.readFileSync(path.join(library,s.path)))===s.sha256)&&rawFiles.every(f=>sha(fs.readFileSync(path.join(output,f.path)))===f.sha256);
let resources=null;try{resources=JSON.parse(terminal.stdout);}catch{}
const finiteQualified=terminal.status===0&&bookendsEqual&&results[0].pass,nonfiniteQualified=terminal.status===0&&bookendsEqual&&results[1].pass;
const report={status:finiteQualified&&nonfiniteQualified?'OMC_RENDERED_FRAME_INPUT_PASS':'FAILED_OR_PARTIAL',scope:'Test-only native OMC/MSL MATv4 image IO. Full90x160x4 UInt8 RGB and90x160 finite f32 depth widen exactly to Real64. Separate nonfinite/signedzero controls. No SLAM math, production ABI or WASM portability claim.',
  api:'impure RGBDRenderedFrameInput.Read(fileName,frameIndex)->(rgb[90,160,4],depth[90,160])',matSchema:{type:0,endianness:'little',realType:'float64',order:'column-major',rgb:'rgb_N[90,640], packed column=(pixelColumn-1)*4+channel',depth:'depth_N[90,160]'},
  compilerVersion:version.stdout.trim(),installedMslHomeRelative:path.relative(home,library),librarySources,sources,rawFiles,independentMatDecode:{matrixCount,cellCount,pass:true},
  results,finiteQualified,nonfiniteQualified,nanPayloadBitsPreserved:false,bookendsEqual,processStatus:terminal.status,resources,generated,generatedScratchHomeRelative:path.relative(home,output),productionAbiQualified:false,wasmFileIoQualified:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
for(const p of ['report.json','resources.json','command.json','guardian-stderr.log','semantics.log','rendered-frame-input.mos',...results.map(r=>r.csv).filter(Boolean),...generated.filter(g=>/_functions\.c$/.test(g.path)||models.some(m=>g.path===m+'.c')).map(g=>g.path)])if(fs.existsSync(path.join(output,p)))fs.copyFileSync(path.join(output,p),path.join(durable,p));
console.log(JSON.stringify({directory:path.relative(app,durable),...report}));process.exitCode=finiteQualified&&nonfiniteQualified?0:1;
