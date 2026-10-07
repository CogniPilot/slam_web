import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {selectionOracle,fullGeometry,type SelectionSettings} from './feature-selection-bounded-oracle';

const n=14400;
const pattern=Array.from({length:n},(_,i)=>((i*8191)%32749)/1000);
function compare(scores:number[],p:SelectionSettings,grid=false,minimumBorder=0){
  const g={...fullGeometry,minimumBorder};
  const expected=selectionOracle(scores,p,grid,'specification',g);
  for(const mode of ['original','bounded'] as const){
    const actual=selectionOracle(scores,p,grid,mode,g);
    expect(actual.valid,mode).toBe(expected.valid);
    expect(actual.features,mode).toEqual(expected.features);
    expect(actual.scoreReads,mode).toEqual(expected.scoreReads);
    expect(actual.maximumSift,mode).toBeLessThanOrEqual(14);
  }
  return expected;
}

it('full14400 bounded raster/heap/neighborhood oracle preserves original order, ties and suppression',()=>{
  for(const p of [
    [0,0,1,0,n,1,0,0], [0,0,10,1,n,1,0,0], [1e-9,.01,1e12,3,240,1,0,0],
    [0,.1,100,16,240,2,1,1], [0,0,10,3,1,160,0,0], [0,0,1,0,240,7,5,8],
    [0,0,1,0,240,1,44,45],
  ] as SelectionSettings[])compare(pattern,p);
  expect(compare(Array(n).fill(2),[0,0,1,0,n,1,0,0]).features).toHaveLength(n);
  const rounding=Array(n).fill(-1);[2.5,3.5,2.49,2.51,3.49].forEach((v,i)=>rounding[i]=v);
  expect(compare(rounding,[0,0,1,0,n,1,0,0]).features.slice(0,5).map(p=>p[0])).toEqual([1,3,4,0,2]);
  const earlyStop=Array(n).fill(0);earlyStop[0]=2.99;earlyStop[1]=3.01;
  expect(compare(earlyStop,[3,0,1,0,n,1,0,0]).features).toEqual([]);
  const outside=Array(n).fill(2);outside[0]=100;
  expect(compare(outside,[0,.1,1,0,n,1,1,1]).features).toEqual([]);
  const zeros=Array(n).fill(-0);
  expect(Object.is(compare(zeros,[0,0,1,0,1,1,0,0]).features[0][2],-0)).toBe(true);
});

it('full raster grid preserves visited-only invalid validation, cap, borders and spacing',()=>{
  const p:SelectionSettings=[0,0,1,0,n,6,5,5];
  const expected=compare(pattern,p,true);
  expect(expected.features).toHaveLength(350);
  expect(expected.features[0].slice(0,2)).toEqual([5,5]);
  expect(expected.features.at(-1)?.slice(0,2)).toEqual([149,83]);
  for(const spacing of [1,2,3,6,31,89,90,159,160])for(const border of [0,1,5,44])
    for(const cap of [1,7,n])compare(pattern,[0,0,1,0,cap,spacing,border,border],true);
  const hidden=pattern.slice();hidden[0]=NaN;
  expect(compare(hidden,p,true).valid).toBe(1);
  expect(compare(hidden,[0,0,1,0,n,1,0,0]).valid).toBe(0);
  const afterCap=pattern.slice();afterCap[1]=Infinity;
  expect(compare(afterCap,[0,0,1,0,1,1,0,0],true).scoreReads).toEqual([0]);
  expect(compare(afterCap,[0,0,1,0,2,1,0,0],true).valid).toBe(0);
});

it('invalid settings and unsafe ranks clear full output without eager protected conversions',()=>{
  const valid:SelectionSettings=[1e-9,.01,1e12,3,240,1,0,0];
  for(let slot=0;slot<8;slot++)for(const value of [NaN,Infinity,-Infinity,-1,1e300]){
    const p=valid.slice() as SelectionSettings;p[slot]=value;
    const result=compare(pattern,p);
    expect(result.valid).toBe(0);expect(result.features).toEqual([]);expect(result.scoreReads).toEqual([]);
  }
  for(const [slot,value] of [[3,.5],[4,240.5],[5,1.5],[6,.5],[7,.5]] as const){
    const p=valid.slice() as SelectionSettings;p[slot]=value;expect(compare(pattern,p).valid).toBe(0);
  }
  const unsafe=pattern.slice();unsafe[n-1]=Number.MAX_SAFE_INTEGER+1;
  const invalid=compare(unsafe,[0,0,1,0,n,1,0,0]);expect(invalid.valid).toBe(0);expect(invalid.scoreReads).toHaveLength(n);
  expect(compare(pattern,valid).valid).toBe(1);
  expect(compare(pattern,[18,0,1e8,3,240,1,3,3],false,3).valid).toBe(1);
  expect(compare(pattern,valid,false,3).valid).toBe(0);
});

it('candidate keeps named full geometry and original evidence independently editable',()=>{
  const candidate=readFileSync('dev/modelica-candidates/FeatureSelectionBounded.mo','utf8');
  const original=readFileSync('models/Vision/Features/FeatureSelection.mo','utf8');
  expect(candidate).toContain('constant Integer width = 160;');
  expect(candidate).toContain('constant Integer height = 90;');
  expect(candidate).toContain('constant Integer capacity = width*height;');
  expect(candidate).toContain('scores[BoundedRasterGeometry.capacity]');
  expect(candidate).toContain('features[BoundedRasterGeometry.capacity,BoundedRasterGeometry.featureColumns]');
  expect(candidate).not.toMatch(/\bwhile\b/);
  expect(original).toContain('while y < height-border and count < cap loop');
});

it('floor diagnostic counter arithmetic agrees with exact integers only on the proved small domain',()=>{
  // This is evidence for the separate diagnostic source, not an admission of
  // general Integer quotient lowering or the named Integer candidate.
  for(const d of [2,14,33,160])for(let a=0;a<201600;a++){
    const exact=BigInt(a)/BigInt(d),q=Math.floor(a/d);
    if(BigInt(q)!==exact||BigInt(a-d*q)!==BigInt(a)%BigInt(d))throw new Error(`counter ${a}/${d}`);
  }
  for(let d=1;d<=160;d++)for(let a=-89;a<=159;a++){
    let remainder=BigInt(a)%BigInt(d);if(remainder<0n)remainder+=BigInt(d);
    const q=Math.floor(a/d);
    if(BigInt(a-d*q)!==remainder)throw new Error(`spacing ${a}/${d}`);
  }
  expect(readFileSync('dev/modelica-candidates/FeatureSelectionBoundedFloorDiagnostic.mo','utf8')).toContain('integer(floor(');
});
