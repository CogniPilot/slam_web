import {it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import type * as Rumoca from '@cognipilot/rumoca';

const directory=process.env.RUMOCA_BRANCH_PKG;
type Input=[string,number];
const vector=(name:string,v:number[]):Input[]=>v.map((x,i)=>[`${name}[${i+1}]`,x]);
const draws=(name:string,v:number[][]):Input[]=>v.flatMap((r,i)=>r.map((x,j):Input=>[`${name}[${i+1},${j+1}]`,x]));
const gaussian=(radial:number,angle:number)=>Math.sqrt(-2*Math.log(Math.max(1e-9,radial)))*Math.cos(2*Math.PI*angle);
const close=(actual:number,expected:number,label:string)=>{
  expect(Number.isFinite(actual),label).toBe(true);
  expect(Math.abs(actual-expected),`${label}: ${actual} != ${expected}`).toBeLessThan(2e-11*Math.max(1,Math.abs(expected)));
};

it.skipIf(!directory)('Modelica sensor equations preserve all IMU/GPS axes and roof gates at90Hz',async()=>{
  const compiler:typeof Rumoca=await import(/* @vite-ignore */ pathToFileURL(resolve(directory!,'rumoca_bind_wasm.js')).href);
  const wasm=readFileSync(resolve(directory!,'rumoca_bind_wasm_bg.wasm'));
  await compiler.default({module_or_path:wasm});
  const source=readFileSync('models/Sensors/SensorObservations.mo','utf8');
  console.info(JSON.stringify({event:'sensor_equations_provenance',revision:compiler.get_git_commit(),compilerSha256:createHash('sha256').update(wasm).digest('hex'),sourceSha256:createHash('sha256').update(source).digest('hex'),ticks:90}));
  const make=(name:string,text=source)=>compiler.WasmSimulationSession.withInteractiveOptions(text,name,1/90,'rk-like',1e-12,1e-12,'[]');
  const preparationStart=performance.now();
  const sensor=make('SensorObservations');
  const edited=make('SensorObservations',source.replace('{0.015,-0.012,0.02}','{0.025,-0.012,0.02}'));
  const preparationMs=performance.now()-preparationStart,frameTimes:number[]=[];
  let tick=0;
  const evaluate=(s:typeof sensor,input:Input[],time:number)=>{s.set_inputs(JSON.stringify(input));s.advance_to(time);return JSON.parse(s.state_json()).values as Record<string,number>;};
  try{
    for(let frame=1;frame<=90;frame++){
      const a=[Math.sin(frame*.7),-frame/11,9.81+frame*.003],g=[frame*.0001,-.08,.6];
      const ad=Array.from({length:3},(_,i)=>[(frame+3*i)%19/19,(frame*7+i)%23/23]);
      const gd=Array.from({length:3},(_,i)=>[(frame+5*i)%29/29,(frame*11+i)%31/31]);
      const pd=Array.from({length:3},(_,i)=>[(frame+7*i)%37/37,(frame*13+i)%41/41]);
      const positions=[[35.8,-5.2,0],[48.2,5.2,3.8],[35.8-1e-8,0,1],[42,0,3.8+1e-8],[42,0,1]];
      const p=positions[frame%positions.length],roof=frame%7===0?0:1;
      const input=[...vector('accelTruth',a),...vector('gyroTruth',g),...vector('positionTruth',p),...draws('accelDraws',ad),...draws('gyroDraws',gd),...draws('gpsDraws',pd),['roofEnabled',roof] as Input];
      const start=performance.now(),actual=evaluate(sensor,input,frame/90);
      frameTimes.push(performance.now()-start);
      const changed=evaluate(edited,input,frame/90);
      const inside=p.every((v,i)=>v>=[35.8,-5.2,0][i]&&v<=[48.2,5.2,3.8][i]);
      expect(actual.gpsAvailable,`roof frame${frame}`).toBe(roof&&inside?0:1);
      for(let i=0;i<3;i++){
        close(actual[`accel[${i+1}]`],a[i]+[.015,-.012,.02][i]+.015*gaussian(...ad[i] as [number,number]),`accel frame${frame} axis${i}`);
        close(actual[`gyro[${i+1}]`],g[i]+[.0004,-.0003,.0006][i]+.0005*gaussian(...gd[i] as [number,number]),`gyro frame${frame} axis${i}`);
        close(actual[`gpsPosition[${i+1}]`],p[i]+.1*gaussian(...pd[i] as [number,number]),`GPS frame${frame} axis${i}`);
        close(changed[`accel[${i+1}]`]-actual[`accel[${i+1}]`],i===0?.01:0,`edited bias axis${i}`);
        for(let j=0;j<3;j++)expect(actual[`gpsCovariance[${i+1},${j+1}]`]).toBe(i===j?.01:0);
      }
    }
    if(process.env.RUMOCA_SENSOR_REPORT)writeFileSync(process.env.RUMOCA_SENSOR_REPORT,JSON.stringify({
      event:'sensor_equations_pass',revision:compiler.get_git_commit(),
      compilerSha256:createHash('sha256').update(wasm).digest('hex'),sourceSha256:createHash('sha256').update(source).digest('hex'),
      ticks:90,twoSessionPreparationMs:preparationMs,
      sensorFrameMeanMs:frameTimes.reduce((sum,v)=>sum+v,0)/frameTimes.length,sensorFrameMaxMs:Math.max(...frameTimes),
      includes:'JSON input write, advance_to and state_json/read for three-axis IMU/GPS/roof only',
      excludes:'whole-frame depth, draw transport, rendering, worker/Zenoh and full SLAM',
    },null,2)+'\n');
  }finally{sensor.free();edited.free();}
},45_000);

it.skipIf(!directory)('Modelica independent truth-reference/error oracle preserves accumulation and quaternion signs',async()=>{
  const compiler:typeof Rumoca=await import(/* @vite-ignore */ pathToFileURL(resolve(directory!,'rumoca_bind_wasm.js')).href);
  await compiler.default({module_or_path:readFileSync(resolve(directory!,'rumoca_bind_wasm_bg.wasm'))});
  const make=(path:string,name:string)=>compiler.WasmSimulationSession.withInteractiveOptions(readFileSync(path,'utf8'),name,1/90,'rk-like',1e-12,1e-12,'[]');
  const evaluation=make('models/Evaluation/RuntimeEvaluation.mo','RuntimeEvaluation');
  let tick=0,previous=0;
  const evaluate=(s:typeof evaluation,input:Input[])=>{s.set_inputs(JSON.stringify(input));s.advance_to(++tick/90);return JSON.parse(s.state_json()).values as Record<string,number>;};
  const product=(a:number[],b:number[])=>{
    const [w,x,y,z]=a,[v,i,j,k]=b;
    return [w*v-x*i-y*j-z*k,w*i+x*v+y*k-z*j,w*j-x*k+y*v+z*i,w*k+x*j-y*i+z*v];
  };
  try{
    for(let frame=1;frame<=90;frame++){
      const heading=.7,tilt=.25,originQ=product([Math.cos(heading/2),0,0,Math.sin(heading/2)],[Math.cos(tilt/2),Math.sin(tilt/2),0,0]);
      const worldQ=product([Math.cos(frame*.003),0,Math.sin(frame*.003),0],[Math.cos(.2),0,0,Math.sin(.2)]);
      const origin=[2,-3,1.5],world=[2+frame*.02,-3+Math.sin(frame*.01),1.7],dx=world[0]-origin[0],dy=world[1]-origin[1];
      const reference=[Math.cos(heading)*dx+Math.sin(heading)*dy,-Math.sin(heading)*dx+Math.cos(heading)*dy,world[2]-origin[2]];
      const referenceQ=product([Math.cos(heading/2),0,0,-Math.sin(heading/2)],worldQ);
      const estimate=reference.map((v,i)=>v+.01*(i+1));
      // A nonzero angle avoids amplifying ULP differences through acos near1;
      // alternating hemispheres still exercise quaternion sign equivalence.
      const estimateQ=product(referenceQ,[Math.cos(.03),Math.sin(.03),0,0]).map(v=>frame%2?-v:v);
      const squared=estimate.reduce((sum,v,i)=>sum+(v-reference[i])**2,0);
      const out=evaluate(evaluation,[...vector('worldPosition',world),...vector('worldQuaternion',worldQ),...vector('originPosition',origin),...vector('originQuaternion',originQ),...vector('estimatePosition',estimate),...vector('estimateQuaternion',estimateQ),['previousSquaredError',previous],['sampleCount',frame]]);
      previous+=squared;
      for(let i=0;i<3;i++)close(out[`referencePosition[${i+1}]`],reference[i],`reference position${i}`);
      for(let i=0;i<4;i++)close(out[`referenceQuaternion[${i+1}]`],referenceQ[i],`reference quaternion${i}`);
      close(out.currentError,Math.sqrt(squared),'current error');close(out.nextSquaredError,previous,'accumulation');close(out.ate,Math.sqrt(previous/frame),'ATE');
      const dot=Math.abs(estimateQ.reduce((sum,v,i)=>sum+v*referenceQ[i],0));
      close(out.orientationError,2*Math.acos(Math.min(1,dot))*180/Math.PI,'orientation antipode');
    }
  }finally{evaluation.free();}
},45_000);
