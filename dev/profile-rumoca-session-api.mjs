// Standalone public Rumoca session diagnostic: no application runtime,
// algorithm emitter, GPU, worker RPC or replacement numerical integration.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import inspector from 'node:inspector';
import {pathToFileURL} from 'node:url';

const output=process.argv[2];
if(!output)throw Error('OUTPUT_DIRECTORY required');
fs.mkdirSync(output,{recursive:true});
// Pass a complete compiler package directory to test a reviewed local build.
// Always load its matching glue and WASM rather than mixing compiler versions.
const compilerDirectory=process.argv[3]?path.resolve(process.argv[3]):undefined;
const rumoca=compilerDirectory
  ?await import(pathToFileURL(path.join(compilerDirectory,'rumoca_bind_wasm.js')).href)
  :await import('@cognipilot/rumoca');
const comparator=process.env.RUMOCA_PROFILE_READ_API??'snapshot';
if(!['snapshot','batch'].includes(comparator))throw Error('RUMOCA_PROFILE_READ_API must be snapshot or batch');
const source=fs.readFileSync('models/Estimation/Inertial/ModelicaInertial.mo','utf8');
const wasm=fs.readFileSync(path.join(compilerDirectory??'public/vendor/rumoca','rumoca_bind_wasm_bg.wasm'));
const sha=data=>createHash('sha256').update(data).digest('hex');
const names=['accel[1]','accel[2]','accel[3]','gyro[1]','gyro[2]','gyro[3]'];
const outputs=[...['position','velocity','filteredAccel','filteredGyro'].flatMap(n=>[1,2,3].map(i=>`${n}[${i}]`)),...[1,2,3,4].map(i=>`quaternion[${i}]`)];
const frames=Number(process.env.RUMOCA_PROFILE_FRAMES??800),warm=200;
if(!Number.isInteger(frames)||frames<128||frames>4000)throw Error('Frames must be128..4000');
// Changing held samples are a fixture. None of this arithmetic is a runtime
// substitute for the Modelica equations, which execute inside Rumoca.
const input=Array.from({length:frames+warm},(_,i)=>JSON.stringify(names.map((name,k)=>[name,k===2?9.81+.05*Math.sin(i/80):k<2?.4*Math.sin(i/(60+k*17)):.02*Math.cos(i/(100+k*11))])));
await rumoca.default({module_or_path:wasm});
const session=rumoca.WasmSimulationSession.withInteractiveOptions(source,'ModelicaInertial',.005,'rk-like',1e-10,1e-8,'[["accel[1]",0],["accel[2]",0],["accel[3]",9.81],["gyro[1]",0],["gyro[2]",0],["gyro[3]",0]]');
let checksum=0;
const readScalars=()=>outputs.map(name=>session.get(name));
const readAll=()=>{const values=JSON.parse(session.state_json()).values;return outputs.map(name=>values[name]);};
const selection=JSON.stringify(outputs);
const readBatch=()=>{
  const values=JSON.parse(session.values_for(selection));
  if(!values||typeof values!=='object'||Array.isArray(values))throw Error('Invalid compiler batch object');
  return outputs.map(name=>Object.hasOwn(values,name)?values[name]:undefined);
};
const step=(index,read)=>{session.set_inputs(input[index]);session.advance_to((index+1)/180);const values=read();if(!values.every(Number.isFinite))throw Error('Nonfinite output');checksum+=values[0];return values;};
const windows=[];
try{
  if(comparator==='batch'&&typeof session.values_for!=='function')throw Error('Compiler package does not expose values_for; batch profiling requires the actual API');
  const readComparison=comparator==='batch'?readBatch:readAll;
  // Same compiled source/inputs and exact output cells. This comparison
  // isolates the reusable compiler's scalar-read API, not application tuning.
  let parityError=0;const trajectories=[];
  for(const read of [readScalars,readComparison]){
    session.reset();const values=[];for(let i=0;i<128;i++)values.push(step(i,read));trajectories.push(values);
  }
  for(let i=0;i<128;i++)for(let k=0;k<outputs.length;k++){
    parityError=Math.max(parityError,Math.abs(trajectories[0][i][k]-trajectories[1][i][k]));
    if(!Object.is(trajectories[0][i][k],trajectories[1][i][k]))throw Error(`Read interface bit parity ${i}/${outputs[k]}`);
  }
  if(parityError!==0)throw Error(`Read interface parity ${parityError}`);
  for(const kind of ['scalar',comparator,comparator,'scalar',comparator,'scalar','scalar',comparator]){
    session.reset();const read=kind==='scalar'?readScalars:readComparison;
    for(let i=0;i<warm;i++)step(i,read);
    const phase={setInputsMs:0,advanceMs:0,readMs:0};
    const start=performance.now();
    for(let i=warm;i<frames+warm;i++){
      let at=performance.now();session.set_inputs(input[i]);phase.setInputsMs+=performance.now()-at;
      at=performance.now();session.advance_to((i+1)/180);phase.advanceMs+=performance.now()-at;
      at=performance.now();const values=read();phase.readMs+=performance.now()-at;
      if(!values.every(Number.isFinite))throw Error('Nonfinite output');checksum+=values[0];
    }
    windows.push({kind,frames,wallMs:performance.now()-start,...phase});
  }
  const profiler=new inspector.Session();profiler.connect();
  const post=(method,params={})=>new Promise((resolve,reject)=>profiler.post(method,params,(e,r)=>e?reject(e):resolve(r)));
  session.reset();for(let i=0;i<warm;i++)step(i,readScalars);
  await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:1000});await post('Profiler.start');
  const profileStart=performance.now();for(let i=warm;i<frames+warm;i++)step(i,readScalars);
  const profileWallMs=performance.now()-profileStart;
  const {profile}=await post('Profiler.stop');profiler.disconnect();
  fs.writeFileSync(path.join(output,'session-api.cpuprofile'),JSON.stringify(profile));
  const nodes=new Map(profile.nodes.map(n=>[n.id,n]));const counts=new Map();
  for(const id of profile.samples??[]){const frame=nodes.get(id)?.callFrame;const name=frame?.functionName??'<unknown>';counts.set(name,(counts.get(name)??0)+1);}
  const topSelf=Array.from(counts,([functionName,samples])=>({functionName,samples,percent:100*samples/profile.samples.length})).sort((a,b)=>b.samples-a.samples).slice(0,30);
  const grouped={};for(const kind of ['scalar',comparator]){const selected=windows.filter(w=>w.kind===kind);const total=selected.reduce((s,w)=>s+w.frames,0);grouped[kind]={frames:total};for(const key of ['wallMs','setInputsMs','advanceMs','readMs'])grouped[kind][key+'PerFrame']=selected.reduce((s,w)=>s+w[key],0)/total;}
  const report={status:'RUMOCA_PUBLIC_SESSION_API_PHASE_PROFILE_PASS',comparator,sourceSha256:sha(source),compilerWasmSha256:sha(wasm),compilerGlueSha256:compilerDirectory?sha(fs.readFileSync(path.join(compilerDirectory,'rumoca_bind_wasm.js'))):null,scriptSha256:sha(fs.readFileSync(import.meta.filename)),compilerVersion:rumoca.get_version(),compilerCommit:rumoca.get_git_commit(),nodeVersion:process.version,clockHz:180,outputs,parity:{frames:128,cells:128*outputs.length,maximumError:parityError,bitExact:true},order:'ABBA BAAB',warmPerWindow:warm,windows,grouped,profile:{kind:'scalar',wallMs:profileWallMs,samples:profile.samples.length,topSelf},checksum,scope:`Standalone Rumoca session; identical compiled Modelica, held six-input frames, scalar get16 vs one ${comparator==='batch'?'compiler values_for':'full-state snapshot'} read. Timing includes per-phase timer overhead. CPU samples exclude compilation/warmup; Linux perf covers full process. Comparator timings are specific to the recorded compiler. Snapshot is a diagnostic comparator, not a replacement app execution path. No sensors/GPU/SLAM/10x throughput claim.`};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,grouped,topSelf:topSelf.slice(0,8)}));
}finally{session.free();}
