// Independent test mathematics only. Production matching is editable Modelica.
export const featureCapacity=350,descriptorSize=49;
export type Point=[number,number,number];
export interface MatchingFixture {
  referenceDescriptor:number[][];currentDescriptor:number[][];referencePoint:Point[];currentPoint:Point[];
  referenceEnabled:number[];currentEnabled:number[];referenceCount:number;currentCount:number;
  ratio:number;maximumDescriptorDistance:number;usePrediction:number;predictedRotation:Point[];predictedTranslation:Point;maximumGeometricDistance:number;
}
export function fullMatchingFixture():MatchingFixture {
  const descriptors=Array.from({length:featureCapacity},(_,i)=>{const a=(i+1)*2*Math.PI/(featureCapacity+1);return [Math.cos(a),Math.sin(a),...Array(descriptorSize-2).fill(0)];});
  const points=descriptors.map((_,i)=>[(i%25)/100,Math.floor(i/25)/100,2] as Point);
  const permutation=Array.from({length:featureCapacity},(_,i)=>(i*17)%featureCapacity);
  return {referenceDescriptor:descriptors,currentDescriptor:permutation.map(i=>[...descriptors[i]]),referencePoint:points,currentPoint:permutation.map(i=>[points[i][0]+.1,points[i][1]-.2,points[i][2]+.05]),
    referenceEnabled:Array(featureCapacity).fill(1),currentEnabled:Array(featureCapacity).fill(1),referenceCount:featureCapacity,currentCount:featureCapacity,
    ratio:.8,maximumDescriptorDistance:.8,usePrediction:0,predictedRotation:[[1,0,0],[0,1,0],[0,0,1]],predictedTranslation:[.1,-.2,.05],maximumGeometricDistance:.5};
}
const finiteBound=(x:number,bound:number)=>Number.isFinite(x)&&Math.abs(x)<=bound;
const squared=(a:number[],b:number[])=>a.map((x,k)=>(x-b[k])**2).reduce((sum,x)=>sum+x,0);
export function matchingOracle(f:MatchingFixture) {
  const n=f.referenceEnabled.length,m=f.currentEnabled.length;
  let configurationValid=[f.referenceCount,f.currentCount].every(Number.isInteger)&&f.referenceCount>=0&&f.referenceCount<=n&&f.currentCount>=0&&f.currentCount<=m&&
    f.ratio>0&&f.ratio<1&&f.maximumDescriptorDistance>=0&&f.maximumDescriptorDistance<=2&&[0,1].includes(f.usePrediction)&&
    f.maximumGeometricDistance>=0&&f.maximumGeometricDistance<=1e6;
  if(f.usePrediction===1){
    const R=f.predictedRotation;
    let orthogonal=0;
    for(let a=0;a<3;a++)for(let b=0;b<3;b++)orthogonal+=Math.abs(R.reduce((s,row)=>s+row[a]*row[b],0)-(a===b?1:0));
    const determinant=R[0][0]*(R[1][1]*R[2][2]-R[1][2]*R[2][1])-R[0][1]*(R[1][0]*R[2][2]-R[1][2]*R[2][0])+R[0][2]*(R[1][0]*R[2][1]-R[1][1]*R[2][0]);
    configurationValid&&=R.flat().every(x=>finiteBound(x,1))&&f.predictedTranslation.every(x=>finiteBound(x,1e6))&&orthogonal<=1e-8&&Math.abs(determinant-1)<=1e-8;
  }
  const valid=(descriptor:number[],point:Point)=>descriptor.length===49&&descriptor.every(x=>finiteBound(x,1))&&point.every(x=>finiteBound(x,1e6))&&Math.abs(descriptor.reduce((s,x)=>s+x*x,0)-1)<=1e-8;
  const refs=f.referenceEnabled.map((enabled,i)=>configurationValid&&i<f.referenceCount&&enabled===1&&valid(f.referenceDescriptor[i],f.referencePoint[i]));
  const curs=f.currentEnabled.map((enabled,j)=>configurationValid&&j<f.currentCount&&enabled===1&&valid(f.currentDescriptor[j],f.currentPoint[j]));
  const invalidReference=f.referenceEnabled.filter((flag,i)=>i<f.referenceCount&&flag!==0&&!refs[i]).length;
  const invalidCurrent=f.currentEnabled.filter((flag,j)=>j<f.currentCount&&flag!==0&&!curs[j]).length;
  const candidates:{index:number;distance:number}[][]=Array.from({length:n},()=>[]);
  const reverse:{index:number;distance:number}[][]=Array.from({length:m},()=>[]);
  for(let i=0;i<n;i++)if(refs[i])for(let j=0;j<m;j++)if(curs[j]){
    const predicted=f.predictedRotation.map((row,k)=>row.reduce((sum,x,a)=>sum+x*f.referencePoint[i][a],f.predictedTranslation[k]));
    if(f.usePrediction===1&&squared(predicted,f.currentPoint[j])>f.maximumGeometricDistance**2)continue;
    const distance=squared(f.referenceDescriptor[i],f.currentDescriptor[j]);candidates[i].push({index:j,distance});reverse[j].push({index:i,distance});
  }
  const order=(a:{index:number;distance:number},b:{index:number;distance:number})=>a.distance-b.distance||a.index-b.index;
  candidates.forEach(list=>list.sort(order));reverse.forEach(list=>list.sort(order));
  const currentIndex=Array(n).fill(0),pairEnabled=Array(n).fill(0),sourcePoint:Point[]=Array.from({length:n},()=>[0,0,0]),targetPoint:Point[]=Array.from({length:n},()=>[0,0,0]);
  const nearestDistance=Array(n).fill(1e30),secondDistance=Array(n).fill(1e30);
  let count=0;
  candidates.forEach((list,i)=>{
    if(list[0])nearestDistance[i]=list[0].distance;if(list[1])secondDistance[i]=list[1].distance;
    if(list.length<2)return;
    const first=list[0],second=list[1];
    if(first.distance<=f.maximumDescriptorDistance**2&&first.distance<f.ratio**2*second.distance&&reverse[first.index][0].index===i){
      currentIndex[i]=first.index+1;pairEnabled[i]=1;sourcePoint[i]=[...f.referencePoint[i]];targetPoint[i]=[...f.currentPoint[first.index]];count++;
    }
  });
  return {configurationValid:Number(configurationValid),count,currentIndex,pairEnabled,sourcePoint,targetPoint,invalidReference,invalidCurrent,nearestDistance,secondDistance};
}

export function descriptorOracle(gray:number[][],depth:number[][],pixels:number[][],activeCount:number,calibration:number[],minimumContrast=1e-6) {
  const height=gray.length,width=gray[0].length;
  const configuration=Number.isInteger(activeCount)&&activeCount>=0&&activeCount<=pixels.length&&calibration[0]>=1e-6&&calibration[0]<=1e6&&calibration[1]>=1e-6&&calibration[1]<=1e6&&calibration.slice(2).every(x=>finiteBound(x,1e6))&&minimumContrast>0&&minimumContrast<=1;
  let invalidCount=0;
  const descriptor:number[][]=[],point:Point[]=[],enabled:number[]=[];
  pixels.forEach(([x,y],i)=>{
    let values=Array(49).fill(0),p:Point=[0,0,0],valid=configuration&&i<activeCount&&Number.isInteger(x)&&Number.isInteger(y)&&x>=3&&x<=width-4&&y>=3&&y<=height-4;
    if(valid){
      const samples=Array.from({length:7},(_,dy)=>gray[y+dy-3].slice(x-3,x+4)).flat();
      valid=depth[y][x]>=.28&&depth[y][x]<=10&&samples.every(x=>x>=0&&x<=1);
      if(valid){const mean=samples.reduce((sum,x)=>sum+x,0)/49,centered=samples.map(x=>x-mean),energy=centered.reduce((sum,x)=>sum+x*x,0);valid=energy>=49*minimumContrast**2;
        if(valid){values=centered.map(x=>x/Math.sqrt(energy));p=[(x-calibration[2])*depth[y][x]/calibration[0],(y-calibration[3])*depth[y][x]/calibration[1],depth[y][x]];}}
    }
    if(i<activeCount&&!valid)invalidCount++;descriptor.push(values);point.push(p);enabled.push(Number(valid));
  });return {descriptor,point,enabled,invalidCount};
}

export function calibratedPointOracle(depth:number[][],pixel:number[],rgb:number[],optics:number[],disparityNoise=.1,baseline=.05,noiseReferenceFx=848/(2*Math.tan(87*Math.PI/360)),depthUnits=1) {
  const height=depth.length,width=depth[0].length;
  const invalid={valid:0,point:[0,0,0] as Point,axialDepth:0};
  if(!(depthUnits>0&&depthUnits<=1e6)||!pixel.every((p,k)=>Number.isFinite(p)&&p>=0&&p<(k===0?width:height))||
    ![...rgb.slice(0,2),...optics.slice(0,2)].every(x=>x>=1e-6&&x<=1e6)||
    ![...rgb.slice(2),...optics.slice(2)].every(x=>finiteBound(x,1e6))||!(disparityNoise>=0&&disparityNoise<=1&&baseline>=1e-6&&baseline<=10&&noiseReferenceFx>=1e-6&&noiseReferenceFx<=1e6))return invalid;
  const address=pixel.map((p,k)=>{const mapped=(p-rgb[k+2])*optics[k]/rgb[k]+optics[k+2],nearest=Math.round(mapped);return Math.abs(mapped-nearest)<=1e-9?nearest:mapped;});
  if(address.some((v,k)=>v<0||v>(k===0?width-1:height-1)))return invalid;
  const [x,y]=address,[left,top]=address.map(Math.floor),dx=x-left,dy=y-top;
  const samples:[[number,number],number][]=[[[left,top],(1-dx)*(1-dy)],[[left+1,top],dx*(1-dy)],[[left,top+1],(1-dx)*dy],[[left+1,top+1],dx*dy]];
  const used=samples.filter(([,w])=>w>0);
  if(used.some(([[x,y]])=>x>=width||y>=height||!(depth[y][x]*depthUnits>.28&&depth[y][x]*depthUnits<9.95)))return invalid;
  const values=used.map(([[x,y]])=>depth[y][x]*depthUnits),minimum=Math.min(...values),maximum=Math.max(...values);
  if(maximum-minimum>.03+.025*minimum+3*minimum**2*disparityNoise/(noiseReferenceFx*baseline))return invalid;
  const inverse=used.reduce((sum,[[x,y],weight])=>sum+weight/(depth[y][x]*depthUnits),0),z=1/inverse;
  return {valid:1,point:[(pixel[0]-rgb[2])*z/rgb[0],(pixel[1]-rgb[3])*z/rgb[1],z] as Point,axialDepth:z};
}
