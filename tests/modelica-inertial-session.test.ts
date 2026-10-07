import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import init,* as rumoca from '@cognipilot/rumoca';
import {ModelicaInertialSession} from '../src/modelica-inertial-session';

const source=readFileSync('models/ModelicaInertial.mo','utf8');
const initial='[["accel[1]",0],["accel[2]",0],["accel[3]",9.81],["gyro[1]",0],["gyro[2]",0],["gyro[3]",0]]';
async function make(text=source){
  await init({module_or_path:readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
  const solver=rumoca.WasmSimulationSession.withInteractiveOptions(text,'ModelicaInertial',.005,'rk-like',1e-10,1e-8,initial);
  return {solver,adapter:new ModelicaInertialSession(solver)};
}
const frame=(time:number,dt=1/90,ax=0)=>({time,dt,imu:{accel:[ax,0,9.81],gyro:[0,0,0]}});

it('actual Rumoca-owned INS follows independent analytic low-pass and position dynamics, edits and reset/replay',async()=>{
  const current=await make(),edited=await make(source.replace('accel_tau = 0.03','accel_tau = 0.06'));
  try{
    const replay:ReturnType<ModelicaInertialSession['estimate']>[]=[];
    for(let i=1;i<=90;i++){
      const t=i/90,estimate=current.adapter.step(frame(t,1/90,1));replay.push(estimate);
      edited.adapter.step(frame(t,1/90,1));
      for(const [s,tau] of [[current.solver,.03],[edited.solver,.06]] as const){
        const e=Math.exp(-t/tau);
        expect(s.get('filteredAccel[1]')).toBeCloseTo(1-e,7);
        expect(s.get('velocity[1]')).toBeCloseTo(t-tau*(1-e),7);
        expect(s.get('position[1]')).toBeCloseTo(t*t/2-tau*t+tau*tau*(1-e),7);
      }
      expect(estimate.quaternion).toEqual([1,0,0,0]);expect(estimate.z).toBeCloseTo(0,12);
      expect(estimate.diagnostics.backend).toBe('Rumoca Solve IR session');
    }
    expect(current.adapter.estimate().x).toBeGreaterThan(edited.adapter.estimate().x);
    current.adapter.reset();
    expect(current.adapter.estimate().x).toBe(0);
    for(let i=1;i<=90;i++)expect(current.adapter.step(frame(i/90,1/90,1))).toEqual(replay[i-1]);
    console.info(JSON.stringify({scope:'Actual pinned Rumoca compiler-owned Solve IR session; no app emitter/integrator',frames:270,compilerVersion:rumoca.get_version(),compilerCommit:rumoca.get_git_commit()}));
  }finally{current.adapter.free();edited.adapter.free();}
},90_000);

it('validates the entire IMU batch and timestamp continuity before any solver advance',async()=>{
  const {solver,adapter}=await make();
  try{
    adapter.step(frame(1/90));const before=solver.state_json();
    const invalid={...frame(3/90,2/90),imuIntervals:[
      {time:2/90,dt:1/90,imu:frame(2/90).imu},
      {time:3/90,dt:1/90,imu:{accel:[NaN,0,9.81],gyro:[0,0,0]}},
    ]};
    expect(()=>adapter.step(invalid)).toThrow('finite');expect(solver.state_json()).toBe(before);
    expect(()=>adapter.step(frame(3/90))).toThrow('Discontinuous');expect(solver.state_json()).toBe(before);
    expect(()=>adapter.reset(20)).toThrow('reset_at');expect(solver.state_json()).toBe(before);
    const batch={...frame(3/90,2/90),imuIntervals:[
      {time:2/90,dt:1/90,imu:frame(2/90,1/90,1).imu},
      {time:3/90,dt:1/90,imu:frame(3/90,1/90,2).imu},
    ]};
    adapter.step(batch);expect(solver.time()).toBeCloseTo(3/90,12);
    adapter.reset();const reset=solver.state_json();
    expect(()=>adapter.step(frame(20+1/90))).toThrow('reset_at');expect(solver.state_json()).toBe(reset);
  }finally{adapter.free();}
},90_000);

it('rejects source interfaces that omit declared IMU channels or pose outputs',async()=>{
  await init({module_or_path:readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
  const solver=rumoca.WasmSimulationSession.withInteractiveOptions('model ModelicaInertial input Real accel=0; output Real position=accel; end ModelicaInertial;','ModelicaInertial',.005,'rk-like',1e-10,1e-8,'[]');
  expect(()=>new ModelicaInertialSession(solver)).toThrow('accel[3]');
},90_000);
