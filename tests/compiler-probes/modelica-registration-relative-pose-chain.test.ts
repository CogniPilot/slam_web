import {it,expect} from 'vitest';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {NativeProgram,type NativeProgramArtifact} from '../../src/modelica-native-program';

type Vec=number[];type Mat=number[][];type Pose={rotation:Mat;position:Vec};
const I:Mat=[[1,0,0],[0,1,0],[0,0,1]],C:Mat=[[0,0,1],[-1,0,0],[0,-1,0]];
const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const transpose=(a:Mat)=>a[0].map((_,j)=>a.map(row=>row[j]));
const mv=(a:Mat,v:Vec)=>a.map(row=>row.reduce((sum,value,j)=>sum+value*v[j],0));
const mm=(a:Mat,b:Mat)=>a.map(row=>b[0].map((_,j)=>row.reduce((sum,value,k)=>sum+value*b[k][j],0)));
const add=(a:Vec,b:Vec)=>a.map((v,i)=>v+b[i]),sub=(a:Vec,b:Vec)=>a.map((v,i)=>v-b[i]);
// Fixture geometry only: independent Rodrigues body/extrinsic rotations and
// inverse camera projection. No fitted transform is manufactured by this oracle.
function rotation(axis:Vec,angle:number):Mat{
  const [x,y,z]=axis.map(v=>v/Math.hypot(...axis)),c=Math.cos(angle),s=Math.sin(angle),d=1-c;
  return [[c+x*x*d,x*y*d-z*s,x*z*d+y*s],[y*x*d+z*s,c+y*y*d,y*z*d-x*s],[z*x*d-y*s,z*y*d+x*s,c+z*z*d]];
}
function opticalPoint(world:Vec,body:Pose,camera:Mat,lever:Vec):Vec{
  const cameraInWorld=mm(body.rotation,camera),origin=add(body.position,mv(body.rotation,lever));
  return mv(transpose(cameraInWorld),sub(world,origin));
}
const near=(actual:ArrayLike<number>,expected:ArrayLike<number>,label:string,tolerance=2e-8)=>{
  expect(actual.length,label).toBe(expected.length);
  Array.from(actual).forEach((value,i)=>{expect(Number.isFinite(value),label).toBe(true);expect(Math.abs(value-expected[i]),`${label}/${i}`).toBeLessThan(tolerance);});
};
const landmarks=(i:number):Vec=>[8+(i%120)/30,-2+Math.floor(i/120)/30,.3+(i%7)/5+(Math.floor(i/120)%3)/7];
const lateSlots=[14380,14391,14395,14396,14398,14399];
const lateWorld:Mat=[[8,-2,1],[9,0,2],[10,1,-1],[11,-1,3],[8,2,4],[12,3,.5]];

it('full14400 actual registration WASM feeds calibrated relative body-pose WASM with retained estimated references',async()=>{
  const directory=process.env.RUMOCA_BRANCH_PKG;
  if(!directory)throw new Error('Explicit review compiler RUMOCA_BRANCH_PKG required');
  const registrationFile=process.env.RUMOCA_CHAIN_REGISTRATION_ARTIFACT??'/tmp/slam-native-horn-whole-program-v3.json';
  const compiler=await import(/* @vite-ignore */ pathToFileURL(resolve(directory,'rumoca_bind_wasm.js')).href);
  const compilerBytes=readFileSync(resolve(directory,'rumoca_bind_wasm_bg.wasm'));
  await compiler.default({module_or_path:compilerBytes});
  const registrationSource=readFileSync('models/RigidPointRegistration.mo','utf8');
  const relativeSource=readFileSync('models/RGBDRelativePose.mo','utf8');
  const registrationRaw=readFileSync(registrationFile,'utf8');
  const registrationArtifact:NativeProgramArtifact=JSON.parse(registrationRaw);
  const artifactDirectory=process.env.RUMOCA_CHAIN_ARTIFACT_DIR;
  if(artifactDirectory){
    mkdirSync(artifactDirectory,{recursive:true});
    writeFileSync(resolve(artifactDirectory,'RigidPointRegistration.mo'),registrationSource);
    writeFileSync(resolve(artifactDirectory,'RGBDRelativePose.mo'),relativeSource);
    writeFileSync(resolve(artifactDirectory,'registration.artifact.json'),registrationRaw);
  }
  const record:any={schemaVersion:1,status:'RUNNING',phase:'relative-source-preparation',recordedAt:new Date().toISOString(),
    engine:`Node ${process.version} WebAssembly in Vitest; no Chromium or browser worker chain execution`,
    execution:'Two separately source-issued whole-program modules; host copies registration outputs directly into relative-pose inputs. Not a single compiler-issued graph.',
    scope:'Isolated exact matched optical point-pairs -> Modelica rigid registration -> Modelica calibrated body observation',
    fixtureOracle:{testSourceSha256:sha(readFileSync('tests/compiler-probes/modelica-registration-relative-pose-chain.test.ts')),
      worldLandmarkFormula:'[8+(i%120)/30,-2+floor(i/120)/30,.3+(i%7)/5+(floor(i/120)%3)/7]',lateSlots,lateWorld},
    capacity:14400,sourceHashes:{registration:sha(registrationSource),relativePose:sha(relativeSource)},
    compiler:{...registrationArtifact.compiler,reviewWasmSha256:sha(compilerBytes)},registrationArtifactSha256:sha(registrationRaw),
    registrationModuleSha256:registrationArtifact.module_sha256,cases:[],runtimeIntegrated:false,fullSlam:false,productionPinChanged:false,
    limitations:['Known exact matches are fixtures; descriptor matching, RGB/depth lifting, robust dynamic-object rejection, covariance and mapping are outside this probe.','Analytic body poses generate measurements and expected outputs only. Tested modules receive point pairs, calibration and retained estimated references.','No whole-pipeline throughput or hardware capture claim.']};
  const report=process.env.RUMOCA_CHAIN_REPORT;
  const save=()=>{if(report)writeFileSync(report,JSON.stringify(record,null,2)+'\n');};save();
  try{
    const start=performance.now();
    const relativeArtifact:NativeProgramArtifact=JSON.parse(compiler.prepare_native_program(relativeSource,'RGBDRelativePose'));
    record.relativePreparationMs=performance.now()-start;record.relativeModuleSha256=relativeArtifact.module_sha256;
    record.relativeArtifactSha256=sha(JSON.stringify(relativeArtifact));record.abi={registration:registrationArtifact.abi,relativePose:relativeArtifact.abi};
    if(artifactDirectory)writeFileSync(resolve(artifactDirectory,'relative-pose.artifact.json'),JSON.stringify(relativeArtifact)+'\n');
    let registration=await NativeProgram.instantiate(registrationArtifact,registrationSource);
    let relative=await NativeProgram.instantiate(relativeArtifact,relativeSource);record.phase='actual-whole-program-chain';save();
    expect(registration.input('sourcePoint').length).toBe(14400*3);
    expect(registration.input('targetPoint').length).toBe(14400*3);
    expect(registration.input('pairEnabled').length).toBe(14400);
    let tick=0;
    const run=(name:string,reference:Pose,current:Pose,camera=C,lever=[.18,0,-.04],sparse=false,invalid=false,measurementReference=reference):Pose=>{
      const source=registration.input('sourcePoint'),target=registration.input('targetPoint'),enabled=registration.input('pairEnabled');
      // Every slot is copied, including disabled late-slot fixtures. The issued
      // registration program alone selects/accumulates/solves the full domain.
      for(let i=0;i<14400;i++){
        const index=lateSlots.indexOf(i),world=sparse&&index>=0?lateWorld[index]:landmarks(i);
        source.set(opticalPoint(world,measurementReference,camera,lever),i*3);
        target.set(opticalPoint(world,current,camera,lever),i*3);
        enabled[i]=invalid?(i<2?1:0):sparse?(index>=0?1:0):1;
      }
      registration.input('activeCount')[0]=14400;
      const start=performance.now();registration.evaluate(++tick/90);const registrationMs=performance.now()-start;
      const accepted=registration.output('accepted')[0];expect(accepted,name).toBe(invalid?0:1);
      expect(registration.output('validCount')[0],name).toBe(invalid?2:sparse?6:14400);
      // Host copies source-issued fields directly. It never composes the pose.
      relative.input('referenceBodyRotation').set(reference.rotation.flat());relative.input('referenceBodyPosition').set(reference.position);
      relative.input('opticalToBody').set(camera.flat());relative.input('cameraOriginBody').set(lever);
      relative.input('currentFromReference').set(registration.output('rotation'));
      relative.input('currentFromReferenceTranslation').set(registration.output('translation'));
      relative.input('registrationAccepted').set(registration.output('accepted'));
      const poseStart=performance.now();relative.evaluate(tick/90);const relativeMs=performance.now()-poseStart;
      expect(relative.output('valid')[0],name).toBe(invalid?0:1);
      const observed={rotation:Array.from({length:3},(_,i)=>Array.from(relative.output('observedBodyRotation').subarray(i*3,i*3+3))),position:Array.from(relative.output('observedBodyPosition'))};
      near(observed.rotation.flat(),invalid?I.flat():current.rotation.flat(),`${name}/body rotation`);
      near(observed.position,invalid?[0,0,0]:current.position,`${name}/body position`);
      record.cases.push({name,activeCount:14400,enabledPairs:invalid?2:sparse?6:14400,sparseLateSlots:sparse?lateSlots:undefined,
        measurementReferenceBodyPose:measurementReference,retainedEstimatedReferenceBodyPose:reference,expectedCurrentBodyPose:current,
        opticalToBody:camera,cameraOriginBody:lever,actualRegistrationRotation:Array.from(registration.output('rotation')),
        actualRegistrationTranslation:Array.from(registration.output('translation')),
        registrationAccepted:accepted,rejectionReason:registration.output('rejectionReason')[0],rms:registration.output('rms')[0],registrationMs,relativeMs,
        recoveredPosition:observed.position,maximumPoseError:Math.max(...observed.position.map((v,i)=>Math.abs(v-(invalid?0:current.position[i]))),...observed.rotation.flat().map((v,i)=>Math.abs(v-(invalid?I.flat():current.rotation.flat())[i])))});save();return observed;
    };
    const reference={rotation:I,position:[0,0,0]};
    const translation={rotation:I,position:[.7,-.3,.2]};
    run('translation',reference,translation);
    run('rotation with camera lever arm',reference,{rotation:rotation([1,2,-1],.55),position:[0,0,0]});
    const general={rotation:rotation([-2,1,4],-.6),position:[1.1,-.4,.7]};
    run('general six DOF',{rotation:rotation([1,2,3],.25),position:[.2,.3,-.1]},general);
    const extrinsic=rotation([2,-1,4],.7),lever=[.4,-.2,.3];
    run('nonidentity extrinsic and lever arm',reference,general,extrinsic,lever);
    run('sparse late slots at original full capacity',reference,general,C,[.18,0,-.04],true);
    let retained:Pose=reference,analyticPrevious:Pose=reference;
    for(let i=1;i<=12;i++){
      const next={rotation:rotation([1,2,3],i*.025),position:[i*.03,Math.sin(i*.05),i*.01]};
      // Source cloud comes from the independent previous analytic pose; only
      // the observation component receives the retained estimated pose.
      retained=run(`retained observation ${i}`,retained,next,C,[.18,0,-.04],i%3===0,false,analyticPrevious);
      analyticPrevious=next;
    }
    record.retainedObservationChain=12;
    run('invalid registration rejected downstream',retained,general,C,[.18,0,-.04],false,true);
    run('recovery after invalid registration',reference,translation);
    registration.reset();relative.reset();run('reset restores chain',reference,general);
    // Reload source-bound compiler artifacts through ordinary JSON. Execute
    // fresh memories, not retained outputs from the preceding program.
    const persisted=JSON.parse(JSON.stringify({registration:{artifact:registrationArtifact,source:registrationSource},relative:{artifact:relativeArtifact,source:relativeSource}}));
    registration=await NativeProgram.instantiate(persisted.registration.artifact,persisted.registration.source);
    relative=await NativeProgram.instantiate(persisted.relative.artifact,persisted.relative.source);
    run('JSON source artifact reload',reference,general,C,[.18,0,-.04],true);
    record.resetAndReload=true;record.fullCapacityAdmitted=true;record.status='ISOLATED_VISUAL_BODY_OBSERVATION_CHAIN_PASS';record.phase='complete';save();
  }catch(error){record.status='FAIL';record.error=String(error);save();throw error;}
},170_000);
