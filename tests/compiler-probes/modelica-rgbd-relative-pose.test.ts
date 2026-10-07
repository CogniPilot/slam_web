import {it, expect} from 'vitest';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {NativeProgram, type NativeProgramArtifact} from '../../src/modelica-native-program';

type Vec = number[];
type Mat = number[][];
const directory = process.env.RUMOCA_BRANCH_PKG;
const sha = (value:string|Uint8Array) => createHash('sha256').update(value).digest('hex');
const I:Mat = [[1,0,0],[0,1,0],[0,0,1]];
const C:Mat = [[0,0,1],[-1,0,0],[0,-1,0]];
const transpose = (a:Mat) => a[0].map((_,j)=>a.map(row=>row[j]));
const mv = (a:Mat,v:Vec) => a.map(row=>row.reduce((sum,value,j)=>sum+value*v[j],0));
const mm = (a:Mat,b:Mat) => a.map(row=>b[0].map((_,j)=>row.reduce((sum,value,k)=>sum+value*b[k][j],0)));
const add = (a:Vec,b:Vec) => a.map((v,i)=>v+b[i]);
const sub = (a:Vec,b:Vec) => a.map((v,i)=>v-b[i]);
// Analytic axis-angle fixture generator, independent of registration/eigenfit.
function rotation(axis:Vec,angle:number):Mat {
  const n=Math.hypot(...axis),[x,y,z]=axis.map(v=>v/n),c=Math.cos(angle),s=Math.sin(angle),d=1-c;
  return [[c+x*x*d,x*y*d-z*s,x*z*d+y*s],[y*x*d+z*s,c+y*y*d,y*z*d-x*s],[z*x*d-y*s,z*y*d+x*s,c+z*z*d]];
}
const close = (actual:Vec,expected:Vec,label:string) => {
  expect(actual.length,label).toBe(expected.length);
  actual.forEach((v,i)=>{expect(Number.isFinite(v),label).toBe(true);expect(Math.abs(v-expected[i]),`${label}/${i}`).toBeLessThan(2e-9);});
};
const worldPoints:Mat = [[3,4,5],[-3,2,7],[1,-8,2],[9,4,-2],[0,1,8],[3,-2,6]];

it.skipIf(!directory)('camera registration composes a calibrated body observation in actual compiler-issued WASM',async()=>{
  const compiler = await import(/* @vite-ignore */ pathToFileURL(resolve(directory!,'rumoca_bind_wasm.js')).href);
  await compiler.default({module_or_path:readFileSync(resolve(directory!,'rumoca_bind_wasm_bg.wasm'))});
  const source = readFileSync('models/RGBDRelativePose.mo','utf8');
  const artifact:NativeProgramArtifact = JSON.parse(compiler.prepare_native_program(source,'RGBDRelativePose'));
  const program = await NativeProgram.instantiate(artifact,source);
  const cases:{name:string;valid:number}[]=[];
  const browserCases:{name:string;inputs:(number|string)[];expected:{index:number;value:number;tolerance:number}[]}[]=[];
  let tick=0;
  const evaluate = (name:string,enabled=1,expectedR=I,expectedP=[0,0,0],expectedValid=0) => {
    program.input('registrationAccepted')[0]=enabled;
    const a=artifact.abi;
    const p=new Uint8Array(program.memory.buffer,a.p_offset,a.p_count*8).slice();
    const indices=(name:string,values:Vec)=>values.map((value,i)=>({index:artifact.var_layout.bindings[name].Y!.index+i,value,tolerance:2e-9}));
    browserCases.push({name,inputs:[...new Float64Array(program.memory.buffer,a.p_offset,a.p_count)].map(v=>Number.isFinite(v)?v:String(v)),
      expected:[...indices('valid',[expectedValid]),...indices('observedBodyRotation',expectedR.flat()),...indices('observedBodyPosition',expectedP)]});
    new Float64Array(program.memory.buffer,a.y_offset,a.y_count).fill(NaN);
    program.evaluate(++tick/90);
    expect(new Uint8Array(program.memory.buffer,a.p_offset,a.p_count*8)).toEqual(p);
    const valid=program.output('valid')[0];cases.push({name,valid});
    return valid;
  };
  const put = (name:string,value:Vec|Mat) => program.input(name).set(value.flat());
  const fixture = (name:string,referenceR:Mat,referenceP:Vec,currentR:Mat,currentP:Vec,cameraR=C,origin=[.18,0,-.04]) => {
    const referenceCameraR=mm(referenceR,cameraR),currentCameraR=mm(currentR,cameraR);
    const referenceCameraP=add(referenceP,mv(referenceR,origin)),currentCameraP=add(currentP,mv(currentR,origin));
    const relativeR=mm(transpose(currentCameraR),referenceCameraR);
    const relativeT=mv(transpose(currentCameraR),sub(referenceCameraP,currentCameraP));
    // Independent forward geometric check: every world landmark must have
    // matching reference/current camera coordinates under this measurement.
    for(const point of worldPoints){
      const previous=mv(transpose(referenceCameraR),sub(point,referenceCameraP));
      const current=mv(transpose(currentCameraR),sub(point,currentCameraP));
      close(add(mv(relativeR,previous),relativeT),current,`${name}/forward landmark`);
    }
    put('referenceBodyRotation',referenceR);put('referenceBodyPosition',referenceP);
    put('currentFromReference',relativeR);put('currentFromReferenceTranslation',relativeT);
    put('opticalToBody',cameraR);put('cameraOriginBody',origin);
    expect(evaluate(name,1,currentR,currentP,1)).toBe(1);
    close([...program.output('observedBodyRotation')],currentR.flat(),`${name}/body rotation`);
    close([...program.output('observedBodyPosition')],currentP,`${name}/body position`);
  };
  fixture('forward translation',I,[0,0,0],I,[2,0,0]);
  fixture('pure rotation about body with camera lever arm',I,[1,2,3],rotation([0,0,1],.7),[1,2,3]);
  fixture('general 6DOF',rotation([1,2,-3],.4),[2,-3,1],rotation([-2,1,4],-.8),[-1,4,3]);
  fixture('half turn',I,[0,0,0],rotation([1,2,3],Math.PI-1e-9),[2,1,-3]);
  fixture('custom camera orientation and offset',rotation([1,-3,2],.6),[0,2,-1],rotation([3,4,-1],-.9),[2,-3,5],rotation([2,-1,4],1.2),[.4,-.2,.3]);
  let priorR=I,priorP=[0,0,0];
  for(let i=1;i<=12;i++){
    const currentR=rotation([1,2,3],i*.025),currentP=[i*.03,Math.sin(i*.05),i*.01];
    fixture(`retained observation chain ${i}`,priorR,priorP,currentR,currentP);
    priorR=Array.from({length:3},(_,j)=>[...program.output('observedBodyRotation').subarray(j*3,j*3+3)]);
    priorP=[...program.output('observedBodyPosition')];
  }
  const refuse = (name:string,field:string,value:Vec|Mat,enabled=1) => {
    program.reset();put(field,value);
    expect(evaluate(name,enabled)).toBe(0);
    close([...program.output('observedBodyRotation')],I.flat(),`${name}/neutral rotation`);
    close([...program.output('observedBodyPosition')],[0,0,0],`${name}/neutral position`);
  };
  refuse('reflection is not a proper rotation','currentFromReference',[[-1,0,0],[0,1,0],[0,0,1]]);
  refuse('singular reference pose','referenceBodyRotation',[[0,0,0],[0,1,0],[0,0,1]]);
  refuse('invalid extrinsic','opticalToBody',[[1,0,0],[0,2,0],[0,0,1]]);
  refuse('nonfinite registration','currentFromReferenceTranslation',[NaN,0,0]);
  refuse('infinite reference','referenceBodyPosition',[0,Infinity,0]);
  refuse('camera offset outside domain','cameraOriginBody',[1e7,0,0]);
  refuse('disabled observation','referenceBodyPosition',[0,0,0],0);
  refuse('fractional accepted flag','referenceBodyPosition',[0,0,0],.5);
  fixture('recovery',I,[0,0,0],I,[2,0,0]);
  // Actual edited Modelica body controls executable results; source/artifact
  // persistence is ordinary JSON, and stale source/module pairs must fail.
  const edited=source.replace('then proposedBodyPosition else zeros(dimension)','then proposedBodyPosition+{1.0,0.0,0.0} else zeros(dimension)');
  expect(edited).not.toBe(source);
  const changed:NativeProgramArtifact=JSON.parse(compiler.prepare_native_program(edited,'RGBDRelativePose'));
  expect(changed.module_sha256).not.toBe(artifact.module_sha256);
  await expect(NativeProgram.instantiate(artifact,edited)).rejects.toThrow('does not match its source');
  const saved=JSON.parse(JSON.stringify({source:edited,artifact:changed}));
  const restored=await NativeProgram.instantiate(saved.artifact,saved.source);
  restored.input('registrationAccepted')[0]=1;restored.evaluate(0);
  close([...restored.output('observedBodyPosition')],[1,0,0],'edited source persisted numerical output');
  const record={status:'NATIVE_RELATIVE_BODY_POSE_COMPONENT_PASS',sourceSha256:sha(source),compiler:artifact.compiler,
    moduleSha256:artifact.module_sha256,moduleBytes:artifact.module_bytes.length,abi:artifact.abi,cases,
    editedSourceSha256:sha(edited),editedModuleSha256:changed.module_sha256,sourceEditAndJsonReload:true,
    runtimeIntegrated:false,productionPinChanged:false,fullSlam:false};
  if(process.env.RUMOCA_RELATIVE_POSE_REPORT)writeFileSync(process.env.RUMOCA_RELATIVE_POSE_REPORT,JSON.stringify(record,null,2)+'\n');
  if(process.env.RUMOCA_RELATIVE_POSE_FIXTURES)writeFileSync(process.env.RUMOCA_RELATIVE_POSE_FIXTURES,JSON.stringify({sourceSha256:sha(source),
    yCount:artifact.abi.y_count,pCount:artifact.abi.p_count,layout:artifact.var_layout,cases:browserCases,
    edit:{from:'then proposedBodyPosition else zeros(dimension)',to:'then proposedBodyPosition+{1.0,0.0,0.0} else zeros(dimension)',
      outputIndex:artifact.var_layout.bindings.observedBodyPosition.Y!.index,validIndex:artifact.var_layout.bindings.valid.Y!.index}},null,2)+'\n');
},60_000);
