import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import init,* as rumoca from '@cognipilot/rumoca';
import {readPhysicsSnapshot} from '../src/physics-snapshot';

const legacy=(session:rumoca.WasmSimulationSession)=>({time:session.time(),x:session.get('x'),y:session.get('y'),z:session.get('z'),
  quaternion:['qw','qx','qy','qz'].map(name=>session.get(name)),velocity:['vx','vy','vz'].map(name=>session.get(name)),
  accel:['imu_ax','imu_ay','imu_az'].map(name=>session.get(name)),gyro:['p','q','r'].map(name=>session.get(name)),
  propellerAngles:[1,2,3,4].map(i=>session.get(`propellerAngles[${i}]`))});

it('one Rumoca snapshot preserves every truth/IMU field, exact time, reset, and model interface checks',async()=>{
  await init({module_or_path:readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
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
