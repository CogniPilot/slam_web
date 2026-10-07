// Actual pinned Modelica session. No host integration or physics equations.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import inspector from 'node:inspector';
import {spawn} from 'node:child_process';
import init,* as compiler from '@cognipilot/rumoca';
import {SensorClock,QUALITY_SENSOR_RATES} from '../src/sensor-clock.ts';
import {readPhysicsSnapshot} from '../src/physics-snapshot.ts';
const output=path.resolve(process.argv[2]??path.join(process.env.HOME,'scratch/slam_web/tmp/physics-critical-path'));
const frames=Number(process.env.SLAM_PHYSICS_FRAMES??900);
if(!Number.isInteger(frames)||frames<90||frames>3600)throw new Error('Physics frames must be90..3600');
await fs.mkdir(output,{recursive:true});
const source=await fs.readFile('models/Vehicles/LabQuadrotor.mo','utf8'),wasm=await fs.readFile('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm');
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
await init({module_or_path:wasm});
const report={status:'RUNNING',sourceSha256:digest(source),compilerWasmSha256:digest(wasm),compiler:{version:compiler.get_version(),revision:compiler.get_git_commit()},node:process.version,rates:QUALITY_SENSOR_RATES.high,frames,solver:{dt:.005,mode:'rk-like',atol:1e-8,rtol:1e-6},runs:[],sourceUnchanged:true,physicsStepsSkipped:0,hostMathFallback:false,productionPinChanged:false};
const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const summarize=a=>({samples:a.length,meanMs:a.reduce((x,y)=>x+y,0)/a.length,p95Ms:a.toSorted((x,y)=>x-y)[Math.ceil(a.length*.95)-1],totalMs:a.reduce((x,y)=>x+y,0)});
const trace=[];let inspectorSession,perf;
const post=(method,params={})=>new Promise((resolve,reject)=>inspectorSession.post(method,params,(e,r)=>e?reject(e):resolve(r)));
async function stopPerf(){if(perf&&perf.exitCode===null&&perf.signalCode===null){const child=perf;const finished=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGINT');await finished;}perf=undefined;}
try{
  for(const mode of ['baseline','delta-input-transport']){
    report.phase=`prepare:${mode}`;await save();const prepare=performance.now();
    const session=compiler.WasmSimulationSession.withInteractiveOptions(source,'LabQuadrotor',.005,'rk-like',1e-8,1e-6,'[["forward",0],["left",0],["up",0],["yaw",0]]');
    const preparationMs=performance.now()-prepare,clock=new SensorClock(QUALITY_SENSOR_RATES.high),samples={inputEncoding:[],inputApi:[],advance:[],stateApi:[],stateParse:[],extract:[],total:[]};
    let current=readPhysicsSnapshot(session,true),command={forward:0,left:0,up:0,yaw:0},previousInputs=[],calls=0,omitted=0,jsonBytes=0,visibleValues=0;
    try{
      for(let frame=-30;frame<frames;frame++){
        if(frame===0){
          inspectorSession=new inspector.Session();inspectorSession.connect();await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:1000});await post('Profiler.start');
          report.phase=`measured:${mode}`;await save();
          if(mode==='baseline'&&process.env.SLAM_PHYSICS_PERF){perf=spawn(process.env.SLAM_PHYSICS_PERF,['record','-o',path.join(output,'native.perf.data'),'-e','cpu-clock:u','-F','199','--call-graph','dwarf','-p',String(process.pid)],{stdio:['ignore','ignore','pipe']});let stderr='';perf.stderr.on('data',v=>stderr+=v);perf.once('error',e=>report.perfError=String(e));perf.once('exit',code=>report.perfFinalization={exitCode:code,stderr});await new Promise(resolve=>setTimeout(resolve,100));}
        }
        const commandTime=current.time;
        for(const event of clock.nextFrame(true)){
          const start=performance.now(),inputs=[...Object.entries(command),['autopilot',1],['indoorTour',0],['commandTime',commandTime]];
          const selected=mode==='baseline'?inputs:inputs.filter(([name,value])=>!previousInputs.some(([oldName,oldValue])=>oldName===name&&Object.is(value,oldValue)));
          const encoded=JSON.stringify(selected),encodedAt=performance.now();
          if(selected.length){session.set_inputs(encoded);if(frame>=0)calls++;}else if(frame>=0)omitted++;
          previousInputs=inputs;const setAt=performance.now();session.advance_to(event.time);const advancedAt=performance.now();
          const json=session.state_json(),stateAt=performance.now(),parsed=JSON.parse(json),parsedAt=performance.now();
          current=readPhysicsSnapshot({state_json:()=>json},true);const extractedAt=performance.now();
          // The extractor currently parses once itself; the separate parse is
          // diagnostic and excluded from the production-equivalent total.
          if(frame>=0){samples.inputEncoding.push(encodedAt-start);samples.inputApi.push(setAt-encodedAt);samples.advance.push(advancedAt-setAt);samples.stateApi.push(stateAt-advancedAt);samples.stateParse.push(parsedAt-stateAt);samples.extract.push(extractedAt-parsedAt);samples.total.push((stateAt-start)+(extractedAt-parsedAt));jsonBytes+=Buffer.byteLength(json);visibleValues=Object.keys(parsed.values).length;
            const row=[current.time,current.x,current.y,current.z,...current.quaternion,...current.velocity,...current.accel,...current.gyro,...current.propellerAngles,...Object.values(current.command)];
            if(mode==='baseline')trace.push(row);else{const expected=trace[samples.total.length-1];if(!expected||row.some((v,i)=>!Object.is(v,expected[i])))throw new Error(`delta input transport changed actual physics at event${samples.total.length-1}`);}
          }
        }
        command=current.command;
      }
      await stopPerf();const profile=(await post('Profiler.stop')).profile;inspectorSession.disconnect();inspectorSession=undefined;await fs.writeFile(path.join(output,mode+'.cpuprofile'),JSON.stringify(profile));
      report.runs.push({mode,preparationMs,events:samples.total.length,inputApiCalls:calls,omittedIdenticalBatches:omitted,visibleValues,neededSnapshotValues:25,meanJsonBytes:jsonBytes/samples.total.length,perEvent:Object.fromEntries(Object.entries(samples).map(([key,value])=>[key,summarize(value)])),perCameraFrameMs:samples.total.reduce((a,b)=>a+b,0)/frames,last:current,actualParity:mode==='baseline'?'reference trace':'all25public values bit-identical at every measured endpoint'});await save();
    }finally{session.free();}
  }
  report.status='ACTUAL_PINNED_PHYSICS_PROFILE_AND_DELTA_PARITY_PASS';report.limitations=['Isolated actual session on one CPU; no GPU sensors, rendering, worker RPC or whole-pipeline throughput.','Diagnostic JSON parse is timed separately and excluded from production-equivalent total; extraction includes its own production parse.','Sampling profiler and native perf overhead affect timings; not an unprofiled speedup claim.','Native perf JIT symbols require corresponding V8 map/dump; no Rust source phase attributed from unresolved code.'];await save();console.log(JSON.stringify(report,null,2));
}catch(error){report.status='FAILED';report.error=String(error);await save();throw error;}finally{await stopPerf();if(inspectorSession){try{await post('Profiler.stop');}catch{}inspectorSession.disconnect();}}
