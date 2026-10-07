// Independent TEST oracle. Never imported by application/runtime code.
// Quaternion residuals and finite-difference Jacobians avoid copying Modelica's
// rotation-matrix logarithm and its analytic Jacobian expressions.
export type Matrix = number[][];
export type Quaternion = [number,number,number,number];
export type Pose = {p:number[];q:Quaternion};
export type Edge = {from:number;to:number;t:number[];q:Quaternion;information:Matrix;slot:number};
export type Graph = {poses:Pose[];active:boolean[];edges:Edge[]};
export const matrix = (n:number,m:number,f:(i:number,j:number)=>number):Matrix => Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>f(i,j)));
export const eye = (n:number):Matrix => matrix(n,n,(i,j)=>+(i===j));
export const transpose = (a:Matrix):Matrix => matrix(a[0].length,a.length,(i,j)=>a[j][i]);
export const multiply = (a:Matrix,b:Matrix):Matrix => matrix(a.length,b[0].length,(i,j)=>a[i].reduce((s,v,k)=>s+v*b[k][j],0));
export const mv = (a:Matrix,v:number[]) => a.map(row=>row.reduce((s,x,i)=>s+x*v[i],0));
export const norm = (v:number[]) => Math.hypot(...v);
export function product(a:Quaternion,b:Quaternion):Quaternion {
  const [w,x,y,z]=a,[W,X,Y,Z]=b;
  return [w*W-x*X-y*Y-z*Z,w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W];
}
export const inverse = (q:Quaternion):Quaternion => [q[0],-q[1],-q[2],-q[3]];
export function expQ(v:number[]):Quaternion {
  const a=norm(v),s=a<1e-12?.5:Math.sin(a/2)/a;
  return [Math.cos(a/2),v[0]*s,v[1]*s,v[2]*s];
}
export function logQ(q:Quaternion):number[] {
  const sign=q[0]<0?-1:1,unit=q.map(v=>sign*v/norm(q)),s=norm(unit.slice(1));
  const scale=s<1e-12?2:2*Math.atan2(s,unit[0])/s;return unit.slice(1).map(v=>v*scale);
}
export function rotation(q:Quaternion):Matrix {
  const [w,x,y,z]=q;
  return [[1-2*(y*y+z*z),2*(x*y-w*z),2*(x*z+w*y)],
    [2*(x*y+w*z),1-2*(x*x+z*z),2*(y*z-w*x)],
    [2*(x*z-w*y),2*(y*z+w*x),1-2*(x*x+y*y)]];
}
export function retract(pose:Pose,delta:number[]):Pose {
  return {p:pose.p.map((v,i)=>v+delta[i]),q:product(pose.q,expQ(delta.slice(3)))};
}
export function residual(a:Pose,b:Pose,e:Edge):number[] {
  const t=mv(transpose(rotation(a.q)),b.p.map((v,i)=>v-a.p[i]));
  return [...t.map((v,i)=>v-e.t[i]),...logQ(product(inverse(e.q),product(inverse(a.q),b.q)))];
}
export function numericalJacobians(a:Pose,b:Pose,e:Edge):[Matrix,Matrix] {
  const epsilon=1e-6;
  const side=(which:number)=>transpose(Array.from({length:6},(_,k)=>{
    const d=Array(6).fill(0);d[k]=epsilon;const n=d.map(v=>-v);
    const positive=which===0?residual(retract(a,d),b,e):residual(a,retract(b,d),e);
    const negative=which===0?residual(retract(a,n),b,e):residual(a,retract(b,n),e);
    return positive.map((v,i)=>(v-negative[i])/(2*epsilon));
  }));
  return [side(0),side(1)];
}
export function cost(g:Graph):number {
  return g.edges.reduce((sum,e)=>{const r=residual(g.poses[e.from],g.poses[e.to],e);return sum+.5*r.reduce((s,v,i)=>s+v*mv(e.information,r)[i],0);},0);
}
// Independent pivoted dense Gaussian solve for small test graphs only. The
// Modelica implementation uses sparse edge products plus block-preconditioned CG.
export function solve(A:Matrix,b:number[]):number[] {
  const rows=A.map((row,i)=>[...row,b[i]]),n=b.length,x=Array(n).fill(0);
  for(let k=0;k<n;k++){
    let pivot=k;for(let i=k+1;i<n;i++)if(Math.abs(rows[i][k])>Math.abs(rows[pivot][k]))pivot=i;
    [rows[k],rows[pivot]]=[rows[pivot],rows[k]];if(Math.abs(rows[k][k])<1e-20)throw new Error('singular oracle');
    for(let i=k+1;i<n;i++){const f=rows[i][k]/rows[k][k];for(let j=k;j<=n;j++)rows[i][j]-=f*rows[k][j];}
  }
  for(let i=n-1;i>=0;i--)x[i]=(rows[i][n]-rows[i].slice(i+1,n).reduce((s,v,k)=>s+v*x[i+1+k],0))/rows[i][i];
  return x;
}
export function finiteDifferenceOptimizer(input:Graph,iterations=8):Graph {
  const g=structuredClone(input),ids=g.active.flatMap((a,i)=>a&&i!==0?[i]:[]),index=new Map(ids.map((id,i)=>[id,i]));
  let damping=.001;
  for(let iteration=0;iteration<iterations;iteration++){
    const size=ids.length*6,H=matrix(size,size,()=>0),gradient=Array(size).fill(0),before=cost(g);
    for(const e of g.edges){
      const r=residual(g.poses[e.from],g.poses[e.to],e),jac=numericalJacobians(g.poses[e.from],g.poses[e.to],e);
      const endpoints=[e.from,e.to];
      for(let side=0;side<2;side++){
        const a=index.get(endpoints[side]);if(a===undefined)continue;
        for(let u=0;u<6;u++){
          gradient[6*a+u]+=jac[side].reduce((s,row,k)=>s+row[u]*mv(e.information,r)[k],0);
          for(let other=0;other<2;other++){
            const b=index.get(endpoints[other]);if(b===undefined)continue;
            const WJ=multiply(e.information,jac[other]);
            for(let v=0;v<6;v++)H[6*a+u][6*b+v]+=jac[side].reduce((s,row,k)=>s+row[u]*WJ[k][v],0);
          }
        }
      }
    }
    if(norm(gradient)<1e-9)break;
    for(let k=0;k<size;k++)H[k][k]+=damping*Math.max(H[k][k],1e-6);
    const delta=solve(H,gradient.map(v=>-v));let scale=1;
    for(let i=0;i<ids.length;i++)scale=Math.min(scale,.5/Math.max(1e-12,norm(delta.slice(6*i,6*i+3))),.2/Math.max(1e-12,norm(delta.slice(6*i+3,6*i+6))));
    let accepted=false;
    for(let backtrack=0;backtrack<8;backtrack++){
      const candidate=structuredClone(g);ids.forEach((id,i)=>{candidate.poses[id]=retract(g.poses[id],delta.slice(6*i,6*i+6).map(v=>scale*v));});
      if(cost(candidate)<before-1e-12*Math.max(1,before)){g.poses=candidate.poses;accepted=true;damping=Math.max(1e-9,.3*damping);break;}
      scale*=.5;
    }
    if(!accepted)damping=Math.min(1e6,damping*10);
  }
  return g;
}
export function correlatedInformation(scale=1):Matrix {
  const L=matrix(6,6,(i,j)=>i<j?0:i===j?Math.sqrt(scale)*(i<3?2:3):.04*Math.sqrt(scale)*(i+1)*(j+1));
  return multiply(L,transpose(L));
}
export function loopFixture(count=8):{graph:Graph;truth:Pose[]} {
  const truth=Array.from({length:count},(_,i)=>{
    const a=2*Math.PI*i/(count-1);
    return {p:[3*Math.cos(a)-3,2*Math.sin(a),.4*Math.sin(2*a)],q:product(expQ([.2,-.3,.4]),expQ([.1*Math.sin(a),.05*Math.cos(a),a]))};
  });
  const poses=truth.map((p,i)=>({p:p.p.map((v,k)=>v+[.018,-.012,.006][k]*i),q:product(p.q,expQ([.0004,-.0006,.0012].map(v=>v*i)))}));
  const edges:Edge[]=Array.from({length:count-1},(_,i)=>({from:i,to:i+1,
    t:mv(transpose(rotation(poses[i].q)),poses[i+1].p.map((v,k)=>v-poses[i].p[k])),
    q:product(inverse(poses[i].q),poses[i+1].q),information:correlatedInformation(1),slot:i}));
  edges.push({from:0,to:count-1,t:mv(transpose(rotation(truth[0].q)),truth[count-1].p.map((v,k)=>v-truth[0].p[k])),
    q:product(inverse(truth[0].q),truth[count-1].q),information:correlatedInformation(25),slot:255});
  return {graph:{poses,active:Array(count).fill(true),edges},truth};
}
export const poseError = (g:Graph,truth:Pose[]) => Math.sqrt(truth.reduce((s,p,i)=>s+norm(g.poses[i].p.map((v,k)=>v-p.p[k]))**2,0)/truth.length);
export function graphInputs(g:Graph):Record<string,number|number[]|number[][]|number[][][]> {
  const p=matrix(128,3,()=>0),R=Array.from({length:128},()=>eye(3)),nodeMask=Array(128).fill(0),edgeMask=Array(256).fill(0);
  const from=Array(256).fill(1),to=Array(256).fill(1),t=matrix(256,3,()=>0),Z=Array.from({length:256},()=>eye(3)),W=Array.from({length:256},()=>eye(6));
  g.poses.forEach((pose,i)=>{p[i]=[...pose.p];R[i]=rotation(pose.q);nodeMask[i]=+g.active[i];});
  for(const e of g.edges){edgeMask[e.slot]=1;from[e.slot]=e.from+1;to[e.slot]=e.to+1;t[e.slot]=[...e.t];Z[e.slot]=rotation(e.q);W[e.slot]=e.information;}
  return {position:p,rotation:R,nodeMask,edgeMask,fromNode:from,toNode:to,translation:t,measuredRotation:Z,information:W};
}

// Independent LDL/BFS refusal oracle for full-sized transport fixtures.
export function admissibleGraphInputs(x:Record<string,unknown>):boolean {
  const p=x.position as Matrix,R=x.rotation as Matrix[],mask=x.nodeMask as number[],edges=x.edgeMask as number[];
  const from=x.fromNode as number[],to=x.toNode as number[],t=x.translation as Matrix,Z=x.measuredRotation as Matrix[],W=x.information as Matrix[];
  const proper=(A:Matrix)=>{
    if(A.flat().some(v=>!Number.isFinite(v)||Math.abs(v)>1.000001))return false;
    const gram=multiply(transpose(A),A),det=A[0][0]*(A[1][1]*A[2][2]-A[1][2]*A[2][1])-A[0][1]*(A[1][0]*A[2][2]-A[1][2]*A[2][0])+A[0][2]*(A[1][0]*A[2][1]-A[1][1]*A[2][0]);
    return Math.abs(det-1)<=1e-7&&gram.every((row,i)=>row.every((v,j)=>Math.abs(v-+(i===j))<=1e-7));
  };
  const spd=(A:Matrix)=>{
    const scale=Math.max(...A.map((row,i)=>Math.abs(row[i])));
    if(!(scale>1e-12&&scale<=1e18)||A.some((row,i)=>row.some((v,j)=>!Number.isFinite(v)||Math.abs(v)>1e18||Math.abs(v-A[j][i])>1e-10*Math.max(1,scale))))return false;
    const D=A.map(row=>[...row]);
    for(let k=0;k<6;k++){
      const pivot=D[k][k];if(!(pivot>1e-10*scale))return false;
      for(let i=k+1;i<6;i++)for(let j=k+1;j<6;j++)D[i][j]-=D[i][k]*D[k][j]/pivot;
    }
    return true;
  };
  if(mask.length!==128||edges.length!==256||mask[0]!==1||mask.some(v=>v!==0&&v!==1)||edges.some(v=>v!==0&&v!==1))return false;
  for(let i=0;i<128;i++)if(mask[i]&&(p[i].some(v=>!Number.isFinite(v)||Math.abs(v)>1e6)||!proper(R[i])))return false;
  const neighbors:Array<number[]>=Array.from({length:128},()=>[]);
  for(let e=0;e<256;e++)if(edges[e]){
    const a=from[e]-1,b=to[e]-1;
    if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||a>=128||b<0||b>=128||a===b||!mask[a]||!mask[b])return false;
    if(t[e].some(v=>!Number.isFinite(v)||Math.abs(v)>1e6)||!proper(Z[e])||!spd(W[e]))return false;
    const E=multiply(transpose(Z[e]),multiply(transpose(R[a]),R[b]));
    if(Math.acos(Math.min(1,Math.max(-1,(E[0][0]+E[1][1]+E[2][2]-1)/2)))>=Math.PI-.001)return false;
    neighbors[a].push(b);neighbors[b].push(a);
  }
  const seen=new Set([0]),queue=[0];for(let cursor=0;cursor<queue.length;cursor++)for(const b of neighbors[queue[cursor]])if(!seen.has(b)){seen.add(b);queue.push(b);}
  return mask.every((v,i)=>!v||seen.has(i));
}
