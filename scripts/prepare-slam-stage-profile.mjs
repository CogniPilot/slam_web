// Research cache only. Instrument host boundaries without changing Modelica/WASM.
import {readFile,writeFile,mkdir,readdir,cp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const [base,output]=process.argv.slice(2);
if(!output)throw Error('Usage: prepare-slam-stage-profile.mjs VERIFIED_CACHE NEW_RESEARCH_CACHE');
const sha=x=>createHash('sha256').update(x).digest('hex');
const receipt=JSON.parse(await readFile(join(base,'receipt.json')));
const graphMeasurements=process.env.SLAM_PROFILE_GRAPH_MEASUREMENTS==='1';
const shadowEpochs=(process.env.SLAM_PROFILE_SHADOW_NO_GRAPH??'').split(',').filter(Boolean).map(Number);
if(shadowEpochs.some(x=>!Number.isSafeInteger(x)||x<1||x>3000))throw Error('Invalid shadow epochs');
if(sha(await readFile(join(base,'worker.js')))!==receipt.workerSha256)throw Error('Base worker hash mismatch');
const sources=[];
const replaceOnce=(source,before,after)=>{
 if(source.split(before).length!==2)throw Error('Research hook target changed: '+before);
 return source.replace(before,after);
};
const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/modelica-slam.worker.ts',import.meta.url))],bundle:true,write:false,
 format:'esm',platform:'browser',target:'es2022',plugins:[{name:'research-host-stage-clocks',setup(builder){
 builder.onResolve({filter:/\?raw$/},args=>({path:resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'research-raw'}));
 builder.onLoad({filter:/.*/,namespace:'research-raw'},async({path})=>({contents:await readFile(path,'utf8'),loader:'text'}));
 builder.onLoad({filter:/\/(slam-native-program|modelica-slam\.worker)\.ts$/},async({path})=>{
  const original=await readFile(path,'utf8');let contents=original;
  if(path.endsWith('/slam-native-program.ts')){
   if(shadowEpochs.length)contents=replaceOnce(contents,'    const program=new SlamNativeProgram(layout,memory,entry as never,tables);',`    const program=new SlamNativeProgram(layout,memory,entry as never,tables);
    if(layout.model.endsWith('Step')){
      const shadowMemory=SlamNativeProgram.allocateMemory(layout.pages);
      const shadowInstance=await WebAssembly.instantiate(module,{env:{...env,memory:shadowMemory}});
      program.__researchShadow={memory:shadowMemory,entry:shadowInstance.exports.eval_assignments};
    }`);
   contents=replaceOnce(contents,'    if(this.needsCarry){','    const researchCarryStart=performance.now(),researchCarried=this.needsCarry;\n    if(this.needsCarry){');
   contents=replaceOnce(contents,'    const status=this.entry(',`    const researchCarryEnd=performance.now();let researchShadow;
    const researchSnapshot=memory=>{
      const read=name=>{const run=this.layout.state_runs.find(row=>row.name==='estimator.localization.estimator.'+name);if(!run||run.lane!=='f64')throw Error('Missing diagnostic state '+name);return new Float64Array(memory.buffer,run.next,run.count);};
      const covariance=read('covariance');return {covarianceDiagonal:Array.from({length:15},(_,i)=>covariance[i*15+i]),velocity:Array.from(read('velocity')),accelBias:Array.from(read('accelBias')),gyroBias:Array.from(read('gyroBias'))};
    };
    if(this.__researchShadow&&this.boolean('imageRequested')[0]&&${JSON.stringify(shadowEpochs)}.includes(Number(this.integer('imageEpoch')[0]))){
      const shadow=this.__researchShadow;new Uint8Array(shadow.memory.buffer).set(new Uint8Array(this.memory.buffer));
      const slot=this.layout.inputs.graphCorrectionRequested;if(!slot||slot.lane!=='u8'||slot.count!==1)throw Error('Unexpected graph switch slot');
      new Uint8Array(shadow.memory.buffer)[slot.offset]=0;
      const shadowStatus=shadow.entry(0,this.layout.p_offset,time,this.layout.scratch_offset,this.layout.typed_bytes?this.layout.typed_offset:0);
      if(shadowStatus!==0)throw Error('Shadow native entry failed '+shadowStatus);
      researchShadow={epoch:Number(this.integer('imageEpoch')[0]),withoutGraph:researchSnapshot(shadow.memory)};
    }
    const researchEntryStart=performance.now();
    const status=this.entry(`);
   contents=replaceOnce(contents,'    this.needsCarry=true;',`    const researchEnd=performance.now(),researchEdges=[];
    if(${graphMeasurements}&&this.layout.model.endsWith('Step')){
      const read=name=>this.stateRun('estimator.localization.graph.edges.'+name)?.view;
      const enabled=read('enabled'),ids=read('id');
      if(enabled&&ids){
        const previousEdgeId=this.__researchLastEdgeId??0;let latest=previousEdgeId;
        for(let slot=0;slot<enabled.length;slot++)if(Number(enabled[slot])&&Number(ids[slot])>previousEdgeId){
          const scalar=name=>Number(read(name)[slot]),vector=(name,size)=>Array.from(read(name).slice(slot*size,(slot+1)*size),Number);
          researchEdges.push({id:Number(ids[slot]),kind:scalar('kind'),referenceId:scalar('referenceId'),currentId:scalar('currentId'),
            referenceEpoch:scalar('referenceEpoch'),currentEpoch:scalar('currentEpoch'),translation:vector('translation',3),rotation:vector('rotation',9),covariance:vector('covariance',36)});
          latest=Math.max(latest,Number(ids[slot]));
        }
        this.__researchLastEdgeId=latest;
      }
    }
    if(researchShadow)researchShadow.withGraph=researchSnapshot(this.memory);
    globalThis.__nativeStageMetrics?.push({time,carryMs:researchCarryEnd-researchCarryStart,entryMs:researchEnd-researchEntryStart,
      carryBytes:researchCarried?this.layout.carry.reduce((sum,value,index)=>index%3===2?sum+value:sum,0):0,
      ...(researchShadow?{shadowCounterfactual:researchShadow}:{}),
      ...(${graphMeasurements}?{newGraphMeasurements:researchEdges}:{})});
    this.needsCarry=true;`);
  }else{
   contents=replaceOnce(contents,'  const started=performance.now();','  globalThis.__nativeStageMetrics=[];\n  const started=performance.now();');
   const token='timings:{workerMs:performance.now()-started}';
   if(contents.split(token).length!==3)throw Error('Worker reply hook target changed');
   contents=contents.replaceAll(token,'timings:{workerMs:performance.now()-started,nativeStages:globalThis.__nativeStageMetrics}');
  }
  sources.push({file:path.split('/').at(-1),originalSha256:sha(original),instrumentedSha256:sha(contents)});
  return {contents,loader:'ts'};
 });
 }}]});
await mkdir(output);
for(const file of await readdir(base))if(file!=='receipt.json'&&file!=='worker.js')await cp(join(base,file),join(output,file),{recursive:true,errorOnExist:true});
const worker=bundle.outputFiles[0].contents;
await writeFile(join(output,'worker.js'),worker);
receipt.researchInstrumentation={baseWorkerSha256:receipt.workerSha256,sources,
 graphMeasurements,
 shadowEpochs,
 scope:'Current source host worker with boundary clocks. Exact cached Modelica WASM and configuration retained. Carry and entry are nested inside native step; worker and RPC times include them and must not be added. Includes timer/log overhead. Not a published-worker timing result.'};
receipt.workerSha256=sha(worker);
await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({output,workerSha256:receipt.workerSha256,researchInstrumentation:receipt.researchInstrumentation}));
