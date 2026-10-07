import {it,expect} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {NativeProgram,type NativeProgramArtifact} from '../../src/modelica-native-program';

it('source-issued scalar dependency primitive preserves branch values, reset and source-bound reload',async()=>{
  const sourceFile=process.env.DEPENDENCY_PRIMITIVE_SOURCE;
  const artifactFile=process.env.DEPENDENCY_PRIMITIVE_ARTIFACT;
  if(!sourceFile||!artifactFile)throw Error('Explicit immutable source/artifact paths are required');
  const source=readFileSync(sourceFile,'utf8');
  const bytes=readFileSync(artifactFile);
  const artifact:NativeProgramArtifact=JSON.parse(bytes.toString());
  const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
  const cases:[number,number,number][]=[[2.25,-4.5,1],[-3,7,-2],[9,-11,0],[.5,.25,3],[1,-1,-0],[-0,0,1],[0,-0,-1],[37,-31,NaN]];
  let program=await NativeProgram.instantiate(artifact,source);
  const run=(input:[number,number,number])=>{
    const [left,right,gate]=input;
    program.input('left')[0]=left;program.input('right')[0]=right;program.input('gate')[0]=gate;
    program.evaluate(0);
    const expected=gate>0?[left,right,left+right]:[right,left,right+left];
    const actual=['selected','other','total'].map(name=>program.output(name)[0]);
    for(let index=0;index<3;index++)expect(Object.is(actual[index],expected[index]),`output${index}`).toBe(true);
  };
  for(let index=0;index<cases.length;index++){
    run(cases[index]);
    if(index===3)program=await NativeProgram.instantiate(JSON.parse(JSON.stringify(artifact)),source);
  }
  program.reset();for(const input of cases)run(input);
  await expect(NativeProgram.instantiate(artifact,source+'\n// changed source\n')).rejects.toThrow(/source/i);
  const directory=resolve('dev/artifacts/modelica-shared-dependency');mkdirSync(directory,{recursive:true});
  writeFileSync(resolve(directory,'primitive-numeric-verification.json'),JSON.stringify({
    scope:'Separate scalar primitive only; actual source-issued Node/V8 WASM, not full14400 depth, browser, production runtime or full SLAM',
    sourceSha256:sha(source),artifactSha256:sha(bytes),moduleSha256:artifact.module_sha256,profile:artifact.profile,
    engine:process.version,cases:8,replayedCases:8,maxNumericError:0,signedZeroPreserved:true,nanGateFalseBranch:true,
    sourceBoundReload:true,reset:true,staleSourceRefused:true,
    limitations:['Full14400 source gates remain separate and must retain original capacities.','Primitive execution does not prove the full-depth workload or dependency minimality.']
  },null,2)+'\n');
});
