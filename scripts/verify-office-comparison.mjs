// Readonly preflight. No browser, native entry or geometry evaluation.
import{writeFile,mkdir}from'node:fs/promises';import{join}from'node:path';import{verifyOfficeComparisonInput}from'./office-comparison-input.mjs';
const[input,assets,contract,output]=process.argv.slice(2);if(!output||process.argv.length!==6)throw Error('Usage: verify-office-comparison.mjs QUALIFIED_REPLAY CANDIDATE_ASSETS CONTRACT NEW_OUTPUT');await mkdir(output);
const result=await verifyOfficeComparisonInput(input,assets,contract);
const receipt={status:'preflight-pass',originalReplayFilesVerified:result.files.size,candidateAssetsVerified:result.assetCount,candidate:result.contract,
 scope:'Readonly identity/schema/data checks only. No new replay, proposal, anchor, loop-edge or correction acceptance.'};
await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
