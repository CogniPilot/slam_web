// Independent test oracle only. Never imported by application code.
// Quaternion perturbations and finite differences avoid copying Modelica H/reset.
export type Mat=number[][];
export type Q=[number,number,number,number];
export const mat=(n:number,m:number,f:(i:number,j:number)=>number):Mat=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>f(i,j)));
export const eye=(n:number)=>mat(n,n,(i,j)=>+(i===j));
export const tr=(a:Mat)=>mat(a[0].length,a.length,(i,j)=>a[j][i]);
export const mm=(a:Mat,b:Mat)=>mat(a.length,b[0].length,(i,j)=>a[i].reduce((s,v,k)=>s+v*b[k][j],0));
export const mv=(a:Mat,b:number[])=>a.map(r=>r.reduce((s,v,i)=>s+v*b[i],0));
export const plus=(a:number[],b:number[])=>a.map((v,i)=>v+b[i]);
export const minus=(a:number[],b:number[])=>a.map((v,i)=>v-b[i]);
export const norm=(a:number[])=>Math.hypot(...a);
export const conjugate=(a:Q):Q=>[a[0],-a[1],-a[2],-a[3]];
export function product(a:Q,b:Q):Q {
  const [w,x,y,z]=a,[W,X,Y,Z]=b;
  return [w*W-x*X-y*Y-z*Z,w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W];
}
export function exp(v:number[]):Q {
  const a=norm(v),s=a===0?.5:Math.sin(a/2)/a;
  return [Math.cos(a/2),...v.map(x=>x*s)] as Q;
}
export function log(q:Q):number[] {
  const v=q.map(x=>x*(q[0]<0?-1:1)/norm(q)),a=norm(v.slice(1));
  return v.slice(1).map(x=>x*(a===0?2:2*Math.atan2(a,v[0])/a));
}
export function rot(q:Q):Mat {
  const [w,x,y,z]=q;
  return [[1-2*(y*y+z*z),2*(x*y-w*z),2*(x*z+w*y)],
    [2*(x*y+w*z),1-2*(x*x+z*z),2*(y*z-w*x)],
    [2*(x*z-w*y),2*(y*z+w*x),1-2*(x*x+y*y)]];
}
export type Fixture={p:number[];v:number[];q:Q;ba:number[];bg:number[];pr:number[];qr:Q;b:Q;o:number[];z:Q;t:number[];P:Mat;C:Mat};
// Optical pose composition, using independently composed quaternions.
export function predicted(f:Fixture) {
  const rc=rot(f.q),rr=rot(f.qr),camera=rot(product(f.q,f.b));
  return {q:product(conjugate(product(f.q,f.b)),product(f.qr,f.b)),
    t:mv(tr(camera),minus(plus(f.pr,mv(rr,f.o)),plus(f.p,mv(rc,f.o))))};
}
export function innovation(f:Fixture):number[] {
  const p=predicted(f);return [...minus(f.t,p.t),...log(product(conjugate(p.q),f.z))];
}
export function shifted(f:Fixture,axis:number,delta:number):Fixture {
  const x=structuredClone(f),v=Array(3).fill(0);
  if(axis<3)x.p[axis]+=delta;
  else if(axis>=6&&axis<9){v[axis-6]=delta;x.q=product(x.q,exp(v));}
  else if(axis>=15&&axis<18)x.pr[axis-15]+=delta;
  else if(axis>=18){v[axis-18]=delta;x.qr=product(x.qr,exp(v));}
  return x;
}
export function jacobian(f:Fixture):Mat {
  const eps=2e-6;
  return tr(Array.from({length:21},(_,axis)=>minus(innovation(shifted(f,axis,eps)),innovation(shifted(f,axis,-eps))).map(v=>-v/(2*eps))));
}
// Analytic result derived in docs; the oracle correction above still uses FD H.
export function derivedJacobian(f:Fixture):Mat {
  const u=rot(predicted(f).q),bT=tr(rot(f.b)),a=tr(rot(product(f.q,f.b)));
  const d=mv(tr(rot(f.q)),minus(plus(f.pr,mv(rot(f.qr),f.o)),f.p)),r=innovation(f).slice(3);
  const skew=(v:number[]):Mat=>[[0,-v[2],v[1]],[v[2],0,-v[0]],[-v[1],v[0],0]];
  const W=skew(r),angle=norm(r),c=angle<1e-4?1/12+angle*angle/720:(1-angle/2/Math.tan(angle/2))/(angle*angle);
  const W2=mm(W,W),leftInverse=mat(3,3,(i,j)=>+(i===j)-W[i][j]/2+c*W2[i][j]);
  const H=mat(6,21,()=>0),tc=mm(bT,skew(d)),trr=mm(mm(a,rot(f.qr)),skew(f.o));
  const rc=mm(mm(leftInverse,tr(u)),bT),rr=mm(leftInverse,bT);
  for(let i=0;i<3;i++)for(let j=0;j<3;j++){
    H[i][j]=-a[i][j];H[i][j+6]=tc[i][j];H[i][j+15]=a[i][j];H[i][j+18]=-trr[i][j];
    H[i+3][j+6]=-rc[i][j];H[i+3][j+18]=rr[i][j];
  }
  return H;
}
export function noiseJacobian(f:Fixture):Mat {
  const eps=2e-6;
  return tr(Array.from({length:6},(_,axis)=>{
    const side=(s:number)=>{const x=structuredClone(f),v=Array(3).fill(0);if(axis<3)x.t[axis]+=s*eps;
      else{v[axis-3]=s*eps;x.z=product(exp(v),x.z);}return innovation(x);};
    return minus(side(1),side(-1)).map(v=>v/(2*eps));
  }));
}
// Partial-pivot Gaussian solve, independent of Modelica's Cholesky.
export function solve(A:Mat,B:Mat):Mat {
  const n=A.length,m=B[0].length,a=A.map((r,i)=>[...r,...B[i]]),x=mat(n,m,()=>0);
  for(let k=0;k<n;k++){
    let p=k;for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[p][k]))p=i;
    [a[p],a[k]]=[a[k],a[p]];if(Math.abs(a[k][k])<1e-25)throw Error('singular oracle');
    for(let i=k+1;i<n;i++){const f=a[i][k]/a[k][k];for(let j=k;j<n+m;j++)a[i][j]-=f*a[k][j];}
  }
  for(let i=n-1;i>=0;i--)for(let j=0;j<m;j++)x[i][j]=(a[i][n+j]-a[i].slice(i+1,n).reduce((s,v,k)=>s+v*x[i+1+k][j],0))/a[i][i];
  return x;
}
const sum=(a:Mat,b:Mat)=>mat(a.length,a[0].length,(i,j)=>a[i][j]+b[i][j]);
export function resetJacobian(d:number[]):Mat {
  const eps=2e-6;
  return tr(Array.from({length:3},(_,axis)=>{
    const side=(s:number)=>log(product(conjugate(exp(d)),exp(d.map((v,i)=>v+(i===axis?s*eps:0)))));
    return minus(side(1),side(-1)).map(v=>v/(2*eps));
  }));
}
export function correction(f:Fixture) {
  const H=jacobian(f),N=noiseJacobian(f),noise=mm(mm(N,f.C),tr(N)),cross=mm(f.P,tr(H));
  const S=sum(mm(H,cross),noise),K=tr(solve(S,tr(cross)));
  // Schmidt gain's nuisance rows are zero, not the full21 Kalman gain.
  for(let i=15;i<21;i++)K[i].fill(0);
  const r=innovation(f),d=mv(K,r),KH=mm(K,H),A=mat(21,21,(i,j)=>+(i===j)-KH[i][j]);
  const joseph=sum(mm(mm(A,f.P),tr(A)),mm(mm(K,noise),tr(K))),reset=eye(21),J=resetJacobian(d.slice(6,9));
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)reset[i+6][j+6]=J[i][j];
  const posterior=mm(mm(reset,joseph),tr(reset)),nis=r.reduce((s,v,i)=>s+v*solve(S,r.map(v=>[v]))[i][0],0);
  return {H,N,S,noise,K,d,joseph,posterior,nis,r,nextQ:product(f.q,exp(d.slice(6,9)))};
}
export function correlated(n:number,scale:number):Mat {
  const L=mat(n,n,(i,j)=>j>i?0:i===j?scale*(1+i/50):scale*.04*Math.sin((i+1)*(j+2)));
  return mm(L,tr(L));
}
export function fixture(k=0):Fixture {
  const f:Fixture={p:[.5,-.8,1.2],v:[.1,-.2,.3],q:exp([.35,-.28,.17+k*.03]),ba:[.02,-.01,.03],bg:[.005,-.002,.001],
    pr:[-.8,.4,1.6],qr:exp([-.2,.31,.63]),b:exp([.7,-.5,1.1]),o:[.23,-.12,.07],z:exp([0,0,0]),t:[0,0,0],P:correlated(21,.1),C:correlated(6,.03)};
  const p=predicted(f);f.z=product(exp([.04,-.02,.01]),p.q);f.t=plus(p.t,[.06,-.04,.02]);return f;
}
export function gaugeFixture(commonVariance=40):Fixture {
  const f=fixture();f.P=correlated(21,.04);
  const G=mat(21,3,(i,j)=>+(i===j||i===j+15));
  f.P=sum(f.P,mm(G,tr(G)).map(r=>r.map(v=>v*commonVariance)));return f;
}
export function geometryCases():{label:string;f:Fixture}[] {
  const rows=Array.from({length:12},(_,k)=>({label:`rotated${k}`,f:fixture(k)}));
  const small=fixture();small.z=product(exp([1e-9,-2e-9,3e-9]),predicted(small).q);
  rows.push({label:'small-angle innovation',f:small});
  const boundary=fixture();boundary.z=product(exp([.349,0,0]),predicted(boundary).q);
  rows.push({label:'angular gate interior',f:boundary});
  const standard=fixture();standard.b=[.5,-.5,.5,-.5];standard.o=[.18,0,-.04];
  const p=predicted(standard);standard.z=product(exp([.04,-.02,.01]),p.q);standard.t=plus(p.t,[.06,-.04,.02]);
  const coupled=fixture(),direction=[0,0,0,.02,0,0,.12,-.1,.08,.005,0,0,0,0,0,0,0,0,.1,.07,-.1];
  coupled.P=sum(coupled.P,mat(21,21,(i,j)=>direction[i]*direction[j]));
  const semidefinite=fixture();semidefinite.P=mat(21,21,(i,j)=>i===j&&(i<3||i>=6&&i<9||i>=15)?.01:0);
  rows.push({label:'RDF-to-FLU standard mount',f:standard},{label:'correlated gauge',f:gaugeFixture()},
    {label:'strong attitude-reference cross reset',f:coupled},{label:'PSD inertial uncertainty',f:semidefinite});return rows;
}
export function inputs(f:Fixture):Record<string,unknown> {
  return {position:f.p,velocity:f.v,rotation:rot(f.q),accelBias:f.ba,gyroBias:f.bg,
    referencePosition:f.pr,referenceRotation:rot(f.qr),opticalToBody:rot(f.b),cameraOriginBody:f.o,
    measuredRotation:rot(f.z),measuredTranslation:f.t,measurementEnabled:[1],
    covariance:f.P.slice(0,15).map(r=>r.slice(0,15)),crossCovariance:f.P.slice(0,15).map(r=>r.slice(15)),
    referenceCovariance:f.P.slice(15).map(r=>r.slice(15)),relativeCovariance:f.C};
}
