// Independent test-only mathematics. This module is never a runtime fallback.
const identity = [1,0,0,0,1,0,0,0,1];

export function landmarkFrame() {
  return {
    opticalPoint: Array.from({length:350},(_,i)=>[
      ((i%25)-12)*.03,(Math.floor(i/25)-7)*.02,2+(i%17)*.05,
    ]).flat(),
    enabled: Array(350).fill(1), activeCount:350, poseAccepted:1,
    bodyRotation:identity.slice(), bodyPosition:[0,0,0],
    opticalToBody:[0,0,1,-1,0,0,0,-1,0], cameraOriginBody:[.18,0,-.04],
  };
}

function rotation(axis,angle) {
  const norm=Math.hypot(...axis),[x,y,z]=axis.map(v=>v/norm);
  const c=Math.cos(angle),s=Math.sin(angle),d=1-c;
  return [c+x*x*d,x*y*d-z*s,x*z*d+y*s,
    y*x*d+z*s,c+y*y*d,y*z*d-x*s,
    z*x*d-y*s,z*y*d+x*s,c+z*z*d];
}

function proper(r) {
  if(!r.every(v=>Number.isFinite(v)&&Math.abs(v)<=1+1e-6))return false;
  for(let i=0;i<3;i++)for(let j=0;j<3;j++) {
    const dot=r[i]*r[j]+r[3+i]*r[3+j]+r[6+i]*r[6+j];
    if(Math.abs(dot-(i===j?1:0))>1e-6)return false;
  }
  const det=r[0]*(r[4]*r[8]-r[5]*r[7])
    -r[1]*(r[3]*r[8]-r[5]*r[6])+r[2]*(r[3]*r[7]-r[4]*r[6]);
  return Math.abs(det-1)<=1e-6;
}

function multiply(r,p) {
  return [r[0]*p[0]+r[1]*p[1]+r[2]*p[2],
    r[3]*p[0]+r[4]*p[1]+r[5]*p[2],r[6]*p[0]+r[7]*p[1]+r[8]*p[2]];
}

export function landmarkOracle(f,limit=1e6) {
  const configurationValid=+(Number.isInteger(f.activeCount)
    &&f.activeCount>=0&&f.activeCount<=350&&limit>0&&limit<=1e6);
  const poseValid=+(configurationValid===1&&f.poseAccepted===1
    &&proper(f.bodyRotation)&&proper(f.opticalToBody)
    &&[...f.bodyPosition,...f.cameraOriginBody].every(v=>Number.isFinite(v)&&Math.abs(v)<=limit));
  const worldPoint=Array(1050).fill(0),landmarkEnabled=Array(350).fill(0);
  let invalidCount=0;
  for(let i=0;i<350;i++) {
    const p=f.opticalPoint.slice(3*i,3*i+3);
    const valid=configurationValid===1&&i+1<=f.activeCount&&f.enabled[i]===1
      &&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=limit)&&p[2]>0;
    if(i+1<=f.activeCount&&f.enabled[i]!==0&&!valid)invalidCount++;
    if(!poseValid||!valid)continue;
    const body=multiply(f.opticalToBody,p).map((v,k)=>v+f.cameraOriginBody[k]);
    const world=multiply(f.bodyRotation,body).map((v,k)=>v+f.bodyPosition[k]);
    if(world.every(v=>Number.isFinite(v)&&Math.abs(v)<=limit)) {
      landmarkEnabled[i]=1;worldPoint.splice(3*i,3,...world);
    }
  }
  return {worldPoint,landmarkEnabled,
    validCount:[landmarkEnabled.reduce((a,b)=>a+b,0)],invalidCount:[invalidCount],
    configurationValid:[configurationValid],poseValid:[poseValid]};
}

export function landmarkCases() {
  const cases=[{name:'full350 RDF axes',frame:landmarkFrame()}];
  for(const angle of [.61,Math.PI-1e-8,-.73]) {
    const frame=landmarkFrame();frame.bodyRotation=rotation([1,2,-3],angle);
    frame.bodyPosition=[4,-2,1.1];frame.opticalToBody=rotation([2,-1,4],.93);
    frame.cameraOriginBody=[.41,-.24,.18];cases.push({name:`general6DOF ${angle}`,frame});
  }
  const sparse=landmarkFrame();sparse.enabled.fill(0);sparse.enabled[0]=sparse.enabled[349]=1;
  sparse.opticalPoint.fill(NaN,3,1047);cases.push({name:'sparse first/last, maskedNaN',frame:sparse});
  for(const count of [-1,.5,351,NaN,Infinity,0]) {
    const frame=landmarkFrame();frame.activeCount=count;cases.push({name:`count ${count}`,frame});
  }
  const bad=landmarkFrame();[.5,NaN,2].forEach((v,i)=>bad.enabled[i]=v);
  [0,-1,NaN,Infinity].forEach((z,i)=>bad.opticalPoint[(i+3)*3+2]=z);
  bad.opticalPoint[21]=1e6+1;cases.push({name:'bad flags/depth/domain',frame:bad});
  cases.push({name:'full350 recovery',frame:landmarkFrame()});
  for(const accepted of [0,.5,2,NaN,Infinity]) {
    const frame=landmarkFrame();frame.poseAccepted=accepted;cases.push({name:`poseAccepted ${accepted}`,frame});
  }
  for(const field of ['bodyRotation','opticalToBody'])for(const value of [
    [-1,0,0,0,1,0,0,0,1],Array(9).fill(0),[2,0,0,0,1,0,0,0,1],
    [NaN,0,0,0,1,0,0,0,1],[Infinity,0,0,0,1,0,0,0,1],
  ]) {
    const frame=landmarkFrame();frame[field]=value;cases.push({name:`improper ${field} ${value[0]}`,frame});
  }
  for(const field of ['bodyPosition','cameraOriginBody'])for(const value of [NaN,Infinity,1e6+1]) {
    const frame=landmarkFrame();frame[field][0]=value;cases.push({name:`invalid ${field} ${value}`,frame});
  }
  const outside=landmarkFrame();outside.bodyPosition=[999999.9,0,0];
  cases.push({name:'transformed output bound',frame:outside});
  cases.push({name:'pose recovery',frame:landmarkFrame()});
  return cases;
}
