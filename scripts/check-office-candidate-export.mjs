import{readFile,writeFile,mkdir}from'node:fs/promises';import{join}from'node:path';import{createHash}from'node:crypto';import{exact}from'./office-replay-contract.mjs';import{requireCandidateContract}from'./office-compare-contract.mjs';
const[root,compilerFile,baselineFile,contractFile,output]=process.argv.slice(2);if(!output||process.argv.length!==7)throw Error('Usage: check-office-candidate-export.mjs EXPORT COMPILER_RECEIPT BASELINE_RECEIPT CONTRACT NEW_OUTPUT');await mkdir(output);
const compiler=JSON.parse(await readFile(compilerFile)),baseline=JSON.parse(await readFile(baselineFile)),contract=JSON.parse(await readFile(contractFile));requireCandidateContract(contract);
exact(compiler.status,'built-unqualified','Fresh CI compiler build');exact(compiler.revision,contract.exporterRevision,'CI compiler source');
exact(baseline.status,'pass','Mandatory baseline parity');exact(baseline.mismatches,[],'No baseline mismatches');exact(baseline.binarySha256,compiler.binarySha256,'Same qualified CI exporter');
exact(baseline.captureManifestSha256,'026a141c66af20f1d505938404127ab6f0e30e168b7fb28ec5e51dd96d5b1ea1','Baseline original native manifest');
const profile=JSON.parse(await readFile(join(root,'profiles/424x240/profile.json')));
for(const[name,wanted]of Object.entries({resolution:'424x240',binarySha256:compiler.binarySha256,revision:contract.exporterRevision,modelicaRevision:contract.canonicalRevision,resetSha256:contract.resetSha256,baseSourceSha256:contract.baseSourceSha256,sourceSha256:contract.profileSourceSha256}))exact(profile[name],wanted,'Candidate source identity '+name);
const source=await readFile(join(root,'profiles/424x240/source.mo'));exact(createHash('sha256').update(source).digest('hex'),contract.profileSourceSha256,'Actual emitted source text');
const report={status:'candidate-export-identity-pass',binarySha256:compiler.binarySha256,exporterRevision:compiler.revision,canonicalRevision:contract.canonicalRevision,profileSourceSha256:profile.sourceSha256,baselineParity:true,
 scope:'Fresh CI exporter is baseline-qualified and candidate export is source-bound. Candidate replay/closure acceptance remains unproved.'};
await writeFile(join(output,'receipt.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
