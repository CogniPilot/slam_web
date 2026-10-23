import {aliasPolicy} from './office-alias-selection.mjs';

// Freeze records a contiguous non-late frame prefix, not just selected current
// frames. References must be covered by this same immutable hash inventory.
export function validateFrozenFrameInventory(manifest){
  const coverage=manifest.coverage,rows=manifest.frameInventory;
  const scanned=coverage?.scannedNonLateFrames,recorded=coverage?.recordedFrames;
  if(!Number.isSafeInteger(recorded)||recorded<0||recorded>aliasPolicy.expectedFrames
      ||!Number.isSafeInteger(scanned)||scanned<0||scanned>Math.min(recorded,aliasPolicy.endEpochExclusive)
      ||coverage.recordedNonLateFrames!==Math.min(recorded,aliasPolicy.endEpochExclusive)
      ||coverage.selectionScanComplete!==(scanned===coverage.recordedNonLateFrames)
      ||!Array.isArray(rows)||rows.length!==scanned)
    throw Error('Invalid frozen frame inventory coverage/shape');
  const hashes=new Map();
  for(const [epoch,row] of rows.entries()){
    if(row?.epoch!==epoch||typeof row.sha256!=='string'||!/^[a-f0-9]{64}$/.test(row.sha256))
      throw Error('Invalid frozen frame inventory order, duplicate, epoch or hash');
    hashes.set(epoch,row.sha256);
  }
  for(const entry of [...manifest.cases,...manifest.omittedCases]){
    if(!hashes.has(entry.currentEpoch)||hashes.get(entry.currentEpoch)!==entry.frameSha256)
      throw Error('Frozen current frame binding differs from frame inventory');
    if(entry.referenceBinding==='bound'&&(!Number.isSafeInteger(entry.referenceEpoch)
        ||entry.referenceEpoch<0||entry.referenceEpoch>=entry.currentEpoch||!hashes.has(entry.referenceEpoch)))
      throw Error('Frozen reference epoch is not covered by frame inventory');
  }
  return hashes;
}
