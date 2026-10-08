import {it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import init,* as pinned from '@cognipilot/rumoca';
import {modelicaModelsSources} from '../../src/modelica-models-library';
const source=readFileSync('models/Vehicles/LabQuadrotor.mo','utf8');
const sha=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex');
const value=(v:Record<string,number>,name:string)=>{expect(Number.isFinite(v[name]),name).toBe(true);return v[name];};
const near=(a:number,b:number,label:string,tolerance=1e-7)=>expect(Math.abs(a-b),label).toBeLessThanOrEqual(tolerance*Math.max(1,Math.abs(b)));

it('retains the pinned plant and loads the unmodified upstream control library',()=>{
  const directory='models/upstream/quadrotor';
  expect(source).toContain(readFileSync(`${directory}/QuadrotorSIL.mo`,'utf8'));
  const provenance=JSON.parse(readFileSync(`${directory}/provenance.json`,'utf8'));
  for(const [file,digest] of Object.entries(provenance.vendored))expect(sha(readFileSync(`${directory}/${file}`)),file).toBe(digest);
  expect(source).toContain('der(propellerAngles[motor])=spinDirection[motor]*vehicle.omega_m[motor]');
  expect(source).toContain('spinDirection[motorCount] = {1,1,-1,-1}');
  expect(source).toContain('Control.Multirotor.LogLinear.Controller controller');
  const library='models/Libraries/CogniPilot';
  const manifest=JSON.parse(readFileSync(`${library}/provenance.json`,'utf8'));
  for(const [file,digest]of Object.entries(manifest.sources))expect(sha(readFileSync(`${library}/${file}`)),file).toBe(digest);
});

it('actual WASM genuine plant preserves coherent ENU/FLU outputs and actual signed rotor integration, reset and source editing',async()=>{
  const directory=process.env.RUMOCA_BRANCH_PKG;
  const compiler:typeof pinned=directory?await import(/* @vite-ignore */ pathToFileURL(resolve(directory,'rumoca_bind_wasm.js')).href):pinned;
  const wasm=readFileSync(directory?resolve(directory,'rumoca_bind_wasm_bg.wasm'):'public/vendor/rumoca/rumoca_bind_wasm_bg.wasm');
  await (directory?compiler.default:init)({module_or_path:wasm});
  expect(JSON.parse(compiler.sync_workspace_sources(JSON.stringify(modelicaModelsSources))).error_count).toBe(0);
  const report:Record<string,unknown>={status:'RUNNING',phase:'initialization',sourceSha256:sha(source),compilerWasmSha256:sha(wasm),
    compiler:{version:compiler.get_version(),revision:compiler.get_git_commit()},propellerDirection:[1,1,-1,-1],samples:0};
  const save=()=>{if(process.env.RUMOCA_QUADROTOR_REPORT)writeFileSync(process.env.RUMOCA_QUADROTOR_REPORT,JSON.stringify(report,null,2)+'\n');};
  const sessions:InstanceType<typeof compiler.WasmSimulationSession>[]=[];
  const make=(text:string,model='LabQuadrotor')=>{
    report.phase=`prepare:${model}`;save();console.log(report.phase);const start=performance.now();
    const s=compiler.WasmSimulationSession.withInteractiveOptions(text,model,.005,'rk-like',1e-10,1e-8,
      '[["forward",0],["left",0],["up",0],["yaw",0]]');
    sessions.push(s);report[`${model}PreparationMs`]=performance.now()-start;save();return s;
  };
  const read=(s:typeof sessions[number])=>JSON.parse(s.state_json()).values as Record<string,number>;
  try{
    if(process.env.RUMOCA_QUADROTOR_MODE==='compile'){
      report.phase='source compilation';save();const start=performance.now(),result=JSON.parse(compiler.compile(source,'LabQuadrotor'));
      expect(result.balance.is_balanced).toBe(true);report.compilationMs=performance.now()-start;report.balance=result.balance;report.phaseTiming=result.__compile_phase_timing;report.status='COMPILED';save();return;
    }
    const s=make(source),initial=read(s);
    near(value(initial,'z'),1.5,'initial height');near(value(initial,'qw'),1,'initial heading');
    for(const name of ['x','y','qx','qy','qz','vx','vy','vz','p','q','r'])near(value(initial,name),0,`initial ${name}`);
    for(let motor=1;motor<=4;motor++){near(value(initial,`omega_m[${motor}]`),0,'genuine startup motor');near(value(initial,`propellerAngles[${motor}]`),0,'initial phase');}
    let previous=initial,previousTime=0;const replay:number[][]=[];
    for(let frame=1;frame<=90;frame++){
      const inputs=[['forward',frame<30?.6:-.2],['left',.1],['up',frame<60?.1:-.1],['yaw',frame<45?.2:-.1]];
      report.phase=`frame:${frame}`;save();s.set_inputs(JSON.stringify(inputs));s.advance_to(frame/90);
      const v=read(s),time=frame/90,dt=time-previousTime;
      for(const name of ['x','y','z','vx','vy','vz','qw','qx','qy','qz','p','q','r','imu_ax','imu_ay','imu_az'])value(v,name);
      near(value(v,'x'),-value(v,'vehicle.position[2]'),'ENU east');near(value(v,'y'),value(v,'vehicle.position[1]'),'ENU north');
      for(const [name,index] of [['imu_ax',1],['imu_ay',2],['imu_az',3]] as const)near(value(v,name),value(v,`vehicle.a_b[${index}]`),'FLU specific force');
      near(['qw','qx','qy','qz'].reduce((sum,name)=>sum+v[name]**2,0),1,'unit attitude',2e-7);
      const phases:number[]=[];
      for(let motor=1;motor<=4;motor++){
        const direction=motor<=2?1:-1,phase=value(v,`propellerAngles[${motor}]`),oldPhase=value(previous,`propellerAngles[${motor}]`);
        const speed=value(v,`omega_m[${motor}]`),oldSpeed=value(previous,`omega_m[${motor}]`);
        expect(speed).toBeGreaterThanOrEqual(0);expect(direction*(phase-oldPhase)).toBeGreaterThanOrEqual(0);
        // A physical integral over this interval must lie between the endpoint
        // speeds for monotone startup; after startup use a conservative motor
        // command bound rather than assuming a trapezoidal integrator.
        expect(direction*(phase-oldPhase)).toBeLessThanOrEqual(1601*dt);
        if(frame===1){expect(direction*phase).toBeGreaterThan(0);expect(direction*phase).toBeLessThan(speed*dt);expect(oldSpeed).toBe(0);}
        phases.push(phase);
      }
      replay.push([v.x,v.y,v.z,...phases]);previous=v;previousTime=time;report.samples=frame;save();
    }
    s.reset();const reset=read(s);for(let i=1;i<=4;i++)expect(reset[`propellerAngles[${i}]`]).toBe(0);near(reset.z,1.5,'reset height');
    for(let frame=1;frame<=90;frame++){
      s.set_inputs(JSON.stringify([['forward',frame<30?.6:-.2],['left',.1],['up',frame<60?.1:-.1],['yaw',frame<45?.2:-.1]]));s.advance_to(frame/90);
      const v=read(s);expect([v.x,v.y,v.z,...[1,2,3,4].map(i=>v[`propellerAngles[${i}]`])]).toEqual(replay[frame-1]);
    }
    const edited=source.replace('initialHeight = 1.5','initialHeight = 2.2');expect(edited).not.toBe(source);
    const edit=make(edited);near(read(edit).z,2.2,'actual source edited initial altitude');report.editedSourceSha256=sha(edited);edit.advance_to(1/90);
    report.status='PASS';report.phase='complete';report.replayResetChecked=true;report.sourceEditChecked=true;report.defaultProjectSourceIntegrated=true;report.browserVerified=false;save();
  }catch(error){report.status='REFUSED_OR_FAILED';report.error=String(error);report.errorStack=error instanceof Error?error.stack:undefined;save();throw error;}
  finally{for(const s of sessions)s.free();}
},590_000);
