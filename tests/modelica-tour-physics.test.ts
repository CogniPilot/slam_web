import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import init,* as rumoca from '@cognipilot/rumoca';
import {readPhysicsSnapshot} from '../src/physics-snapshot';

it('the editable Modelica flight tour drives the plant with held lockstep commands and preserves manual control',async()=>{
  await init({module_or_path:readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
  const source=readFileSync('models/Vehicles/LabQuadrotor.mo','utf8');
  const make=()=>rumoca.WasmSimulationSession.withInteractiveOptions(source,'LabQuadrotor',.005,'rk-like',1e-10,1e-8,'[["forward",0],["left",0],["up",0],["yaw",0]]');
  const automatic=make(),manual=make();
  try{
    let sequence=0;
    for(const indoor of [0,1])for(const t of [0,1.999,2,39.999,40,49.999,50,89.999,90]){
      const expected={forward:indoor?t<40?1.1:t<50?0:t<90?-1.1:0:.6,left:0,up:indoor?0:.06*Math.sin(t*.3),yaw:indoor||t<2?0:.4};
      automatic.set_inputs(JSON.stringify([['autopilot',1],['indoorTour',indoor],['commandTime',t]]));
      manual.set_inputs(JSON.stringify(Object.entries(expected)));
      const time=++sequence/90;automatic.advance_to(time);manual.advance_to(time);
      const truth=readPhysicsSnapshot(automatic,true);
      for(const [name,value] of Object.entries(expected))expect(Math.abs(truth.command![name as keyof typeof expected]-value)).toBeLessThan(1e-14);
      // Whole plant state and measured body IMU must match independently
      // supplied manual commands, not just the displayed command outputs.
      const expectedTruth=readPhysicsSnapshot(manual);
      // The genuine plant's asymmetric motor lag needs tighter integration
      // than the retired plant. Keep the same 2e-8 comparison bound across
      // the different adaptive changed-input paths.
      for(const name of ['x','y','z'] as const)expect(Math.abs(truth[name]-expectedTruth[name])).toBeLessThan(2e-8);
      for(const name of ['quaternion','velocity','accel','gyro'] as const)truth[name].forEach((v,i)=>expect(Math.abs(v-expectedTruth[name][i])).toBeLessThan(2e-8));
      expect(truth.time).toBe(time);
    }
    automatic.set_inputs(JSON.stringify([['autopilot',0],['forward',-.2],['left',.1],['up',-.3],['yaw',.15]]));
    automatic.advance_to(++sequence/90);
    expect(readPhysicsSnapshot(automatic,true).command).toEqual({forward:-.2,left:.1,up:-.3,yaw:.15});
  }finally{automatic.free();manual.free();}
},60000);
