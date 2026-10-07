// Independent fixture/oracle mathematics only; no application imports this file.
import {eye,mat,mm,tr,mv,rot,exp,plus,resetJacobian,type Mat} from './schmidt-relative-fixtures';
export const poseIndices=[0,1,2,6,7,8];
export type Factors={current:Mat;reference:Mat};
export function latentFixture():Factors {
  const current=mat(15,27,(i,j)=>j===i?.05:j===24+i&&i<3?Math.sqrt(60):0);
  const reference=mat(6,27,(i,j)=>j===15+i?.03:j===24+i&&i<3?Math.sqrt(60):j<15?.013*Math.cos((i+1)*(j+2)):0);
  return {current,reference};
}
export function covariance(f:Factors) {
  const joint=[...f.current,...f.reference],P=mm(joint,tr(joint));
  return {joint:P,current:P.slice(0,15).map(r=>r.slice(0,15)),cross:P.slice(0,15).map(r=>r.slice(15)),reference:P.slice(15).map(r=>r.slice(15))};
}
export function propagated(f:Factors,Phi:Mat,B:Mat):Factors {
  const current=mm(Phi,f.current).map((r,i)=>[...r,...B[i]]),reference=f.reference.map(r=>[...r,...Array(B[0].length).fill(0)]);
  return {current,reference};
}
export function captured(f:Factors):Factors {return {current:f.current.map(r=>[...r]),reference:poseIndices.map(i=>[...f.current[i]])};}
export function transition():Mat {
  const Phi=eye(15),rightLocal=rot(exp([-.02,.01,-.015]));
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)Phi[i+6][j+6]=rightLocal[i][j];
  for(let i=0;i<3;i++){Phi[i][i+3]=.011;Phi[i+3][i+9]=-.011;Phi[i+6][i+12]=-.011;}
  Phi[3][7]=.08;Phi[4][6]=-.08;return Phi;
}
export function noiseFactor():Mat {return mat(15,12,(i,j)=>i===j+3?.0003:0);}
export function predictionInputs(f:Factors,Phi=transition(),B=noiseFactor()) {
  const c=covariance(f);return {covariance:c.current,crossCovariance:c.cross,referenceCovariance:c.reference,transition:Phi,processCovariance:mm(B,tr(B)),referenceAvailable:[1],predictionEnabled:[1]};
}
export function captureInputs(f:Factors) {
  const c=covariance(f);return {position:[.6,-.8,1.2],rotation:rot(exp([.35,-.28,.17])),covariance:c.current,
    crossCovariance:c.cross,referenceCovariance:c.reference,referencePosition:[-.3,.2,1.1],referenceRotation:rot(exp([-.2,.1,.4])),
    referenceAvailable:[1],captureRequested:[1],currentValid:[1]};
}
// Nilpotent, stationary held-IMU dynamics. Four-node process factor quadrature
// is independent of the component's three-node covariance implementation.
export function stationary(h=1/90,R=rot(exp([.35,-.28,.17]))) {
  const force=mv(tr(R),[0,0,9.81]),W=[[0,-force[2],force[1]],[force[2],0,-force[0]],[-force[1],force[0],0]],RW=mm(R,W);
  const F=mat(15,15,()=>0),G=mat(15,12,()=>0);
  for(let i=0;i<3;i++)for(let j=0;j<3;j++){
    F[i][j+3]=+(i===j);F[i+3][j+6]=-RW[i][j];F[i+3][j+9]=-R[i][j];F[i+6][j+12]=-+(i===j);
    G[i+3][j]=-R[i][j];G[i+6][j+3]=-+(i===j);G[i+9][j+6]=+(i===j);G[i+12][j+9]=+(i===j);
  }
  const powers=[eye(15),F];for(let i=2;i<=4;i++)powers.push(mm(powers[i-1],F));
  const factorial=[1,1,2,6],at=(t:number)=>mat(15,15,(i,j)=>powers.slice(0,4).reduce((s,P,k)=>s+P[i][j]*t**k/factorial[k],0));
  const x1=Math.sqrt((3-2*Math.sqrt(6/5))/7),x2=Math.sqrt((3+2*Math.sqrt(6/5))/7),fractions=[(1-x2)/2,(1-x1)/2,(1+x1)/2,(1+x2)/2];
  const weights=[(18-Math.sqrt(30))/72,(18+Math.sqrt(30))/72,(18+Math.sqrt(30))/72,(18-Math.sqrt(30))/72];
  const density=[.06,.06,.06,.006,.006,.006,.002,.002,.002,.0002,.0002,.0002];
  const blocks=fractions.map((t,n)=>mm(at(t*h),G).map(r=>r.map((v,j)=>v*density[j]*Math.sqrt(h*weights[n]))));
  const B=mat(15,48,(i,j)=>blocks[Math.floor(j/12)][i][j%12]);
  return {R,force,F,G,Phi:at(h),B,density,powers};
}
export function correctedFactors(f:Factors,H:Mat,K:Mat,N:Mat,d:number[]):Factors {
  const L=mat(6,6,(i,j)=>j>i?0:i===j?.03*(1+i/50):.03*.04*Math.sin((i+1)*(j+2))),KH=mm(K,H),A=mat(21,21,(i,j)=>+(i===j)-KH[i][j]),reset=eye(21),J=resetJacobian(d.slice(6,9));
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)reset[i+6][j+6]=J[i][j];
  const state=mm(mm(reset,A),[...f.current,...f.reference]),noise=mm(mm(mm(reset,K),N),L),joint=state.map((r,i)=>[...r,...noise[i]]);
  return {current:joint.slice(0,15),reference:joint.slice(15)};
}
export function nominalInputs(f:Factors,h=1/90) {
  const c=covariance(f),s=stationary(Math.max(0,h)),ba=[.02,-.01,.03],bg=[.005,-.002,.001];
  return {position:[.6,-.8,1.2],velocity:[.1,-.2,.3],rotation:s.R,accelBias:ba,gyroBias:bg,
    covariance:c.current,crossCovariance:c.cross,referenceCovariance:c.reference,
    referencePosition:[-.3,.2,1.1],referenceRotation:rot(exp([-.2,.1,.4])),referenceAvailable:[1],
    accel:plus(s.force,ba),gyro:bg,gravity:[0,0,-9.81],h:[h],density:s.density};
}
