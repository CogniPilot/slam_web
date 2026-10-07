// Actual browser compiler scaling of a generic nested record constructor.
// No reduced-capacity application or alternate SLAM runtime is produced.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {rgbdSlamNativeSourceManifest as manifest} from '../src/modelica-slam-source-manifest.mjs';
const [compiler,directory]=process.argv.slice(2);
if(!directory)throw Error('COMPILER_DIRECTORY OUTPUT_DIRECTORY required');
fs.mkdirSync(directory,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const applicationSource=()=>sha(manifest.paths.map(file=>fs.readFileSync(file,'utf8')).join(manifest.separator));
const sourceBefore=applicationSource(),fixtureFile='tests/compiler-probes/fixtures/NativeRecordResetScaling.mo';
const fixture=fs.readFileSync(fixtureFile,'utf8'),rows=[];
for(const capacity of [16,64,256,1024]){
  const output=path.join(directory,`capacity-${capacity}`);fs.mkdirSync(output,{recursive:true});
  const source=fixture.replace('constant Integer capacity = 16;',`constant Integer capacity = ${capacity};`);
  if(capacity!==16&&source===fixture)throw Error('Capacity substitution absent');
  const sourceFile=path.join(output,'source.mo'),artifactFile=path.join(output,'artifact.json'),reportFile=path.join(output,'report.json');
  fs.writeFileSync(sourceFile,source);
  const env={...process.env,RUMOCA_BROWSER_TIMEOUT_MS:'20000'};
  delete env.RUMOCA_BROWSER_PROFILE;
  if(capacity===1024)env.RUMOCA_BROWSER_PROFILE=path.join(output,'compiler-profile.json');
  const result=spawnSync(process.execPath,['dev/issue-native-program-browser.mjs',compiler,sourceFile,
    'NativeRecordResetScaling',artifactFile,reportFile],{env,encoding:'utf8',maxBuffer:4*1024*1024});
  fs.writeFileSync(path.join(output,'stdout.log'),result.stdout??'');fs.writeFileSync(path.join(output,'stderr.log'),result.stderr??'');
  if(result.error)throw result.error;
  if(!fs.existsSync(reportFile))throw Error('Compiler probe did not produce a report');
  const report=JSON.parse(fs.readFileSync(reportFile));
  const row={capacity,realCells:capacity*(49+3),sourceSha256:sha(source),exitCode:result.status,
    status:report.status,compileMs:report.compileMs??report.compilerElapsedMs,
    compiler:report.compiler,compilerModuleSha256:report.compilerModuleSha256,
    memoryBytes:report.abi?.memory_pages*65536,moduleBytes:report.moduleBytes,error:report.error};
  rows.push(row);console.log(JSON.stringify(row));
  // A timeout/failure at a smaller case already changes the next action; do
  // not launch a larger version of the same blocked preparation automatically.
  if(result.status!==0)break;
}
const sourceAfter=applicationSource();
if(sourceBefore!==sourceAfter)throw Error('Application source changed during scaling probe');
const report={status:'ACTUAL_BROWSER_RECORD_RESET_SCALING_OBSERVED',recordedAt:new Date().toISOString(),
  fixture:{path:fixtureFile,sha256:sha(fixture)},probeSha256:sha(fs.readFileSync(import.meta.filename)),
  applicationSourceSha256:sourceBefore,applicationSourceBookendsEqual:true,rows,
  scope:'Generic nested record constructor issuance and ABI admission only. Capacities vary exclusively in test copies. No function execution, SLAM state transfer, application capacity reduction or browser runtime performance qualification.'};
fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
