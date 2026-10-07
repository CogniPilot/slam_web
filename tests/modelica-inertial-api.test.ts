import {expect,it,vi} from 'vitest';
import {ModelicaInertialSession,type InertialSolverSession} from '../src/modelica-inertial-session';

// Transport-boundary controls only. These do not substitute for the compiler
// source/reset/batch tests or execution of the forthcoming WASM package.
function boundary(){
  const names=['position','quaternion','velocity','filteredAccel','filteredGyro'].flatMap(
    name=>Array.from({length:name==='quaternion'?4:3},(_,i)=>`${name}[${i+1}]`));
  const values=Object.fromEntries(names.map(name=>[name,name==='quaternion[1]'?1:0]));
  let time=0;
  const solver:InertialSolverSession={
    input_names:()=>JSON.stringify(['accel','gyro'].flatMap(name=>[1,2,3].map(i=>`${name}[${i}]`))),
    get:vi.fn(()=>{throw new Error('Scalar fallback must not hide batch failure');}),
    values_for:vi.fn(request=>{
      expect(JSON.parse(request)).toEqual(names);
      return JSON.stringify(values);
    }),
    set_inputs:vi.fn(),advance_to:vi.fn(t=>{time=t;}),time:()=>time,
    reset:vi.fn(()=>{time=0;}),reset_at:vi.fn(t=>{time=t;}),free:vi.fn(),
  };
  return {solver,values,adapter:new ModelicaInertialSession(solver)};
}
const frame=(time:number)=>({time,dt:1/90,imu:{accel:[0,0,9.81],gyro:[0,0,0]}});

it('uses one compiler observation for all pose and diagnostic outputs',()=>{
  const {solver,adapter,values}=boundary();
  vi.mocked(solver.values_for!).mockClear();
  values['position[1]']=12;values['position[2]']=-3;
  expect(adapter.estimate()).toMatchObject({x:12,y:-3,z:0,quaternion:[1,0,0,0]});
  expect(solver.values_for).toHaveBeenCalledTimes(1);
  expect(solver.get).not.toHaveBeenCalled();
});

it.each(['[]','null','{"position[1]":0}','invalid JSON'])(
  'rejects malformed or incomplete compiler observation %s without scalar retry',result=>{
    const {solver,adapter}=boundary();
    vi.mocked(solver.values_for!).mockReturnValue(result);
    expect(()=>adapter.estimate()).toThrow();
    expect(solver.get).not.toHaveBeenCalled();
  });

it('propagates compiler observation faults without retrying another API',()=>{
  const {solver,adapter}=boundary();
  vi.mocked(solver.values_for!).mockImplementation(()=>{throw new Error('checked observation failed');});
  expect(()=>adapter.estimate()).toThrow('checked observation failed');
  expect(solver.get).not.toHaveBeenCalled();
});

it('delegates absolute reset and replay initialization to the compiler',()=>{
  const {solver,adapter}=boundary();
  adapter.reset(7000.125);
  expect(solver.reset_at).toHaveBeenCalledExactlyOnceWith(7000.125);
  expect(solver.reset).not.toHaveBeenCalled();
  adapter.step(frame(7000.125+1/90));
  expect(solver.reset_at).toHaveBeenCalledTimes(1);
  expect(solver.advance_to).toHaveBeenLastCalledWith(7000.125+1/90);
  adapter.reset();
  expect(solver.reset).toHaveBeenCalledTimes(1);
  adapter.step(frame(7+1/90));
  expect(solver.reset_at).toHaveBeenLastCalledWith(7);
  expect(solver.advance_to).toHaveBeenLastCalledWith(7+1/90);
});

it('validates reset timestamps and complete replay batches before mutation',()=>{
  const {solver,adapter}=boundary();
  for(const time of [-1,NaN,Infinity,-Infinity])expect(()=>adapter.reset(time)).toThrow('finite nonnegative');
  expect(()=>adapter.step({...frame(7+1/90),imu:{accel:[NaN,0,9.81],gyro:[0,0,0]}})).toThrow('finite');
  expect(solver.reset_at).not.toHaveBeenCalled();
  expect(solver.reset).not.toHaveBeenCalled();
  expect(solver.set_inputs).not.toHaveBeenCalled();
  expect(solver.advance_to).not.toHaveBeenCalled();
});

it('rejects missing or nonfinite diagnostic cells as well as pose cells',()=>{
  const {adapter,values}=boundary();
  for(const name of ['velocity[3]','filteredAccel[1]','filteredGyro[2]']){
    values[name]=Infinity;
    expect(()=>adapter.estimate()).toThrow(name);
    values[name]=0;
  }
});
