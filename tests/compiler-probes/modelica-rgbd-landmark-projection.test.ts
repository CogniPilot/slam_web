import {beforeAll,afterAll,it,expect} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {NativeProgram,type NativeProgramArtifact} from '../../src/modelica-native-program';

const pkg=process.env.RUMOCA_BRANCH_PKG,artifactDirectory=process.env.RUMOCA_LANDMARK_ARTIFACT_DIRECTORY;
const sessionGate=process.env.RUMOCA_LANDMARK_EXECUTION==='session';
const enabled=Boolean(pkg||artifactDirectory)&&!sessionGate,sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const source=readFileSync('models/RGBDLandmarkProjection.mo','utf8');
const editedSource=source.replace('parameter Real coordinateLimit = 1e6;','parameter Real coordinateLimit = 1.0;');
const identity=[1,0,0,0,1,0,0,0,1],opticalToBody=[0,0,1,-1,0,0,0,-1,0];
type Frame={opticalPoint:number[],enabled:number[],activeCount:number,poseAccepted:number,bodyRotation:number[],bodyPosition:number[],opticalToBody:number[],cameraOriginBody:number[]};
function fixture():Frame{return {opticalPoint:Array.from({length:350},(_,i)=>[((i%25)-12)*.03,(Math.floor(i/25)-7)*.02,2+(i%17)*.05]).flat(),enabled:Array(350).fill(1),activeCount:350,poseAccepted:1,bodyRotation:identity.slice(),bodyPosition:[0,0,0],opticalToBody:opticalToBody.slice(),cameraOriginBody:[.18,0,-.04]};}
// Independent test-only Rodrigues rotation and explicit coordinate transforms.
function rotation(axis:number[],angle:number){const norm=Math.hypot(...axis),[x,y,z]=axis.map(v=>v/norm),c=Math.cos(angle),s=Math.sin(angle),d=1-c;return [c+x*x*d,x*y*d-z*s,x*z*d+y*s,y*x*d+z*s,c+y*y*d,y*z*d-x*s,z*x*d-y*s,z*y*d+x*s,c+z*z*d];}
function mv(r:number[],p:number[]){return [r[0]*p[0]+r[1]*p[1]+r[2]*p[2],r[3]*p[0]+r[4]*p[1]+r[5]*p[2],r[6]*p[0]+r[7]*p[1]+r[8]*p[2]];}
function proper(r:number[]){if(!r.every(v=>Number.isFinite(v)&&Math.abs(v)<=1+1e-6))return false;for(let i=0;i<3;i++)for(let j=0;j<3;j++)if(Math.abs(r[i]*r[j]+r[3+i]*r[3+j]+r[6+i]*r[6+j]-(i===j?1:0))>1e-6)return false;return Math.abs(r[0]*(r[4]*r[8]-r[5]*r[7])-r[1]*(r[3]*r[8]-r[5]*r[6])+r[2]*(r[3]*r[7]-r[4]*r[6])-1)<=1e-6;}
function oracle(f:Frame,limit=1e6){
  const configurationValid=+(Number.isInteger(f.activeCount)&&f.activeCount>=0&&f.activeCount<=350&&limit>0&&limit<=1e6);
  const poseValid=+(configurationValid===1&&f.poseAccepted===1&&proper(f.bodyRotation)&&proper(f.opticalToBody)&&[...f.bodyPosition,...f.cameraOriginBody].every(v=>Number.isFinite(v)&&Math.abs(v)<=limit));
  const worldPoint=Array(1050).fill(0),landmarkEnabled=Array(350).fill(0);let invalidCount=0;
  for(let i=0;i<350;i++){
    const p=f.opticalPoint.slice(3*i,3*i+3),valid=configurationValid===1&&i+1<=f.activeCount&&f.enabled[i]===1&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=limit)&&p[2]>0;
    if(i+1<=f.activeCount&&f.enabled[i]!==0&&!valid)invalidCount++;
    if(!poseValid||!valid)continue;
    const inBody=mv(f.opticalToBody,p).map((v,k)=>v+f.cameraOriginBody[k]),inWorld=mv(f.bodyRotation,inBody).map((v,k)=>v+f.bodyPosition[k]);
    if(inWorld.every(v=>Number.isFinite(v)&&Math.abs(v)<=limit)){landmarkEnabled[i]=1;worldPoint.splice(3*i,3,...inWorld);}
  }
  return {worldPoint,landmarkEnabled,validCount:[landmarkEnabled.reduce((a,b)=>a+b,0)],invalidCount:[invalidCount],configurationValid:[configurationValid],poseValid:[poseValid]};
}
let artifact:NativeProgramArtifact,editedArtifact:NativeProgramArtifact,program:NativeProgram;
const report:Record<string,unknown>={status:enabled?'RUNNING':'NOT_EXECUTED',sourceSha256:sha(source),editedSourceSha256:sha(editedSource),capacity:350,actualNumericGroupsCompleted:0,cases:[],runtimeIntegrated:false,persistentMap:false,fullSlamAccepted:false,productionPinChanged:false};
function save(){if(process.env.RUMOCA_LANDMARK_REPORT)writeFileSync(process.env.RUMOCA_LANDMARK_REPORT,JSON.stringify(report,null,2)+'\n');}save();
beforeAll(async()=>{
  if(!enabled)return;
  if(artifactDirectory){artifact=JSON.parse(readFileSync(resolve(artifactDirectory,'baseline.json'),'utf8'));editedArtifact=JSON.parse(readFileSync(resolve(artifactDirectory,'edited.json'),'utf8'));}
  else{
    const compiler=await import(/* @vite-ignore */pathToFileURL(resolve(pkg!,'rumoca_bind_wasm.js')).href);
    const wasm=readFileSync(resolve(pkg!,'rumoca_bind_wasm_bg.wasm'));await compiler.default({module_or_path:wasm});report.compilerWasmSha256=sha(wasm);save();
    for(const [name,text] of [['baseline',source],['edited',editedSource]]){
      report.phase=`${name} full350 native preparation`;save();const start=performance.now();
      try{const raw=compiler.prepare_native_program(text,'RGBDLandmarkProjection'),value=JSON.parse(raw) as NativeProgramArtifact;if(name==='baseline')artifact=value;else editedArtifact=value;
        report[`${name}PrepareMs`]=performance.now()-start;
        const dir=process.env.RUMOCA_LANDMARK_EXPORT_DIRECTORY;if(dir){mkdirSync(dir,{recursive:true});writeFileSync(resolve(dir,`${name}.json`),raw);writeFileSync(resolve(dir,`${name}.mo`),text);}}
      catch(error){report.status='ACTUAL_FULL_SOURCE_NATIVE_PREPARATION_REFUSED';report.refusal=String(error);report.refusalMs=performance.now()-start;save();throw error;}
    }
  }
  report.moduleSha256=artifact.module_sha256;report.editedModuleSha256=editedArtifact.module_sha256;report.moduleBytes=artifact.module_bytes.length;report.profile=artifact.profile;report.compiler=artifact.compiler;report.phase='actual issued module numeric execution';save();
  expect(artifact.var_layout.shapes.worldPoint).toEqual([350,3]);expect(artifact.var_layout.shapes.landmarkEnabled).toEqual([350]);
  program=await NativeProgram.instantiate(artifact,source);
});
afterAll(()=>{if((enabled||sessionGate)&&report.status==='RUNNING')report.status=report.actualNumericGroupsCompleted===4?'ACTUAL_FULL350_NUMERIC_PASS':'FAILED_OR_INCOMPLETE';save();});
function execute(name:string,f:Frame,limit=1e6){
  for(const [key,value] of Object.entries(f))program.input(key).set(Array.isArray(value)?value:[value]);
  const before=new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8).slice(),expected=oracle(f,limit),start=performance.now();program.evaluate(0);const executeMs=performance.now()-start;
  expect(new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8)).toEqual(before);
  for(const [key,value] of Object.entries(expected)){const actual=program.output(key);expect(actual.length).toBe(value.length);for(let i=0;i<value.length;i++)if(!Number.isFinite(actual[i])||Math.abs(actual[i]-value[i])>2e-11)throw new Error(`${name}: ${key}/${i}: ${actual[i]} != ${value[i]}`);}
  (report.cases as unknown[]).push({name,executeMs,outputsChecked:1404,validCount:expected.validCount[0],invalidCount:expected.invalidCount[0]});save();return expected;
}
function complete(){report.actualNumericGroupsCompleted=Number(report.actualNumericGroupsCompleted)+1;save();}
it('independent full350 projection oracle has the declared RDF→FLU→ENU frames; no Modelica execution',()=>{const f=fixture(),p=f.opticalPoint.slice(0,3),result=oracle(f);expect(result.validCount).toEqual([350]);expect(result.worldPoint.slice(0,3)).toEqual([p[2]+.18,-p[0],-p[1]-.04]);expect(proper(rotation([1,2,3],Math.PI))).toBe(true);});
it.skipIf(!enabled)('actual full350 points use general6DOF estimated pose and nonidentity lever-arm extrinsics',()=>{
  execute('default opticalRDF axes/full350',fixture());
  for(const angle of [.61,Math.PI-1e-8,-.73]){const f=fixture();f.bodyRotation=rotation([1,2,-3],angle);f.bodyPosition=[4,-2,1.1];f.opticalToBody=rotation([2,-1,4],.93);f.cameraOriginBody=[.41,-.24,.18];execute(`general6DOF angle ${angle}`,f);}complete();
});
it.skipIf(!enabled)('actual sparse late slots, malformed flags/counts and masked NaN preserve all350 slots',()=>{
  const sparse=fixture();sparse.enabled.fill(0);sparse.enabled[0]=sparse.enabled[349]=1;sparse.opticalPoint.fill(NaN,3,1047);expect(execute('first+last slot, maskedNaN',sparse).validCount).toEqual([2]);
  for(const count of [-1,.5,351,NaN,Infinity,0]){const f=fixture();f.activeCount=count;expect(execute(`count ${count}`,f).validCount).toEqual([0]);}
  const bad=fixture();[.5,NaN,2].forEach((flag,i)=>bad.enabled[i]=flag);[0,-1,NaN,Infinity].forEach((z,i)=>bad.opticalPoint[(i+3)*3+2]=z);bad.opticalPoint[21]=1e6+1;expect(execute('badflags/depth/finite/domain',bad).invalidCount).toEqual([8]);execute('full350 recovery',fixture());complete();
});
it.skipIf(!enabled)('actual rejected/malformed poses and improper rotations publish zero coordinates',()=>{
  for(const accepted of [0,.5,2,NaN,Infinity]){const f=fixture();f.poseAccepted=accepted;expect(execute(`poseAccepted ${accepted}`,f).validCount).toEqual([0]);}
  for(const field of ['bodyRotation','opticalToBody'] as const)for(const bad of [[-1,0,0,0,1,0,0,0,1],Array(9).fill(0),[2,0,0,0,1,0,0,0,1],[NaN,0,0,0,1,0,0,0,1],[Infinity,0,0,0,1,0,0,0,1]]){const f=fixture();f[field]=bad;expect(execute(`improper ${field} ${bad[0]}`,f).poseValid).toEqual([0]);}
  for(const field of ['bodyPosition','cameraOriginBody'] as const)for(const bad of [NaN,Infinity,1e6+1]){const f=fixture();f[field][0]=bad;expect(execute(`invalid ${field} ${bad}`,f).poseValid).toEqual([0]);}
  const outside=fixture();outside.bodyPosition=[999999.9,0,0];expect(execute('finite transformed output beyonddomain',outside).validCount).toEqual([0]);execute('pose recovery',fixture());complete();
});
it.skipIf(!enabled)('actual reset, source parameter edit and source-bound JSON reload preserve complete outputs',async()=>{
  const f=fixture(),first=execute('before reset',f);program.reset();expect(execute('reset replay',f)).toEqual(first);
  await expect(NativeProgram.instantiate(artifact,editedSource)).rejects.toThrow('does not match its source');
  const corrupt=structuredClone(artifact);corrupt.module_bytes[0]^=1;await expect(NativeProgram.instantiate(corrupt,source)).rejects.toThrow('digest mismatch');
  program=await NativeProgram.instantiate(JSON.parse(JSON.stringify(artifact)),source);expect(execute('JSON source/module reload',f)).toEqual(first);
  expect(editedArtifact.source_sha256).not.toBe(artifact.source_sha256);
  // A default parameter edit may change the bound P payload while keeping code
  // identical. The source binding and executed changed behavior are required.
  expect(editedArtifact.module_sha256!==artifact.module_sha256||JSON.stringify(editedArtifact.parameters)!==JSON.stringify(artifact.parameters)).toBe(true);
  const baseline=artifact;artifact=editedArtifact;program=await NativeProgram.instantiate(JSON.parse(JSON.stringify(editedArtifact)),editedSource);expect(execute('coordinateLimit source edit to1',f,1).invalidCount).toEqual([350]);artifact=baseline;program=await NativeProgram.instantiate(artifact,source);complete();
});

it.skipIf(!sessionGate||!pkg)('actual ordinary Modelica WASM session projects full350 candidates; native admission is separate',async()=>{
  const compiler=await import(/* @vite-ignore */pathToFileURL(resolve(pkg!,'rumoca_bind_wasm.js')).href);
  const wasm=readFileSync(resolve(pkg!,'rumoca_bind_wasm_bg.wasm'));await compiler.default({module_or_path:wasm});
  report.status='RUNNING';report.execution='ordinary WasmSimulationSession; native schedule remains refused';report.compilerWasmSha256=sha(wasm);
  const sessions:InstanceType<typeof compiler.WasmSimulationSession>[]=[];
  const make=(text:string)=>{report.phase='full350 ordinary session preparation';save();const start=performance.now();
    const initial=Object.entries(fixture()).flatMap(([key,value])=>{const values=Array.isArray(value)?value:[value];return scalarNames(key,values).map((name,i)=>[name,values[i]]);});
    const s=compiler.WasmSimulationSession.withInteractiveOptions(text,'RGBDLandmarkProjection',1/90,'rk-like',1e-12,1e-12,JSON.stringify(initial));sessions.push(s);report.sessionPreparationMs=performance.now()-start;
    if(!report.preparations)report.preparations=[];(report.preparations as unknown[]).push({sourceSha256:sha(text),elapsedMs:report.sessionPreparationMs});save();return s;};
  let tick=0;
  const scalarNames=(key:string,values:number[])=>values.map((_,i)=>values.length===1?key:(key==='bodyRotation'||key==='opticalToBody'||key==='opticalPoint'||key==='worldPoint')?`${key}[${Math.floor(i/3)+1},${i%3+1}]`:`${key}[${i+1}]`);
  const run=(s:typeof sessions[number],name:string,f:Frame,limit=1e6)=>{
    report.phase=`ordinary execute:${name}`;save();const start=performance.now();
    const fields=Object.entries(f).flatMap(([key,value])=>{const values=Array.isArray(value)?value:[value];return scalarNames(key,values).map((name,i)=>[name,values[i]]);});
    // JSON cannot encode IEEE NaN/Infinity. Finite fields use one batch; special
    // values use the compiler's scalar API, with transport refusal recorded.
    const special=fields.filter(([,value])=>!Number.isFinite(value as number));
    s.set_inputs(JSON.stringify(fields.map(([key,value])=>[key,Number.isFinite(value as number)?value:0])));
    for(const [field,value] of special){try{s.set_input(field as string,value as number);}catch(error){
      if(!report.nonfiniteTransportRefusals)report.nonfiniteTransportRefusals=[];
      (report.nonfiniteTransportRefusals as unknown[]).push({name,field,value:String(value),error:String(error)});save();return null;
    }}
    s.advance_to(++tick/90);const values=JSON.parse(s.state_json()).values as Record<string,number>,expected=oracle(f,limit);
    for(const [key,array] of Object.entries(expected))for(const [i,field] of scalarNames(key,array).entries())if(!Number.isFinite(values[field])||Math.abs(values[field]-array[i])>2e-11)throw new Error(`${name} ${field}: ${values[field]} != ${array[i]}`);
    (report.cases as unknown[]).push({name,outputsChecked:1404,executeMs:performance.now()-start,validCount:expected.validCount[0],invalidCount:expected.invalidCount[0]});save();return expected;
  };
  try{
    const s=make(source);run(s,'full350 RDF axes',fixture());
    const general=fixture();general.bodyRotation=rotation([1,2,-3],.61);general.bodyPosition=[4,-2,1.1];general.opticalToBody=rotation([2,-1,4],.93);general.cameraOriginBody=[.41,-.24,.18];run(s,'general6DOF+leverarm+extrinsics',general);
    const halfTurn=structuredClone(general);halfTurn.bodyRotation=rotation([1,2,-3],Math.PI-1e-8);run(s,'near half-turn proper rotation',halfTurn);
    const sparse=fixture();sparse.enabled.fill(0);sparse.enabled[0]=sparse.enabled[349]=1;run(s,'sparse first+late slot',sparse);
    for(const count of [-1,.5,351,0]){const f=fixture();f.activeCount=count;run(s,`invalid/empty count ${count}`,f);}
    const bad=fixture();bad.enabled[0]=.5;bad.opticalPoint[5]=0;bad.opticalPoint[8]=-1;bad.opticalPoint[9]=1e6+1;run(s,'finite candidate/domain refusals',bad);
    for(const field of ['bodyRotation','opticalToBody'] as const)for(const invalid of [[-1,0,0,0,1,0,0,0,1],Array(9).fill(0),[2,0,0,0,1,0,0,0,1]]){const f=fixture();f[field]=invalid;run(s,`improper ${field}/${invalid[0]}`,f);}
    for(const value of [NaN,Infinity,-Infinity]){const f=fixture();f.opticalPoint[2]=value;run(s,`active nonfinite depth ${value}`,f);}
    const hidden=fixture();hidden.enabled[349]=0;hidden.opticalPoint[1049]=NaN;run(s,'masked late NaN',hidden);
    const badPose=fixture();badPose.bodyRotation[0]=NaN;run(s,'NaN pose rotation',badPose);
    const badCount=fixture();badCount.activeCount=NaN;run(s,'NaN activeCount',badCount);
    const rejected=fixture();rejected.poseAccepted=0;run(s,'rejected estimated pose',rejected);rejected.poseAccepted=.5;run(s,'malformed pose flag',rejected);
    const outside=fixture();outside.bodyPosition=[999999.9,0,0];run(s,'transformed domain refusal',outside);
    const baseline=run(s,'full350 recovery',general);s.reset();expect(run(s,'reset/replay',general)).toEqual(baseline);
    const edited=make(editedSource);run(edited,'coordinateLimit source edit',fixture(),1);
    const reloaded=make(JSON.parse(JSON.stringify({source:editedSource})).source);run(reloaded,'edited source JSON reload',fixture(),1);
    report.status='ACTUAL_FULL350_ORDINARY_SESSION_NUMERIC_PASS';report.actualNumericGroupsCompleted=1;report.nativeArtifactIssued=false;save();
  }finally{sessions.forEach(s=>s.free());}
},170000);
