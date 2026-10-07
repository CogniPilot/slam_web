import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';
const scratch=path.join(os.homedir(),'scratch/slam_web/tmp/compiler-owned-ins');
const archive='dev/artifacts/compiler-owned-ins';fs.mkdirSync(archive,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),files=[];
function retain(source,name){
 const bytes=fs.readFileSync(source),destination=path.join(archive,name);fs.writeFileSync(destination,bytes);
 if(sha(fs.readFileSync(destination))!==sha(bytes))throw Error('Archive copy mismatch');
 files.push({path:destination,bytes:bytes.length,sha256:sha(bytes)});
}
for(const name of ['tests.log','tests-resource.json','migration-tests.log','migration-tests-resource.json','typescript.log','typescript-resource.json','build.log','build-resource.json','browser.log','browser-resource.json','browser-report.json','profile.log','profile-resource.json','ins-profile-report.json'])retain(path.join(scratch,name),name);
for(const file of ['src/modelica-state.worker.ts','src/modelica-inertial-session.ts','src/imu-intervals.ts','src/project.ts','src/runtime.ts','tests/modelica-inertial-session.test.ts','tests/project-migration.test.ts','models/Estimation/Inertial/ModelicaInertial.mo','dev/probe-compiler-owned-ins.mjs','dev/profile-compiler-owned-ins.mjs'])retain(file,file.replaceAll('/','__'));
const profile=JSON.parse(fs.readFileSync(path.join(scratch,'ins-profile-report.json'),'utf8'));
const historical=fs.realpathSync('dist'),candidate=path.join(os.homedir(),'scratch/slam_web/build/compiler-owned-ins-preview');
retain(path.join(historical,'assets',profile.baselineWorker.file),'historical-state-worker.js');
retain(path.join(candidate,'assets',profile.candidateWorker.file),'compiler-owned-state-worker.js');
const stages=['tests','migration-tests','typescript','build','browser','profile'];
for(const stage of stages){const record=JSON.parse(fs.readFileSync(path.join(scratch,`${stage}-resource.json`),'utf8'));if(record.exitCode!==0||record.signal)throw Error(`Unpassed ${stage}`);}
if(fs.existsSync('src/modelica-state-export.ts')||fs.existsSync('tests/modelica-state-export.test.ts'))throw Error('Retired state backend still exists');
const remainingAppEmitters=fs.readdirSync('src').filter(file=>file.endsWith('.ts')&&fs.readFileSync(path.join('src',file),'utf8').includes("import wabtFactory from 'wabt'"));
const compiler=fs.readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm');
const report={schemaVersion:1,status:'COMPILER_OWNED_INS_MIGRATION_VERIFIED',recordedAt:new Date().toISOString(),
 compilerWasmSha256:sha(compiler),removed:['src/modelica-state-export.ts','tests/modelica-state-export.test.ts'],
 productionPreviewUpdated:false,privatePreview:'http://localhost:4182/',remainingAppEmitters,
 actualTests:{initial:4,finalWithProjectMigration:9,typescript:true,build:true,browserSourceEditCacheMigrationReload:true,lockstepFrames:30},
 profile:{meanHistoricalRpcMs:profile.meanBaselineRpcMs,meanCompilerSessionRpcMs:profile.meanCandidateRpcMs,
  timedCalls:3200,order:'ABBA then BAAB',maximumPoseError:profile.maximumPoseError,poseComparisons:profile.poseComparisons},
 limitations:['Compiler Auto may interpret unsupported Solve IR kernels','Current public API lacks reset_at: nonzero-start replay explicitly refused','Vision retains5app-sideemitters','CVFloat32/fullSLAM/10xremainpending'],files};
fs.writeFileSync('dev/compiler-owned-ins-verification.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,archives:files.length,remainingAppEmitters,profile:report.profile}));
