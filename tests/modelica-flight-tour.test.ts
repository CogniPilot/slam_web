import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import init,* as compiler from '@cognipilot/rumoca';
import {MAP_FLIGHT_TOUR_PATH,MAP_TOUR_INPUTS,ModelicaFlightTour,mapFlightTourSources} from '../src/modelica-flight-tour';

it('actual pinned Modelica profiles produce the closed office corners and full hallway return, without JavaScript trajectory math',async()=>{
  await init({module_or_path:readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
  const workspace={...mapFlightTourSources},source=workspace[MAP_FLIGHT_TOUR_PATH];delete workspace[MAP_FLIGHT_TOUR_PATH];
  expect(JSON.parse(compiler.sync_workspace_sources(JSON.stringify(workspace))).error_count).toBe(0);
  const s=compiler.WasmSimulationSession.withInteractiveOptions(source,'MapFlightTour',.01,'rk-like',1e-12,1e-12,'[]');
  const route=new ModelicaFlightTour(s,{x:2,y:-3,z:1.5});let tick=0;
  try{
    const read=(kind:'office-loop'|'hallway',time:number)=>Object.fromEntries(route.inputs(kind,time,++tick/90));
    for(const [t,x,y,heading]of [[0,0,0,0],[65,24,0,0],[75,24,0,Math.PI/2],[115,24,16,Math.PI/2],[125,24,16,Math.PI],[185,0,16,Math.PI],[195,0,16,3*Math.PI/2],[235,0,0,3*Math.PI/2],[250,0,0,2*Math.PI]]){
      const ref=read('office-loop',t);expect(ref['targetPosition[1]']).toBeCloseTo(x+2,12);expect(ref['targetPosition[2]']).toBeCloseTo(y-3,12);
      expect(ref['targetPosition[3]']).toBe(1.5);expect(ref.targetHeading).toBeCloseTo(heading,12);
      for(const name of ['targetVelocity','targetAcceleration'])for(let i=1;i<=3;i++)expect(ref[`${name}[${i}]`]).toBeCloseTo(0,12);
      expect(ref.positionMode).toBe(1);expect(Object.keys(ref).sort()).toEqual([...MAP_TOUR_INPUTS].sort());
    }
    for(const [t,x]of [[0,0],[15,2.5],[285,137.5],[295,140],[305,140],[315,137.5],[585,2.5],[595,0],[600,0]]){
      const ref=read('hallway',t);expect(ref['targetPosition[1]']).toBeCloseTo(x+2,12);expect(ref['targetPosition[2]']).toBe(-3);expect(ref.targetHeading).toBe(0);
    }
    route.reset();tick=0;expect(read('office-loop',0)['targetPosition[1]']).toBe(2);
  }finally{route.free();}
},60_000);

it('refuses invalid times or nonfinite Modelica outputs before returning any plant inputs; reset reuses the session',()=>{
  const session={set_inputs:vi.fn(),advance_to:vi.fn(),state_json:()=>JSON.stringify({values:{'position[1]':NaN}}),reset:vi.fn(),free:vi.fn()};
  const route=new ModelicaFlightTour(session,{x:0,y:0,z:1.5});
  expect(()=>route.inputs('office-loop',NaN,.1)).toThrow('finite');expect(session.set_inputs).not.toHaveBeenCalled();
  expect(()=>route.inputs('office-loop',0,.1)).toThrow('finite position[1]');
  route.reset();expect(session.reset).toHaveBeenCalledOnce();expect(session.free).not.toHaveBeenCalled();
});

it('the real vehicle accepts every mapped input and follows the same one-step state as an independently supplied analytic reference',async()=>{
  const {defaultProject}=await import('../src/project');
  const {readPhysicsSnapshot}=await import('../src/physics-snapshot');
  await init({module_or_path:readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
  const p=defaultProject(),workspace={...p.modelicaSources};delete workspace[MAP_FLIGHT_TOUR_PATH];
  expect(JSON.parse(compiler.sync_workspace_sources(JSON.stringify(workspace))).error_count).toBe(0);
  const make=()=>compiler.WasmSimulationSession.withInteractiveOptions(p.physics,'LabQuadrotor',.01,'rk-like',1e-10,1e-8,'[["forward",0],["left",0],["up",0],["yaw",0]]');
  const vehicle=make(),control=make();
  const math=compiler.WasmSimulationSession.withInteractiveOptions(mapFlightTourSources[MAP_FLIGHT_TOUR_PATH],'MapFlightTour',.01,'rk-like',1e-12,1e-12,'[]');
  const tour=new ModelicaFlightTour(math,{x:0,y:0,z:1.5});
  try{
    const names=JSON.parse(vehicle.input_names());for(const name of MAP_TOUR_INPUTS){expect(names).toContain(name);expect(Number.isFinite(vehicle.get(name))).toBe(true);}
    const reference=tour.inputs('office-loop',10,.01),s=5/60;
    const pos=24*(10*s**3-15*s**4+6*s**5),vel=24*(30*s**2-60*s**3+30*s**4)/60,acc=24*(60*s-180*s**2+120*s**3)/60**2;
    const independent:[string,number][]=[['positionMode',1],['targetPosition[1]',pos],['targetPosition[2]',0],['targetPosition[3]',1.5],
      ['targetVelocity[1]',vel],['targetVelocity[2]',0],['targetVelocity[3]',0],['targetAcceleration[1]',acc],['targetAcceleration[2]',0],['targetAcceleration[3]',0],['targetHeading',0]];
    const common=[['autopilot',1],['indoorTour',0],['commandTime',10]];
    vehicle.set_inputs(JSON.stringify([...common,...reference]));control.set_inputs(JSON.stringify([...common,...independent]));
    vehicle.advance_to(.01);control.advance_to(.01);
    const actual=readPhysicsSnapshot(vehicle),expected=readPhysicsSnapshot(control);
    for(const field of ['x','y','z'] as const)expect(actual[field]).toBeCloseTo(expected[field],12);
    for(const field of ['quaternion','velocity','accel','gyro'] as const)actual[field].forEach((v,i)=>expect(v).toBeCloseTo(expected[field][i],12));
  }finally{vehicle.free();control.free();tour.free();}
},60_000);
