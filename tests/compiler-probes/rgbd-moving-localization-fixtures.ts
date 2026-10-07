// Independent numerical test fixtures. No application code imports this file.
import {rawDescriptorFixture,rawDescriptorOracle,type DescriptorFrameFixture} from './rgbd-descriptor-frame-fixtures';
import {matchingOracle,type Point} from './rgbd-feature-matching-fixtures';
import {sandwich} from './rgbd-registration-uncertainty-fixtures';
import {coldState,initialFactors} from './rgbd-localization-fixtures';
import {captured,covariance,propagated,stationary} from './schmidt-reference-fixtures';
import {correction,exp,eye,log,mat,mm,mv,plus,product,rot,solve,tr,type Mat,type Q} from './schmidt-relative-fixtures';

export const movingSlots=[0,3,9,17,30,46,61,83,101,123,149,177,201,227,252,279,301,319,337,344,345,347,348,349];
export const movingInitialQ=exp([.21,-.16,.29]);
export const movingMountQ=product(exp([.13,-.08,.17]),[.5,-.5,.5,-.5]);
export const movingMount=rot(movingMountQ),movingOrigin=[.23,-.09,.07],movingPosition=[.6,-.8,1.2];
export const movingH=1/90;
export const movingHeldIntervals=8;
const initialR=rot(movingInitialQ);
export const movingAccel=mv(tr(initialR),[0,0,9.81]);
// A stationary, deliberately biased inertial prior makes the visual update
// observable. The image scene moves; analytic camera truth is never an input.
export const physicalRotation=rot(exp([.0096,-.0072,.0088])),physicalTranslation=[.0096,-.0072,.0064];
export const movingColdState=()=>({...coldState(),position:[...movingPosition],rotation:initialR.flat()});
const norm=(x:number[])=>Math.hypot(...x);
const subtract=(a:number[],b:number[])=>a.map((v,i)=>v-b[i]);
const skew=([x,y,z]:number[])=>[[0,-z,y],[z,0,-x],[-y,x,0]];

function marker(key:number){let seed=(0x91e10da5^((key+1)*0x9e3779b9))>>>0;
  const byte=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>24;};
  return Array.from({length:49},()=>[byte(),byte(),byte(),255]);}
function blank():DescriptorFrameFixture{const f=rawDescriptorFixture();
  f.rgb=Array.from({length:90},()=>Array.from({length:160},()=>[80,80,80,255]));
  f.depth=Array.from({length:90},()=>Array(160).fill(0));f.pixels=Array.from({length:350},()=>[-1,-1]);
  f.activeCount=350;f.disparityNoise=.5;return f;}
function stamp(f:DescriptorFrameFixture,slot:number,pixel:number[],z:number,key:number){
  f.pixels[slot]=pixel;const patch=marker(key);
  for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++)f.rgb[pixel[1]+dy][pixel[0]+dx]=patch[(dy+3)*7+dx+3];
  const mapped=pixel.map((v,k)=>(v-f.rgbCalibration[k+2])*f.depthCalibration[k]/f.rgbCalibration[k]+f.depthCalibration[k+2]);
  const [x,y]=mapped.map(Math.floor);
  // A small fronto-parallel marker surface covers every participating depth
  // sample. Its optical-Z is stored as an actual Float32 sensor sample.
  for(let dy=0;dy<=1;dy++)for(let dx=0;dx<=1;dx++){
    if(f.depth[y+dy][x+dx]!==0)throw Error('overlapping depth-marker footprint');
    f.depth[y+dy][x+dx]=Math.fround(z);}
}

// Independent SO(3) least squares, not the Modelica Horn/Jacobi algorithm.
// Pivoted Gaussian normal solves update a left rotation and free translation.
export function rigidFit(source:number[][],target:number[][]){let R=eye(3),t=[0,0,0];
  for(let iteration=0;iteration<30;iteration++){
    const H=mat(6,6,()=>0),b=Array(6).fill(0);
    source.forEach((p,i)=>{const q=mv(R,p),s=skew(q),J=eye(3).map((row,k)=>[...row,...s[k].map(v=>-v)]),r=subtract(target[i],plus(q,t));
      for(let a=0;a<6;a++){for(let k=0;k<3;k++)b[a]+=J[k][a]*r[k];
        for(let c=0;c<6;c++)for(let k=0;k<3;k++)H[a][c]+=J[k][a]*J[k][c];}});
    const delta=solve(H,b.map(v=>[v])).map(row=>row[0]);t=plus(t,delta.slice(0,3));R=mm(rot(exp(delta.slice(3))),R);
    if(norm(delta)<1e-13)break;
  }
  const rms=Math.sqrt(source.reduce((sum,p,i)=>sum+norm(subtract(plus(mv(R,p),t),target[i]))**2,0)/source.length);
  return {R,t,rms};
}
export function positiveTraceQuaternion(R:Mat):Q{const w=Math.sqrt(1+R[0][0]+R[1][1]+R[2][2])/2;
  return [w,(R[2][1]-R[1][2])/(4*w),(R[0][2]-R[2][0])/(4*w),(R[1][0]-R[0][1])/(4*w)];}

export function movingImages(){const reference=blank(),current=blank();const continuous:number[][]=[];
  movingSlots.forEach((slot,key)=>{const pixel=[20+(key%6)*23,14+Math.floor(key/6)*20],z=1.55+((key*7)%13)*.125;
    const p=[(pixel[0]-reference.rgbCalibration[2])*Math.fround(z)/reference.rgbCalibration[0],
      (pixel[1]-reference.rgbCalibration[3])*Math.fround(z)/reference.rgbCalibration[1],Math.fround(z)];
    const q=plus(mv(physicalRotation,p),physicalTranslation);continuous.push(q);
    const projected=q.slice(0,2).map((v,k)=>Math.round(v*current.rgbCalibration[k]/q[2]+current.rgbCalibration[k+2]));
    stamp(reference,slot,pixel,z,key);stamp(current,movingSlots[movingSlots.length-1-key],projected,q[2],key);});
  return {reference,current,continuous};}
export function movingOracle(){const images=movingImages(),reference=rawDescriptorOracle(images.reference),current=rawDescriptorOracle(images.current);
  const matched=matchingOracle({referenceDescriptor:reference.descriptor,currentDescriptor:current.descriptor,
    referencePoint:reference.point as Point[],currentPoint:current.point as Point[],referenceEnabled:reference.enabled,currentEnabled:current.enabled,
    referenceCount:350,currentCount:350,ratio:.8,maximumDescriptorDistance:.8,usePrediction:0,predictedRotation:eye(3) as Point[],
    predictedTranslation:[0,0,0],maximumGeometricDistance:.5});
  const activeSource=matched.sourcePoint.filter((_,i)=>matched.pairEnabled[i]===1),activeTarget=matched.targetPoint.filter((_,i)=>matched.pairEnabled[i]===1);
  const fit=rigidFit(activeSource,activeTarget),noise=sandwich({referencePoint:matched.sourcePoint,currentPoint:matched.targetPoint,
    pairEnabled:matched.pairEnabled,activeCount:350,registrationAccepted:1,currentFromReference:fit.R,translation:fit.t,
    referenceBodyRotation:initialR,opticalToBody:movingMount,cameraOriginBody:movingOrigin,
    referenceRgbFocal:images.reference.rgbCalibration.slice(0,2),currentRgbFocal:images.current.rgbCalibration.slice(0,2),
    referenceNoiseFx:images.reference.noiseReferenceFx,currentNoiseFx:images.current.noiseReferenceFx,baseline:images.current.baseline},images.current.disparityNoise);
  const dynamics=stationary(movingH,initialR),first=captured(propagated(initialFactors(),dynamics.Phi,dynamics.B));
  let prior=first;
  for(let i=0;i<=movingHeldIntervals;i++)prior=propagated(prior,dynamics.Phi,dynamics.B);
  const update=correction({p:[...movingPosition],v:[0,0,0],q:[...movingInitialQ],ba:[0,0,0],bg:[0,0,0],pr:[...movingPosition],qr:[...movingInitialQ],
    b:movingMountQ,o:movingOrigin,z:positiveTraceQuaternion(fit.R),t:fit.t,P:covariance(prior).joint,C:noise.relativeCovariance});
  const nextPosition=plus(movingPosition,update.d.slice(0,3)),nextR=rot(update.nextQ);
  const worldPoints=current.point.map(p=>plus(nextPosition,mv(nextR,plus(mv(movingMount,p),movingOrigin))));
  return {...images,referenceOracle:reference,currentOracle:current,matched,fit,noise,first,prior,update,nextPosition,nextR,worldPoints,
    angularQuantizationError:norm(log(positiveTraceQuaternion(mm(fit.R,tr(physicalRotation))))),
    translationQuantizationError:norm(subtract(fit.t,physicalTranslation))};
}
