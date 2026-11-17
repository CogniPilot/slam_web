import {expect,it,vi} from 'vitest';
import {ModelicaRuntimeMath} from '../src/modelica-runtime-math';

it('resets every existing math session, actor dispatch clock and accumulated error without creating or freeing sessions',()=>{
  const sessions=Array.from({length:4},()=>({reset:vi.fn(),free:vi.fn()}));
  const math=Object.assign(Object.create(ModelicaRuntimeMath.prototype),{
    sensor:sessions[0],availability:sessions[1],evaluation:sessions[2],actor:sessions[3],actorTick:70,sum:42,
    origin:{x:9,y:9,z:9,quaternion:[0,1,0,0]},
  });
  const origin={x:0,y:0,z:1.5,quaternion:[1,0,0,0]};
  for(let i=0;i<2;i++){
    math.reset(origin);expect(math.actorTick).toBe(0);expect(math.sum).toBe(0);expect(math.origin).toEqual(origin);
    expect(math.origin).not.toBe(origin);
  }
  for(const session of sessions){expect(session.reset).toHaveBeenCalledTimes(2);expect(session.free).not.toHaveBeenCalled();}
});

it('actual pinned Rumoca math sessions reproduce initial sensor and actor observations after rewind without recompiling',async()=>{
  const {readFileSync}=await import('node:fs');
  const {default:init,...compiler}=await import('@cognipilot/rumoca');
  const {defaultProject}=await import('../src/project');
  await init({module_or_path:readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
  let created=0;
  const project=defaultProject(),origin={x:0,y:0,z:1.5,quaternion:[1,0,0,0]};
  const math=new ModelicaRuntimeMath((source,model)=>{created++;return compiler.WasmSimulationSession.withInteractiveOptions(source,model,1/90,'rk-like',1e-12,1e-12,'[]');},project.sensorModelica!,project.evaluationModelica!,origin,project.sensorModelica!);
  const truth={...origin,time:0,velocity:[0,0,0],accel:[0,0,9.81],gyro:[0,0,0]};
  const roof={minimum:[-1,-1,0],maximum:[1,1,3]},draws={accel:[[.5,.5],[.5,.5],[.5,.5]],gyro:[[.5,.5],[.5,.5],[.5,.5]]};
  try{
    const initialSensors=math.observeSensors(truth,draws,roof,true,false),initialActors=math.actors(0);
    const estimate={x:2,y:0,z:0,quaternion:[1,0,0,0]},first=math.evaluate(truth,estimate,1);
    math.observeSensors({...truth,time:.2},draws,roof,true,false);math.actors(10);math.evaluate({...truth,time:.2},estimate,2);
    math.reset(origin);
    expect(math.observeSensors(truth,draws,roof,true,false)).toEqual(initialSensors);
    expect(math.actors(0)).toEqual(initialActors);expect(math.evaluate(truth,estimate,1)).toEqual(first);
    expect(created).toBe(4);
  }finally{math.free();}
},60_000);
