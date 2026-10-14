import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import init,* as rumoca from '@cognipilot/rumoca';
import {readPhysicsSnapshot} from '../src/physics-snapshot';
import {modelicaModelsSources} from '../src/modelica-models-library';

const legacy=(session:rumoca.WasmSimulationSession)=>({time:session.time(),x:session.get('x'),y:session.get('y'),z:session.get('z'),
  quaternion:['qw','qx','qy','qz'].map(name=>session.get(name)),velocity:['vx','vy','vz'].map(name=>session.get(name)),
  accel:['imu_ax','imu_ay','imu_az'].map(name=>session.get(name)),gyro:['p','q','r'].map(name=>session.get(name)),
  propellerAngles:[1,2,3,4].map(i=>session.get(`propellerAngles[${i}]`))});

it('one Rumoca snapshot preserves every truth/IMU field, exact time, reset, and model interface checks',async()=>{
  await init({module_or_path:readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
  expect(JSON.parse(rumoca.sync_workspace_sources(JSON.stringify(modelicaModelsSources))).error_count).toBe(0);
  const source=readFileSync('models/Vehicles/LabQuadrotor.mo','utf8');
  const create=(text:string)=>rumoca.WasmSimulationSession.withInteractiveOptions(text,'LabQuadrotor',.005,'rk-like',1e-8,1e-6,
    '[["forward",0],["left",0],["up",0],["yaw",0]]');
  const edited=source.replace('mass = 2.0','mass = 2.4');expect(edited).not.toBe(source);
  for(const text of [source,edited]){
    const session=create(text);
    try {
      expect(readPhysicsSnapshot(session)).toEqual(legacy(session));
      for(let frame=0;frame<60;frame++){
        session.set_inputs(JSON.stringify([['forward',frame<30?.7:-.4],['left',.3],['up',.2],['yaw',frame<30?.4:-.2]]));
        const time=Math.round((frame+1)/90*1e9)/1e9;session.advance_to(time);
        expect(readPhysicsSnapshot(session)).toEqual(legacy(session));expect(session.time()).toBe(time);
      }
      const before=session.time();
      expect(readPhysicsSnapshot(session)).toEqual(readPhysicsSnapshot(session));expect(session.time()).toBe(before);
      session.reset();expect(readPhysicsSnapshot(session)).toEqual(legacy(session));expect(session.time()).toBe(0);
    }finally{session.free();}
  }
  const invalid=create(source.replaceAll('imu_az','imu_vertical'));
  try{expect(()=>readPhysicsSnapshot(invalid)).toThrow('finite imu_az');}finally{invalid.free();}
},60_000);

it('the larger adaptive starting step preserves flight observations within the solver error budget',async()=>{
  await init({module_or_path:readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
  expect(JSON.parse(rumoca.sync_workspace_sources(JSON.stringify(modelicaModelsSources))).error_count).toBe(0);
  const source=readFileSync('models/Vehicles/LabQuadrotor.mo','utf8');
  for(const text of [source,source.replace('mass = 2.0','mass = 2.4')]){
    const sessions=[.005,.01].map(dt=>rumoca.WasmSimulationSession.withInteractiveOptions(text,'LabQuadrotor',dt,'rk-like',1e-8,1e-6,
      '[["forward",0],["left",0],["up",0],["yaw",0]]'));
    try{for(let i=0;i<90;i++){
      const inputs=JSON.stringify([['forward',i<45?.7:-.4],['left',.3],['up',.2],['yaw',i<45?.4:-.2]]);
      for(const session of sessions){session.set_inputs(inputs);session.advance_to((i+1)/90);}
      const [reference,actual]=sessions.map(session=>readPhysicsSnapshot(session,true));
      expect(actual.time).toBe(reference.time);
      expect(Math.hypot(actual.x-reference.x,actual.y-reference.y,actual.z-reference.z)).toBeLessThan(2e-6);
      for(let axis=0;axis<4;axis++)expect(Math.abs(actual.quaternion[axis]-reference.quaternion[axis])).toBeLessThan(5e-7);
      for(let axis=0;axis<3;axis++){
        expect(Math.abs(actual.velocity[axis]-reference.velocity[axis])).toBeLessThan(2e-5);
        expect(Math.abs(actual.accel[axis]-reference.accel[axis])).toBeLessThan(2e-4);
        expect(Math.abs(actual.gyro[axis]-reference.gyro[axis])).toBeLessThan(2e-5);
      }
      expect(actual.command).toEqual(reference.command);
    }}finally{sessions.forEach(session=>session.free());}
  }
},60_000);
