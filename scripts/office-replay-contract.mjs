// Fixed saved-observation experiment. No numerical tolerance is applied.
export const OFFICE_REPLAY=Object.freeze({repository:'CogniPilot/slam_web',runId:'39910422572',
 head:'73323cd717b085c689bb5b0bbc4e1e76af33e1e2',artifactId:12483154021,
 artifactName:'office-loop-software-39910422572-1',archiveBytes:414579406,
 archiveSha256:'f868789c6c3170b267bc2a1b35664ef36bc228ea6ffcb19f4a585dbd5d8c25d8',
 sealManifestSha256:'7b927d81fbfa7079f42397541bb33b1a0d029788cafd057905ea2298c10ae3b8',
 chromium:'154.0.8037.92',frames:1251,snapshots:Object.freeze([80,90,121,122,1175,1200,1205,1206,1250]),
 staleSealSha256:'88b1420f9c1ecb3ced654d6e77cff7b342e5b33fcea2be60239d1b5869f47b88'});
const numberBits=value=>{const b=new ArrayBuffer(8),v=new DataView(b);v.setFloat64(0,value,false);return v.getBigUint64(0,false).toString(16).padStart(16,'0');};
export function firstExactDifference(actual,expected,path='$'){
 if(Object.is(actual,expected))return null;
 if(typeof actual!==typeof expected||actual===null||expected===null||typeof actual!=='object')
  return {path,actual,expected,...(typeof actual==='number'&&typeof expected==='number'?{actualHex:numberBits(actual),expectedHex:numberBits(expected)}:{})};
 if(Array.isArray(actual)!==Array.isArray(expected))return{path,kind:'array/object differs'};
 if(Array.isArray(actual)&&actual.length!==expected.length)return{path,kind:'array length differs',actualLength:actual.length,expectedLength:expected.length};
 const a=Object.keys(actual).sort(),b=Object.keys(expected).sort();
 if(a.length!==b.length||a.some((k,i)=>k!==b[i]))return{path,kind:'keys differ',actualKeys:a,expectedKeys:b};
 for(const key of a){const difference=firstExactDifference(actual[key],expected[key],path+'.'+key);if(difference)return difference;}
 return null;
}
export function exact(actual,expected,label){const difference=firstExactDifference(actual,expected);if(difference){const error=new Error(label+': '+difference.path);error.difference={label,...difference};throw error;}}
// Original observations are JSON, which encodes -0 as 0 and nonfinite Numbers
// as null. Compare exactly in that recorded domain, never with an epsilon.
export function capturedEncoding(value){return JSON.parse(JSON.stringify(value));}
export function exactCaptured(actual,expected,label){exact(capturedEncoding(actual),expected,label);}
export function presented(estimate){
 const result={};for(const name of ['x','y','z','quaternion','diagnostics','poseGraph','loopClosure'])if(name in estimate)result[name]=structuredClone(estimate[name]);
 // Wall-clock measurements have no deterministic native baseline.
 if(result.diagnostics)for(const key of ['stepMsMax','stepMsTotal'])delete result.diagnostics[key];
 return result;
}
export function requireCompleteReplay(receipt,pin=OFFICE_REPLAY){
 // Phase A pins 3800 original files; a Phase B pin names its own sealed count.
 const originalFiles=pin===OFFICE_REPLAY?3800:pin.originalFiles;
 if(receipt.status!=='pass'||receipt.verifiedFrames!==pin.frames||receipt.chromium!==pin.chromium
   ||receipt.originalFilesVerified!==originalFiles||receipt.sourceHead!==pin.head
   ||receipt.snapshotEpochs.length!==pin.snapshots.length||receipt.snapshotEpochs.some((v,i)=>v!==pin.snapshots[i])
   ||receipt.snapshots.length!==pin.snapshots.length*2
   ||pin.snapshots.some(epoch=>['previous','next'].some(side=>receipt.snapshots.filter(s=>s.epoch===epoch&&s.side===side).length!==1)))throw Error('Replay baseline is incomplete; snapshots remain unqualified');
 return true;
}
