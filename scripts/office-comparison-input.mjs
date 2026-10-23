import{readFile,realpath}from'node:fs/promises';import{createReadStream}from'node:fs';import{join,sep}from'node:path';import{createHash}from'node:crypto';import{gunzipSync}from'node:zlib';
import{exact,requireCompleteReplay}from'./office-replay-contract.mjs';import{QUALIFIED_BASELINE,requireCandidateProfile}from'./office-compare-contract.mjs';
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
 return{input,assets,capture,files,manifestBytes,baseline,candidateBytes,manifest,contract,qualified,assetCount:bindings.size};
}
