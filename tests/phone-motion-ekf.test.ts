import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import init,* as rumoca from '@cognipilot/rumoca';
import {defaultProject,estimatorExampleSources,phoneMotionEKFPath} from '../src/project';
import {ModelicaInertialSession} from '../src/modelica-inertial-session';
import {configuredModelicaSession} from '../src/modelica-session-parameters';
import {eulerDegrees,initialTilt} from '../src/phone-motion';

const level='[["accel[1]",0],["accel[2]",0],["accel[3]",9.81],["gyro[1]",0],["gyro[2]",0],["gyro[3]",0]]';
/** Hold one IMU sample for the given duration at 60 Hz, like a phone at rest. */
function hold(session:ModelicaInertialSession,accel:number[],gyro:number[],seconds:number,from=0){
  let estimate=session.estimate(),time=from;
  for(let k=1;k<=Math.round(seconds*10);k++){
    const intervals=Array.from({length:6},(_,i)=>({time:from+(k-1)/10+(i+1)/60,dt:1/60,imu:{accel,gyro}}));
    time=intervals.at(-1)!.time;
    estimate=session.step({time,dt:.1,imu:{accel,gyro},imuIntervals:intervals});
  }
  return estimate;
}

it('runs the phone EKF through actual Rumoca as a selectable inertial example', async () => {
  await init({module_or_path:readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
  const project=defaultProject(),source=project.modelicaSources![phoneMotionEKFPath];
  expect(source).toContain('model PhoneMotionEKF');
  expect(Object.keys(estimatorExampleSources(project))).toContain(phoneMotionEKFPath);
  expect(JSON.parse(rumoca.get_simulation_models(source,'PhoneMotionEKF')).models).toContain('PhoneMotionEKF');
  const g=9.81,roll=Math.PI/6,tilted=[0,g*Math.sin(roll),g*Math.cos(roll)];

  // Started level while the phone is rolled 30°: gravity pulls roll in (about 2 s, measured).
  const corrected=new ModelicaInertialSession(rumoca.WasmSimulationSession.withInteractiveOptions(source,'PhoneMotionEKF',.005,'rk-like',1e-10,1e-8,level));
  try{
    corrected.estimate().quaternion.forEach((value,i)=>expect(value).toBeCloseTo([1,0,0,0][i],12));
    expect(eulerDegrees(hold(corrected,tilted,[0,0,0],10).quaternion).roll).toBeCloseTo(30,0);
    const observed=corrected.observe(['attitudeStd[1]','stationarity','notAnOutput[1]']);
    expect(observed['attitudeStd[1]']).toBeLessThan(.1);
    expect(observed.stationarity).toBeGreaterThan(.9);
    expect(observed).not.toHaveProperty('notAnOutput[1]');
  }finally{corrected.free();}

  // Seeded from the first sample, as the phone panel does: no transient at all.
  const seeded=new ModelicaInertialSession(configuredModelicaSession(rumoca,source,'PhoneMotionEKF',.005,'rk-like',1e-10,1e-8,level,initialTilt(tilted)));
  try{
    const estimate=hold(seeded,tilted,[0,0,0],5);
    expect(eulerDegrees(estimate.quaternion).roll).toBeCloseTo(30,3);
    expect(Math.hypot(estimate.x,estimate.y,estimate.z)).toBeLessThan(1e-3);
  }finally{seeded.free();}

  // A tilt-axis gyro bias is observable through gravity and is learned; the
  // uncorrected integrator would roll 17° over the same 30 s.
  const biased=new ModelicaInertialSession(rumoca.WasmSimulationSession.withInteractiveOptions(source,'PhoneMotionEKF',.005,'rk-like',1e-10,1e-8,level));
  try{
    const estimate=hold(biased,[0,0,g],[.01,0,0],30);
    expect(biased.observe(['gyroBias[1]'])['gyroBias[1]']).toBeCloseTo(.01,3);
    expect(Math.abs(eulerDegrees(estimate.quaternion).roll)).toBeLessThan(.5);
    expect(Math.abs(estimate.y)).toBeLessThan(.5);// zero-velocity updates bound the walk
  }finally{biased.free();}
  rumoca.sync_workspace_sources('{}');
},90_000);
