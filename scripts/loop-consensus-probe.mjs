// Offline research only. Compile the shipped consensus owner unchanged, or add
// observation outputs to a private source string. Never edit published models.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {rgbdSlamSourceManifest} from '../src/modelica-slam-source-manifest.mjs';
import {researchNativeProgram} from './research-native-program.mjs';

export const sha256=value=>createHash('sha256').update(value).digest('hex');
export const consensusDefaults=Object.freeze({requested:1,seed:7,trials:96,refinements:4,
  minimumInliers:12,minimumFraction:0.5,inlierDistance:0.08,maximumRms:0.03,
  coordinateLimit:100,rankTolerance:1e-8,calibratedResiduals:1,
  maximumNormalizedSquared:9,minimumPivot:1e-10});
export const resultNames=Object.freeze(['valid','reason','rotation','translation','mask','matches','inliers','rms','nextSeed']);
const diagnosticNames=['bestCount','bestCost','refinementCount','lastFitAccepted'];

function once(text,before,after){
  if(text.split(before).length!==2)throw Error('Consensus source anchor changed: '+before);
  return text.replace(before,after);
}
export function instrumentConsensus(text){
  const start=text.indexOf('  function Consensus\n'),end=text.indexOf('  end Consensus;',start);
  if(start<0||end<start)throw Error('Consensus owner not found');
  let owner=text.slice(start,end);
  owner=once(owner,'    output Real rms; output Integer nextSeed;',
    '    output Real rms; output Integer nextSeed;\n'
    +'    output Integer bestCount; output Real bestCost;\n'
    +'    output Integer refinementCount; output Boolean lastFitAccepted;');
  owner=once(owner,'Integer count; Integer bestCount;','Integer count;');
  owner=once(owner,'Real cost; Real bestCost;','Real cost;');
  owner=once(owner,'    valid := false; rejectionReason := 1;',
    '    bestCount := 0; bestCost := 0.0; refinementCount := 0; lastFitAccepted := false;\n'
    +'    valid := false; rejectionReason := 1;');
  owner=once(owner,'              if eligible and not stable then\n',
    '              if eligible and not stable then\n                refinementCount := refinementCount+1;\n');
  owner=once(owner,'                eligible := fitAccepted == 1.0;',
    '                lastFitAccepted := fitAccepted == 1.0;\n                eligible := fitAccepted == 1.0;');
  return text.slice(0,start)+owner+text.slice(end);
}

export async function loopConsensusSource(capacity,{diagnostics=false}={}){
  if(!Number.isInteger(capacity)||capacity<3||capacity>350)throw Error('Pair domain must contain 3..350 slots');
  const entries=await Promise.all(rgbdSlamSourceManifest.paths.map(async path=>{
    const text=await readFile(new URL('../'+path,import.meta.url),'utf8');
    return {path,text,sha256:sha256(text)};
  }));
  const original=entries.map(entry=>entry.text).join(rgbdSlamSourceManifest.separator);
  const text=diagnostics?instrumentConsensus(original):original;
  const wrapper=`
model LoopConsensusProbe
  input Real sourcePoint[${capacity},3]; input Real targetPoint[${capacity},3];
  input Real pairEnabled[${capacity}];
  input Real sourceCovariance[${capacity},3,3] = zeros(${capacity},3,3);
  input Real targetCovariance[${capacity},3,3] = zeros(${capacity},3,3);
${Object.entries(consensusDefaults).map(([key,value])=>'  input Real '+key+' = '+value+';').join('\n')}
  output Boolean valid; output Integer reason;
  output Real rotation[3,3]; output Real translation[3]; output Real mask[${capacity}];
  output Integer matches; output Integer inliers; output Real rms; output Integer nextSeed;
${diagnostics?'  output Integer bestCount; output Real bestCost; output Integer refinementCount; output Boolean lastFitAccepted;':''}
equation
  (${[...resultNames,...(diagnostics?diagnosticNames:[])].join(',')}) = RGBDLoopVerification.Consensus(
    sourcePoint,targetPoint,pairEnabled,noEvent(requested > 0.5),noEvent(integer(seed)),noEvent(integer(trials)),noEvent(integer(refinements)),
    noEvent(integer(minimumInliers)),minimumFraction,inlierDistance,maximumRms,coordinateLimit,rankTolerance,
    calibratedResiduals=noEvent(calibratedResiduals > 0.5),sourceCovariance=sourceCovariance,
    targetCovariance=targetCovariance,maximumNormalizedSquared=maximumNormalizedSquared,minimumPivot=minimumPivot);
end LoopConsensusProbe;
`;
  return {source:text+wrapper,originalSourceSha256:sha256(original),
    sources:entries.map(({path,sha256})=>({path,sha256})),capacity,diagnostics};
}

export async function instantiateConsensusProbe(artifact,source){
  const program=await researchNativeProgram(artifact,source);
  function output(name){
    const typed=artifact.derived_outputs?.filter(slot=>slot.name===name);
    if(typed?.length){
      const view=new DataView(program.memory.buffer),base=artifact.abi.output_lanes_offset;
      return typed.map(slot=>slot.representation==='u8'?Boolean(view.getUint8(base+slot.byte_offset))
        :slot.representation==='i64'?Number(view.getBigInt64(base+slot.byte_offset,true))
        :view.getFloat64(base+slot.byte_offset,true));
    }
    return [...program.output(name)];
  }
  return {run(frame){
    for(const name of ['sourcePoint','targetPoint','pairEnabled'])if(!Object.hasOwn(frame,name))throw Error('Missing probe input '+name);
    const controls={...consensusDefaults,...frame};
    for(const name of ['seed','trials','refinements','minimumInliers'])if(!Number.isInteger(controls[name]))throw Error('Expected Integer control '+name);
    for(const name of ['requested','calibratedResiduals'])if(![0,1].includes(controls[name]))throw Error('Expected Boolean control '+name);
    for(const [name,value] of Object.entries({...consensusDefaults,...frame})){
      const values=[value].flat(3),input=program.input(name);
      if(input.length!==values.length||values.some(v=>typeof v!=='number'||!Number.isFinite(v)))
        throw Error('Invalid probe input '+name);
      input.set(values);
    }
    // Reset covariance on each call; an omitted field must not reuse a prior case.
    for(const name of ['sourceCovariance','targetCovariance'])if(frame[name]===undefined)program.input(name).fill(0);
    const p=new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8),before=sha256(p);
    program.evaluate(0);
    if(sha256(p)!==before)throw Error('Native probe mutated readonly inputs');
    return Object.fromEntries([...resultNames,...diagnosticNames.filter(name=>artifact.derived_outputs?.some(slot=>slot.name===name)||artifact.var_layout.bindings[name])]
      .map(name=>{const values=output(name);return [name,values.length===1?values[0]:values];}));
  }};
}

export function consensusFailure(result){
  if(result.valid)return 'accepted';
  if(result.reason===1)return 'not requested';
  if(result.reason===2)return 'invalid configuration';
  if(result.reason===3)return 'invalid pair payload or covariance';
  if(result.reason===4)return 'too few descriptor matches for the inlier floor';
  if(result.reason===6)return 'inlier mask did not stabilize within the refinement budget';
  if(result.reason===5&&result.refinementCount===0)return 'no sampled model met the inlier count and fraction';
  if(result.reason===5&&result.lastFitAccepted===false)return 'refinement fit or weighted solve refused';
  if(result.reason===5&&result.lastFitAccepted===true)return 'refined model fell below the inlier count or fraction';
  return 'consensus or refinement refused';
}
