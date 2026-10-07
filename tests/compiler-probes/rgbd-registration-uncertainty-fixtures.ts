// Independent test-only dense algebra; never imported by production runtime.
export type Matrix=number[][];
export const I=(n:number):Matrix=>Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>+(i===j)));
export const zeros=(m:number,n:number):Matrix=>Array.from({length:m},()=>Array(n).fill(0));
export const transpose=(a:Matrix):Matrix=>a[0].map((_,j)=>a.map(r=>r[j]));
export const multiply=(a:Matrix,b:Matrix):Matrix=>a.map(r=>b[0].map((_,j)=>r.reduce((s,v,k)=>s+v*b[k][j],0)));
export const mv=(a:Matrix,b:number[])=>a.map(r=>r.reduce((s,v,k)=>s+v*b[k],0));
export const skew=([x,y,z]:number[]):Matrix=>[[0,-z,y],[z,0,-x],[-y,x,0]];
export function rotation(axis:number[],angle:number):Matrix{const l=Math.hypot(...axis),[x,y,z]=axis.map(v=>v/l),c=Math.cos(angle),s=Math.sin(angle),d=1-c;return [[c+x*x*d,x*y*d-z*s,x*z*d+y*s],[y*x*d+z*s,c+y*y*d,y*z*d-x*s],[z*x*d-y*s,z*y*d+x*s,c+z*z*d]];}
// Pivoted Gauss-Jordan, deliberately different from Modelica's Cholesky.
export function inverse(a:Matrix):Matrix{const n=a.length,b=a.map((r,i)=>[...r,...I(n)[i]]);for(let j=0;j<n;j++){let p=j;for(let i=j+1;i<n;i++)if(Math.abs(b[i][j])>Math.abs(b[p][j]))p=i;if(Math.abs(b[p][j])<1e-12)throw Error('singular');[b[p],b[j]]=[b[j],b[p]];const d=b[j][j];b[j]=b[j].map(v=>v/d);for(let i=0;i<n;i++)if(i!==j){const f=b[i][j];b[i]=b[i].map((v,k)=>v-f*b[j][k]);}}return b.map(r=>r.slice(n));}
export function pointCovariance(p:number[],f:number[],noiseFx:number,baseline:number,localization=.5,disparity=.1,inflation=1):Matrix{
  // Different factorization: Jacobian of (u,v,disparity) deprojection.
  const z=p[2],d=noiseFx*baseline/z;
  const A=[[z/f[0],0,-p[0]/d],[0,z/f[1],-p[1]/d],[0,0,-z/d]];
  return multiply(multiply(A,[[localization**2,0,0],[0,localization**2,0],[0,0,(inflation*disparity)**2]]),transpose(A));
}
export const defaultE:Matrix=[[0,0,1],[-1,0,0],[0,-1,0]];
export type Fixture={referencePoint:number[][];currentPoint:number[][];pairEnabled:number[];activeCount:number;registrationAccepted:number;currentFromReference:Matrix;translation:number[];referenceBodyRotation:Matrix;opticalToBody:Matrix;cameraOriginBody:number[];referenceRgbFocal:number[];currentRgbFocal:number[];referenceNoiseFx:number;currentNoiseFx:number;baseline:number};
export function fixture(capacity=350):Fixture{const R=rotation([1,2,-3],.12),t=[.05,-.02,.1],referencePoint=Array.from({length:capacity},(_,i)=>[((i%25)-12)*.025,(Math.floor(i/25)%14-7)*.02,2+(i%17)*.03]);return {referencePoint,currentPoint:referencePoint.map(p=>mv(R,p).map((v,k)=>v+t[k])),pairEnabled:Array(capacity).fill(1),activeCount:capacity,registrationAccepted:1,currentFromReference:R,translation:t,referenceBodyRotation:rotation([2,-1,4],.37),opticalToBody:defaultE.map(r=>r.slice()),cameraOriginBody:[.18,0,-.04],referenceRgbFocal:[116.4,116.4],currentRgbFocal:[119,114],referenceNoiseFx:848/(2*Math.tan(87*Math.PI/360)),currentNoiseFx:848/(2*Math.tan(87*Math.PI/360)),baseline:.05};}
export function pose(f:Fixture,R=f.currentFromReference,t=f.translation){const C=multiply(multiply(f.referenceBodyRotation,f.opticalToBody),transpose(R)),B=multiply(C,transpose(f.opticalToBody));return {rotation:B,position:mv(C,t).map((v,k)=>-v-mv(B,f.cameraOriginBody)[k])};}
export function observationJacobian(f:Fixture):Matrix{const C=multiply(multiply(f.referenceBodyRotation,f.opticalToBody),transpose(f.currentFromReference)),arm=f.translation.map((v,k)=>v+mv(transpose(f.opticalToBody),f.cameraOriginBody)[k]),cross=multiply(C,skew(arm)),G=zeros(6,6);for(let i=0;i<3;i++)for(let j=0;j<3;j++){G[i][j]=-C[i][j];G[i][j+3]=-cross[i][j];G[i+3][j+3]=-f.opticalToBody[i][j];}return G;}
export function sandwich(f:Fixture,disparity=.1){const H=zeros(6,6),M=zeros(6,6);let count=0;for(let i=0;i<f.activeCount;i++){if(f.pairEnabled[i]!==1)continue;count++;const p=f.referencePoint[i],q=mv(f.currentFromReference,p),S=skew(q),J=I(3).map((r,k)=>[...r,...S[k].map(v=>-v)]),Cr=pointCovariance(p,f.referenceRgbFocal,f.referenceNoiseFx,f.baseline,.5,disparity),Ct=pointCovariance(f.currentPoint[i],f.currentRgbFocal,f.currentNoiseFx,f.baseline,.5,disparity),rot=multiply(multiply(f.currentFromReference,Cr),transpose(f.currentFromReference)),Sigma=Ct.map((r,a)=>r.map((v,b)=>v+rot[a][b])),h=multiply(transpose(J),J),m=multiply(multiply(transpose(J),Sigma),J);for(let a=0;a<6;a++)for(let b=0;b<6;b++){H[a][b]+=h[a][b];M[a][b]+=m[a][b];}}
 const inv=inverse(H),relative=multiply(multiply(inv,M),transpose(inv)),G=observationJacobian(f),observation=multiply(multiply(G,relative),transpose(G));return {relativeCovariance:relative,observationCovariance:observation,normalMatrix:H,noiseMatrix:M,observationJacobian:G,validCount:count};}
