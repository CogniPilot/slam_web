import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import init,* as rumoca from '@cognipilot/rumoca';
import {readPhysicsSnapshot} from '../src/physics-snapshot.ts';
import {readModelicaModelsLibrary} from './modelica-models-library.mjs';

const options=new Map(),args=process.argv.slice(2);
for(let i=0;i<args.length;i++){
  const key=args[i];if(!['--iterations','--output'].includes(key)||options.has(key))throw new Error('Unsupported/duplicate option '+key);
  const value=args[++i];if(!value||value.startsWith('--'))throw new Error('Missing value for '+key);options.set(key,value);
}
const count=Number(options.get('--iterations')??500);
if(!Number.isInteger(count)||count<50||count>5000)throw new Error('Iterations must be50..5000');
await init({module_or_path:await readFile('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
const library=readModelicaModelsLibrary();
const loaded=JSON.parse(rumoca.sync_workspace_sources(JSON.stringify(library)));
if(loaded.error_count)throw Error('Could not load the local Modelica library');
const source=await readFile('models/Vehicles/LabQuadrotor.mo','utf8');
const session=rumoca.WasmSimulationSession.withInteractiveOptions(source,'LabQuadrotor',.005,'rk-like',1e-8,1e-6,
  '[["forward",0],["left",0],["up",0],["yaw",0]]');
const legacy=()=>({time:session.time(),x:session.get('x'),y:session.get('y'),z:session.get('z'),
  quaternion:['qw','qx','qy','qz'].map(name=>session.get(name)),velocity:['vx','vy','vz'].map(name=>session.get(name)),
  accel:['imu_ax','imu_ay','imu_az'].map(name=>session.get(name)),gyro:['p','q','r'].map(name=>session.get(name))});
const flatten=t=>[t.time,t.x,t.y,t.z,...t.quaternion,...t.velocity,...t.accel,...t.gyro];
const methods={legacy,batch:()=>readPhysicsSnapshot(session)},samples={legacy:[],batch:[]};
try{
  for(let frame=0;frame<60;frame++){
    session.set_inputs(JSON.stringify([['forward',.7],['left',.3],['up',.2],['yaw',.4]]));
    session.advance_to(Math.round((frame+1)/90*1e9)/1e9);
  }
  const time=session.time();
  for(let i=-30;i<count;i++){
    const outputs={};
    for(const kind of i%2?['legacy','batch']:['batch','legacy']){
      const started=performance.now();outputs[kind]=methods[kind]();const elapsed=performance.now()-started;
      if(i>=0)samples[kind].push(elapsed);
    }
    const a=flatten(outputs.legacy),b=flatten(outputs.batch);
    if(!a.every((value,index)=>Number.isFinite(value)&&Object.is(value,b[index])))throw new Error('Physics snapshot lost exact output parity');
    if(session.time()!==time)throw new Error('Observation advanced the physics clock');
  }
  const summarize=values=>({meanMs:values.reduce((a,b)=>a+b,0)/values.length,p95Ms:[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1],samples:values.length});
  const report={runtime:{node:process.version,compiler:rumoca.get_version(),revision:rumoca.get_git_commit()},
    sourceSha256:createHash('sha256').update(source).digest('hex'),
    librarySha256:createHash('sha256').update(JSON.stringify(library)).digest('hex'),iterations:count,parity:'all17truth/timevalues bit-identical',
    legacy:summarize(samples.legacy),batch:summarize(samples.batch),snapshotJsonBytes:Buffer.byteLength(session.state_json()),
    limitations:['Observation-only at a fixed held-flight coordinate; integration/rendering/worker/transport excluded.',
      'Alternating methods on one actual Rumoca session; no whole-pipeline speedup claim.']};
  const text=JSON.stringify(report,null,2)+'\n';if(options.has('--output'))await writeFile(options.get('--output'),text);
  process.stdout.write(text);
}finally{session.free();}
