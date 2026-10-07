// Execute an actual compiler-issued complete registration model in Chromium.
// Geometry below is an independent test oracle, never an application fallback.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const [artifactFile,sourceFile,reportFile,editedArtifactFile,editedSourceFile]=process.argv.slice(2);
if(!reportFile)throw new Error('ISSUED_ARTIFACT SOURCE REPORT required');
const artifact=JSON.parse(fs.readFileSync(artifactFile,'utf8')),source=fs.readFileSync(sourceFile,'utf8');
const sha=value=>createHash('sha256').update(value).digest('hex');
if(artifact.source_sha256!==sha(source))throw new Error('Artifact belongs to a different source');
if(Boolean(editedArtifactFile)!==Boolean(editedSourceFile))throw new Error('Edited artifact and source required together');
const editedArtifact=editedArtifactFile?JSON.parse(fs.readFileSync(editedArtifactFile,'utf8')):undefined;
const editedSource=editedSourceFile?fs.readFileSync(editedSourceFile,'utf8'):undefined;
if(editedArtifact&&editedArtifact.source_sha256!==sha(editedSource))throw new Error('Edited artifact source mismatch');
const consumer=await build({entryPoints:['src/modelica-native-program.ts'],bundle:true,format:'esm',platform:'browser',write:false});
const server=createServer((request,response)=>{
  response.setHeader('Content-Type',request.url==='/consumer.js'?'text/javascript':'text/html');
  response.end(request.url==='/consumer.js'?consumer.outputFiles[0].contents:'<!doctype html><title>Whole Modelica registration review</title>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
try{
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const run=async(data)=>{
    const {NativeProgram}=await import(`${data.base}/consumer.js`);
    const require=(ok,message)=>{if(!ok)throw new Error(message);};
    const close=(actual,expected,label)=>require(Number.isFinite(actual)&&Math.abs(actual-expected)<2e-9,`${label}: ${actual} != ${expected}`);
    const hash=async(bytes)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
    require(data.artifact.profile==='native-direct-program-f64-v3','Not a source-issued typed-call graph');
    const projectArtifact=structuredClone(data.artifact);
    const program=await NativeProgram.instantiate(projectArtifact,data.source),a=data.artifact.abi;
    const points=program.input('sourcePoint'),targets=program.input('targetPoint'),flags=program.input('pairEnabled'),count=program.input('activeCount');
    const n=14400;require(points.length===n*3&&targets.length===n*3&&flags.length===n,'Reduced capacity');
    const I=[1,0,0,0,1,0,0,0,1],axis=[.3,-.7,.5],norm=Math.hypot(...axis),[x,y,z]=axis.map(v=>v/norm);
    const c=Math.cos(.81),s=Math.sin(.81),d=1-c;
    const R=[c+x*x*d,x*y*d-z*s,x*z*d+y*s,y*x*d+z*s,c+y*y*d,y*z*d-x*s,z*x*d-y*s,z*y*d+x*s,c+z*z*d],t=[.2,-.35,.09];
    const fill=()=>{
      count[0]=n;flags.fill(1);
      for(let i=0;i<n;i++){
        const p=[(i%120-59.5)/120,(Math.floor(i/120)-59.5)/240,(i%2?1:-1)*(Math.floor(i/120)%2?1:-1)*.13];
        points.set(p,i*3);
        for(let j=0;j<3;j++)targets[i*3+j]=t[j]+R[j*3]*p[0]+R[j*3+1]*p[1]+R[j*3+2]*p[2];
      }
    };
    let tick=0;const cases=[];
    const check=async(name,reason=0,valid=n)=>{
      const p=new Uint8Array(program.memory.buffer,a.p_offset,a.p_count*8),before=await hash(p.slice());
      new Float64Array(program.memory.buffer,0,a.y_count).fill(NaN);program.evaluate(++tick/90);
      close(program.output('accepted')[0],+(reason===0),`${name}/accepted`);
      close(program.output('rejectionReason')[0],reason,`${name}/reason`);
      const rotation=program.output('rotation'),translation=program.output('translation');
      rotation.forEach((v,i)=>close(v,reason?I[i]:R[i],`${name}/rotation${i}`));
      translation.forEach((v,i)=>close(v,reason?0:t[i],`${name}/translation${i}`));
      if(!reason){close(program.output('validCount')[0],valid,`${name}/count`);close(program.output('rms')[0],0,`${name}/rms`);}
      require(await hash(p.slice())===before,`${name}/input mutation`);
      cases.push({name,reason,accepted:reason===0,validCount:program.output('validCount')[0]});
    };
    fill();await check('full14400 non-axis rigid transform');
    for(let i=0;i<n;i++)if(i%3!==2)flags[i]=0;
    await check('sparse matches across full slot domain',0,n/3);
    fill();count[0]=0;await check('empty observation',3);
    count[0]=n+.5;await check('invalid active count',1);
    fill();flags[n-1]=.5;await check('invalid pair flag',2);
    fill();points[(n-1)*3]=NaN;await check('active nonfinite coordinate',2);
    flags[n-1]=0;await check('disabled nonfinite coordinate',0,n-1);
    fill();await check('recovery');program.reset();fill();await check('reset replay');
    // Saved project metadata is separate from the active model's fixed views.
    projectArtifact.abi.p_offset=0;
    projectArtifact.parameters.fill(-1000);
    projectArtifact.var_layout.bindings.sourcePoint.P.index=0;
    projectArtifact.var_layout.shapes.sourcePoint=[1];
    projectArtifact.input_names=[];
    program.reset();fill();await check('project metadata isolation after reset');
    const fieldRefusals=[];
    for(const [method,name] of [['input','rotation'],['output','sourcePoint'],['input','__proto__']]){
      let refused=false;try{program[method](name);}catch{refused=true;}
      require(refused,`${method}/${name} accepted`);fieldRefusals.push(`${method}/${name}`);
    }
    const module=await WebAssembly.compile(new Uint8Array(data.artifact.module_bytes));
    const env={memory:program.memory};for(const name of data.artifact.math_imports)env[name]=Math[name];
    const raw=await WebAssembly.instantiate(module,{env}),execute=raw.exports.eval_assignments;
    const published=new Uint8Array(program.memory.buffer,0,a.p_offset+a.p_count*8),before=await hash(published.slice());
    const abiFaults=[];
    for(const [name,y,p,scratch,reserved] of [
      ['scratch overlaps Y',0,a.p_offset,0,0],
      ['P overlaps Y',0,0,a.scratch_offset,0],
      ['out of bounds Y',program.memory.buffer.byteLength-8,a.p_offset,a.scratch_offset,0],
      ['reserved argument',0,a.p_offset,a.scratch_offset,1],
    ]){
      const status=execute(y,p,tick/90,scratch,reserved);require(status===1,`${name}: ${status}`);
      require(await hash(published.slice())===before,`${name}/partial publication`);abiFaults.push({name,status});
    }
    program.evaluate(++tick/90);close(program.output('accepted')[0],1,'post-fault recovery');
    const refused=[];
    const bad=async(name,change)=>{
      const copy=structuredClone(data.artifact);change(copy);
      let didRefuse=false;try{await NativeProgram.instantiate(copy,data.source);}catch{didRefuse=true;}
      require(didRefuse,`${name} accepted`);refused.push(name);
    };
    await bad('overlapping scratch',v=>{v.abi.scratch_offset=0;});
    await bad('nontransactional Y',v=>{v.abi.transactional_y=false;});
    await bad('mutable P',v=>{v.abi.p_readonly=false;});
    await bad('undeclared math import',v=>{v.math_imports=[];});
    await bad('duplicate fault status',v=>{v.faults[1].status=1;});
    await bad('rounded provenance source identity',v=>{v.faults[2].provenance.source=Number(v.faults[2].provenance.source);});
    let stale=false;try{await NativeProgram.instantiate(data.artifact,data.source+'\n// edited');}catch{stale=true;}
    require(stale,'Stale source accepted');
    const restored=await NativeProgram.instantiate(JSON.parse(JSON.stringify(data.artifact)),data.source);
    restored.input('sourcePoint').set(points);restored.input('targetPoint').set(targets);restored.input('pairEnabled').set(flags);restored.input('activeCount')[0]=n;
    const savedFirst=points[0];restored.input('sourcePoint')[0]=savedFirst+1;
    require(points[0]===savedFirst,'Reloaded project shares the previous model input buffer');
    restored.input('sourcePoint')[0]=savedFirst;
    restored.evaluate(0);close(restored.output('accepted')[0],1,'JSON reload');
    const detached=await NativeProgram.instantiate(data.artifact,data.source);
    detached.input('sourcePoint');detached.output('translation');
    detached.memory.grow(0);
    const detachedMemoryRefusals=[];
    for(const [name,call] of [['input',()=>detached.input('sourcePoint')],['output',()=>detached.output('translation')],
      ['reset',()=>detached.reset()],['evaluate',()=>detached.evaluate(0)]]){
      let refused=false;try{call();}catch(error){refused=String(error).includes('memory buffer changed');}
      require(refused,`detached memory ${name} accepted`);detachedMemoryRefusals.push(name);
    }
    for(let i=0;i<5;i++)program.evaluate(++tick/90);
    const times=[];for(let i=0;i<20;i++){const start=performance.now();program.evaluate(++tick/90);times.push(performance.now()-start);}
    const sourceEdit=[];
    if(data.editedArtifact){
      const edited=await NativeProgram.instantiate(data.editedArtifact,data.editedSource);
      const reflected=program=>{
        program.input('activeCount')[0]=n;program.input('pairEnabled').fill(1);
        const p=program.input('sourcePoint'),q=program.input('targetPoint');
        for(let i=0;i<n;i++){
          const x=(i%120-59.5)/120,y=(Math.floor(i/120)-59.5)/240;
          const z=(i%2?1:-1)*(Math.floor(i/120)%2?1:-1)*.13;
          p.set([x,y,z],i*3);q.set([-x,y,z],i*3);
        }
      };
      const sourceCase=(name,program,accepted)=>{
        program.reset();reflected(program);program.evaluate(0);
        close(program.output('accepted')[0],accepted,`${name}/accepted`);
        close(program.output('rejectionReason')[0],accepted?0:6,`${name}/reason`);
        close(program.output('rms')[0],.26,`${name}/independent residual`);
        const expected=accepted?[-1,0,0,0,1,0,0,0,-1]:I;
        program.output('rotation').forEach((v,i)=>close(v,expected[i],`${name}/proper rotation${i}`));
        program.output('translation').forEach(v=>close(v,0,`${name}/translation`));
        sourceEdit.push({name,accepted,rms:program.output('rms')[0]});
      };
      sourceCase('original residual gate',program,0);
      sourceCase('source-edited residual gate',edited,1);
      const reloaded=await NativeProgram.instantiate(JSON.parse(JSON.stringify(data.editedArtifact)),data.editedSource);
      sourceCase('edited JSON reload and reset',reloaded,1);
    }
    return {cases,abiFaults,metadataRefused:refused,staleSourceRefused:stale,jsonReload:true,sourceEdit,
      fieldRefusals,projectMetadataIsolated:true,reloadedBufferIsolated:true,retainedViewsLiveAfterReset:true,detachedMemoryRefusals,
      warmExecutionMs:times,meanWarmExecutionMs:times.reduce((s,v)=>s+v,0)/times.length,
      scope:'Actual compiler-issued unchanged full14400 model schedule, one typed-call executable. Excludes sensors, frontend, rendering, compilation and complete SLAM.'};
  };
  const result=await page.evaluate(async({body,payload})=>{
    const url=URL.createObjectURL(new Blob([`const run=${body};onmessage=async e=>{try{postMessage({result:await run(e.data)})}catch(error){postMessage({error:String(error.stack||error)})}}`],{type:'text/javascript'}));
    const worker=new Worker(url);
    try{return await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Whole registration worker timed out')),60000);
      worker.onmessage=({data})=>{clearTimeout(timer);data.error?reject(new Error(data.error)):resolve(data.result);};
      worker.onerror=error=>{clearTimeout(timer);reject(new Error(error.message));};worker.postMessage({...payload,base:location.origin});
    });}finally{worker.terminate();URL.revokeObjectURL(url);}
  },{body:run.toString(),payload:{artifact,source,editedArtifact,editedSource}});
  const report={status:'SOURCE_ISSUED_WHOLE_REGISTRATION_BROWSER_PASS',recordedAt:new Date().toISOString(),browser:browser.version(),
    sourceSha256:sha(source),moduleSha256:artifact.module_sha256,artifactSha256:sha(fs.readFileSync(artifactFile)),
    consumerBundleSha256:sha(consumer.outputFiles[0].contents),abi:artifact.abi,compiler:artifact.compiler,...result,
    ...(editedArtifact?{editedSourceSha256:sha(editedSource),editedModuleSha256:editedArtifact.module_sha256}:{}),
    runtimeIntegrated:false,productionPinChanged:false};
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
