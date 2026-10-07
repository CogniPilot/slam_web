import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import init,* as rumoca from '@cognipilot/rumoca';
import {ModelicaRuntimeMath} from '../src/modelica-runtime-math';
import {defaultProject,parseProject} from '../src/project';
import type {Truth} from '../src/types';

const gaussian=(r:number,a:number)=>Math.sqrt(-2*Math.log(Math.max(1e-9,r)))*Math.cos(2*Math.PI*a);
const close=(actual:number,expected:number)=>{expect(Number.isFinite(actual)).toBe(true);expect(Math.abs(actual-expected)).toBeLessThan(2e-10);};
it('production Modelica math sessions preserve sensor draws, all axes, truth-relative evaluation, source edits and saved sources',async()=>{
  await init({module_or_path:readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
  const project=defaultProject();
  const heading=.7,origin={x:2,y:-3,z:1.5,quaternion:[Math.cos(heading/2),0,0,Math.sin(heading/2)]};
  const make=(source:string,model:string)=>rumoca.WasmSimulationSession.withInteractiveOptions(source,model,1/90,'rk-like',1e-12,1e-12,'[]');
  const baseline=new ModelicaRuntimeMath(make,project.sensorModelica!,project.evaluationModelica!,origin);
  const saved=parseProject(JSON.stringify({...project,sensorModelica:project.sensorModelica!.replace('{0.015,-0.012,0.02}','{0.025,-0.012,0.02}'),evaluationModelica:project.evaluationModelica!.replace('orientationError = 2.0*','orientationError = 4.0*')}));
  const edited=new ModelicaRuntimeMath(make,saved.sensorModelica!,saved.evaluationModelica!,origin);
  const roof={minimum:[35.8,-5.2,0],maximum:[48.2,5.2,3.8]};
  let squared=0;
  try{for(let index=0;index<90;index++){
    const inside=index%2===0,enabled=index%3!==0;
    const truth:Truth={time:(index+1)/90,x:inside?42:35.79,y:.1,z:1.7,quaternion:[1,0,0,0],velocity:[0,0,0],accel:[.1,-.2,9.81],gyro:[.001,-.003,.2]};
    const available=!enabled||!inside;
    expect(baseline.gpsAvailable(truth,roof,enabled)).toBe(available);
    expect(edited.gpsAvailable(truth,roof,enabled)).toBe(available);
    const accel=Array.from({length:3},(_,i)=>[(index+i)%17/17,(index*3+i)%19/19]);
    const gyro=Array.from({length:3},(_,i)=>[(index+i)%23/23,(index*7+i)%29/29]);
    const gps=Array.from({length:3},(_,i)=>[(index+i)%31/31,(index*11+i)%37/37]);
    const draws={accel,gyro,...(available?{gps}:{})};
    const actual=baseline.observeSensors(truth,draws,roof,enabled),changed=edited.observeSensors(truth,draws,roof,enabled);
    for(let i=0;i<3;i++){
      close(actual.imu.accel[i],truth.accel[i]+[.015,-.012,.02][i]+.015*gaussian(accel[i][0],accel[i][1]));
      close(actual.imu.gyro[i],truth.gyro[i]+[.0004,-.0003,.0006][i]+.0005*gaussian(gyro[i][0],gyro[i][1]));
      close(changed.imu.accel[i]-actual.imu.accel[i],i===0?.01:0);
      if(available)close(actual.gps!.position[i],[truth.x,truth.y,truth.z][i]+.1*gaussian(gps[i][0],gps[i][1]));
    }
    expect(Boolean(actual.gps)).toBe(available);
    if(available)expect(actual.gps!.positionCovariance).toEqual([.01,0,0,0,.01,0,0,0,.01]);
    const dx=truth.x-origin.x,dy=truth.y-origin.y,reference=[Math.cos(heading)*dx+Math.sin(heading)*dy,-Math.sin(heading)*dx+Math.cos(heading)*dy,truth.z-origin.z];
    const referenceQ=[Math.cos(heading/2),0,0,-Math.sin(heading/2)];
    const estimate={x:reference[0]+.01,y:reference[1]-.02,z:reference[2]+.03,quaternion:[Math.cos(heading/2+.03),0,0,-Math.sin(heading/2+.03)].map(v=>index%2?-v:v)};
    const evaluated=baseline.evaluate(truth,estimate,index+1),editedEvaluation=edited.evaluate(truth,estimate,index+1);
    squared+=.01**2+.02**2+.03**2;
    [evaluated.reference.x,evaluated.reference.y,evaluated.reference.z].forEach((v,i)=>close(v,reference[i]));
    evaluated.reference.quaternion.forEach((v,i)=>close(v,referenceQ[i]));
    close(evaluated.metrics.currentError,Math.sqrt(.0014));close(evaluated.metrics.ate,Math.sqrt(squared/(index+1)));
    close(evaluated.metrics.orientationError,.06*180/Math.PI);
    close(editedEvaluation.metrics.orientationError,2*evaluated.metrics.orientationError);
    // Re-observing at the exact same committed timestamp must not retain
    // stale inputs or mutate the returned accumulated sum.
    const twice=baseline.evaluate(truth,{...estimate,x:reference[0]},index+1,false);
    close(twice.metrics.currentError,Math.sqrt(.0013));
  }
  const truth:Truth={time:91/90,x:3,y:4,z:2,quaternion:[1,0,0,0],velocity:[0,0,0],accel:[0,0,9.81],gyro:[0,0,0]};
  baseline.setOrigin({x:3,y:4,z:2,quaternion:[1,0,0,0]});
  const reference=baseline.evaluate(truth,{x:0,y:0,z:0,quaternion:[1,0,0,0]},1);
  expect(reference.metrics).toEqual({ate:0,currentError:0,orientationError:0});
  expect(reference.reference).toEqual({x:0,y:0,z:0,quaternion:[1,0,0,0]});
  expect(()=>baseline.observeSensors(truth,{accel:[[1,.2],[.5,.5],[.5,.5]],gyro:[[.5,.5],[.5,.5],[.5,.5]]},roof,true)).toThrow('uniform draws');
  expect(()=>baseline.evaluate(truth,{x:NaN,y:0,z:0,quaternion:[1,0,0,0]},1)).toThrow('finite inputs');
  expect(()=>baseline.evaluate(truth,{x:0,y:0,z:0,quaternion:[1,0,0]},1)).toThrow('input vector');
  // Bad interface creation must release the already-created sessions and
  // refuse compilation instead of retaining an older working context.
  expect(()=>new ModelicaRuntimeMath(make,project.sensorModelica!.replaceAll('gpsAvailable','gateResult'),project.evaluationModelica!,origin)).toThrow('finite gpsAvailable');
  expect(parseProject(JSON.stringify(saved)).sensorModelica).toBe(saved.sensorModelica);
  expect(parseProject(JSON.stringify(saved)).evaluationModelica).toBe(saved.evaluationModelica);
  }finally{baseline.free();edited.free();}
},60000);
