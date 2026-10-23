import{exact,OFFICE_REPLAY}from'./office-replay-contract.mjs';
export const QUALIFIED_BASELINE=Object.freeze({repository:'CogniPilot/slam_web',runId:'39921157453',head:'43148671d4a77aa89aa2d4df276b016047ae5d6c',
 artifactId:12488340648,artifactName:'office-loop-software-39921157453-1',archiveBytes:856660448,
 archiveSha256:'da3d84548df81cb1df08913eefcf9bf201869e312f154685d7bfe5100f63e72c',
 sealManifestSha256:'a519c154127029491655a78b209eebc0f8360b545e7f571563f6b964af334178'});
// Frozen from all 1,251 baseline frames, before a candidate run: no frame before
// 1206 has graph refusal4, sequential7/11 and two distinct verified references.
export const FIRST_POTENTIAL_ANCHOR=1206;
export const prefixSnapshot=(epoch,side)=>epoch<FIRST_POTENTIAL_ANCHOR||(epoch===FIRST_POTENTIAL_ANCHOR&&side==='previous');
export function requireCandidateContract(c){
 for(const name of ['manifestSha256','baseSourceSha256','profileSourceSha256','referenceExporterSha256'])if(!/^[a-f0-9]{64}$/.test(c?.[name]??''))throw Error('Incomplete candidate contract: '+name);
 exact(c.canonicalRevision,'34c26cb4b3ad6f16a072582115acc68d35178d1f','Reviewed experimental revision');
 exact(c.canonicalParent,'3e04d9ed9b29888bdb61ee91167d71b38df81389','Reviewed canonical parent');
 exact(c.canonicalTree,'2fbaf4097235a7b27ba007eabe1f98150320f2ae','Reviewed canonical source tree');
 exact(c.exporterRevision,'278475ff0d39f648f7b98c76abdc4da9a712ee62','Pinned native exporter source');
 exact(c.referenceExporterSha256,'418a97c2284e61d9b88a69b4ed3fd5dd520c16ae6d18d12df96b3a51a388683c','Qualified local reference exporter');
 exact(c.resetSha256,'6e614cc25574c99a4c9659184c974b813f95fb954ff81399499a5a0ead6be4b1','Original reset');
 exact(c.change,'loopAnchoredCapture false->true; isolated comparison comment only','Reviewed source scope');
}
export function requireCandidateProfile(manifest,original,c){
 requireCandidateContract(c);
 exact(manifest.baseSourceSha256,c.baseSourceSha256,'Candidate canonical composition');
 const profile=manifest.profiles?.['424x240'],baseline=original.profiles?.['424x240'];
 exact(profile?.sourceSha256,c.profileSourceSha256,'Candidate 424 source');
 for(const key of ['initialize','step']){
  const a=profile.models[key],b=baseline.models[key];
  exact(a.model,b.model,'Public model identity');exact(a.state,b.state,'Declared state names/count');
  exact(a.state_runs.map(({name,lane,count})=>({name,lane,count})),b.state_runs.map(({name,lane,count})=>({name,lane,count})),'Declared named-state domain/order');
  const shape=slots=>Object.fromEntries(Object.entries(slots).map(([name,{lane,count}])=>[name,{lane,count}]));
  exact(shape(a.inputs),shape(b.inputs),'Original input names/lanes/counts');exact(a.parameters,b.parameters,'Original public parameter metadata');
  const outputs=x=>x.map(({name,lane})=>({name,lane})).sort((a,b)=>a.name.localeCompare(b.name));
  exact(outputs(a.outputs),outputs(b.outputs),'Original declared scalar outputs');
  const arrays=x=>x.map(({name,count})=>({name,count})).sort((a,b)=>a.name.localeCompare(b.name));
  exact(arrays(a.model_outputs),arrays(b.model_outputs),'Original declared array outputs');
 }
 exact(profile.models.initialize.files.state_init.sha256,c.resetSha256,'Delivered source reset');
}
export function requireCompleteComparison(receipt){
 if(receipt.status!=='complete'||receipt.completedFrames!==1251||receipt.prefixFrames!==1206||receipt.prefixSnapshotChecks!==15
  ||receipt.chromium!==OFFICE_REPLAY.chromium||receipt.originalReplayFilesVerified!==3850
  ||receipt.snapshots.length!==18||OFFICE_REPLAY.snapshots.some(epoch=>['previous','next'].some(side=>receipt.snapshots.filter(s=>s.epoch===epoch&&s.side===side).length!==1)))
  throw Error('Incomplete comparison; no qualified prefix or full candidate capture');
 return true;
}
