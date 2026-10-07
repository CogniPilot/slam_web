// Test-only independent full dense762 solve; never imported by the application.
export const transpose=A=>A[0].map((_,j)=>A.map(row=>row[j]));
export const multiply=(A,B)=>A.map(row=>B[0].map((_,j)=>row.reduce((s,v,k)=>s+v*B[k][j],0)));
const vector=(A,x)=>A.map(row=>row.reduce((s,v,k)=>s+v*x[k],0));
const identity=n=>Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>+(i===j)));
const zero=(n,m=n)=>Array.from({length:n},()=>Array(m).fill(0));
const mod=(x,n)=>(x%n+n)%n;
function exp(a){const t=Math.hypot(...a),S=[[0,-a[2],a[1]],[a[2],0,-a[0]],[-a[1],a[0],0]],S2=multiply(S,S);
 const c=t<1e-8?1-t*t/6:Math.sin(t)/t,d=t<1e-8?.5-t*t/24:(1-Math.cos(t))/(t*t);
 return identity(3).map((row,i)=>row.map((v,j)=>v+c*S[i][j]+d*S2[i][j]));}
function log(R){const t=Math.acos(Math.max(-1,Math.min(1,(R[0][0]+R[1][1]+R[2][2]-1)/2))),c=t<1e-4?.5+t*t/12:t/(2*Math.sin(t));
 return [R[2][1]-R[1][2],R[0][2]-R[2][0],R[1][0]-R[0][1]].map(v=>v*c);}
function residual(pi,Ri,pj,Rj,t,Z){return [...vector(transpose(Ri),pj.map((v,k)=>v-pi[k])).map((v,k)=>v-t[k]),...log(multiply(multiply(transpose(Z),transpose(Ri)),Rj))];}
function perturb(p,R,axis,h){if(axis<3){const q=[...p];q[axis]+=h;return[q,R];}
 const a=[0,0,0];a[axis-3]=h;return[p,multiply(R,exp(a))];}
export function fixture(scenario){const active=scenario===7?96:128,p=Array.from({length:128},(_,n)=>[.025*n,.3*Math.sin(.07*(n+1)),.15*Math.cos(.11*(n+1))]);
 const R=p.map((_,n)=>exp([.09*Math.sin(.05*(n+1)),-.12*Math.cos(.04*(n+1)),.004*(n+1)]));
 const edges=[];for(let e=1;e<=256;e++){let i=e<=127?e:mod(17*(e-128),127)+1,j=e<=127?e+1:mod(i+23+3*(e-128),128)+1;
 if(i===j)j=mod(j,128)+1;if(scenario===6&&e%2===0)[i,j]=[j,i];if(i>active||j>active)continue;i--;j--;
 const t=vector(transpose(R[i]),p[j].map((v,k)=>v-p[i][k])).map((v,k)=>v+[.001*Math.sin(e),-.001*Math.cos(e),.0005][k]);
 const Z=multiply(multiply(transpose(R[i]),R[j]),exp([.003*Math.sin(.3*e),-.004*Math.cos(.2*e),.002]));
 const W=Array.from({length:6},(_,r)=>Array.from({length:6},(_,c)=>((r===c?1+.2*(r+1):0)+.01*Math.min(r+1,c+1)*Math.max(r+1,c+1))/256));
 const J=[zero(6),zero(6)],h=1e-6;
 for(let side=0;side<2;side++)for(let axis=0;axis<6;axis++){const n=side?j:i,[pp,Rp]=perturb(p[n],R[n],axis,h),[pm,Rm]=perturb(p[n],R[n],axis,-h);
 const plus=side?residual(p[i],R[i],pp,Rp,t,Z):residual(pp,Rp,p[j],R[j],t,Z),minus=side?residual(p[i],R[i],pm,Rm,t,Z):residual(pm,Rm,p[j],R[j],t,Z);
 for(let row=0;row<6;row++)J[side][row][axis]=(plus[row]-minus[row])/(2*h);}
 edges.push({i,j,W,J});}
 return{active,edges,p,R};}
export function denseInformation(data,treeOnly=false){const n=6*(data.active-1),H=new Float64Array(n*n),reached=new Set([0]),selected=[];
 if(treeOnly){
  // Independent adjacency/frontier traversal. Within a breadth layer, original
  // edge ordinal breaks parent ties, matching the documented tree policy.
  const adjacency=Array.from({length:data.active},()=>[]);
  data.edges.forEach((e,index)=>{adjacency[e.i].push(index);adjacency[e.j].push(index);});
  let frontier=[0];while(frontier.length){const candidates=new Set(frontier.flatMap(node=>adjacency[node])),next=[];
   for(const index of [...candidates].sort((a,b)=>a-b)){const edge=data.edges[index];
    if(reached.has(edge.i)!==reached.has(edge.j)){const child=reached.has(edge.i)?edge.j:edge.i;
     reached.add(child);next.push(child);selected.push(edge);}}
   frontier=next;
  }
 }
 for(const e of treeOnly?selected:data.edges){for(let a=0;a<2;a++)for(let b=0;b<2;b++){const ni=a?e.j:e.i,nj=b?e.j:e.i;if(!ni||!nj)continue;
 const block=multiply(multiply(transpose(e.J[a]),e.W),e.J[b]);for(let r=0;r<6;r++)for(let c=0;c<6;c++)H[((ni-1)*6+r)*n+(nj-1)*6+c]+=block[r][c];}}
 return{H,n,edges:treeOnly?selected.length:data.edges.length};}
export function factor({H,n}){const L=new Float64Array(n*n);for(let i=0;i<n;i++)for(let j=0;j<=i;j++){let a=.5*(H[i*n+j]+H[j*n+i]);for(let k=0;k<j;k++)a-=L[i*n+k]*L[j*n+k];
 if(i===j){if(!(a>0))throw Error(`Dense test information not SPD at${i}: ${a}`);L[i*n+j]=Math.sqrt(a);}else L[i*n+j]=a/L[j*n+j];}return{L,n};}
export function selectedInverse({L,n},current,reference){const indices=[current,reference].flatMap(node=>Array.from({length:6},(_,axis)=>node===1?-1:6*(node-2)+axis)),Q=zero(12);
 for(let column=0;column<12;column++){if(indices[column]<0)continue;const x=new Float64Array(n);x[indices[column]]=1;
 for(let i=0;i<n;i++){for(let k=0;k<i;k++)x[i]-=L[i*n+k]*x[k];x[i]/=L[i*n+i];}
 for(let i=n-1;i>=0;i--){for(let k=i+1;k<n;k++)x[i]-=L[k*n+i]*x[k];x[i]/=L[i*n+i];}
 for(let row=0;row<12;row++)Q[row][column]=indices[row]<0?0:x[indices[row]];}return Q;}
export function eigenvalues(A){const a=A.map((row,i)=>row.map((v,j)=>(v+A[j][i])/2)),n=a.length;
 for(let sweep=0;sweep<100;sweep++){let largest=0;for(let p=0;p<n;p++)for(let q=p+1;q<n;q++){const x=a[p][q];largest=Math.max(largest,Math.abs(x));if(Math.abs(x)<1e-16)continue;
 const tau=(a[q][q]-a[p][p])/(2*x),t=(tau>=0?1:-1)/(Math.abs(tau)+Math.sqrt(1+tau*tau)),c=1/Math.sqrt(1+t*t),s=t*c;
 const pp=a[p][p],qq=a[q][q];a[p][p]=pp-t*x;a[q][q]=qq+t*x;a[p][q]=a[q][p]=0;
 for(let k=0;k<n;k++)if(k!==p&&k!==q){const kp=a[k][p],kq=a[k][q];a[k][p]=a[p][k]=c*kp-s*kq;a[k][q]=a[q][k]=s*kp+c*kq;}}
 if(largest<1e-13)break;}return a.map((row,i)=>row[i]);}
export const difference=(A,B)=>A.map((row,i)=>row.map((v,j)=>v-B[i][j]));
export const maxAbs=A=>Math.max(...A.flat().map(Math.abs));
