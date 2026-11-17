import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import init,* as rumoca from '@cognipilot/rumoca';
import {defaultProject,phoneMotionEKFPath} from '../src/project';
import {MAP_FLIGHT_TOUR_PATH} from '../src/modelica-flight-tour';
import {configuredModelicaSession,supportsWasmMultiMemory} from '../src/modelica-session-parameters';
import {ModelicaInertialSession} from '../src/modelica-inertial-session';
import {eulerDegrees,initialTilt} from '../src/phone-motion';

// Safari/WebKit reject Rumoca's multi-memory compiled programs, so those
// browsers run the same sessions through Rumoca's interpreter.
it('runs the flight plant and phone EKF with the interpreter policy used on Safari', async () => {
  await init({module_or_path:readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
  expect(supportsWasmMultiMemory()).toBe(true);// Node; the interpreter is forced below
  const project=defaultProject(),workspace={...project.modelicaSources};delete workspace[MAP_FLIGHT_TOUR_PATH];
  expect(JSON.parse(rumoca.sync_workspace_sources(JSON.stringify(workspace))).error_count).toBe(0);
  const plant=configuredModelicaSession(rumoca,project.physics,'LabQuadrotor',.01,'rk-like',1e-8,1e-6,
    '[["forward",0],["left",0],["up",0],["yaw",0]]',{},{},'interpreter');
  try{
    let started=performance.now();
    for(let k=1;k<=100;k++)plant.step(.01);
    const flightMs=(performance.now()-started)/100;
    console.log(`interpreter flight plant: ${flightMs.toFixed(2)} ms per 10 ms step`);
    expect(Number.isFinite(plant.time())).toBe(true);
  }finally{plant.free();}
  rumoca.sync_workspace_sources('{}');

  const g=9.81,roll=Math.PI/6,tilted=[0,g*Math.sin(roll),g*Math.cos(roll)];
  const level='[["accel[1]",0],["accel[2]",0],["accel[3]",9.81],["gyro[1]",0],["gyro[2]",0],["gyro[3]",0]]';
  const ekf=new ModelicaInertialSession(configuredModelicaSession(rumoca,project.modelicaSources![phoneMotionEKFPath],'PhoneMotionEKF',
    .005,'rk-like',1e-10,1e-8,level,initialTilt(tilted),{},'interpreter'));
  try{
    const started=performance.now();let estimate=ekf.estimate();
    for(let k=1;k<=20;k++){
      const intervals=Array.from({length:6},(_,i)=>({time:(k-1)/10+(i+1)/60,dt:1/60,imu:{accel:tilted,gyro:[0,0,0]}}));
      estimate=ekf.step({time:intervals.at(-1)!.time,dt:.1,imu:intervals[0].imu,imuIntervals:intervals});
    }
    console.log(`interpreter phone EKF: ${((performance.now()-started)/120).toFixed(2)} ms per 60 Hz sample`);
    expect(eulerDegrees(estimate.quaternion).roll).toBeCloseTo(30,2);
  }finally{ekf.free();}
  rumoca.sync_workspace_sources('{}');
},180_000);
