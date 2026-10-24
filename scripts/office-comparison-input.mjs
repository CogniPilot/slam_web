import{readFile,realpath}from'node:fs/promises';import{createReadStream}from'node:fs';import{join,sep}from'node:path';import{createHash}from'node:crypto';import{gunzipSync}from'node:zlib';
import{exact,requireCompleteReplay}from'./office-replay-contract.mjs';import{activeReplayPin}from'./office-phase-b-replay-pin.mjs';import{QUALIFIED_BASELINE,requireCandidateProfile}from'./office-compare-contract.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function verifyOfficeComparisonInput(inputArg,assetsArg,contractArg){
 const input=await realpath(inputArg),assets=await realpath(assetsArg),capture=join(input,'input/original/capture');
 const seal=await readFile(join(input,'SHA256SUMS'));exact(sha(seal),QUALIFIED_BASELINE.sealManifestSha256,'Pinned qualified replay seal');const files=new Map();
 for(const line of seal.toString('utf8').trim().split('\n')){
  const[digest,name]=line.split('  '),path=await realpath(join(input,name));if(files.has(name)||!path.startsWith(input+sep))throw Error('Invalid qualified replay seal member');
  const h=createHash('sha256');for await(const part of createReadStream(path))h.update(part);exact(h.digest('hex'),digest,'Qualified replay file '+name);files.set(name,digest);
 }
 exact(files.size,3850,'Qualified baseline sealed files');
 const qualified=JSON.parse(await readFile(join(input,'replay/receipt.json')));requireCompleteReplay(qualified);if(qualified.qualified!==true)throw Error('Baseline state remains unqualified');
 const pipeline=JSON.parse(await readFile(join(input,'pipeline-status.json')));if(pipeline.stage!=='complete'||pipeline.exitCode!==0)throw Error('Baseline pipeline incomplete');
 const manifestBytes=await readFile(join(capture,'native-manifest.json')),baseline=JSON.parse(manifestBytes);
 exact(sha(manifestBytes),'026a141c66af20f1d505938404127ab6f0e30e168b7fb28ec5e51dd96d5b1ea1','Original full native manifest');
 const{candidateBytes,manifest,contract,assetCount}=await verifyCandidateAssets(assets,contractArg,baseline);
 return{input,assets,capture,files,manifestBytes,baseline,candidateBytes,manifest,contract,qualified,assetCount};
}
/** The reviewed candidate: manifest pinned by the contract, profile against the baseline, every decoded asset hash. */
async function verifyCandidateAssets(assets,contractArg,baseline){
 const candidateBytes=await readFile(join(assets,'manifest.json')),manifest=JSON.parse(candidateBytes),contract=JSON.parse(await readFile(contractArg));
 exact(sha(candidateBytes),contract.manifestSha256,'Reviewed local candidate manifest');requireCandidateProfile(manifest,baseline,contract);
 const bindings=new Map();for(const layout of Object.values(manifest.profiles['424x240'].models))for(const binding of Object.values(layout.files)){
  if(bindings.has(binding.file))exact(binding,bindings.get(binding.file),'Shared candidate asset binding');else bindings.set(binding.file,binding);
 }
 for(const[file,binding]of bindings){
  if(!/^[a-f0-9]{16}-[A-Za-z0-9_.-]+$/.test(file))throw Error('Invalid candidate asset filename');
  let bytes=await readFile(join(assets,file));if(binding.encoding==='gzip')bytes=gunzipSync(bytes,{maxOutputLength:binding.bytes});else if(binding.encoding!=='identity')throw Error('Unknown candidate asset encoding');
  exact(bytes.length,binding.bytes,'Candidate decoded asset bytes');exact(sha(bytes),binding.sha256,'Candidate decoded asset hash');
 }
 return{candidateBytes,manifest,contract,assetCount:bindings.size};
}
/** Phase B pass 1 input: the sealed job-1 two-circuit capture artifact, every pin from the granted Phase B pin. */
export async function verifyPhaseBCaptureInput(inputArg,assetsArg,contractArg,pin){
 const input=await realpath(inputArg),assets=await realpath(assetsArg),capture=join(input,'capture');
 const seal=await readFile(join(input,'SHA256SUMS'));exact(sha(seal),pin.sealManifestSha256,'Granted job-1 capture seal');const files=new Map();
 for(const line of seal.toString('utf8').trim().split('\n')){
  const[digest,name]=line.split('  '),path=await realpath(join(input,name));if(files.has(name)||!path.startsWith(input+sep))throw Error('Invalid capture seal member');
  const h=createHash('sha256');for await(const part of createReadStream(path))h.update(part);exact(h.digest('hex'),digest,'Capture file '+name);files.set(name,digest);
 }
 exact(files.size,pin.originalFiles,'Granted job-1 sealed file count');
 const pipeline=JSON.parse(await readFile(join(input,'pipeline-status.json')));if(pipeline.stage!=='complete'||pipeline.exitCode!==0)throw Error('Job-1 pipeline incomplete');
 const origin=JSON.parse(await readFile(join(input,'build-origin.json')));exact(origin.runId,pin.runId,'Job-1 run');exact(origin.head,pin.head,'Job-1 head');
 const captureReceipt=JSON.parse(await readFile(join(capture,'receipt.json')));
 if(captureReceipt.scene!=='office-loop-two-circuit'||captureReceipt.complete!==true)throw Error('Not a complete two-circuit capture');
 const summary=JSON.parse(await readFile(join(input,'summary.json')));
 if(summary.flight?.envelope!=='pass'||summary.flight?.return!=='pass')throw Error('Job-1 flight checks did not pass');
 const manifestBytes=await readFile(join(capture,'native-manifest.json')),baseline=JSON.parse(manifestBytes);
 exact(sha(manifestBytes),captureReceipt.nativeManifestSha256,'Job-1 baseline native manifest');
 const{candidateBytes,manifest,contract,assetCount}=await verifyCandidateAssets(assets,contractArg,baseline);
 return{input,assets,capture,files,manifestBytes,baseline,candidateBytes,manifest,contract,assetCount};
}
/** Rehash every member of a seal manifest under root; returns name -> digest. */
async function sealedFiles(root,seal,label){
 const files=new Map();
 for(const line of seal.toString('utf8').trim().split('\n')){
  const[digest,name]=line.split('  '),path=await realpath(join(root,name));if(files.has(name)||!path.startsWith(root+sep))throw Error('Invalid '+label+' seal member');
  const h=createHash('sha256');for await(const part of createReadStream(path))h.update(part);exact(h.digest('hex'),digest,label+' file '+name);files.set(name,digest);
 }
 return files;
}
/** Phase B pass 2 input: job 3's own qualified baseline replay of the granted capture, and the granted job-2 artifact,
 * whose candidate assets are replayed byte for byte (never rebuilt). */
export async function verifyPhaseBReplayInput(inputArg,pass1Arg,contractArg,mode,candidatePin){
 const input=await realpath(inputArg),pass1=await realpath(pass1Arg),assets=join(pass1,'candidate-assets'),capture=join(input,'input/original/capture');
 const files=await sealedFiles(input,await readFile(join(input,'SHA256SUMS')),'Baseline replay');
 const qualified=JSON.parse(await readFile(join(input,'replay/receipt.json')));requireCompleteReplay(qualified,activeReplayPin());
 if(qualified.qualified!==true)throw Error('Phase B baseline replay remains unqualified');
 const pipeline=JSON.parse(await readFile(join(input,'pipeline-status.json')));if(pipeline.stage!=='complete'||pipeline.exitCode!==0)throw Error('Baseline replay pipeline incomplete');
 exact(createHash('sha256').update(await readFile(join(input,'input/original/SHA256SUMS'))).digest('hex'),mode.pin.sealManifestSha256,'Granted job-1 capture seal');
 const pass1Seal=await readFile(join(pass1,'SHA256SUMS'));exact(sha(pass1Seal),candidatePin.sealManifestSha256,'Granted job-2 seal');
 const pass1Files=await sealedFiles(pass1,pass1Seal,'Job-2');exact(pass1Files.size,candidatePin.originalFiles,'Granted job-2 sealed file count');
 const pass1Pipeline=JSON.parse(await readFile(join(pass1,'pipeline-status.json')));if(pass1Pipeline.stage!=='complete'||pass1Pipeline.exitCode!==0)throw Error('Job-2 pipeline incomplete');
 const pass1Receipt=JSON.parse(await readFile(join(pass1,'comparison/receipt.json')));
 if(pass1Receipt.status!=='complete'||pass1Receipt.phaseB?.pass!==1||pass1Receipt.phaseB.captureRun!==mode.pin.runId||pass1Receipt.phaseB.B!==mode.B)throw Error('Job-2 pass 1 does not match this capture');
 exact(sha(await readFile(join(pass1,'plan/plan-receipt.json'))),mode.pin.snapshotPlanSha256,'Job-2 sealed plan');
 const manifestBytes=await readFile(join(capture,'native-manifest.json')),baseline=JSON.parse(manifestBytes);
 const{candidateBytes,manifest,contract,assetCount}=await verifyCandidateAssets(assets,contractArg,baseline);
 exact(sha(candidateBytes),candidatePin.candidateManifestSha256,'Granted job-2 candidate manifest');
 return{input,assets,capture,files,manifestBytes,baseline,candidateBytes,manifest,contract,qualified,assetCount,pass1};
}
