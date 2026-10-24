// Physics preflight for the two-circuit route (UNEXECUTED until its own GO). Same method as the reviewed
// check-office-loop-physics.mjs: CPU route control with controller, rigid body and motors active; no camera or SLAM.
// Adds the lap-1 seam: settle and return checks at 125 s as well as 250 s, and corners at their two-lap times.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {reference} from './office-phase-b-checks.mjs';
const [projectPath,vendor,output]=process.argv.slice(2);if(!output)throw Error('Usage: check-office-loop-physics-two-circuit.mjs PROJECT VERIFIED_RUMOCA_VENDOR NEW_OUTPUT');await mkdir(output);
const compiler=await import(pathToFileURL(join(vendor,'rumoca_bind_wasm.js')).href);
await compiler.default({module_or_path:await readFile(join(vendor,'rumoca_bind_wasm_bg.wasm'))});
const swaps=[
 ['positionSetpoint = if noEvent(positionMode > 0.5) then targetPosition else pathPosition;','positionSetpoint = {OfficeLoopTwoCircuitProfile.X(time),OfficeLoopTwoCircuitProfile.Y(time),initialHeight};'],
 ['velocitySetpoint = if noEvent(positionMode > 0.5) then targetVelocity else pathVelocity;','velocitySetpoint = {OfficeLoopTwoCircuitProfile.VX(time),OfficeLoopTwoCircuitProfile.VY(time),0};'],
 ['headingSetpoint = if noEvent(positionMode > 0.5) then targetHeading else pathHeading;','headingSetpoint = OfficeLoopTwoCircuitProfile.Heading(time);'],
 ['controller.accelerationReferenceWorld = if noEvent(positionMode > 0.5) then targetAcceleration else zeros(3);','controller.accelerationReferenceWorld = {OfficeLoopTwoCircuitProfile.AX(time),OfficeLoopTwoCircuitProfile.AY(time),0};']];
let plant=await readFile(new URL('../models/Vehicles/LabQuadrotor.mo',import.meta.url),'utf8');
for(const [a,b]of swaps){if(plant.split(a).length!==2)throw Error('Expected one canonical mission reference: '+a);plant=plant.replace(a,b);}
const source=plant+'\n'+await readFile(new URL('../models/Benchmarks/OfficeLoopProfile.mo',import.meta.url),'utf8')+'\n'+await readFile(new URL('../models/Benchmarks/OfficeLoopTwoCircuitProfile.mo',import.meta.url),'utf8');
const sha=b=>createHash('sha256').update(b).digest('hex'),p=JSON.parse(await readFile(projectPath));
const sources={...p.modelicaSources};delete sources['models/Vehicles/LabQuadrotor.mo'];
if(JSON.parse(compiler.sync_workspace_sources(JSON.stringify(sources))).error_count)throw Error('Workspace load failed');
const receipt={route:'two-circuit',sourceSha256:sha(source),compiler:compiler.get_git_commit(),rows:[],maxTracking:0,
  scope:'Full 250 s CPU physics/controller route control for the two-circuit reference. No camera, SLAM, wall collision or throughput result.'};
const yaw=r=>Math.atan2(2*(r.qw*r.qz+r.qx*r.qy),1-2*(r.qy**2+r.qz**2)),wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));let session;
try{
 session=compiler.WasmSimulationSession.withInteractiveOptions(source,'LabQuadrotor',.01,'rk-like',1e-8,1e-6,'[["forward",0],["left",0],["up",0],["yaw",0]]');
 for(let i=0;i<=2500;i++){
  if(i)session.advance_to(i/10);const {time,values:v}=JSON.parse(session.state_json());const row={time,x:v.x,y:v.y,z:v.z,qw:v.qw,qx:v.qx,qy:v.qy,qz:v.qz};
  if(!Object.values(row).every(Number.isFinite))throw Error('Nonfinite flight state');
  const r=reference(time,'two-circuit'),e=Math.hypot(v.x-r.x,v.y-r.y);receipt.maxTracking=Math.max(receipt.maxTracking,e);
  // Same 0.4 m centreline tube and 0.15 m altitude band as the reviewed single-circuit check; along-track lag at double
  // speed is bounded separately by the 0.75 m reference-tracking limit used on the capture.
  const c=Math.min(Math.hypot(v.x-Math.max(0,Math.min(24,v.x)),v.y),Math.hypot(v.x-24,v.y-Math.max(0,Math.min(16,v.y))),Math.hypot(v.x-Math.max(0,Math.min(24,v.x)),v.y-16),Math.hypot(v.x,v.y-Math.max(0,Math.min(16,v.y))));
  receipt.maxCentreline=Math.max(receipt.maxCentreline??0,c);
  if(c>.4||Math.abs(v.z-1.5)>.15)throw Error('Flight left the centreline tube '+JSON.stringify(row));
  if(e>.75)throw Error('Reference tracking above 0.75 m '+JSON.stringify(row));
  // The 2.5 s settle at the end of each lap: reference stationary at the start corner.
  if(((time>=117.5&&time<=125)||(time>=242.5&&time<=250))&&e>.25)throw Error('Settle span missed '+JSON.stringify(row));
  if(i%25===0)receipt.rows.push(row);
 }
 for(const t of [125,250]){const row=receipt.rows.find(r=>Math.abs(r.time-t)<1e-9),r=reference(t,'two-circuit');
  if(!row||Math.hypot(row.x,row.y,row.z-1.5)>.1||Math.abs(wrap(yaw(row)-r.heading))>.02)throw Error('Lap return failed at '+t);}
 // Corners checked at the END of each 5 s dwell (reference turns in place there), not at arrival, where double-speed lag peaks.
 for(const [t,x,y]of [[37.5,24,0],[62.5,24,16],[97.5,0,16],[122.5,0,0],[162.5,24,0],[187.5,24,16],[222.5,0,16],[247.5,0,0]]){
  const row=receipt.rows.find(r=>Math.abs(r.time-t)<1e-9);if(!row||Math.hypot(row.x-x,row.y-y)>.1)throw Error('Corner not reached '+t);}
 receipt.execution=JSON.parse(session.execution_receipt_json());if(receipt.execution.engine!=='wasm_program')throw Error('Not compiled execution');
 receipt.status='pass';
}catch(e){receipt.status='failed';receipt.error=String(e);process.exitCode=1;}
finally{session?.free();await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');await writeFile(join(output,'physics.mo'),source);console.log(JSON.stringify({...receipt,rows:undefined}));}
