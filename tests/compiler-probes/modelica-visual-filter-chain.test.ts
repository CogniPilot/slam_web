import {it,expect} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {NativeProgram,type NativeProgramArtifact} from '../../src/modelica-native-program';
import {ModelicaFilterSession,type FilterSnapshot,type FilterFrame} from '../../src/modelica-filter-session';

type Mat=number[][];type Oracle={mean:number[];covariance:Mat};
const sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const matrix=(n:number,m:number,f:(i:number,j:number)=>number):Mat=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>f(i,j)));
const identity=(n:number)=>matrix(n,n,(i,j)=>+(i===j));
const transpose=(a:Mat)=>matrix(a[0].length,a.length,(i,j)=>a[j][i]);
const multiply=(a:Mat,b:Mat)=>matrix(a.length,b[0].length,(i,j)=>a[i].reduce((sum,value,k)=>sum+value*b[k][j],0));
const plus=(a:Mat,b:Mat)=>matrix(a.length,a[0].length,(i,j)=>a[i][j]+b[i][j]);
const scale=(a:Mat,v:number)=>a.map(row=>row.map(value=>value*v));
const mv=(a:Mat,v:number[])=>a.map(row=>row.reduce((s,value,j)=>s+value*v[j],0));
const I=identity(3),C:Mat=[[0,0,1],[-1,0,0],[0,-1,0]],lever=[.18,0,-.04];
const density=[.06,.06,.06,.006,.006,.006,.002,.002,.002,.0002,.0002,.0002];
const initialCovariance=scale(identity(15),.1),measurementCovariance=scale(identity(6),.04);
const h=1/90;
const measuredHeight=(k:number)=>.0015*k+.00003*k*k;
const measuredImu=(k:number)=>({accel:[0,0,9.81+.01*Math.sin(k)],gyro:[0,0,0]});
const worldPoint=(i:number)=>[8+(i%120)/30,-2+Math.floor(i/120)/30,.3+(i%7)/5+(Math.floor(i/120)%3)/7];
const opticalPoint=(world:number[],height:number)=>mv(transpose(C),world.map((value,j)=>value-lever[j]-(j===2?height:0)));

// Test-only Gaussian elimination, independent of Modelica's checked Cholesky.
function solve(a:Mat,b:Mat):Mat{
  const n=a.length,m=b[0].length,rows=a.map((row,i)=>[...row,...b[i]]);
  for(let k=0;k<n;k++){
    let pivot=k;for(let i=k+1;i<n;i++)if(Math.abs(rows[i][k])>Math.abs(rows[pivot][k]))pivot=i;
    [rows[k],rows[pivot]]=[rows[pivot],rows[k]];
    for(let i=k+1;i<n;i++){const ratio=rows[i][k]/rows[k][k];for(let j=k;j<n+m;j++)rows[i][j]-=ratio*rows[k][j];}
  }
  const x=matrix(n,m,()=>0);
  for(let i=n-1;i>=0;i--)for(let j=0;j<m;j++)x[i][j]=(rows[i][n+j]-rows[i].slice(i+1,n).reduce((s,value,k)=>s+value*x[i+1+k][j],0))/rows[i][i];
  return x;
}
// Exact nilpotent held-force continuous Lyapunov solution. This oracle uses
// neither the Modelica polynomial transition nor its Gauss-Legendre nodes.
function prediction(state:Oracle,accel:number[]):Oracle{
  const force=accel.map((value,i)=>value-state.mean[i+9]);
  const skew:Mat=[[0,-force[2],force[1]],[force[2],0,-force[0]],[-force[1],force[0],0]];
  const F=matrix(15,15,()=>0),G=matrix(15,12,()=>0);
  for(let i=0;i<3;i++){
    F[i][i+3]=1;F[i+3][i+9]=-1;F[i+6][i+12]=-1;
    G[i+3][i]=-1;G[i+6][i+3]=-1;G[i+9][i+6]=1;G[i+12][i+9]=1;
    for(let j=0;j<3;j++)F[i+3][j+6]=-skew[i][j];
  }
  const powers=[identity(15)];for(let i=1;i<=4;i++)powers.push(multiply(powers.at(-1)!,F));
  expect(powers[4].flat()).toEqual(Array(225).fill(0));
  const factorial=[1,1,2,6],D=multiply(multiply(G,matrix(12,12,(i,j)=>i===j?density[i]**2:0)),transpose(G));
  let transition=matrix(15,15,()=>0),Q=matrix(15,15,()=>0);
  for(let i=0;i<4;i++)transition=plus(transition,scale(powers[i],h**i/factorial[i]));
  for(let i=0;i<4;i++)for(let j=0;j<4;j++)Q=plus(Q,scale(multiply(multiply(powers[i],D),transpose(powers[j])),h**(i+j+1)/(factorial[i]*factorial[j]*(i+j+1))));
  const mean=[...state.mean];
  for(let i=0;i<3;i++){const acceleration=force[i]-(i===2?9.81:0);mean[i]+=mean[i+3]*h+.5*acceleration*h*h;mean[i+3]+=acceleration*h;}
  return {mean,covariance:plus(multiply(multiply(transition,state.covariance),transpose(transition)),Q)};
}
function correction(state:Oracle,observed:number[]):{state:Oracle;nis:number}{
  const selected=[0,1,2,6,7,8],H=matrix(6,15,(i,j)=>+(selected[i]===j));
  const cross=multiply(state.covariance,transpose(H)),S=plus(multiply(H,cross),measurementCovariance);
  const K=transpose(solve(S,transpose(cross))),innovation=[...observed.map((v,i)=>v-state.mean[i]),0,0,0];
  const delta=mv(K,innovation),residual=plus(identity(15),scale(multiply(K,H),-1));
  const posterior=plus(multiply(multiply(residual,state.covariance),transpose(residual)),multiply(multiply(K,measurementCovariance),transpose(K)));
  const solved=solve(S,innovation.map(value=>[value]));
  return {state:{mean:state.mean.map((value,i)=>value+delta[i]),covariance:posterior},nis:innovation.reduce((sum,value,i)=>sum+value*solved[i][0],0)};
}
function error(actual:ArrayLike<number>,expected:ArrayLike<number>):number{
  expect(actual.length).toBe(expected.length);return Math.max(...Array.from(actual).map((value,i)=>{expect(Number.isFinite(value)).toBe(true);return Math.abs(value-expected[i]);}));
}

it('actual full-capacity visual geometry observations drive retained Modelica ES15 corrections with independent numeric oracles',async()=>{
  const geometry=process.env.RUMOCA_VISUAL_FILTER_GEOMETRY??'dev/artifacts/registration-relative-pose-chain';
  const filterDirectory=process.env.RUMOCA_VISUAL_FILTER_ARTIFACT??'/tmp/slam-modelica-filter-session-artifacts';
  const registrationSource=readFileSync(resolve(geometry,'RigidPointRegistration.mo'),'utf8');
  const relativeSource=readFileSync(resolve(geometry,'RGBDRelativePose.mo'),'utf8');
  const filterSource=readFileSync(resolve(filterDirectory,'source.mo'),'utf8');
  const registrationArtifact:NativeProgramArtifact=JSON.parse(readFileSync(resolve(geometry,'registration.artifact.json'),'utf8'));
  const relativeArtifact:NativeProgramArtifact=JSON.parse(readFileSync(resolve(geometry,'relative-pose.artifact.json'),'utf8'));
  const filterRaw=readFileSync(resolve(filterDirectory,'baseline.json'),'utf8'),filterArtifact:NativeProgramArtifact=JSON.parse(filterRaw);
  const reportPath=process.env.RUMOCA_VISUAL_FILTER_REPORT;
  const record:any={schemaVersion:1,status:'RUNNING',recordedAt:new Date().toISOString(),engine:`Node ${process.version} WebAssembly in Vitest`,
    scope:'Three separately source-issued programs: full14400 rigid registration -> calibrated relative body pose -> persistent ES15FilterStep',
    capacity:14400,imuHz:90,covarianceCells:225,observationCovariance:measurementCovariance,
    observationCovariancePolicy:'Explicit conservative independent fixture: position variances0.04m², attitude variances0.04rad². Not inferred from registration.',
    fixture:{worldPointFormula:'[8+(i%120)/30,-2+floor(i/120)/30,.3+(i%7)/5+(floor(i/120)%3)/7]',heightFormula:'.0015*k+.00003*k*k',
      measuredImuFormula:'accel=[0,0,9.81+.01*sin(k)], gyro=[0,0,0]',opticalToBody:C,cameraOriginBody:lever,initialCovariance},
    sources:{registration:sha(registrationSource),relativePose:sha(relativeSource),filter:sha(filterSource),test:sha(readFileSync('tests/compiler-probes/modelica-visual-filter-chain.test.ts'))},
    modules:{registration:registrationArtifact.module_sha256,relativePose:relativeArtifact.module_sha256,filter:filterArtifact.module_sha256},
    artifacts:{registration:sha(readFileSync(resolve(geometry,'registration.artifact.json'))),relativePose:sha(readFileSync(resolve(geometry,'relative-pose.artifact.json'))),filter:sha(filterRaw)},
    compiler:{registration:registrationArtifact.compiler,relativePose:relativeArtifact.compiler,filter:filterArtifact.compiler},cases:[],
    fullSlam:false,runtimeIntegrated:false,productionPinChanged:false,compilerBuildRun:false,
    limitations:['No image capture, depth lifting, descriptor matching, dynamic-object robustness, keyframes/map, relocalization or loop closure.',
      'Repeated relative observations reuse retained estimated reference poses. Cross-frame reference/measurement correlations are not accounted for; fixed covariance is a conservative fixture, not a proven consistent uncertainty model.',
      'This independent filter numeric oracle covers measured translation/held-IMU motion with nominal identity body rotation; general6DOF geometric composition is covered by the separate geometry chain.',
      'Known matched point-pairs are generated from analytic camera fixtures; ground truth fields never enter tested modules.',
      'Node WASM execution of separate modules, not a single compiler-issued graph or Chromium worker chain/full-pipeline acceptance.']};
  const save=()=>{if(reportPath)writeFileSync(reportPath,JSON.stringify(record,null,2)+'\n');};save();
  try{
    let registration=await NativeProgram.instantiate(registrationArtifact,registrationSource),relative=await NativeProgram.instantiate(relativeArtifact,relativeSource);
    const initial={time:0,covariance:initialCovariance.flat()};
    const filter=await ModelicaFilterSession.create(filterArtifact,filterSource,initial);
    const initialSnapshot=filter.snapshot();
    const independentFixtures:any={schemaVersion:1,engine:record.engine,initial:initialSnapshot,artifacts:{
      registration:{artifactPath:'dev/artifacts/registration-relative-pose-chain/registration.artifact.json',sourcePath:'dev/artifacts/registration-relative-pose-chain/RigidPointRegistration.mo',sourceSha256:registrationArtifact.source_sha256,moduleSha256:registrationArtifact.module_sha256},
      relativePose:{artifactPath:'dev/artifacts/registration-relative-pose-chain/relative-pose.artifact.json',sourcePath:'dev/artifacts/registration-relative-pose-chain/RGBDRelativePose.mo',sourceSha256:relativeArtifact.source_sha256,moduleSha256:relativeArtifact.module_sha256},
      filter:{artifactPath:'dev/artifacts/visual-filter-chain/filter.artifact.json',sourcePath:'dev/artifacts/visual-filter-chain/filter-source.mo',sourceSha256:filterArtifact.source_sha256,moduleSha256:filterArtifact.module_sha256}},
      observationCovariancePolicy:record.observationCovariancePolicy,frames:[],limits:record.limitations};
    expect(registration.input('sourcePoint').length).toBe(43200);expect(registration.input('targetPoint').length).toBe(43200);
    const visual=(step:number,reference:FilterSnapshot)=>{
      const source=registration.input('sourcePoint'),target=registration.input('targetPoint'),enabled=registration.input('pairEnabled');
      for(let i=0;i<14400;i++){
        source.set(opticalPoint(worldPoint(i),measuredHeight(step-1)),i*3);
        target.set(opticalPoint(worldPoint(i),measuredHeight(step)),i*3);
        enabled[i]=step===4?(i<2?1:0):step===6?(i>=14380?1:0):1;
      }
      registration.input('activeCount')[0]=14400;registration.evaluate(step*h);
      relative.input('referenceBodyRotation').set(reference.rotation);relative.input('referenceBodyPosition').set(reference.position);
      relative.input('opticalToBody').set(C.flat());relative.input('cameraOriginBody').set(lever);
      relative.input('currentFromReference').set(registration.output('rotation'));
      relative.input('currentFromReferenceTranslation').set(registration.output('translation'));
      relative.input('registrationAccepted').set(registration.output('accepted'));relative.evaluate(step*h);
      const valid=relative.output('valid')[0];expect(valid).toBe(step===4?0:1);
      if(!valid)return undefined;
      // Transport copies only actual relative-pose outputs and fixture noise.
      return {rotation:Array.from(relative.output('observedBodyRotation')),position:Array.from(relative.output('observedBodyPosition')),covariance:measurementCovariance.flat()};
    };
    const snapshots:FilterSnapshot[]=[],frames:FilterFrame[]=[];let oracle:Oracle={mean:Array(15).fill(0),covariance:initialCovariance},oracleLastNis=0;
    for(let step=1;step<=9;step++){
      const before=filter.snapshot(),imu=measuredImu(step),observation=visual(step,before);
      const expectedVisualPosition=oracle.mean.slice(0,3).map((value,i)=>value+(i===2?measuredHeight(step)-measuredHeight(step-1):0));
      const visualPositionError=error(relative.output('observedBodyPosition'),observation?expectedVisualPosition:[0,0,0]);
      const visualRotationError=error(relative.output('observedBodyRotation'),I.flat());
      expect(visualPositionError).toBeLessThan(2e-9);expect(visualRotationError).toBeLessThan(2e-9);
      const registrationInputs={sourcePoint:Array.from(registration.input('sourcePoint')),targetPoint:Array.from(registration.input('targetPoint')),
        pairEnabled:Array.from(registration.input('pairEnabled')),activeCount:14400};
      const frame:FilterFrame={time:step*h,dt:h,imu,...(observation?{observation}:{})};frames.push(structuredClone(frame));
      const predicted=prediction(oracle,imu.accel);let expectedNis=oracleLastNis;
      if(observation){const corrected=correction(predicted,expectedVisualPosition);oracle=corrected.state;expectedNis=corrected.nis;}else oracle=predicted;
      oracleLastNis=expectedNis;
      const snapshot=filter.advance(frame);snapshots.push(snapshot);
      const actualMean=[...snapshot.position,...snapshot.velocity,0,0,0,...snapshot.accelBias,...snapshot.gyroBias];
      const meanError=error(actualMean,oracle.mean),covarianceError=error(snapshot.covariance,oracle.covariance.flat());
      const nisError=Math.abs(snapshot.lastNis-expectedNis),rotationError=error(snapshot.rotation,I.flat());
      expect(meanError).toBeLessThan(2e-9);expect(covarianceError).toBeLessThan(2e-9);expect(nisError).toBeLessThan(2e-9);expect(rotationError).toBeLessThan(2e-9);
      expect(snapshot.acceptedCount).toBe(step-(step>=4?1:0));expect(snapshot.rejectedCount).toBe(0);expect(snapshot.steps).toBe(step);
      if(!observation){expect(snapshot.acceptedCount).toBe(before.acceptedCount);expect(snapshot.rejectedCount).toBe(before.rejectedCount);}
      else expect(snapshot.covariance[2*15+2]).toBeLessThan(predicted.covariance[2][2]);
      record.cases.push({step,time:snapshot.time,imu,referencePose:{rotation:before.rotation,position:before.position},observation,
        registrationAccepted:registration.output('accepted')[0],registrationRejectionReason:registration.output('rejectionReason')[0],validPairs:registration.output('validCount')[0],
        acceptedCount:snapshot.acceptedCount,rejectedCount:snapshot.rejectedCount,meanError,covarianceError,nisError,rotationError,visualPositionError,visualRotationError,
        correctedPosition:snapshot.position,correctedVelocity:snapshot.velocity,accelBias:snapshot.accelBias,posteriorVerticalVariance:snapshot.covariance[32]});save();
      independentFixtures.frames.push({time:step*h,dt:h,imu,registration:registrationInputs,opticalToBody:C.flat(),cameraOriginBody:lever,
        observationCovariance:measurementCovariance.flat(),tolerance:2e-9,expected:{registrationAccepted:step===4?0:1,
          registrationRejectionReason:step===4?3:0,relativeValid:step===4?0:1,observedRotation:I.flat(),observedPosition:step===4?[0,0,0]:expectedVisualPosition,
          filter:{...initialSnapshot,time:step*h,steps:step,rotation:I.flat(),position:oracle.mean.slice(0,3),velocity:oracle.mean.slice(3,6),
            accelBias:oracle.mean.slice(9,12),gyroBias:oracle.mean.slice(12,15),covariance:oracle.covariance.flat(),acceptedCount:step-(step>=4?1:0),rejectedCount:0,lastNis:expectedNis}}});
    }
    expect(Math.abs(snapshots[8].velocity[2])).toBeGreaterThan(1e-5);
    expect(Math.abs(snapshots[8].accelBias[2])).toBeGreaterThan(1e-7);
    // Reset the entire actual chain and repeat the independent cloud sequence.
    filter.reset();registration.reset();relative.reset();expect(filter.snapshot()).toEqual(initialSnapshot);
    for(let step=1;step<=9;step++){
      const observation=visual(step,filter.snapshot()),frame={time:step*h,dt:h,imu:measuredImu(step),...(observation?{observation}:{})};
      expect(filter.advance(frame)).toEqual(snapshots[step-1]);
    }
    const saved=JSON.parse(JSON.stringify({source:filterSource,artifact:filterArtifact,state:snapshots[2],
      registration:{source:registrationSource,artifact:registrationArtifact},relative:{source:relativeSource,artifact:relativeArtifact}}));
    const reload=await ModelicaFilterSession.create(saved.artifact,saved.source,saved.state);
    registration=await NativeProgram.instantiate(saved.registration.artifact,saved.registration.source);
    relative=await NativeProgram.instantiate(saved.relative.artifact,saved.relative.source);
    for(let step=4;step<=9;step++){
      const observation=visual(step,reload.snapshot());
      expect(reload.advance({time:step*h,dt:h,imu:measuredImu(step),...(observation?{observation}:{})})).toEqual(snapshots[step-1]);
    }
    await expect(ModelicaFilterSession.create(filterArtifact,filterSource+'\n// unmatched source\n',initial)).rejects.toThrow('does not match its source');
    await expect(ModelicaFilterSession.create(filterArtifact,filterSource,{...snapshots[2],sourceSha256:'0'.repeat(64)})).rejects.toThrow('source/schema mismatch');
    const outputDirectory=process.env.RUMOCA_VISUAL_FILTER_EXPORT;
    if(outputDirectory){mkdirSync(outputDirectory,{recursive:true});writeFileSync(resolve(outputDirectory,'filter-source.mo'),filterSource);writeFileSync(resolve(outputDirectory,'filter.artifact.json'),filterRaw);writeFileSync(resolve(outputDirectory,'frames-and-snapshots.json'),JSON.stringify({frames,snapshots},null,2)+'\n');}
    const fixturesPath=process.env.RUMOCA_VISUAL_FILTER_FIXTURES??'dev/artifacts/registration-relative-pose-filter-chain/independent-fixtures.json';
    mkdirSync(dirname(fixturesPath),{recursive:true});writeFileSync(fixturesPath,JSON.stringify(independentFixtures)+'\n');
    record.independentFixtures={path:fixturesPath,sha256:sha(readFileSync(fixturesPath)),frames:independentFixtures.frames.length,
      expected:'Independent analytic optical geometry + nilpotent continuous Lyapunov/Gaussian/Joseph full225-cell oracle, not copied executed filter outputs'};
    record.resetAndSourceBoundReload=true;record.rejectedRegistrationPredictionOnly=true;record.recoveryVerified=true;
    record.maximumErrors=Object.fromEntries(['meanError','covarianceError','nisError','rotationError','visualPositionError','visualRotationError'].map(field=>[field,Math.max(...record.cases.map((item:any)=>item[field]))]));
    record.status='ISOLATED_VISUAL_GEOMETRY_ES15_CHAIN_PASS';save();
  }catch(error){record.status='FAIL';record.error=String(error);save();throw error;}
},170_000);
