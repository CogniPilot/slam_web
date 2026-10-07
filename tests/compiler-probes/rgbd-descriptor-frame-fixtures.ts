// Independent test mathematics. No production code imports these oracles.
import {calibratedPointOracle} from './rgbd-feature-matching-fixtures';
export const descriptorHeight=90,descriptorWidth=160,descriptorCapacity=350,descriptorCells=49;
export interface DescriptorFrameFixture {
  rgb:number[][][];depth:number[][];pixels:number[][];activeCount:number;
  rgbCalibration:number[];depthCalibration:number[];disparityNoise:number;noiseReferenceFx:number;baseline:number;
}
export function rawDescriptorFixture():DescriptorFrameFixture {
  return {rgb:Array.from({length:90},(_,y)=>Array.from({length:160},(_,x)=>[(17*x+11*y)%256,(3*x+23*y+7)%256,(19*x+5*y+13)%256,255])),
    depth:Array.from({length:90},(_,y)=>Array.from({length:160},(_,x)=>2+.0008*x+.0005*y)),
    pixels:Array.from({length:350},(_,i)=>[5+(i%25)*6,5+Math.floor(i/25)*6]),activeCount:350,
    rgbCalibration:[160/(2*Math.tan(69*Math.PI/360)),90/(2*Math.tan(42*Math.PI/360)),79.5,44.5],
    depthCalibration:[160/(2*Math.tan(87*Math.PI/360)),90/(2*Math.tan(58*Math.PI/360)),79.5,44.5],
    disparityNoise:.1,noiseReferenceFx:848/(2*Math.tan(87*Math.PI/360)),baseline:.05};
}
export function mappedFirstPixel(f:DescriptorFrameFixture,x:number,y:number){
  const p=f.pixels[0];f.depthCalibration[2]=x-(p[0]-f.rgbCalibration[2])*f.depthCalibration[0]/f.rgbCalibration[0];
  f.depthCalibration[3]=y-(p[1]-f.rgbCalibration[3])*f.depthCalibration[1]/f.rgbCalibration[1];
  return f;
}
export function rawDescriptorOracle(f:DescriptorFrameFixture){
  // Alpha has no participation in grayscale validation or arithmetic.
  const gray=f.rgb.map(row=>row.map(pixel=>pixel.slice(0,3).every(v=>Number.isFinite(v)&&v>=0&&v<=255)?(pixel[0]+pixel[1]+pixel[2])/765:-1));
  const configuration=Number.isInteger(f.activeCount)&&f.activeCount>=0&&f.activeCount<=350&&
    f.rgbCalibration.slice(0,2).every(v=>v>=1e-6&&v<=1e6)&&f.rgbCalibration.slice(2).every(v=>Number.isFinite(v)&&Math.abs(v)<=1e6);
  const descriptor:number[][]=[],point:number[][]=[],enabled:number[]=[];let invalidCount=0;
  for(let i=0;i<350;i++){
    const [x,y]=f.pixels[i];let valid=configuration&&i<f.activeCount&&Number.isInteger(x)&&Number.isInteger(y)&&x>=3&&x<=156&&y>=3&&y<=86;
    let d=Array(49).fill(0),p=[0,0,0];
    if(valid){
      const geometry=calibratedPointOracle(f.depth,[x,y],f.rgbCalibration,f.depthCalibration,f.disparityNoise,f.baseline,f.noiseReferenceFx);
      const patch=gray.slice(y-3,y+4).flatMap(row=>row.slice(x-3,x+4));
      valid=geometry.valid===1&&patch.every(v=>v>=0&&v<=1);
      if(valid){const mean=patch.reduce((sum,v)=>sum+v,0)/49,centered=patch.map(v=>v-mean),energy=centered.reduce((sum,v)=>sum+v*v,0);
        valid=energy>=49*1e-12;if(valid){d=centered.map(v=>v/Math.sqrt(energy));p=geometry.point;}}
    }
    if(i+1<=f.activeCount&&!valid)invalidCount++;descriptor.push(d);point.push(p);enabled.push(Number(valid));
  }
  return {gray,descriptor,point,enabled,invalidCount};
}
