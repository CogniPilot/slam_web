// Analytic rigid transforms and explicit outliers; no second consensus solver.
export function loopConsensusFixtures(capacity=350){
  if(!Number.isInteger(capacity)||capacity<32||capacity>350)throw Error('Fixture capacity must be 32..350');
  const count=32,c=Math.cos(.12),s=Math.sin(.12),rotation=[c,-s,0,s,c,0,0,0,1],translation=[.3,-.2,.1];
  // Thirty-one low slots and the final allocated slot exercise the sparse domain.
  const enabled=Array.from({length:capacity},(_,i)=>i<31||i===capacity-1);
  const sourcePoint=enabled.map((on,i)=>on?[(i%7-3)*.22,(Math.floor((i%32)/7)-2)*.18,2+i%5*.11]:[1e101,1e101,1e101]);
  const targetPoint=sourcePoint.map((p,i)=>enabled[i]?[c*p[0]-s*p[1]+translation[0],s*p[0]+c*p[1]+translation[1],p[2]+translation[2]]:[1e101,1e101,1e101]);
  const covariance=enabled.map(()=>[[.0001,0,0],[0,.0001,0],[0,0,.0001]]);
  const base={sourcePoint,targetPoint,pairEnabled:enabled.map(Number),sourceCovariance:covariance,targetCovariance:covariance};
  const cases=[];
  const add=(name,expected,change=()=>{})=>{const inputs=structuredClone(base);change(inputs);cases.push({name,inputs,expected});};
  const outliers=f=>{for(let i=0;i<8;i++)f.targetPoint[i]=f.targetPoint[i].map((v,k)=>v+[3,-4,1][k]);};
  add('clean calibrated transform',{valid:true,reason:0,inliers:count,bestCount:count});
  add('clean metric transform',{valid:true,reason:0,inliers:count,bestCount:count},f=>f.calibratedResiduals=0);
  add('eight geometric outliers',{valid:true,reason:0,inliers:24,bestCount:24},outliers);
  add('insufficient fraction',{valid:false,reason:5,inliers:0,bestCount:24,refinementCount:0},f=>{f.minimumFraction=.9;outliers(f);});
  add('seven matches',{valid:false,reason:4,matches:7,bestCount:0,refinementCount:0},f=>f.pairEnabled=f.pairEnabled.map((_,i)=>+(i<7)));
  add('collinear geometry',{valid:false,reason:5,bestCount:0,refinementCount:0},f=>{
    f.sourcePoint=f.sourcePoint.map((_,i)=>[i/100,0,3]);
    f.targetPoint=f.sourcePoint.map(p=>[c*p[0]+translation[0],s*p[0]+translation[1],p[2]+translation[2]]);
  });
  add('singular covariance',{valid:false,reason:3},f=>f.sourceCovariance[0]=[[0,0,0],[0,0,0],[0,0,0]]);
  add('refinement solve refused',{valid:false,reason:5,bestCount:32,refinementCount:1,lastFitAccepted:false},f=>f.minimumPivot=.99);
  add('zero trial budget',{valid:false,reason:2},f=>f.trials=0);
  add('idle',{valid:false,reason:1},f=>f.requested=0);
  add('disabled poisoned tail',{valid:true,reason:0,matches:31,inliers:31},f=>{
    f.pairEnabled[capacity-1]=0;f.sourcePoint[capacity-1]=[1e101,1e101,1e101];f.targetPoint[capacity-1]=[1e101,1e101,1e101];
  });
  add('recovery after refusal',{valid:true,reason:0,inliers:count,bestCount:count});
  return {schemaVersion:1,capacity,truth:{rotation,translation},cases};
}
