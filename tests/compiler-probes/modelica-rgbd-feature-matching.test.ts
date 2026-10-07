import {it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import type * as Rumoca from '@cognipilot/rumoca';
import {featureCapacity,descriptorSize,fullMatchingFixture,matchingOracle,descriptorOracle,calibratedPointOracle,type MatchingFixture} from './rgbd-feature-matching-fixtures';

const directory=process.env.RUMOCA_BRANCH_PKG;
const mode=process.env.RUMOCA_MATCHING_MODE??'session';
const source=()=>readFileSync('models/RGBDFeatureMatching.mo','utf8');
const sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
function focusedFixture(n=3):MatchingFixture {
  const f=fullMatchingFixture();f.referenceCount=n;f.currentCount=n;
  for(let i=0;i<n;i++)f.currentDescriptor[i]=[...f.referenceDescriptor[i]];
  return f;
}
function ratioBoundaryFixture():MatchingFixture {
  const f=focusedFixture(3);f.referenceCount=1;
  f.referenceDescriptor[0]=[1,...Array(48).fill(0)];
  f.currentDescriptor[0]=[Math.cos(.4),Math.sin(.4),...Array(47).fill(0)];
  f.currentDescriptor[1]=[Math.cos(.8),Math.sin(.8),...Array(47).fill(0)];
  f.currentDescriptor[2]=[-1,...Array(48).fill(0)];return f;
}

it('full350×49 independent fixture gives exact reciprocal permutation and optical XYZ pairs',()=>{
  const f=fullMatchingFixture(),result=matchingOracle(f);
  expect(result.count).toBe(350);expect(result.configurationValid).toBe(1);
  expect(new Set(result.currentIndex).size).toBe(350);
  for(let i=0;i<350;i++){
    expect(result.currentIndex[i]).toBe(Array.from({length:350},(_,j)=>j).find(j=>j*17%350===i)!+1);
    expect(result.sourcePoint[i]).toEqual(f.referencePoint[i]);expect(result.targetPoint[i]).toEqual(f.currentPoint[result.currentIndex[i]-1]);
    expect(result.nearestDistance[i]).toBe(0);expect(result.secondDistance[i]).toBeGreaterThan(0);
  }
  f.usePrediction=1;expect(matchingOracle(f).currentIndex).toEqual(result.currentIndex);
});

it('independent matching controls cover ambiguity, strict ratio, mutual ownership, finite masks and rejected-state recovery',()=>{
  const f=focusedFixture(),baseline=matchingOracle(f);expect(baseline.count).toBe(3);
  const tie=structuredClone(f);tie.currentDescriptor[1]=[...tie.currentDescriptor[0]];
  expect(matchingOracle(tie).currentIndex[0]).toBe(0); // Equal first/second distances fail strict ratio.
  const duplicate=structuredClone(f);duplicate.referenceDescriptor[1]=[...duplicate.referenceDescriptor[0]];
  const duplicateResult=matchingOracle(duplicate);expect(duplicateResult.currentIndex[0]).toBe(1);expect(duplicateResult.currentIndex[1]).toBe(0);
  const sole=structuredClone(f);sole.currentCount=1;expect(matchingOracle(sole).count).toBe(0);
  for(const bad of [-1,.5,351,NaN,Infinity]){const invalid=structuredClone(f);invalid.referenceCount=bad;const r=matchingOracle(invalid);expect(r.configurationValid).toBe(0);expect(r.pairEnabled).toEqual(Array(350).fill(0));}
  const hidden=structuredClone(f);hidden.currentEnabled[2]=0;hidden.currentDescriptor[2][0]=NaN;
  expect(matchingOracle(hidden).invalidCurrent).toBe(0);expect(matchingOracle(hidden).count).toBe(2);
  hidden.currentEnabled[2]=1;expect(matchingOracle(hidden).invalidCurrent).toBe(1);
  const invalidFlag=structuredClone(f);invalidFlag.referenceEnabled[1]=.5;expect(matchingOracle(invalidFlag).invalidReference).toBe(1);
  const zero=structuredClone(f);zero.referenceDescriptor[1].fill(0);expect(matchingOracle(zero).invalidReference).toBe(1);
  const huge=structuredClone(f);huge.currentPoint[1][0]=1e150;expect(matchingOracle(huge).invalidCurrent).toBe(1);
  const reflected=structuredClone(f);reflected.usePrediction=1;reflected.predictedRotation[0][0]=-1;expect(matchingOracle(reflected).configurationValid).toBe(0);
  const outside=structuredClone(f);outside.usePrediction=1;outside.predictedTranslation[0]=10;expect(matchingOracle(outside).count).toBe(0);
  expect(matchingOracle(f)).toEqual(baseline);
  // Analytic unit-circle descriptors: squared ratio threshold has a distinct boundary.
  const ratio=ratioBoundaryFixture();ratio.ratio=.49;expect(matchingOracle(ratio).count).toBe(0);
  ratio.ratio=.6;expect(matchingOracle(ratio).count).toBe(1);
});

it('independent full350 descriptor fixtures retain49-sample order, contrast, border/depth masks and finite XYZ',()=>{
  const gray=Array.from({length:90},(_,y)=>Array.from({length:160},(_,x)=>((x*11+y*7)%101)/100));
  const depth=Array.from({length:90},()=>Array(160).fill(2));
  const pixels=Array.from({length:350},(_,i)=>[5+(i%25)*6,5+Math.floor(i/25)*6]);
  const result=descriptorOracle(gray,depth,pixels,350,[100,110,79.5,44.5]);
  expect(result.enabled).toEqual(Array(350).fill(1));expect(result.invalidCount).toBe(0);
  for(const d of result.descriptor){expect(d).toHaveLength(49);expect(d.reduce((a,x)=>a+x,0)).toBeCloseTo(0,12);expect(d.reduce((a,x)=>a+x*x,0)).toBeCloseTo(1,12);}
  expect(result.point[0]).toEqual([(5-79.5)*2/100,(5-44.5)*2/110,2]);
  // This identity-intrinsics fixture alone does not prove raw production registration.
  const flat=gray.map(row=>row.map(()=>.5));expect(descriptorOracle(flat,depth,pixels,350,[100,110,79.5,44.5]).enabled.every(x=>x===0)).toBe(true);
  const bad=structuredClone(pixels);bad[0]=[2,10];bad[1]=[3.5,10];bad[2]=[NaN,10];
  expect(descriptorOracle(gray,depth,bad,350,[100,110,79.5,44.5]).invalidCount).toBe(3);
  const invalidDepth=structuredClone(depth);invalidDepth[5][5]=NaN;expect(descriptorOracle(gray,invalidDepth,pixels,350,[100,110,79.5,44.5]).enabled[0]).toBe(0);
  expect(descriptorOracle(gray,depth,pixels,0,[100,110,79.5,44.5]).enabled.every(x=>x===0)).toBe(true);
});

it('independent raw depth gathers use separate intrinsics, inverse depth and positive-weight discontinuity gates',()=>{
  const depth=Array.from({length:90},()=>Array(160).fill(2));
  const rgb=[160/(2*Math.tan(69*Math.PI/360)),90/(2*Math.tan(42*Math.PI/360)),79.5,44.5];
  const optics=[160/(2*Math.tan(87*Math.PI/360)),90/(2*Math.tan(58*Math.PI/360)),79.5,44.5];
  const observed=calibratedPointOracle(depth,[100,60],rgb,optics);
  expect(observed.valid).toBe(1);expect(observed.point).toEqual([(100-79.5)*2/rgb[0],(60-44.5)*2/rgb[1],2]);
  const mapped=[(100-79.5)*optics[0]/rgb[0]+79.5,(60-44.5)*optics[1]/rgb[1]+44.5];
  expect(mapped[0]).not.toBe(100);expect(mapped[1]).not.toBe(60);
  const identity=[100,100,79.5,44.5],edge=structuredClone(depth);
  edge[31][20]=NaN;edge[30][21]=NaN;edge[31][21]=NaN;
  expect(calibratedPointOracle(edge,[20,30],identity,identity).valid).toBe(1);
  edge[30][20]=NaN;expect(calibratedPointOracle(edge,[20,30],identity,identity).valid).toBe(0);
  const discontinuous=structuredClone(depth);discontinuous[30][21]=5;
  expect(calibratedPointOracle(discontinuous,[20.5,30],identity,identity,0).valid).toBe(0);
  discontinuous[30][21]=2.02;
  expect(calibratedPointOracle(discontinuous,[20.5,30],identity,identity,0).axialDepth).toBeCloseTo(1/(.5/2+.5/2.02),14);
  discontinuous[30][21]=2.2;
  expect(calibratedPointOracle(discontinuous,[20.5,30],identity,identity).valid).toBe(0);
  expect(calibratedPointOracle(discontinuous,[20.5,30],identity,identity,.1,.05,100).valid).toBe(1);
  expect(calibratedPointOracle(depth,[100,60],[1e-320,100,79.5,44.5],optics).valid).toBe(0);
});

it.skipIf(!directory)('actual reviewed WASM full350 matching source admission and numerical controls',async()=>{
  const compiler:typeof Rumoca&{prepare_native_program?:(s:string,m:string)=>string}=await import(/* @vite-ignore */pathToFileURL(resolve(directory!,'rumoca_bind_wasm.js')).href);
  const wasm=readFileSync(resolve(directory!,'rumoca_bind_wasm_bg.wasm'));await compiler.default({module_or_path:wasm});
  const text=source(),report:Record<string,unknown>={status:'RUNNING',phase:'source compilation',sourceSha256:sha(text),compilerWasmSha256:sha(wasm),capacity:featureCapacity,descriptorSize,
    mode,fullCapacityNumericalPass:false,nativeAdmitted:false,runtimeIntegrated:false,productionPinChanged:false,cases:[]};
  const save=()=>{if(process.env.RUMOCA_MATCHING_REPORT)writeFileSync(process.env.RUMOCA_MATCHING_REPORT,JSON.stringify(report,null,2)+'\n');};
  let session:InstanceType<typeof compiler.WasmSimulationSession>|undefined;save();
  const values=(f:MatchingFixture)=>{
    const inputs:[string,number][]=[];
    for(const field of ['referenceDescriptor','currentDescriptor','referencePoint','currentPoint','predictedRotation'] as const)
      f[field].forEach((row,i)=>row.forEach((x,k)=>inputs.push([`${field}[${i+1},${k+1}]`,x])));
    for(const field of ['referenceEnabled','currentEnabled','predictedTranslation'] as const)f[field].forEach((x,i)=>inputs.push([`${field}[${i+1}]`,x]));
    for(const field of ['referenceCount','currentCount','usePrediction'] as const)inputs.push([field,f[field]]);
    return inputs;
  };
  let tick=0;
  try{
    if(mode==='compile'){const start=performance.now();const result=JSON.parse(compiler.compile(text,'RGBDFeatureMatching'));expect(result.balance.is_balanced).toBe(true);report.compileMs=performance.now()-start;report.status='COMPILED';save();return;}
    if(mode==='native'){
      report.phase='native program preparation';save();if(!compiler.prepare_native_program)throw Error('Reviewed native preparation capability unavailable');
      const start=performance.now(),raw=compiler.prepare_native_program(text,'RGBDFeatureMatching'),artifact=JSON.parse(raw);
      if(artifact.error||artifact.errors)throw Error(JSON.stringify(artifact.error??artifact.errors));
      expect(artifact.profile).toMatch(/^native-direct-program-f64-v[0-9]+$/);
      expect(artifact.source_sha256).toBe(sha(text));expect(artifact.module_bytes.length).toBeGreaterThan(8);
      report.preparationMs=performance.now()-start;report.status='NATIVE_PREPARED';report.nativeAdmitted=true;save();return;
    }
    report.phase='ordinary WASM session preparation';save();const start=performance.now();
    session=compiler.WasmSimulationSession.withInteractiveOptions(text,'RGBDFeatureMatching',1/90,'rk-like',1e-12,1e-12,'[]');
    report.preparationMs=performance.now()-start;save();
    const run=(name:string,f:MatchingFixture)=>{
      report.phase=name;save();const expected=matchingOracle(f),start=performance.now();
      session!.set_inputs(JSON.stringify(values(f)));session!.advance_to(++tick/90);
      const scalar=(name:string)=>session!.get(name);
      expect(scalar('configurationValid')).toBe(expected.configurationValid);expect(scalar('count')).toBe(expected.count);
      expect(scalar('invalidReference')).toBe(expected.invalidReference);expect(scalar('invalidCurrent')).toBe(expected.invalidCurrent);
      for(let i=0;i<350;i++){
        expect(scalar(`currentIndex[${i+1}]`)).toBe(expected.currentIndex[i]);expect(scalar(`pairEnabled[${i+1}]`)).toBe(expected.pairEnabled[i]);
        expect(scalar(`nearestDistance[${i+1}]`)).toBeCloseTo(expected.nearestDistance[i],12);
        expect(scalar(`secondDistance[${i+1}]`)).toBeCloseTo(expected.secondDistance[i],12);
        for(let k=0;k<3;k++){expect(scalar(`sourcePoint[${i+1},${k+1}]`)).toBe(expected.sourcePoint[i][k]);expect(scalar(`targetPoint[${i+1},${k+1}]`)).toBe(expected.targetPoint[i][k]);}
      }
      (report.cases as unknown[]).push({name,count:expected.count,elapsedMs:performance.now()-start});save();
    };
    const full=fullMatchingFixture();run('full350 reciprocal permutation',full);report.fullCapacityNumericalPass=true;save();
    const predicted=structuredClone(full);predicted.usePrediction=1;run('full350 calibrated optical prediction',predicted);
    const tie=focusedFixture();tie.currentDescriptor[1]=[...tie.currentDescriptor[0]];run('ambiguous equal-distance refusal',tie);
    const count=structuredClone(full);count.referenceCount=350.5;run('invalid active count clears all outputs',count);
    const huge=structuredClone(full);huge.referencePoint[349][0]=1e150;run('huge finite point rejected before geometric multiplication',huge);
    run('baseline ratio boundary admits one pair',ratioBoundaryFixture());
    run('recovery full350',full);session.reset();tick=0;run('reset full350 replay',full);
    session.free();session=undefined;
    const edited=text.replace('ratio = 0.8','ratio = 0.49');expect(edited).not.toBe(text);report.editedSourceSha256=sha(edited);report.phase='edited source preparation';save();
    session=compiler.WasmSimulationSession.withInteractiveOptions(edited,'RGBDFeatureMatching',1/90,'rk-like',1e-12,1e-12,'[]');tick=0;
    // The source edit is checked on the same complete350-slot fixture profile.
    const editFixture=ratioBoundaryFixture();editFixture.ratio=.49;run('edited ratio boundary rejects previously admitted pair',editFixture);
    report.status='PASS';report.phase='complete';save();
  }catch(error){report.status='REFUSED_OR_FAILED';report.refusal=String(error);save();throw error;}
  finally{session?.free();}
},175000);
