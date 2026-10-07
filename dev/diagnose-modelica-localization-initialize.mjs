// Exact archived initializer, phase-local profiling; never numerical acceptance.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const receipt=path.resolve(app,process.env.OMC_INITIALIZE_RECEIPT??'dev/artifacts/modelica-localization-initialize-semantics/localization-initialize-semantics-rVlfJZ');
const original=JSON.parse(fs.readFileSync(path.join(receipt,'report.json'),'utf8'));
const phase=process.env.OMC_INITIALIZE_PHASE??'check';
if(!['check','translate'].includes(phase))throw Error('Expected check or translate');
const perf=process.env.PERF_BIN??'perf';
const perfVersion=spawnSync(perf,['--version'],{encoding:'utf8'});
if(perfVersion.error||perfVersion.status!==0)throw perfVersion.error??Error(perfVersion.stderr);
const root=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(root,{recursive:true});
const output=fs.mkdtempSync(path.join(root,`localization-initialize-${phase}-`));
const sha=b=>createHash('sha256').update(b).digest('hex');
const sources=original.sources.map(source=>{
  const bytes=fs.readFileSync(path.join(receipt,'source-preimages',source.path));
  if(sha(bytes)!==source.sha256)throw Error(`Archived source changed: ${source.path}`);
  const target=path.join(output,'source-preimages',source.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);
  return source;
});
const names=sources.filter(source=>source.path.endsWith('.mo')).map(source=>source.path);
const model='RGBDLocalizationInitializeAcceptanceCase1';
const script=path.join(output,'phase.mos');
fs.writeFileSync(script,'setDebugFlags("gen,execstat,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize");\n'
  +'setCommandLineOptions("--preOptModules-=evalFunc");\n'
  +names.map(name=>`loadFile(${JSON.stringify(path.join(output,'source-preimages',name))});`).join('\n')
  +`\nloadString("model ${model} extends RGBDLocalizationInitializeAcceptance(final scenario=1); end ${model};");\ngetErrorString();\nwriteFile("phase.txt","loaded");\n`
  +(phase==='check'?`writeFile("check-result.txt",checkModel(${model}));\n`:`translateModel(${model});\n`)
  +'writeFile("phase.txt","returned");\ngetErrorString();\n');
const omc=process.env.OMC_BIN??'omc';
const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','30','--rss-mib','8192','--available-mib','16384',
  '--log',path.join(output,'phase.log'),'--','nice','-n','15','taskset','-c','8,9','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,
  omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
const resources=fs.openSync(path.join(output,'resources.json'),'w');
const child=spawn(process.execPath,command,{cwd:output,stdio:['ignore',resources,'inherit']});
const terminal=new Promise(resolve=>child.on('exit',(status,signal)=>resolve({status,signal})));
console.log(JSON.stringify({directory:output,phase,driver:child.pid}));
await new Promise(resolve=>setTimeout(resolve,phase==='translate'?15000:2000));
let processIdentity=null,profile=null;
if(child.exitCode===null&&child.signalCode===null){
  for(const entry of fs.readdirSync('/proc')){
    if(!/^\d+$/.test(entry))continue;
    try{
      const args=fs.readFileSync(`/proc/${entry}/cmdline`,'utf8').split('\0');
      if(args[0]===omc&&args.includes(script)){
        processIdentity={pid:Number(entry),stat:fs.readFileSync(`/proc/${entry}/stat`,'utf8'),args};break;
      }
    }catch(error){if(!['ENOENT','ESRCH','EACCES'].includes(error.code))throw error;}
  }
  if(processIdentity){
    const args=['record','-g','--call-graph','dwarf,16384','-F','99','-o',path.join(output,'perf.data'),'-p',String(processIdentity.pid),'--','sleep','8'];
    fs.writeFileSync(path.join(output,'profile-owner.json'),JSON.stringify({processIdentity,command:[perf,...args]},null,2)+'\n');
    const logs=fs.openSync(path.join(output,'perf.log'),'w');
    const sample=spawn(perf,args,{cwd:output,stdio:['ignore',logs,logs]});
    profile=await new Promise(resolve=>{
      sample.once('error',error=>resolve({status:null,signal:null,error:String(error)}));
      sample.once('exit',(status,signal)=>resolve({status,signal}));
    });
    fs.closeSync(logs);
    if(profile.status===0){
      for(const [file,args] of [['perf-self.txt',['report','--stdio','--no-children','--percent-limit','0.5']],['perf-inclusive.txt',['report','--stdio','--children','--percent-limit','1.0']]]){
        const result=spawnSync(perf,[...args,'-i',path.join(output,'perf.data')],{cwd:output,encoding:'utf8',maxBuffer:16*1024*1024});
        fs.writeFileSync(path.join(output,file),result.stdout??'');
        if(result.status!==0)fs.writeFileSync(path.join(output,`${file}.error`),result.stderr??'');
      }
    }
  }
}
const result=await terminal;fs.closeSync(resources);
const report={phase,processStatus:result.status,signal:result.signal,sources,originalReceipt:path.relative(app,receipt),
  bookendsEqual:sources.every(source=>sha(fs.readFileSync(path.join(receipt,'source-preimages',source.path)))===source.sha256),
  frontier:fs.existsSync(path.join(output,'phase.txt'))?fs.readFileSync(path.join(output,'phase.txt'),'utf8'):null,
  checkResult:fs.existsSync(path.join(output,'check-result.txt'))?fs.readFileSync(path.join(output,'check-result.txt'),'utf8'):null,
  profile,perfVersion:perfVersion.stdout.trim(),profiledOwnedProcess:processIdentity!==null,numericalAcceptance:false,
  driverSha256:sha(fs.readFileSync(fileURLToPath(import.meta.url)))};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const durable=path.join(app,'dev/artifacts/modelica-localization-initialize-diagnosis',path.basename(output));
fs.mkdirSync(durable,{recursive:true});
for(const file of fs.readdirSync(output)){
  // Large raw recordings remain on the scratch disk; retain their identity.
  if(file !== 'perf.data' && fs.statSync(path.join(output,file)).isFile())fs.copyFileSync(path.join(output,file),path.join(durable,file));
}
if(fs.existsSync(path.join(output,'perf.data'))){
  const raw=fs.readFileSync(path.join(output,'perf.data'));
  fs.writeFileSync(path.join(durable,'raw-profile.json'),JSON.stringify({
    homeRelativePath:path.relative(os.homedir(),path.join(output,'perf.data')),
    bytes:raw.length,sha256:sha(raw),copiedIntoRepository:false,
  },null,2)+'\n');
}
console.log(JSON.stringify({directory:output,...report}));
process.exitCode=result.status===0?0:1;
