import {it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NativeProgram,type NativeProgramArtifact} from '../../src/modelica-native-program';
import {fullMatchingFixture,matchingOracle,type MatchingFixture} from './rgbd-feature-matching-fixtures';

// The upstream preparation probe saves the actual issued executable. Running
// its numerical gate separately keeps compile time out of execution timings.
const artifactPath=process.env.RUMOCA_MATCHING_ARTIFACT;
const editedArtifactPath=process.env.RUMOCA_MATCHING_EDITED_ARTIFACT;
const sha=(data:string|Uint8Array)=>createHash('sha256').update(data).digest('hex');

it.skipIf(!artifactPath)('source-issued full350 matcher executes independent reciprocal and rejection controls',async()=>{
  const bytes=readFileSync(artifactPath!);
  const artifact:NativeProgramArtifact=JSON.parse(bytes.toString());
  const source=readFileSync('models/Vision/Matching/RGBDFeatureMatching.mo','utf8');
  expect(artifact.model_name).toBe('RGBDFeatureMatching');
  const program=await NativeProgram.instantiate(artifact,source);
  expect(program.input('referenceDescriptor').length).toBe(350*49);
  expect(program.input('currentDescriptor').length).toBe(350*49);
  const cases:{name:string;count:number;executionMs:number}[]=[];
  let tick=0;
  const run=(name:string,fixture:MatchingFixture)=>{
    const expected=matchingOracle(fixture);
    for(const field of ['referenceDescriptor','currentDescriptor','referencePoint','currentPoint','predictedRotation'] as const)
      program.input(field).set(fixture[field].flat());
    for(const field of ['referenceEnabled','currentEnabled','predictedTranslation'] as const)
      program.input(field).set(fixture[field]);
    for(const field of ['referenceCount','currentCount','usePrediction'] as const)
      program.input(field)[0]=fixture[field];
    const p=new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8);
    const before=sha(p);
    new Float64Array(program.memory.buffer,0,artifact.abi.y_count).fill(NaN);
    const start=performance.now();program.evaluate(++tick/90);
    const executionMs=performance.now()-start;
    expect(sha(p),`${name}: read-only input bytes`).toBe(before);
    for(const field of ['configurationValid','count','invalidReference','invalidCurrent'] as const)
      expect(program.output(field)[0],`${name}/${field}`).toBe(expected[field]);
    for(const field of ['currentIndex','pairEnabled','sourcePoint','targetPoint','nearestDistance','secondDistance'] as const){
      const wanted=expected[field].flat(),actual=program.output(field);
      expect(actual.length,`${name}/${field}`).toBe(wanted.length);
      wanted.forEach((value,index)=>{
        expect(Number.isFinite(actual[index]),`${name}/${field}/${index}`).toBe(true);
        expect(Math.abs(actual[index]-value),`${name}/${field}/${index}`).toBeLessThan(2e-10);
      });
    }
    cases.push({name,count:expected.count,executionMs});
  };
  const baseline=fullMatchingFixture();run('full350 reciprocal permutation',baseline);
  const predicted=structuredClone(baseline);predicted.usePrediction=1;
  run('full350 optical prediction',predicted);
  const sparse=structuredClone(baseline);
  sparse.referenceEnabled=sparse.referenceEnabled.map((_,i)=>+(i%3===2));
  run('sparse accepted partners in late slots',sparse);
  const ambiguous=structuredClone(baseline);
  ambiguous.currentDescriptor[1]=[...ambiguous.currentDescriptor[0]];
  run('equal nearest distances are ambiguous',ambiguous);
  const duplicate=structuredClone(baseline);
  duplicate.referenceDescriptor[1]=[...duplicate.referenceDescriptor[0]];
  run('reciprocal ownership resolves duplicate references',duplicate);
  for(const count of [-1,350.5,351,NaN,Infinity]){
    const invalid=structuredClone(baseline);invalid.referenceCount=count;
    run(`invalid count ${String(count)}`,invalid);
  }
  const hidden=structuredClone(baseline);
  hidden.currentEnabled[349]=0;hidden.currentDescriptor[349][0]=NaN;
  run('disabled nonfinite descriptor',hidden);
  hidden.currentEnabled[349]=1;run('active nonfinite descriptor',hidden);
  const huge=structuredClone(baseline);huge.referencePoint[349][0]=1e150;
  run('huge coordinate rejected before geometry',huge);
  const reflection=structuredClone(predicted);reflection.predictedRotation[0][0]=-1;
  run('reflection prediction clears matches',reflection);
  const outside=structuredClone(predicted);outside.predictedTranslation[0]=10;
  run('geometric prediction rejects distant pairs',outside);
  const sole=structuredClone(baseline);sole.currentCount=1;
  run('one candidate cannot pass ratio test',sole);
  run('full350 recovery',baseline);program.reset();tick=0;
  run('reset full350 replay',baseline);
  await expect(NativeProgram.instantiate(artifact,source+'\n// source edit')).rejects.toThrow('does not match its source');
  const restored=await NativeProgram.instantiate(JSON.parse(JSON.stringify(artifact)),source);
  for(const name of artifact.input_names)restored.input(name).set(program.input(name));
  restored.evaluate(0);
  expect([...restored.output('currentIndex')]).toEqual([...program.output('currentIndex')]);
  const times:number[]=[];
  for(let i=0;i<5;i++)program.evaluate(++tick/90);
  for(let i=0;i<20;i++){const start=performance.now();program.evaluate(++tick/90);times.push(performance.now()-start);}
  if(process.env.RUMOCA_MATCHING_NUMERICAL_REPORT)writeFileSync(process.env.RUMOCA_MATCHING_NUMERICAL_REPORT,JSON.stringify({
    status:'ACTUAL_NATIVE_MATCHER_FULL350_NUMERICAL_PASS',recordedAt:new Date().toISOString(),
    sourceSha256:sha(source),artifactSha256:sha(bytes),moduleSha256:artifact.module_sha256,
    compiler:artifact.compiler,cases,warmExecutionMs:times,
    meanWarmExecutionMs:times.reduce((sum,value)=>sum+value,0)/times.length,
    jsonReload:true,staleSourceRefused:true,sourceEditNumericalProof:false,
    runtimeIntegrated:false,productionPinChanged:false,fullSlam:false,
    scope:'Actual issued matcher module; excludes preparation, input copies, descriptors, registration, filter, sensors and rendering.'
  },null,2)+'\n');
},120_000);

it.skipIf(!artifactPath||!editedArtifactPath)('actual Modelica ratio edit changes full-capacity matcher results after artifact reload',async()=>{
  const source=readFileSync('models/Vision/Matching/RGBDFeatureMatching.mo','utf8');
  const editedSource=source.replace('ratio = 0.8','ratio = 0.49');
  expect(editedSource).not.toBe(source);
  const baseline:NativeProgramArtifact=JSON.parse(readFileSync(artifactPath!,'utf8'));
  const edited:NativeProgramArtifact=JSON.parse(readFileSync(editedArtifactPath!,'utf8'));
  // Parameters can remain P loads in identical module bytes. The edited
  // source-bound defaults and executed result must change in that case.
  expect(edited.source_sha256).not.toBe(baseline.source_sha256);
  expect(edited.parameters).not.toEqual(baseline.parameters);
  const fixture=fullMatchingFixture();fixture.referenceCount=1;fixture.currentCount=3;
  fixture.referenceDescriptor[0]=[1,...Array(48).fill(0)];
  fixture.currentDescriptor[0]=[Math.cos(.4),Math.sin(.4),...Array(47).fill(0)];
  fixture.currentDescriptor[1]=[Math.cos(.8),Math.sin(.8),...Array(47).fill(0)];
  fixture.currentDescriptor[2]=[-1,...Array(48).fill(0)];
  const run=async(artifact:NativeProgramArtifact,text:string,ratio:number)=>{
    const saved=JSON.parse(JSON.stringify({artifact,source:text}));
    const program=await NativeProgram.instantiate(saved.artifact,saved.source);
    expect(program.input('currentDescriptor').length).toBe(350*49);
    for(const field of ['referenceDescriptor','currentDescriptor','referencePoint','currentPoint','predictedRotation'] as const)
      program.input(field).set(fixture[field].flat());
    for(const field of ['referenceEnabled','currentEnabled','predictedTranslation'] as const)
      program.input(field).set(fixture[field]);
    for(const field of ['referenceCount','currentCount','usePrediction'] as const)program.input(field)[0]=fixture[field];
    fixture.ratio=ratio;const expected=matchingOracle(fixture);
    program.evaluate(0);
    expect(program.output('count')[0]).toBe(expected.count);
    expect([...program.output('currentIndex')]).toEqual(expected.currentIndex);
    return expected.count;
  };
  expect(await run(baseline,source,.8)).toBe(1);
  expect(await run(edited,editedSource,.49)).toBe(0);
  await expect(NativeProgram.instantiate(baseline,editedSource)).rejects.toThrow('does not match its source');
  if(process.env.RUMOCA_MATCHING_EDIT_REPORT)writeFileSync(process.env.RUMOCA_MATCHING_EDIT_REPORT,JSON.stringify({
    status:'ACTUAL_MODELICA_MATCHER_RATIO_EDIT_RELOAD_PASS',recordedAt:new Date().toISOString(),
    sourceSha256:sha(source),editedSourceSha256:sha(editedSource),baselineModuleSha256:baseline.module_sha256,
    editedModuleSha256:edited.module_sha256,capacity:350,descriptorSize:49,
    baselineCount:1,editedCount:0,staleSourceRefused:true,jsonReload:true,
    runtimeIntegrated:false,productionPinChanged:false,fullSlam:false
  },null,2)+'\n');
},60_000);
