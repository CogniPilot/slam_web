import {expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {NativeProgram,type NativeProgramArtifact} from '../../src/modelica-native-program';
import {fixture,sandwich} from './rgbd-registration-uncertainty-fixtures';
const matrices=['relativeCovariance','observationCovariance','normalMatrix','noiseMatrix','observationJacobian'] as const;
it('actual edited original full350 source owns fourfold depth contribution and JSON persistence',async()=>{
 const dir=process.env.RUMOCA_ORIGINAL350_EDIT_DIR!,out=process.env.RUMOCA_ORIGINAL350_EDIT_REPORT_DIR!;mkdirSync(out,{recursive:true});
 const source=readFileSync(dir+'/edited-source.mo','utf8'),artifact=JSON.parse(readFileSync(dir+'/edited-native.json','utf8')) as NativeProgramArtifact;
 const original=readFileSync('dev/artifacts/registration-uncertainty/initial-builtin-source.mo','utf8');const hash=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
 const report:Record<string,unknown>={status:'RUNNING',engine:'Node/V8 WebAssembly',sourceSha256:hash(source),moduleSha256:artifact.module_sha256,capacity:350,fullSlam:false,throughputClaim:false,cases:[]};const save=()=>writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');save();
 try{
 expect(source).toBe(original.replace('parameter Real disparitySigma = 0.1;','parameter Real disparitySigma = 0.2;'));expect(artifact.source_sha256).toBe(hash(source));expect(hash(new Uint8Array(artifact.module_bytes))).toBe(artifact.module_sha256);
 const f=fixture(),zero=sandwich(f,0),baseline=sandwich(f,.1),edited=sandwich(f,.2);const previous=JSON.parse(readFileSync('dev/artifacts/original350-uncertainty-native/independent-browser-fixtures.json','utf8')).cases[0].expected;
 const expected={...edited,valid:1,rejectionReason:0,invalidCount:0,minimumScaledPivot:previous.minimumScaledPivot};let maxError=0,varianceError=0;
 const compare=(a:number[],b:number[])=>{for(let i=0;i<a.length;i++){const error=Math.abs(a[i]-b[i]);maxError=Math.max(maxError,error);expect(error).toBeLessThan(3e-8*Math.max(1,Math.abs(b[i])));}};
 for(const field of ['relativeCovariance','observationCovariance','noiseMatrix'] as const){const a=edited[field].flat(),b=baseline[field].flat(),z=zero[field].flat();for(let i=0;i<a.length;i++){const error=Math.abs((a[i]-z[i])-4*(b[i]-z[i]));varianceError=Math.max(varianceError,error);expect(error).toBeLessThan(1e-12*Math.max(1,Math.abs(a[i])));}}
 expect(Math.max(...edited.observationCovariance.flat().map((v,i)=>Math.abs(v-baseline.observationCovariance.flat()[i])))).toBeGreaterThan(1e-8);
 let program=await NativeProgram.instantiate(artifact,source);const cases:unknown[]=[];
 const run=(name:string)=>{for(const [key,value] of Object.entries(f))program.input(key).set(Array.isArray(value)?value.flat():[value]);const p=new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8).slice();program.evaluate(0);expect(new Uint8Array(program.memory.buffer,artifact.abi.p_offset,p.length)).toEqual(p);for(const field of matrices)compare([...program.output(field)],expected[field].flat());for(const field of ['valid','rejectionReason','validCount','invalidCount','minimumScaledPivot'] as const)compare([...program.output(field)],[expected[field]]);cases.push({name,pBytes:[...p],expected});(report.cases as unknown[]).push({name,matrixCells:180});save();};
 run('actual disparitySigma0.2 general full350');program.reset();run('edited reset');const saved=JSON.parse(JSON.stringify({source,artifact}));program=await NativeProgram.instantiate(saved.artifact,saved.source);run('edited source and artifact JSON reload');await expect(NativeProgram.instantiate(artifact,original)).rejects.toThrow('does not match its source');
 report.status='ACTUAL_EDITED_ORIGINAL_FULL350_NATIVE_NUMERICS_PASS';report.maxAbsoluteError=maxError;report.fourfoldDepthContributionMaxError=varianceError;report.matrixCellsChecked=540;report.controls={sourceIssuedDefaultEdit:true,immutableP:true,reset:true,savedSourceArtifactJSONReload:true,wrongSourceRefusal:true};writeFileSync(out+'/independent-browser-fixtures.json',JSON.stringify({sourcePath:'dev/artifacts/original350-uncertainty-native-edit/edited-source.mo',sourceSha256:hash(source),artifactPath:'dev/artifacts/original350-uncertainty-native-edit/edited-native.json',moduleSha256:artifact.module_sha256,capacity:350,cases})+'\n');save();
 }catch(error){report.status='FAILED';report.failure=String(error);save();throw error;}
},120000);
