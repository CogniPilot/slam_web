import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const [packageDirectory,sourceFile,problemFile,fixtureFile,reportFile]=process.argv.slice(2);
if(!reportFile)throw new Error('COMPILER_DIRECTORY SOURCE PROBLEM FIXTURES REPORT required');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const source=fs.readFileSync(sourceFile,'utf8'),layout=JSON.parse(fs.readFileSync(problemFile,'utf8')).layout;
const fixture=JSON.parse(fs.readFileSync(fixtureFile,'utf8'));
if(sha(source)!==fixture.sourceSha256)throw new Error('Independent fixtures belong to different source');
const consumer=await build({entryPoints:['src/modelica-native-program.ts'],bundle:true,format:'esm',platform:'browser',write:false});
const files=new Map([
  ['/compiler.js',['text/javascript',fs.readFileSync(path.join(packageDirectory,'rumoca_bind_wasm.js'))]],
  ['/compiler.wasm',['application/wasm',fs.readFileSync(path.join(packageDirectory,'rumoca_bind_wasm_bg.wasm'))]],
  ['/consumer.js',['text/javascript',consumer.outputFiles[0].contents]],
]);
const server=createServer((request,response)=>{
  if(request.url==='/'){response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Modelica filter review gate</title>');return;}
  const file=files.get(request.url);
  if(!file){response.statusCode=404;response.end();return;}
  response.setHeader('Content-Type',file[0]);response.end(file[1]);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
try{
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const input={source,layout,fixture};
  const run=async(data)=>{
    const {NativeProgram}=await import(`${data.base}/consumer.js`);
    const require=(ok,message)=>{if(!ok)throw new Error(message);};
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('modelica-filter-review',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('projects');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    const save=project=>new Promise((resolve,reject)=>{
      const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(project,'filter');
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
    const load=()=>new Promise((resolve,reject)=>{
      const request=db.transaction('projects').objectStore('projects').get('filter');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    const check=async(artifact,text,edited=false)=>{
      require(artifact.abi.y_count===data.fixture.yCount&&artifact.abi.p_count===data.fixture.pCount,'Unexpected filter storage sizes');
      require(JSON.stringify(artifact.var_layout.bindings)===JSON.stringify(data.layout.bindings),'Compiler changed fixture binding inventory');
      require(JSON.stringify(artifact.var_layout.shapes)===JSON.stringify(data.layout.shapes),'Compiler changed fixture shapes');
      const program=await NativeProgram.instantiate(artifact,text),a=artifact.abi;
      const y=new Float64Array(program.memory.buffer,a.y_offset,a.y_count),p=new Float64Array(program.memory.buffer,a.p_offset,a.p_count);
      const counter=artifact.var_layout.bindings.next_accepted_count.Y.index,frames=[];
      for(const item of data.fixture.cases){
        y.fill(NaN);p.set(item.inputs);const before=new Uint8Array(p.buffer,p.byteOffset,p.byteLength).slice();
        program.evaluate(0);
        for(const expected of item.expected){
          const wanted=expected.value+(edited&&expected.index===counter?1:0);
          require(Number.isFinite(y[expected.index])&&Math.abs(y[expected.index]-wanted)<expected.tolerance,`${item.name} output ${expected.index}: ${y[expected.index]} != ${wanted}`);
        }
        require(new Uint8Array(p.buffer,p.byteOffset,p.byteLength).every((v,i)=>v===before[i]),'Filter changed input bytes');
        frames.push({name:item.name,outputsChecked:item.expected.length});
      }
      program.reset();y.fill(NaN);p.set(data.fixture.cases[0].inputs);program.evaluate(0);
      require(program.output('next_accepted_count')[0]===3+(edited?1:0),'Reset did not restore source execution');
      return frames;
    };
    try{
      if(data.reload){
        const project=await load();require(project.source===data.editedSource,'Reload lost edited source');
        return {reloadedFrames:await check(project.artifact,project.source,true),sourceSha256:project.artifact.source_sha256};
      }
      const compiler=await import(`${data.base}/compiler.js`);await compiler.default({module_or_path:`${data.base}/compiler.wasm`});
      require(typeof compiler.prepare_native_program==='function','Review compiler lacks source program export');
      const start=performance.now(),artifact=JSON.parse(compiler.prepare_native_program(data.source,'ES15FilterStep'));
      const compileMs=performance.now()-start,frames=await check(artifact,data.source);
      const original='next_accepted_count = accepted_count+observation_accepted;';
      require(data.source.includes(original),'Missing exact reviewed edit target');
      const editedSource=data.source.replace(original,'next_accepted_count = accepted_count+observation_accepted+1.0;');
      const editStart=performance.now(),edited=JSON.parse(compiler.prepare_native_program(editedSource,'ES15FilterStep'));
      const editCompileMs=performance.now()-editStart;
      require(artifact.source_sha256!==edited.source_sha256&&artifact.module_sha256!==edited.module_sha256,'Source edit did not invalidate executable');
      let staleRefused=false;try{await NativeProgram.instantiate(artifact,editedSource);}catch(error){staleRefused=String(error).includes('does not match its source');}
      require(staleRefused,'Old module accepted edited source');
      const editedFrames=await check(edited,editedSource,true);
      await save({source:editedSource,artifact:edited});
      return {compileMs,editCompileMs,frames,editedFrames,staleRefused,editedSource,
        compiler:{version:compiler.get_version(),git_commit:compiler.get_git_commit()},
        artifact:{profile:artifact.profile,sourceSha256:artifact.source_sha256,moduleSha256:artifact.module_sha256,moduleBytes:artifact.module_bytes.length,stages:artifact.issued_schedule.length},
        editedArtifact:{sourceSha256:edited.source_sha256,moduleSha256:edited.module_sha256}};
    }finally{db.close();}
  };
  const invoke=async(payload)=>page.evaluate(async({body,payload})=>{
    const url=URL.createObjectURL(new Blob([`const run=${body};onmessage=async e=>{try{postMessage({result:await run(e.data)})}catch(error){postMessage({error:String(error.stack||error)})}}`],{type:'text/javascript'}));
    const worker=new Worker(url);
    try{return await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Browser compiler worker timed out')),240000);
      worker.onmessage=({data})=>{clearTimeout(timer);data.error?reject(new Error(data.error)):resolve(data.result);};
      worker.onerror=error=>{clearTimeout(timer);reject(new Error(error.message));};worker.postMessage({...payload,base:location.origin});
    });}finally{worker.terminate();URL.revokeObjectURL(url);}
  },{body:run.toString(),payload});
  const first=await invoke(input),editedSource=first.editedSource;delete first.editedSource;
  await page.reload();const reload=await invoke({...input,reload:true,editedSource});
  const report={status:'REVIEW_BROWSER_COMPILER_FILTER_SOURCE_EDIT_PERSISTENCE_PASS',recordedAt:new Date().toISOString(),browser:browser.version(),
    compilerModuleSha256:sha(files.get('/compiler.wasm')[1]),consumerBundleSha256:sha(consumer.outputFiles[0].contents),
    ...first,...reload,productionPinChanged:false,
    scope:'Actual browser compiler source-to-kernel in worker, nine independent complete filter cases, edited body numerical oracle, IndexedDB save and page/worker reload. Isolated review consumer; preview/full visual SLAM/10x acceptance pending.'};
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
