// Count native reference entries without changing authored or generated math.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const [kind,directoryArg]=process.argv.slice(2);
if(!['descriptor','fast'].includes(kind)||!directoryArg)throw Error('Expected descriptor|fast and the owned reference build directory');
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.resolve(directoryArg),scratch=path.join(os.homedir(),'scratch/slam_web/tmp');
if(!directory.startsWith(scratch+path.sep))throw Error('Expected owned build under HOME/scratch/slam_web/tmp');
const model=kind==='descriptor'?'RGBDDescriptorFrameGuardAcceptance':'FastFrameScoresGuardAcceptance';
const helper=kind==='descriptor'?'omc_DescribeRGBDFrame':'omc_FastFrameScores';
const work=kind==='descriptor'?'omc_DescribeRGBDFeatures':'omc_FastPatchScore';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const executable=path.join(directory,model),generated=path.join(directory,model+'_functions.c');
const executableSha256=sha(fs.readFileSync(executable)),generatedSha256=sha(fs.readFileSync(generated));
const originReport=fs.readFileSync(path.join(directory,'report.json'));
const accepted=JSON.parse(originReport);
const expectedStatus=kind==='descriptor'?'OMC_FULL_RASTER_DESCRIPTOR_GUARD_PASS':'OMC_FULL_RASTER_FAST_FUNCTION_GUARD_PASS';
if(accepted.status!==expectedStatus||accepted.processStatus!==0||accepted.checks?.length!==(kind==='descriptor'?8:4)
  ||!accepted.checks.every(value=>value===true)||accepted.modelResult?.simulationSucceeded!==true)throw Error('No successful numerical function gate');
const output=fs.mkdtempSync(path.join(scratch,'image-guard-calls-'+kind+'-'));
const script=path.join(output,'calls.gdb');
fs.writeFileSync(script,`set pagination off
set confirm off
set print thread-events off
set $frames = 0
set $work_calls = 0
break ${helper}
commands
silent
set $frames = $frames + 1
continue
end
break ${work}
commands
silent
set $work_calls = $work_calls + 1
${kind==='fast'?'disable 2\n':''}continue
end
run
printf "GUARD_CALL_COUNTS frames=%d work=%d\\n", $frames, $work_calls
quit
`);
const gdb=process.env.GDB_BIN??'gdb';
const cases=[];
for(const phase of [{name:'disabled',start:0,end:0.25},{name:'enabled',start:1,end:1.25}]){
  const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','30','--rss-mib','2048','--available-mib','16384',
    '--log',path.join(output,phase.name+'.log'),'--','nice','-n','15','taskset','-c','6,7',
    'env',`--chdir=${directory}`,gdb,'--batch','--nx','-x',script,'--args',executable,
    `-startTime=${phase.start}`,`-stopTime=${phase.end}`,'-stepSize=0.25',`-r=${path.join(output,phase.name+'.csv')}`];
  fs.writeFileSync(path.join(output,phase.name+'-command.json'),JSON.stringify(command,null,2)+'\n');
  const result=spawnSync(process.execPath,command,{encoding:'utf8',maxBuffer:1024*1024,env:{...process.env,TMPDIR:output}});
  fs.writeFileSync(path.join(output,phase.name+'-resources.json'),result.stdout??'');
  const log=fs.readFileSync(path.join(output,phase.name+'.log'),'utf8');
  const match=log.match(/GUARD_CALL_COUNTS frames=(\d+) work=(\d+)/);
  const frames=match?Number(match[1]):null,workCalls=match?Number(match[2]):null;
  const pass=result.status===0&&frames>0&&log.includes('exited normally')&&log.includes('The simulation finished successfully.')
    &&(phase.name==='disabled'?workCalls===0:kind==='fast'?workCalls===1:workCalls===2*frames);
  cases.push({phase:phase.name,pass,processStatus:result.status,frames,workCalls,
    meaning:kind==='fast'?'Patch entry breakpoint disables after its first hit; enabled1 means observed, disabled0 means no hit.':'Counts both the production frame and enabled baseline descriptor calls.'});
}
const unchanged=sha(fs.readFileSync(executable))===executableSha256&&sha(fs.readFileSync(generated))===generatedSha256;
const pass=unchanged&&cases.every(value=>value.pass);
const report={status:pass?'NATIVE_REFERENCE_IMAGE_GUARD_CALLS_PASS':'FAILED_OR_INCOMPLETE',kind,cases,unchanged,
  executableSha256,generatedSha256,originReportSha256:sha(originReport),
  checkScriptSha256:sha(fs.readFileSync(fileURLToPath(import.meta.url))),
  scope:'Debugger entry observations on the unchanged native reference artifact. Disabled and enabled controls finish normally. Not a WASM execution-cost or full-model/browser qualification.'};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
fs.copyFileSync(generated,path.join(output,path.basename(generated)));
fs.copyFileSync(fileURLToPath(import.meta.url),path.join(output,'check-modelica-image-guard-calls.mjs'));
const durable=path.join(app,'dev/artifacts/modelica-image-acquisition-guard',path.basename(output));
fs.cpSync(output,durable,{recursive:true});
console.log(JSON.stringify({directory:durable,...report}));process.exitCode=pass?0:1;
