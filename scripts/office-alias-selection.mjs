// Selection only. Native identity/status determines membership; no truth,
// estimated pose, image content or offline registration outcome is inspected.
import {nativeTraceValue} from './office-pair-adapter.mjs';

export const aliasPolicy=Object.freeze({version:1,startEpoch:0,endEpochExclusive:1175,
  endTimeExclusive:235,expectedFrames:1251,capacity:350,maxRanks:4,
  defaultMaxCases:64,maximumCases:4700,order:'current-epoch-then-native-rank',
  matcherReasons:Object.freeze([0,6,7,8,9,11])});

export function nativeAliasRequests(sample){
  const epoch=sample.sequence,trace=sample.nativeTrace,cases=[],events=[];
  if(!Number.isSafeInteger(epoch)||sample.index!==epoch||epoch<0||epoch>=aliasPolicy.expectedFrames
      ||!Number.isFinite(sample.time)||Math.abs(sample.time-epoch/5)>1e-7)
    throw Error('Invalid capture epoch/time');
  if(epoch>=aliasPolicy.endEpochExclusive)return {cases,events:[{status:'excluded-late-window'}]};
  if(trace?.status!==0||trace.inputs?.imageEpoch?.[0]!==epoch)throw Error('Missing successful matching-epoch native trace');
  if(trace.inputs.imageRequested!==undefined&&trace.inputs.imageRequested[0]!==1)throw Error('Native trace is not an image-on observation');
  const attempted=nativeTraceValue(trace,'loopAttempted'),count=nativeTraceValue(trace,'loopCandidateCount');
  if(attempted!==true&&attempted!==1){
    events.push({status:attempted===false||attempted===0?'not-requested':'missing-native-attempt-flag',candidateCount:count??null});
    return {cases,events};
  }
  if(!Number.isSafeInteger(count)||count<0||count>aliasPolicy.maxRanks)
    return {cases,events:[{status:'invalid-native-candidate-count'}]};
  if(count===0)return {cases,events:[{status:'absent-native-candidates'}]};
  for(let rank=0;rank<count;rank++){
    const referenceId=nativeTraceValue(trace,'loopCandidateReferenceId',rank);
    const currentId=nativeTraceValue(trace,'loopCandidateCurrentId',rank);
    const reason=nativeTraceValue(trace,'loopCandidateReason',rank);
    if(!Number.isSafeInteger(referenceId)||referenceId<1||!Number.isSafeInteger(currentId)
        ||currentId!==trace.previousCatalog?.nextId||referenceId>=currentId
        ||!Number.isSafeInteger(reason)||reason<0||reason>11){
      events.push({status:'invalid-native-candidate-identity',rank});continue;
    }
    if(!aliasPolicy.matcherReasons.includes(reason)){
      events.push({status:'unattempted-before-matcher',rank,referenceId,currentId,nativeReason:reason});continue;
    }
    const references=(trace.references??[]).filter(ref=>ref.id===referenceId),pointer=references.length===1?references[0]:null;
    const binding=pointer&&Number.isSafeInteger(pointer.epoch)&&pointer.epoch>=0&&pointer.epoch<epoch
      &&Number.isSafeInteger(pointer.generation)&&pointer.generation>=1&&Number.isFinite(pointer.time)
      &&Math.abs(pointer.time-pointer.epoch/5)<1e-7&&/^[a-f0-9]{64}$/.test(pointer.sha256??'');
    const matched=nativeTraceValue(trace,'loopCandidateMatchedCount',rank);
    const baselineStatus=matched===undefined?'missing':Number.isSafeInteger(matched)&&matched>=0&&matched<=350?'present':'invalid';
    cases.push({key:`epoch-${epoch}-rank-${rank}-reference-${referenceId}-current-${currentId}`,
      currentEpoch:epoch,currentId,time:sample.time,rank,referenceId,
      referenceEpoch:binding?pointer.epoch:null,referenceGeneration:binding?pointer.generation:null,
      referencePayloadSha256:binding?pointer.sha256:null,referenceBinding:binding?'bound':'missing-or-invalid',
      nativeReason:reason,nativeMatchedCount:baselineStatus==='present'?matched:null,baselineStatus});
  }
  return {cases,events};
}

export function checkAliasLimit(value){
  if(!Number.isSafeInteger(value)||value<0||value>aliasPolicy.maximumCases)throw Error('Invalid alias case limit');
  return value;
}

export function parseAliasOptions(args,{selection=false}={}){
  const options={seconds:selection?60:120,...(selection?{maxCases:aliasPolicy.defaultMaxCases}:{})};
  for(let i=0;i<args.length;i+=2){
    const name=args[i],value=Number(args[i+1]);
    if(name==='--seconds'&&Number.isFinite(value)&&value>0&&value<=600)options.seconds=value;
    else if(selection&&name==='--max-cases')options.maxCases=checkAliasLimit(value);
    else throw Error('Invalid alias option '+name);
  }
  return options;
}
