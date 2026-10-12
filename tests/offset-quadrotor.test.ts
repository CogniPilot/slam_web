import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import init,* as rumoca from '@cognipilot/rumoca';
import {modelicaModelsSources} from '../src/modelica-models-library';
import {readPhysicsSnapshot} from '../src/physics-snapshot';

it('initializes independent plants and controller references at their ENU spawn positions',async()=>{
  await init({module_or_path:readFileSync('node_modules/@cognipilot/rumoca/rumoca_bind_wasm_bg.wasm')});
  expect(JSON.parse(rumoca.sync_workspace_sources(JSON.stringify(modelicaModelsSources))).error_count).toBe(0);
  const source=readFileSync('models/Vehicles/LabQuadrotor.mo','utf8')+'\n'+readFileSync('models/Vehicles/OffsetQuadrotor.mo','utf8');
  const make=(model:string)=>rumoca.WasmSimulationSession.withInteractiveOptions(
    source,model,.005,'rk-like',1e-10,1e-8,'[["forward",0],["left",0],["up",0],["yaw",0]]');
  const first=make('LabQuadrotor'),second=make('OffsetQuadrotor');
  const values=(session:typeof first)=>JSON.parse(session.state_json()).values as Record<string,number>;
  const checkSpawn=()=>{
    for(const [name,target] of Object.entries({x:0,y:0,z:1.5}))expect(readPhysicsSnapshot(first)[name as 'x'|'y'|'z']).toBeCloseTo(target,12);
    for(const [name,target] of Object.entries({x:0,y:2,z:1.5}))expect(readPhysicsSnapshot(second)[name as 'x'|'y'|'z']).toBeCloseTo(target,12);
    const v=values(second);
    [2,0,1.5].forEach((target,index)=>expect(v[`vehicle.p[${index+1}]`]).toBeCloseTo(target,12));
    for(let axis=1;axis<=3;axis++){
      expect(v[`pathPosition[${axis}]`]).toBe([0,2,1.5][axis-1]);
      expect(v[`positionSetpoint[${axis}]`]).toBe([0,2,1.5][axis-1]);
      expect(v[`targetPosition[${axis}]`]).toBe([0,2,1.5][axis-1]);
    }
  };
  try{
    checkSpawn();
    // The same zero command gives translation invariant physical startup,
    // including motor spin-up and the initial vertical acceleration.
    first.advance_to(.1);second.advance_to(.1);
    const a=readPhysicsSnapshot(first),b=readPhysicsSnapshot(second);
    expect(b.x).toBeCloseTo(a.x,9);expect(b.y-a.y).toBeCloseTo(2,9);expect(b.z).toBeCloseTo(a.z,9);
    for(const field of ['velocity','accel','gyro','quaternion'] as const)
      b[field].forEach((value,index)=>expect(value).toBeCloseTo(a[field][index],8));
    expect(Math.abs(b.velocity[0])+Math.abs(b.velocity[1])).toBeLessThan(1e-8);
    second.set_inputs('[["forward",0.6]]');second.advance_to(.3);
    expect(readPhysicsSnapshot(second).time).toBe(.3);
    expect(readPhysicsSnapshot(first)).toEqual(a);
    expect(values(second)['forwardSetpoint']).toBe(.6);
    expect(values(second)['pathPosition[1]']).toBeGreaterThan(0);
    expect(readPhysicsSnapshot(second).x).toBeGreaterThan(a.x);
    first.reset();second.reset();checkSpawn();
    second.set_inputs('[["positionMode",1]]');second.advance_to(.1);
    expect(readPhysicsSnapshot(second).y).toBeCloseTo(2,9);
  }finally{first.free();second.free();}
},120_000);
