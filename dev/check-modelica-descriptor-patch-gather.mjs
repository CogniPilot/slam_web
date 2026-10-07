// Small durable numerical controls. No generated C, build cache or native SLAM claim.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.join(app,'dev/artifacts/modelica-descriptor-patch-gather-2026-10-07');
const review=process.argv.includes('--review'),prepare=process.argv.includes('--prepare');
if(review&&prepare)throw Error('Choose --prepare or --review');
fs.mkdirSync(root,{recursive:true});
const original=fs.readFileSync(path.join(app,'tests/compiler-probes/fixtures/RGBDFeatureMatchingDenseReference.mo'),'utf8');
const current=fs.readFileSync(path.join(app,'models/Vision/Matching/RGBDFeatureMatching.mo'),'utf8');
const test=fs.readFileSync(path.join(app,'tests/modelica/RGBDDescriptorPatchGatherTests.mo'),'utf8');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const runnerSha256=sha(fs.readFileSync(fileURLToPath(import.meta.url)));
if(sha(original)!=='c2007359260543f725df3d297c920b1cdfd89ef36a48b11decc9c15ca0371446')throw Error('Frozen reference changed');
if(!review){
  fs.writeFileSync(path.join(root,'original-package.mo'),`package RGBDDenseReference\n${original}\nend RGBDDenseReference;\n`);
  fs.writeFileSync(path.join(root,'current-package.mo'),`package RGBDPatchGather\n${current}\nend RGBDPatchGather;\n`);
}

function matrix(name,rows,columns,values){
  const label=Buffer.from(name+'\0'),header=Buffer.alloc(20),data=Buffer.alloc(rows*columns*8);
  [0,rows,columns,0,label.length].forEach((n,i)=>header.writeInt32LE(n,i*4));
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++)data.writeDoubleLE(values[y*columns+x],(x*rows+y)*8);
  return Buffer.concat([header,label,data]);
}
const raw=process.argv.includes('--raw');
if(process.argv.slice(2).some(arg=>!['--raw','--prepare','--review'].includes(arg)))throw Error('Expected --raw, --prepare or --review');
const prior=review?JSON.parse(fs.readFileSync(path.join(root,'plan.json'),'utf8')):null;
if(prior&&prior.raw!==raw)throw Error('Review mode differs from the prepared plan');
const cases=prior?prior.cases:[],commands=[];
const literal=value=>Array.isArray(value)?'{'+value.map(literal).join(',')+'}'
  :/^-?\d+$/.test(String(value))?value+'.0':String(value);
if(!review)for(const [height,width,channels] of [[13,17,3],[9,11,4]]){
  const capacity=5,cx=Math.floor(width/2),cy=Math.floor(height/2);
  const base={rgb:Array.from({length:height*width*channels},(_,i)=>{
    const c=i%channels,p=Math.floor(i/channels),x=p%width,y=Math.floor(p/width);return (x*31+y*17+c*11)%255+.125;
  }),depth:Array(height*width).fill(2),pixels:[[cx,cy],[cx+1,cy],[3.5,3],[2,2],[width-4,height-4]].flat(),settings:[capacity,1,1]};
  const scenarios=[];
  const add=(name,mutate=()=>{})=>{const f=structuredClone(base);mutate(f);scenarios.push({name,...f});};
  add('fractional RGB and sparse invalid positions');
  add('opaque outside-patch NaN',f=>{f.rgb[0]=NaN;});
  if(channels===4)add('opaque nonfinite alpha',f=>{for(let i=3;i<f.rgb.length;i+=4)f.rgb[i]=i%8?Infinity:NaN;});
  add('active-patch NaN',f=>{f.rgb[(cy*width+cx)*channels+1]=NaN;});
  for(const count of [0,.5,1.5,-1,capacity+1,NaN,Infinity])add(`activeCount ${count}`,f=>{f.settings[0]=count;});
  add('disabled poisoned image',f=>{f.rgb.fill(NaN);f.depth.fill(Infinity);f.pixels.fill(NaN);f.settings=[Infinity,0,1];});
  add('Z16 units',f=>{f.depth.fill(2000);f.settings[2]=.001;});
  add('positive-weight invalid depth',f=>{f.depth[cy*width+cx]=NaN;});
  add('zero contrast',f=>{f.rgb.fill(128);});
  add('fractional input recovery');
  const prefix=`${height}x${width}x${channels}`,fixture=path.join(root,prefix+'-inputs.mat'),result=path.join(root,prefix+'-results.mat');
  const matrices=scenarios.flatMap((f,i)=>[
    matrix('rgb_'+(i+1),height,width*channels,f.rgb),matrix('depth_'+(i+1),height,width,f.depth),
    matrix('pixels_'+(i+1),capacity,2,f.pixels),matrix('settings_'+(i+1),1,3,f.settings)]);
  fs.writeFileSync(fixture,Buffer.concat(matrices));
  if(fs.existsSync(result))fs.unlinkSync(result);
  cases.push({prefix,height,width,channels,capacity,scenarios:scenarios.map(f=>f.name),fixture:path.basename(fixture),fixtureSha256:sha(fs.readFileSync(fixture)),result:path.basename(result)});
  if(raw)commands.push(`RGBDDescriptorPatchGatherTests.Run(${JSON.stringify(fixture)},${JSON.stringify(result)},${height},${width},${channels},${capacity},${scenarios.length});`);
  else for(const [index,f] of scenarios.entries()){
    // Pure interpreter controls avoid compiling an external MAT I/O wrapper.
    // Nonfinite inputs remain in the raw fixtures and the strict WASM gate;
    // these finite controls explicitly substitute huge out-of-domain values.
    const finite=value=>Number.isFinite(value)?value:value===-Infinity?-1e250:1e250;
    const rgb=Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>
      f.rgb.slice((y*width+x)*channels,(y*width+x+1)*channels).map(finite)));
    const depth=Array.from({length:height},(_,y)=>f.depth.slice(y*width,(y+1)*width).map(finite));
    const pixels=Array.from({length:capacity},(_,i)=>f.pixels.slice(i*2,i*2+2).map(finite));
    commands.push(`print("PATCH_GATHER_CASE ${prefix} ${index+1}\\n");`,
      `RGBDDescriptorPatchGatherTests.CompareFinite(${literal(rgb)},${literal(depth)},${literal(pixels)},${literal(finite(f.settings[0]))},${f.settings[1]===1},${literal(f.settings[2])});`);
  }
}
const script=path.join(root,'controls.mos');
if(!review)fs.writeFileSync(script,`loadFile(${JSON.stringify(path.join(process.env.HOME,'.openmodelica/libraries/Modelica 4.1.0+maint.om/package.mo'))});\n`
  +['original-package.mo','current-package.mo'].map(name=>`loadFile(${JSON.stringify(path.join(root,name))});`).join('\n')
  +`\nloadFile(${JSON.stringify(path.join(app,'tests/modelica/RGBDDescriptorPatchGatherTests.mo'))});\n`
  +commands.join('\n')+'\ngetErrorString();\n');
const plan=prior??{raw,runnerSha256,sourceSha256:sha(current),referenceSha256:sha(original),testSha256:sha(test),
  scriptSha256:sha(fs.readFileSync(script)),originalPackageSha256:sha(fs.readFileSync(path.join(root,'original-package.mo'))),
  currentPackageSha256:sha(fs.readFileSync(path.join(root,'current-package.mo'))),cases};
if(!review)fs.writeFileSync(path.join(root,'plan.json'),JSON.stringify(plan,null,2)+'\n');
if(prepare){console.log(JSON.stringify({script,plan:path.join(root,'plan.json')}));process.exit(0);}
const started=performance.now();
const run=review?{status:Number(fs.readFileSync(path.join(root,'controls.exitstatus'),'utf8')),error:null,
  stdout:fs.readFileSync(path.join(root,'controls.log'),'utf8'),stderr:''}
  :spawnSync(process.env.OMC_BIN??'omc',[script],{cwd:root,encoding:'utf8',timeout:45_000,maxBuffer:1024*1024,
    env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
if(!review)fs.writeFileSync(path.join(root,'controls.log'),(run.stdout??'')+(run.stderr??''));
let pass=run.status===0&&!run.error&&!/Error:|Out of memory|stack overflow/i.test((run.stdout??'')+(run.stderr??''));
const tuples=[...(run.stdout??'').matchAll(/\(\{(true|false), (true|false), (true|false)\}, \{([^}]+)\}, \{([^}]+)\}\)/g)];
let cursor=0;
for(const c of cases){
  if(!raw){
    c.results=c.scenarios.map(name=>{
      const tuple=tuples[cursor++];
      const checks=tuple?tuple.slice(1,4).map(value=>value==='true'):[];
      const enabled=tuple?tuple[5].split(',').map(Number):[];
      const accepted=checks.length===3&&checks.every(Boolean)&&enabled.length===c.capacity;
      pass&&=accepted;
      return {name,nonfiniteInputsReplacedWithFiniteSentinels:/NaN|Infinity|nonfinite|poisoned|invalid depth/.test(name),
        checks,enabled,firstMismatch:tuple?tuple[4].split(',').map(Number):null,pass:accepted};
    });
    c.baselineEnabled=c.results[0].enabled;
    pass&&=JSON.stringify(c.baselineEnabled)==='[1,1,0,0,1]';
    continue;
  }
  const file=path.join(root,c.result);
  if(!fs.existsSync(file)){pass=false;c.error='No result matrix';continue;}
  const bytes=fs.readFileSync(file),type=bytes.readInt32LE(0),rows=bytes.readInt32LE(4),columns=bytes.readInt32LE(8),imaginary=bytes.readInt32LE(12),labelBytes=bytes.readInt32LE(16);
  const offset=20+labelBytes;
  if(type!==0||rows!==c.scenarios.length*2||columns!==1+c.capacity*53||imaginary!==0
    ||bytes.subarray(20,offset).toString()!=='results\0'||offset+rows*columns*8!==bytes.length)throw Error('Unexpected result MAT layout');
  c.results=[];
  for(let pair=0;pair<c.scenarios.length;pair++){
    let exact=true,finite=true;
    for(let column=0;column<columns;column++){
      const a=offset+(column*rows+pair*2)*8,b=a+8;
      finite&&=Number.isFinite(bytes.readDoubleLE(a))&&Number.isFinite(bytes.readDoubleLE(b));
      exact&&=bytes.subarray(a,a+8).equals(bytes.subarray(b,b+8));
    }
    const invalidCount=bytes.readDoubleLE(offset+pair*2*8);
    c.results.push({name:c.scenarios[pair],exact,finite,publicValues:columns,invalidCount});
    pass&&=exact&&finite;
  }
  c.resultSha256=sha(bytes);
  // Independent nonvacuity: actual accepted patches and valid final sparse slot.
  c.baselineEnabled=Array.from({length:c.capacity},(_,i)=>bytes.readDoubleLE(offset+((1+i*53)*rows)*8));
  pass&&=JSON.stringify(c.baselineEnabled)==='[1,1,0,0,1]';
}
if(!raw)pass&&=cursor===tuples.length&&cursor===cases.reduce((n,c)=>n+c.scenarios.length,0);
const bookendsEqual=sha(fs.readFileSync(path.join(app,'models/Vision/Matching/RGBDFeatureMatching.mo')))==sha(current)
  &&sha(fs.readFileSync(path.join(app,'tests/modelica/RGBDDescriptorPatchGatherTests.mo')))==sha(test)
  &&runnerSha256===plan.runnerSha256
  &&sha(current)===plan.sourceSha256&&sha(original)===plan.referenceSha256&&sha(test)===plan.testSha256
  &&sha(fs.readFileSync(script))===plan.scriptSha256
  &&sha(fs.readFileSync(path.join(root,'original-package.mo')))===plan.originalPackageSha256
  &&sha(fs.readFileSync(path.join(root,'current-package.mo')))===plan.currentPackageSha256
  &&cases.every(c=>sha(fs.readFileSync(path.join(root,c.fixture)))===c.fixtureSha256);
pass&&=bookendsEqual;
const report={status:pass?'OMC_DESCRIPTOR_PATCH_GATHER_BIT_EXACT_CONTROLS_PASS':'FAILED_OR_INCOMPLETE',
  scope:raw?'Small rectangular RGB/RGBA component reference controls, including actual NaN/Infinity and raw Z16 scale. Not full350/native848 admission, Rumoca WASM execution or throughput qualification.'
    :'Small rectangular RGB/RGBA finite component controls with exact equality and signed-zero checks. Nonfinite fixture values explicitly replaced by huge finite sentinels. Not actual NaN/Infinity, full350/native848 admission, Rumoca WASM execution or throughput qualification.',
  mode:raw?'raw-mat':'finite-pure',
  execution:review?'Reviewed separately executed script and exit status':'Owned subprocess',
  sourceSha256:sha(current),referenceSha256:sha(original),testSha256:sha(test),bookendsEqual,
  ...(review?{reviewMs:performance.now()-started}:{elapsedMs:performance.now()-started}),
  runnerSha256,processStatus:run.status,error:run.error?String(run.error):null,cases,
  browserSlamExecuted:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));process.exitCode=pass?0:1;
