import {expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import init, * as rumoca from '@cognipilot/rumoca';
import {defaultProject, parseProject} from '../src/project';
import {ModelicaInertialSession} from '../src/modelica-inertial-session';

it('runs each qualified example through actual Rumoca and preserves a selected entry point', async () => {
  await init({module_or_path: readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
  const project = defaultProject();
  expect(project.entryPoint).toBe('Examples.InertialOnly');
  const loaded=JSON.parse(rumoca.sync_workspace_sources(JSON.stringify(project.modelicaSources)));
  expect(loaded.error_count).toBe(0);
  const names=[project.algorithm,...Object.values(project.modelicaSources!)].flatMap(source=>
    JSON.parse(rumoca.get_simulation_models(source,project.entryPoint!)).models);
  expect(names).toContain(project.entryPoint);
  for (const [name, tau] of [
    ['Examples.InertialOnly', 0.03],
    ['Examples.ResponsiveInertial', 0.005],
    ['Examples.SmoothedInertial', 0.12],
    ['ModelicaInertial', 0.03],
  ] as const) {
    expect(names).toContain(name);
    const solver = rumoca.WasmSimulationSession.withInteractiveOptions(project.algorithm, name,
      0.005, 'rk-like', 1e-10, 1e-8,
      '[["accel[1]",1],["accel[2]",0],["accel[3]",9.81],["gyro[1]",0],["gyro[2]",0],["gyro[3]",0]]');
    const session = new ModelicaInertialSession(solver);
    try {
      const time = 0.1;
      const estimate = session.step({time, dt:time, imu:{accel:[1,0,9.81],gyro:[0,0,0]}});
      const decay = Math.exp(-time/tau);
      expect(estimate.x).toBeCloseTo(time*time/2-tau*time+tau*tau*(1-decay), 8);
      expect(solver.get('filteredAccel[1]')).toBeCloseTo(1-decay, 7);
      expect(estimate.quaternion).toEqual([1,0,0,0]);
      session.reset();
      expect(session.estimate().x).toBe(0);
    } finally { session.free(); }
    expect(parseProject(JSON.stringify({...project,entryPoint:name})).entryPoint).toBe(name);
  }
  // A student's new model is discovered by the compiler, without editing an app catalog.
  const custom = project.algorithm + '\nmodel MyExperiment extends Examples.InertialOnly; end MyExperiment;';
  expect(JSON.parse(rumoca.get_simulation_models(custom,'Examples.MyExperiment')).models).toContain('Examples.MyExperiment');
  rumoca.sync_workspace_sources('{}');
}, 90_000);

it('retains the original entry point for saved projects that predate example selection', () => {
  const project = defaultProject();
  delete project.entryPoint;
  delete project.modelicaSources;
  delete project.mainSourcePath;
  project.algorithm = readFileSync('models/Estimation/Inertial/ModelicaInertial.mo','utf8');
  expect(parseProject(JSON.stringify(project))).toEqual(project);
  expect(() => parseProject(JSON.stringify({...project, entryPoint:''}))).toThrow('entry point');
});

it('preserves exact library edits on reload and rejects ambiguous or malformed sources',()=>{
  const project=defaultProject();
  const path='models/Examples/SmoothedInertial.mo';
  project.modelicaSources![path]='\ufeffwithin Examples;\r\n// Student edit λ\r\n';
  expect(parseProject(JSON.stringify(project))).toEqual(project);
  for(const modelicaSources of [[],{[path]:false},{'../escape.mo':''},
    {...project.modelicaSources,[project.mainSourcePath!]:project.algorithm}])
    expect(()=>parseProject(JSON.stringify({...project,modelicaSources}))).toThrow();
});
