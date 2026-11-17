// Freeze native case membership before extraction, offline probes or labels.
import {readFile,writeFile,mkdir,realpath,stat,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {sha256} from './loop-consensus-probe.mjs';
import {aliasPolicy,nativeAliasRequests,parseAliasOptions} from './office-alias-selection.mjs';

const [captureArg,outputArg,...args]=process.argv.slice(2);
if(!captureArg||!outputArg)throw Error('Usage: freeze-office-alias-controls.mjs CAPTURE NEW_SELECTION [--max-cases N] [--seconds N]');
const limits=parseAliasOptions(args,{selection:true}),capture=await realpath(captureArg),output=resolve(outputArg);
await mkdir(output);const started=performance.now();
const receipt={schemaVersion:1,status:'running',limits,scope:'Frozen unlabelled native candidate controls, not proven aliases or closure evidence.'};
async function saveReceipt(){
  await writeFile(join(output,'selection-receipt.json.tmp'),JSON.stringify(receipt,null,2)+'\n');
  await rename(join(output,'selection-receipt.json.tmp'),join(output,'selection-receipt.json'));
}
await saveReceipt();
try{
  const captureBytes=await readFile(join(capture,'receipt.json')),captureReceipt=JSON.parse(captureBytes);
  const nativeBytes=await readFile(join(capture,'native-manifest.json'));
  const frames=captureReceipt.framesCompleted;
  if(!Number.isSafeInteger(frames)||frames<0||frames>aliasPolicy.expectedFrames
      ||frames>0&&(captureReceipt.firstTime!==0||!Number.isFinite(captureReceipt.lastTime)
        ||Math.abs(captureReceipt.lastTime-(frames-1)/5)>1e-7)
      ||captureReceipt.complete&&(frames!==aliasPolicy.expectedFrames||captureReceipt.failure))
    throw Error('Invalid capture prefix receipt');
  const captureComplete=captureReceipt.complete===true&&!captureReceipt.failure;
  const inventory=[],events=[],frameInventory=[];let scanned=0;
  const scanEnd=Math.min(frames,aliasPolicy.endEpochExclusive);
  receipt.scanProgress={recordedFrames:frames,scannedNonLateFrames:0,recordedNonLateFrames:scanEnd};
  await saveReceipt();
  for(let epoch=0;epoch<scanEnd;epoch++){
    if(performance.now()-started>=limits.seconds*1000)break;
    const path=join(capture,'frames',String(epoch).padStart(4,'0')+'.json');
    if((await stat(path)).size>8*1024**2)throw Error('Oversized capture frame metadata');
    const bytes=await readFile(path);
    const sample=JSON.parse(bytes);if(sample.sequence!==epoch)throw Error('Frame filename/epoch mismatch');
    const selected=nativeAliasRequests(sample);
    const hash=sha256(bytes);frameInventory.push({epoch,sha256:hash});
    inventory.push(...selected.cases.map(entry=>({...entry,frameSha256:hash})));
    events.push(...selected.events.map(entry=>({currentEpoch:epoch,...entry})));scanned++;
    receipt.scanProgress.scannedNonLateFrames=scanned;
    if(scanned%25===0)await saveReceipt();
  }
  const cases=inventory.slice(0,limits.maxCases),omittedCases=inventory.slice(limits.maxCases);
  const coverage={captureComplete,recordedFrames:frames,expectedFrames:aliasPolicy.expectedFrames,
    eligibleCasesObserved:inventory.length,selectedCases:cases.length,omittedByCaseLimit:omittedCases.length,
    scannedNonLateFrames:scanned,recordedNonLateFrames:scanEnd,selectionScanComplete:scanned===scanEnd,
    unscannedRecordedNonLateEpochs:{first:scanned,endExclusive:scanEnd,count:scanEnd-scanned},
    unrecordedNonLateEpochs:{first:scanEnd,endExclusive:aliasPolicy.endEpochExclusive,count:aliasPolicy.endEpochExclusive-scanEnd},
    excludedLateWindow:{first:aliasPolicy.endEpochExclusive,endExclusive:aliasPolicy.expectedFrames},
    selectionIssues:events.filter(e=>e.status.startsWith('invalid-')||e.status==='missing-native-attempt-flag').length,
    unattemptedFrames:events.filter(e=>e.status==='not-requested').length,
    emptyAttemptedQueries:events.filter(e=>e.status==='absent-native-candidates').length,
    preMatcherCandidatesExcluded:events.filter(e=>e.status==='unattempted-before-matcher').length};
  const selectionSource={};
  for(const name of ['office-alias-selection.mjs','freeze-office-alias-controls.mjs'])
    selectionSource[name]=sha256(await readFile(new URL('./'+name,import.meta.url)));
  const manifest={schemaVersion:1,kind:'office-native-alias-controls',policy:aliasPolicy,limits,
    selectionSource,
    capture:{receiptSha256:sha256(captureBytes),nativeManifestSha256:sha256(nativeBytes),captureComplete},
    coverage,frameInventory,cases,omittedCases,events,
    scope:'Actual non-late native attempts in epoch/rank order. No truth labels, pose-based selection or offline probe results. A case is not yet a confirmed alias.'};
  const bytes=Buffer.from(JSON.stringify(manifest)+'\n'),hash=sha256(bytes);
  await writeFile(join(output,'case-manifest.json'),bytes,{flag:'wx'});
  await writeFile(join(output,'case-manifest.sha256'),hash+'  case-manifest.json\n',{flag:'wx'});
  Object.assign(receipt,{status:captureComplete&&scanned===scanEnd?'frozen':'frozen-partial',manifestSha256:hash,coverage});
}catch(error){receipt.status='failed';receipt.failure=String(error);process.exitCode=1;}
finally{
  receipt.elapsedMs=performance.now()-started;
  await saveReceipt();
  console.log(JSON.stringify(receipt));
}
