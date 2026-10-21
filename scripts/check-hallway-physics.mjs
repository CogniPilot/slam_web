import * as compiler from '@cognipilot/rumoca';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {hallwayPhysics} from './hallway-benchmark-physics.mjs';

const [projectPath,output]=process.argv.slice(2);
if(!output)throw Error('Usage: check-hallway-physics.mjs ORIGINAL_PROJECT NEW_OUTPUT');
await mkdir(output);
const project=JSON.parse(await readFile(projectPath));
const source=await hallwayPhysics(project.physics),sha=x=>createHash('sha256').update(x).digest('hex');
await writeFile(join(output,'physics.mo'),source);
await compiler.default({module_or_path:await readFile(new URL('../node_modules/@cognipilot/rumoca/rumoca_bind_wasm_bg.wasm',import.meta.url))});
const sources={...project.modelicaSources};delete sources['models/Vehicles/LabQuadrotor.mo'];
const loaded=JSON.parse(compiler.sync_workspace_sources(JSON.stringify(sources)));
if(loaded.error_count)throw Error('Workspace source load failed');
const begin=performance.now();let session;
const receipt={sourceSha256:sha(source),projectSha256:sha(await readFile(projectPath)),compiler:compiler.get_git_commit(),
  scope:'CPU-only physics fixture validation. No camera capture, SLAM estimator, return relocalization or performance-parity result.',rows:[]};
try{
 session=compiler.WasmSimulationSession.withInteractiveOptions(source,'LabQuadrotor',.01,'rk-like',1e-8,1e-6,
   '[["forward",0],["left",0],["up",0],["yaw",0]]');
 receipt.prepareMs=performance.now()-begin;
 for(let index=0;index<=6000;index++){
  if(index)session.advance_to(index/10);
  if(index%50===0){
   const {time,values:v}=JSON.parse(session.state_json());
   const row={time,x:v.x,y:v.y,z:v.z,vx:v.vx,reference:v['positionSetpoint[1]']};
   if(!Object.values(row).every(Number.isFinite)||Math.abs(row.y)>.05||Math.abs(row.z-1.5)>.1||row.x<-.1||row.x>140.1)
     throw Error('Flight left the declared corridor bounds: '+JSON.stringify(row));
   receipt.rows.push(row);
  }
 }
 receipt.execution=JSON.parse(session.execution_receipt_json());
 receipt.simulationSeconds=session.time();
 receipt.returnErrorMeters=Math.hypot(receipt.rows.at(-1).x,receipt.rows.at(-1).y,receipt.rows.at(-1).z-1.5);
 if(receipt.execution.engine!=='wasm_program'||receipt.simulationSeconds!==600||receipt.returnErrorMeters>.05)
   throw Error('Native execution, duration or return-position fixture gate failed');
 receipt.status='pass';
}catch(error){receipt.status='failed';receipt.error=String(error);process.exitCode=1;}
finally{
 receipt.wallMs=performance.now()-begin;session?.free();
 await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({...receipt,rows:undefined}));
}
