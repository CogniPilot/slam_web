import {beforeAll,afterAll,it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NativeProgram,type NativeProgramArtifact} from '../../src/modelica-native-program';
import {rawDescriptorFixture,rawDescriptorOracle,mappedFirstPixel,type DescriptorFrameFixture} from './rgbd-descriptor-frame-fixtures';

const artifactPath=process.env.RUMOCA_NATIVE_DESCRIPTOR_ARTIFACT;
const sourcePath=process.env.RUMOCA_NATIVE_DESCRIPTOR_SOURCE??'models/RGBDFeatureMatching.mo';
const reportPath=process.env.RUMOCA_NATIVE_DESCRIPTOR_REPORT;
const fixturePath=process.env.RUMOCA_NATIVE_DESCRIPTOR_FIXTURES;
const source=readFileSync(sourcePath,'utf8'),sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const report:Record<string,unknown>={status:artifactPath?'RUNNING':'ARTIFACT_NOT_PROVIDED',sourceSha256:sha(source),dimensions:{height:90,width:160,rgbaChannels:4,capacity:350,descriptorCells:49},actualNumericTestsCompleted:0,actualCases:[],runtimeIntegrated:false,productionPinChanged:false,fullSlamAccepted:false};
const fixtures:unknown[]=[];let artifact:NativeProgramArtifact,program:NativeProgram;
const save=()=>{if(reportPath)writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');};save();
beforeAll(async()=>{
  if(!artifactPath)return;
  const raw=readFileSync(artifactPath,'utf8');artifact=JSON.parse(raw);report.artifactFileSha256=sha(raw);
  expect(artifact.model_name).toBe('RGBDDescriptorFrame');expect(artifact.var_layout.shapes.rgb).toEqual([90,160,4]);expect(artifact.var_layout.shapes.depth).toEqual([90,160]);
  expect(artifact.var_layout.shapes.pixels).toEqual([350,2]);expect(artifact.var_layout.shapes.descriptor).toEqual([350,49]);expect(artifact.var_layout.shapes.point).toEqual([350,3]);
  expect(artifact.abi.y_count).toBe(32951);
  program=await NativeProgram.instantiate(artifact,source);report.moduleSha256=artifact.module_sha256;report.moduleBytes=artifact.module_bytes.length;report.profile=artifact.profile;report.compiler=artifact.compiler;save();
});
afterAll(()=>{
  if(artifactPath)report.status=report.actualNumericTestsCompleted===5?'ACTUAL_FULL_RGBA_DESCRIPTOR_NUMERIC_PASS':'FAILED_OR_INCOMPLETE';
  save();if(fixturePath&&fixtures.length)writeFileSync(fixturePath,JSON.stringify({schemaVersion:1,sourceSha256:sha(source),moduleSha256:artifact.module_sha256,encoding:'little-endian IEEE754 Float64 base64 (preserves NaN/Infinity/signed-zero)',cases:fixtures},null,2)+'\n');
});
function inputs(f:DescriptorFrameFixture):[string,number[]][]{return [['rgb',f.rgb.flat(2)],['depth',f.depth.flat()],['pixels',f.pixels.flat()],['activeCount',[f.activeCount]],['rgbCalibration',f.rgbCalibration],['depthCalibration',f.depthCalibration],['disparityNoise',[f.disparityNoise]],['noiseReferenceFx',[f.noiseReferenceFx]],['baseline',[f.baseline]]];}
function packed(values:number[]){const bytes=new Uint8Array(values.length*8),view=new DataView(bytes.buffer);values.forEach((v,i)=>view.setFloat64(i*8,v,true));return Buffer.from(bytes).toString('base64');}
function identicalBytes(actual:Uint8Array,expected:Uint8Array,label:string){
  if(actual.length!==expected.length)throw new Error(`${label} byte length changed`);
  for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i])throw new Error(`${label} changed byte ${i}`);
}
function complete(){report.actualNumericTestsCompleted=Number(report.actualNumericTestsCompleted)+1;save();}
function execute(name:string,f:DescriptorFrameFixture){
  const expected=rawDescriptorOracle(f),fields=inputs(f);
  for(const [name,values] of fields){const view=program.input(name);expect(view.length).toBe(values.length);view.set(values);}
  const p=new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8),pBefore=p.slice();
  const started=performance.now();program.evaluate(0);const executeMs=performance.now()-started;
  identicalBytes(p,pBefore,'complete public/parameter P storage');
  const outputs:[string,number[]][]=[['gray',expected.gray.flat()],['descriptor',expected.descriptor.flat()],['point',expected.point.flat()],['enabled',expected.enabled],['invalidCount',[expected.invalidCount]]];
  for(const [name,values] of outputs){const actual=program.output(name);expect(actual.length).toBe(values.length);for(let i=0;i<values.length;i++)if(!Number.isFinite(actual[i])||Math.abs(actual[i]-values[i])>2e-11)throw new Error(`${name}/${i}: ${actual[i]} != ${values[i]} (${name==='descriptor'?'49-sample patch normalization':'calibrated/full-frame oracle'})`);}
  (report.actualCases as unknown[]).push({name,outputsChecked:32951,invalidCount:expected.invalidCount,executeMs});save();
  if(fixturePath)fixtures.push({name,inputs:fields.map(([name,values])=>({name,count:values.length,float64Base64:packed(values)})),expected:outputs.map(([name,values])=>({name,count:values.length,float64Base64:packed(values),absoluteTolerance:2e-11}))});
  return expected;
}

it('independent full RGBA calibrated oracle fixtures are consistent; this is not Modelica execution',()=>{
  const f=rawDescriptorFixture(),result=rawDescriptorOracle(f);expect(result.enabled).toEqual(Array(350).fill(1));expect(result.descriptor.flat()).toHaveLength(17150);
  const alpha=structuredClone(f);alpha.rgb.forEach(row=>row.forEach(p=>p[3]=NaN));expect(rawDescriptorOracle(alpha)).toEqual(result);
  const physical=mappedFirstPixel(rawDescriptorFixture(),20.5,30.5);physical.depth[30][20]=2;physical.depth[30][21]=2;physical.depth[31][20]=2;physical.depth[31][21]=2.2;
  expect(rawDescriptorOracle(physical).enabled[0]).toBe(0);physical.noiseReferenceFx=physical.depthCalibration[0];expect(rawDescriptorOracle(physical).enabled[0]).toBe(1);
});
it.skipIf(!artifactPath)('actual full90×160 RGBA+raw depth and350×49 descriptors use D435 calibration and ignore alpha',()=>{
  const f=rawDescriptorFixture(),expected=execute('complete physicalD435 rawRGBA fixture',f);expect(expected.enabled).toEqual(Array(350).fill(1));
  const before=new Uint8Array(program.memory.buffer,artifact.abi.y_offset,artifact.abi.y_count*8).slice();f.rgb.forEach((row,y)=>row.forEach((p,x)=>p[3]=(x+y)%3===0?NaN:(x+y)%3===1?Infinity:-Infinity));
  execute('alpha NaN/Infinity ignored',f);identicalBytes(new Uint8Array(program.memory.buffer,artifact.abi.y_offset,artifact.abi.y_count*8),before,'alpha-independent Y');complete();
});
it.skipIf(!artifactPath)('actual positive-weight inverse-depth gathers and physical noise threshold preserve masks',()=>{
  const zero=mappedFirstPixel(rawDescriptorFixture(),20,30);zero.depth[30][20]=2;zero.depth[30][21]=NaN;zero.depth[31][20]=Infinity;zero.depth[31][21]=-Infinity;
  expect(execute('zero-weight invalid depth neighbours ignored',zero).enabled[0]).toBe(1);
  const positive=structuredClone(zero);positive.depth[30][20]=NaN;expect(execute('positive-weight NaN depth rejected',positive).enabled[0]).toBe(0);
  const fractional=mappedFirstPixel(rawDescriptorFixture(),20.5,30);fractional.depth[30][20]=2;fractional.depth[30][21]=2.02;
  const result=execute('bilinear inverse-depth differs from axial averaging',fractional);expect(result.point[0][2]).toBeCloseTo(1/(.5/2+.5/2.02),12);
  const discontinuity=mappedFirstPixel(rawDescriptorFixture(),20.5,30.5);discontinuity.depth[30][20]=2;discontinuity.depth[30][21]=2;discontinuity.depth[31][20]=2;discontinuity.depth[31][21]=2.2;
  expect(execute('physical848px noiseReferenceFx refuses spread',discontinuity).enabled[0]).toBe(0);
  discontinuity.noiseReferenceFx=discontinuity.depthCalibration[0];expect(execute('deliberately reduced noiseReferenceFx changes source gate',discontinuity).enabled[0]).toBe(1);complete();
});
it.skipIf(!artifactPath)('actual source handles border pixels, bad RGB/depth and flat contrast at full capacity',()=>{
  const borders=rawDescriptorFixture();[[2,10],[156,86],[157,10],[5,2],[5,87],[NaN,10],[Infinity,10],[3.5,10]].forEach((p,i)=>borders.pixels[i]=p);
  const masked=execute('border/NaN/Infinity/fractional pixel masks',borders);expect(masked.enabled.slice(0,8)).toEqual([0,1,0,0,0,0,0,0]);
  const bad=rawDescriptorFixture();bad.rgb[5][5][1]=NaN;expect(execute('NaN RGB in active patch',bad).enabled[0]).toBe(0);
  const outside=rawDescriptorFixture();outside.rgb[0][0][0]=-1;outside.depth[0][0]=NaN;expect(execute('invalid data outside all active patches/gathers',outside).enabled).toEqual(Array(350).fill(1));
  const flat=rawDescriptorFixture();flat.rgb.forEach(row=>row.forEach(p=>p[0]=p[1]=p[2]=127));expect(execute('zero contrast refuses all350',flat).invalidCount).toBe(350);
  for(const value of [.28,9.95,Infinity]){const f=mappedFirstPixel(rawDescriptorFixture(),20,30);f.depth[30][20]=value;expect(execute(`strict depth boundary ${value}`,f).enabled[0]).toBe(0);}complete();
});
it.skipIf(!artifactPath)('actual malformed counts clear every slot and reset/recovery produces complete stable outputs',()=>{
  for(const count of [-1,.5,351,NaN,Infinity,0]){const f=rawDescriptorFixture();f.activeCount=count;expect(execute(`activeCount ${count}`,f).enabled).toEqual(Array(350).fill(0));}
  execute('full350 recovery after rejected counts',rawDescriptorFixture());const before=new Uint8Array(program.memory.buffer,0,artifact.abi.y_count*8).slice();program.reset();execute('reset full350 replay',rawDescriptorFixture());identicalBytes(new Uint8Array(program.memory.buffer,0,artifact.abi.y_count*8),before,'reset Y');complete();
});
it.skipIf(!artifactPath)('actual descriptor artifact binds exact source/module and reloads through JSON',async()=>{
  await expect(NativeProgram.instantiate(artifact,source+'\n')).rejects.toThrow('does not match its source');
  const corrupt=structuredClone(artifact);corrupt.module_bytes[0]^=1;await expect(NativeProgram.instantiate(corrupt,source)).rejects.toThrow('digest mismatch');
  const loaded=await NativeProgram.instantiate(JSON.parse(JSON.stringify(artifact)),source);program=loaded;expect(execute('JSON artifact/source reload complete350',rawDescriptorFixture()).enabled).toEqual(Array(350).fill(1));complete();
});
