import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const scratch=path.join(process.env.HOME,'scratch/slam_web/profiles');
const destination='dev/artifacts/rumoca-session-api';fs.mkdirSync(destination,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const files=[];
function archive(source,name){const bytes=fs.readFileSync(source),target=path.join(destination,name);fs.writeFileSync(target,bytes);if(hash(fs.readFileSync(target))!==hash(bytes))throw Error(target);files.push({path:target,bytes:bytes.length,sha256:hash(bytes)});}
for(const file of ['dev/profile-rumoca-session-api.mjs','dev/rumoca-session-api-profile.md'])archive(file,path.basename(file));
for(const [directory,prefix,names] of [
  ['session-api','aborted',['resource.json','run.log']],
  ['session-api-run2','short',['resource.json','run.log','report.json','inject.log']],
  ['session-api-run3','final',['resource.json','run.log','report.json','session-api.cpuprofile','api-sample-attribution.json','inject.log','perf-summary.txt','perf-report-errors.txt','perf-annotate-32.txt','perf-annotate-errors.txt']],
])for(const file of names)archive(path.join(scratch,directory,file),prefix+'-'+file);
const final=JSON.parse(fs.readFileSync(path.join(scratch,'session-api-run3/report.json'))),resource=JSON.parse(fs.readFileSync(path.join(scratch,'session-api-run3/resource.json')));
if(final.status!=='RUMOCA_PUBLIC_SESSION_API_PHASE_PROFILE_PASS'||resource.exitCode!==0||final.parity.maximumError!==0)throw Error('Final gate not accepted');
const perfSummary=fs.readFileSync(path.join(scratch,'session-api-run3/perf-summary.txt'),'utf8');
const perfSamples=Number(perfSummary.match(/^# Samples: (\d+)/m)?.[1]),lostSamples=Number(perfSummary.match(/^# Total Lost Samples: (\d+)/m)?.[1]);
if(!Number.isInteger(perfSamples)||perfSamples<=0||!Number.isInteger(lostSamples))throw Error('Missing perf evidence');
const external=[];for(const name of fs.readdirSync(path.join(scratch,'session-api-run3')).filter(n=>/^(perf\.data|perf\.jit\.data|jit-.*\.dump|isolate-.*-v8\.log)$/.test(n))){const b=fs.readFileSync(path.join(scratch,'session-api-run3',name));external.push({path:'$HOME/scratch/slam_web/profiles/session-api-run3/'+name,bytes:b.length,sha256:hash(b)});}
const report={status:'RUMOCA_SESSION_API_BOTTLENECK_PROFILE_VERIFIED',recordedAt:new Date().toISOString(),compilerVersion:final.compilerVersion,compilerCommit:final.compilerCommit,compilerWasmSha256:final.compilerWasmSha256,sourceSha256:final.sourceSha256,grouped:final.grouped,order:final.order,parity:final.parity,perf:{samples:perfSamples,lostSamples,scope:'Whole process, including compilation and both read APIs; Rust source names absent'},sampleAttribution:JSON.parse(fs.readFileSync(path.join(scratch,'session-api-run3/api-sample-attribution.json'))),resources:{elapsedMs:resource.elapsedMs,peakRssKiB:resource.peakRssKiB,minimumAvailableKiB:resource.minimumAvailableKiB},compilerOptimizationApplied:false,appShortcutApplied:false,productionPinChanged:false,limitations:['Diagnostic phase timers/perf/V8 instrumentation on shared host','Old compiler, not merged latest-main validation','Read map/observation trace confirmed in development source; numbered native functions not Rust identities','No full sensors/GPU/SLAM or10x measurement'],files,largeScratchEvidence:external};
fs.writeFileSync('dev/rumoca-session-api-profile-verification.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,archived:files.length,scratchFiles:external.length}));
