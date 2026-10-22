import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {officeLoopPhysics} from './office-loop-physics.mjs';
const [projectPath,vendor,output]=process.argv.slice(2);if(!output)throw Error('Usage: check-office-loop-physics.mjs PROJECT VERIFIED_RUMOCA_VENDOR NEW_OUTPUT');await mkdir(output);
const compiler=await import(pathToFileURL(join(vendor,'rumoca_bind_wasm.js')).href);
await compiler.default({module_or_path:await readFile(join(vendor,'rumoca_bind_wasm_bg.wasm'))});
const p=JSON.parse(await readFile(projectPath)),original=await readFile(new URL('../models/Vehicles/LabQuadrotor.mo',import.meta.url),'utf8'),source=await officeLoopPhysics(original),sha=b=>createHash('sha256').update(b).digest('hex');
const sources={...p.modelicaSources};delete sources['models/Vehicles/LabQuadrotor.mo'];const loaded=JSON.parse(compiler.sync_workspace_sources(JSON.stringify(sources)));if(loaded.error_count)throw Error('Workspace load failed');
const receipt={sourceSha256:sha(source),compiler:compiler.get_git_commit(),wasmSha256:sha(await readFile(join(vendor,'rumoca_bind_wasm_bg.wasm'))),scope:'Full250s CPU physics/controller route control. No camera, SLAM accuracy, wall collision or throughput result.',rows:[],maxPathDeviation:0};let session;
try{
 session=compiler.WasmSimulationSession.withInteractiveOptions(source,'LabQuadrotor',.01,'rk-like',1e-8,1e-6,'[["forward",0],["left",0],["up",0],["yaw",0]]');
 const distance=(x,y)=>Math.min(Math.hypot(x-Math.max(0,Math.min(24,x)),y),Math.hypot(x-24,y-Math.max(0,Math.min(16,y))),Math.hypot(x-Math.max(0,Math.min(24,x)),y-16),Math.hypot(x,y-Math.max(0,Math.min(16,y))));
 for(let i=0;i<=2500;i++){
  if(i)session.advance_to(i/10);const {time,values:v}=JSON.parse(session.state_json());const row={time,x:v.x,y:v.y,z:v.z,qw:v.qw,qx:v.qx,qy:v.qy,qz:v.qz};
  if(!Object.values(row).every(Number.isFinite))throw Error('Nonfinite flight state');
  const d=distance(v.x,v.y);receipt.maxPathDeviation=Math.max(receipt.maxPathDeviation,d);
  if(d>.4||Math.abs(v.z-1.5)>.15)throw Error('Flight left centerline tube '+JSON.stringify(row));
  if(i%50===0)receipt.rows.push(row);
 }
 const last=receipt.rows.at(-1);receipt.returnErrorMeters=Math.hypot(last.x,last.y,last.z-1.5);receipt.returnHeadingRadians=Math.atan2(2*(last.qw*last.qz+last.qx*last.qy),1-2*(last.qy**2+last.qz**2));
 receipt.execution=JSON.parse(session.execution_receipt_json());
 if(receipt.execution.engine!=='wasm_program'||receipt.returnErrorMeters>.1||Math.abs(receipt.returnHeadingRadians)>.02)throw Error('Native loop return failed');
 for(const [t,x,y]of [[65,24,0],[115,24,16],[185,0,16],[235,0,0]]){const row=receipt.rows.find(r=>r.time===t);if(!row||Math.hypot(row.x-x,row.y-y)>.1)throw Error('Corner not reached '+t);}
 receipt.status='pass';
}catch(e){receipt.status='failed';receipt.error=String(e);process.exitCode=1;}finally{session?.free();await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');await writeFile(join(output,'physics.mo'),source);console.log(JSON.stringify({...receipt,rows:undefined}));}
