import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';import{build}from'esbuild';import{resolve}from'node:path';import vm from'node:vm';
import{requireCandidateContract,requireCandidateProfile,requireCompleteComparison,prefixSnapshot,QUALIFIED_BASELINE}from'./office-compare-contract.mjs';import{OFFICE_REPLAY}from'./office-replay-contract.mjs';
import{verifyGamepadOnlyDelta}from'./office-native-features.mjs';
const contract=JSON.parse(await readFile(new URL('./office-candidate.json',import.meta.url)));
function fixture(){
 const model={model:'D435Test',state:{count:1,previous_hash:'a',next_hash:'a'},state_runs:[{name:'declared',lane:'f64',count:1,previous:0,next:8}],inputs:{rgb:{lane:'f64',count:305280,offset:0}},parameters:[{name:'loopMaximumPoseInnovation',value:2}],outputs:[{name:'accepted',lane:'u8',offset:9}],model_outputs:[{name:'features',count:1050,index:0}],files:{state_init:{sha256:contract.resetSha256}}};
 const baseline={profiles:{'424x240':{models:{initialize:structuredClone(model),step:structuredClone(model)}}}};
 const candidate={baseSourceSha256:contract.baseSourceSha256,profiles:{'424x240':{sourceSha256:contract.profileSourceSha256,models:{initialize:structuredClone(model),step:structuredClone(model)}}}};
 return{baseline,candidate};
}
test('incomplete/unreviewed source contract refuses before replay',()=>{
 requireCandidateContract(contract);assert.throws(()=>requireCandidateContract({}),/Incomplete/);
 for(const changed of [{canonicalRevision:contract.canonicalParent},{canonicalRevision:'f'.repeat(40)},{referenceExporterSha256:'0'.repeat(64)},{resetSha256:'0'.repeat(64)},{change:'different policy'}])assert.throws(()=>requireCandidateContract({...contract,...changed}));
 assert.equal(QUALIFIED_BASELINE.repository,'CogniPilot/slam_web');assert.equal(QUALIFIED_BASELINE.artifactId,12488340648);
});
test('only the approved gamepad dependency delta is allowed, including duplicate Cargo rows',()=>{
 const common='rumoca-exec-wasm v0.10.3 [component-build]\nnix v0.29.0 [default,fs]';
 const removed=['rumoca-input-gamepad v0.10.3','gilrs v0.11.2','gilrs-core v0.6.8','libudev-sys v0.1.4','inotify v0.11.2','inotify-sys v0.1.7','nix v0.31.3'].map(x=>x+' []').join('\n');
 const before=common+'\nrumoca v0.10.3 [component-build,default,input-gamepad,native-allocator,fmu-packaging]\nrumoca-sim v0.10.3 [fmi,input-gamepad]\n'+removed;
 const after=common+'\nrumoca v0.10.3 [component-build,native-allocator,fmu-packaging]\nrumoca-sim v0.10.3 [fmi]';
 assert.equal(verifyGamepadOnlyDelta(before+'\nrumoca-exec-wasm v0.10.3 [component-build] (*)',after).removed.length,7);
 for(const changed of [after.replace('rumoca-exec-wasm v0.10.3 [component-build]','rumoca-exec-wasm v0.10.3 []'),after+'\nsurprise v1.0.0 []',after.replace('nix v0.29.0 [default,fs]\n',''),after+'\nlibudev-sys v0.1.4 []'])assert.throws(()=>verifyGamepadOnlyDelta(before,changed));
 assert.throws(()=>verifyGamepadOnlyDelta('unrecognized',after));
});
test('offsets may change but public parameters, lanes, counts and named state must match',()=>{
 const{baseline,candidate}=fixture();candidate.profiles['424x240'].models.step.inputs.rgb.offset=1024;requireCandidateProfile(candidate,baseline,contract);
 for(const mutate of [m=>{m.state.count++;},m=>{m.state_runs[0].lane='i64';},m=>{m.inputs.rgb.count--;},m=>{m.parameters[0].value=2.1;},m=>{m.outputs[0].lane='f64';},m=>{m.model_outputs[0].count--;}]){
  const pair=fixture();mutate(pair.candidate.profiles['424x240'].models.step);assert.throws(()=>requireCandidateProfile(pair.candidate,pair.baseline,contract));
 }
});
test('prefix ends after1205, including carried previous state before1206 entry',()=>{
 assert.equal(prefixSnapshot(1205,'next'),true);assert.equal(prefixSnapshot(1206,'previous'),true);assert.equal(prefixSnapshot(1206,'next'),false);assert.equal(prefixSnapshot(1250,'previous'),false);
});
test('partial collection or a missing predivergence check cannot qualify',()=>{
 const full={status:'complete',completedFrames:1251,prefixFrames:1206,prefixSnapshotChecks:15,chromium:OFFICE_REPLAY.chromium,originalReplayFilesVerified:3850,snapshots:OFFICE_REPLAY.snapshots.flatMap(epoch=>['previous','next'].map(side=>({epoch,side})))};
 assert.equal(requireCompleteComparison(full),true);
 for(const changed of [{status:'failed'},{completedFrames:1250},{prefixFrames:1205},{prefixSnapshotChecks:14},{chromium:'other'},{originalReplayFilesVerified:3849},{snapshots:full.snapshots.slice(1)}])assert.throws(()=>requireCompleteComparison({...full,...changed}),/Incomplete/);
});
test('canonical source object and patch remain the exact reviewed transport',async()=>{
 const raw=await readFile(new URL('./office-anchor-commit.txt',import.meta.url));
 assert.equal(createHash('sha1').update(Buffer.concat([Buffer.from('commit '+raw.length+'\0'),raw])).digest('hex'),contract.canonicalRevision);
 const patch=await readFile(new URL('./office-anchor-source.patch',import.meta.url),'utf8');assert.equal((patch.match(/^diff --git /gm)??[]).length,1);assert.match(patch,/SLAM\/PoseGraph\/RGBDGraphMeasurements\.mo/);
 assert.match(patch,/^-  constant Boolean loopAnchoredCapture = false;/m);assert.match(patch,/^\+  constant Boolean loopAnchoredCapture = true;/m);
});
test('actual comparison IIFE boots without World, renderer or application runtime',async()=>{
 const raw={name:'raw-text',setup(b){b.onResolve({filter:/\?raw$/},a=>({path:resolve(a.resolveDir,a.path.slice(0,-4)),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async a=>({contents:await readFile(a.path,'utf8'),loader:'text'}));}};
 const result=await build({entryPoints:['scripts/office-compare.browser.ts'],bundle:true,format:'iife',platform:'browser',write:false,metafile:true,plugins:[raw]});
 assert.equal(Object.keys(result.metafile.inputs).some(name=>/world(?:\.|-)|runtime\.ts$|modelica-slam\.worker/.test(name)),false);
 const context=vm.createContext({TextDecoder,TextEncoder,Uint8Array,Map,Set,ArrayBuffer,DataView,structuredClone,performance,crypto,fetch,URL,Response,Blob,DecompressionStream});vm.runInContext(result.outputFiles[0].text,context);
 assert.equal(typeof context.OfficeCompare.initialize,'function');assert.equal(typeof context.OfficeCompare.epoch,'function');
});
