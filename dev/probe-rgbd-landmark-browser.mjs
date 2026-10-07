// Opt-in actual worker proof for frozen compiler-issued Modelica artifacts.
// No compiler execution or production application activation occurs here.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const [directory,reportFile]=process.argv.slice(2);
if(!reportFile)throw new Error('ISSUED_ARTIFACT_DIRECTORY REPORT required');
const sha=data=>createHash('sha256').update(data).digest('hex');
const sources=['source.mo','edited.mo'].map(name=>fs.readFileSync(path.join(directory,name),'utf8'));
const rawArtifacts=['baseline.json','edited.json'].map(name=>fs.readFileSync(path.join(directory,name)));
const artifacts=rawArtifacts.map(raw=>JSON.parse(raw));
for(let i=0;i<2;i++)if(sha(sources[i])!==artifacts[i].source_sha256)throw new Error('Source/artifact mismatch');
const consumer=await build({entryPoints:['src/modelica-native-program.ts'],bundle:true,format:'esm',platform:'browser',write:false});
const fixtures=await build({entryPoints:['dev/rgbd-landmark-browser-fixtures.mjs'],bundle:true,format:'esm',platform:'browser',write:false});
const files=new Map([
  ['/consumer.js',['text/javascript',consumer.outputFiles[0].contents]],
  ['/fixtures.js',['text/javascript',fixtures.outputFiles[0].contents]],
  ['/baseline.json',['application/json',rawArtifacts[0]]],['/edited.json',['application/json',rawArtifacts[1]]],
]);
const server=createServer((request,response)=>{
  if(request.url==='/'){response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Modelica landmark review</title>');return;}
  const file=files.get(request.url);if(!file){response.statusCode=404;response.end();return;}
  response.setHeader('Content-Type',file[0]);response.end(file[1]);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const run=async data=>{
    const {NativeProgram}=await import(`${data.base}/consumer.js`);
    const {landmarkFrame,landmarkOracle,landmarkCases}=await import(`${data.base}/fixtures.js`);
    const require=(ok,message)=>{if(!ok)throw new Error(message);};
    const sameBytes=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('modelica-landmark-review',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('projects');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    const save=project=>new Promise((resolve,reject)=>{
      const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(project,'landmarks');
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
    const load=()=>new Promise((resolve,reject)=>{
      const request=db.transaction('projects').objectStore('projects').get('landmarks');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    const check=(program,artifact,name,frame,limit=1e6)=>{
      for(const [key,value] of Object.entries(frame))program.input(key).set(Array.isArray(value)?value:[value]);
      const a=artifact.abi,p=new Uint8Array(program.memory.buffer,a.p_offset,a.p_count*8),before=p.slice();
      const expected=landmarkOracle(frame,limit),start=performance.now();program.evaluate(0);
      const executeMs=performance.now()-start,owned={};let outputsChecked=0;
      require(sameBytes(p,before),`${name}: mutated inputs`);
      for(const [key,values] of Object.entries(expected)) {
        const actual=program.output(key);require(actual.length===values.length,`${name}: ${key} shape`);
        for(let i=0;i<values.length;i++)require(Number.isFinite(actual[i])&&Math.abs(actual[i]-values[i])<=2e-11,
          `${name}: ${key}/${i}: ${actual[i]} != ${values[i]}`);
        owned[key]=Array.from(actual);outputsChecked+=actual.length;
      }
      require(outputsChecked===1404,'Incomplete full350 output domain');
      return {summary:{name,executeMs,outputsChecked,validCount:owned.validCount[0],invalidCount:owned.invalidCount[0]},owned};
    };
    try {
      if(data.reload) {
        const saved=await load();require(saved.source===data.editedSource,'Saved editable source lost');
        const program=await NativeProgram.instantiate(saved.artifact,saved.source);
        const result=check(program,saved.artifact,'IndexedDB page/worker reload',landmarkFrame(),1);
        require(JSON.stringify(result.owned)===JSON.stringify(saved.outputs),'Reload changed complete output');
        return {indexedDbReload:true,reloadCase:result.summary};
      }
      const artifact=await (await fetch(`${data.base}/baseline.json`)).json();
      const edited=await (await fetch(`${data.base}/edited.json`)).json();
      require(JSON.stringify(artifact.var_layout.shapes.worldPoint)==='[350,3]','Changed350 shape');
      let program=await NativeProgram.instantiate(artifact,data.source);
      const cases=landmarkCases().map(c=>check(program,artifact,c.name,c.frame).summary);
      const frame=landmarkFrame(),first=check(program,artifact,'before reset',frame);
      require(Math.abs(first.owned.worldPoint[0]-2.18)<1e-12
        &&Math.abs(first.owned.worldPoint[1]-.36)<1e-12
        &&Math.abs(first.owned.worldPoint[2]-.10)<1e-12,'Analytic RDF axes/leverarm differ');
      program.reset();const reset=check(program,artifact,'reset replay',frame);
      require(JSON.stringify(first.owned)===JSON.stringify(reset.owned),'Reset changed full output');
      let stale=false;try{await NativeProgram.instantiate(artifact,data.editedSource);}catch(error){stale=String(error).includes('does not match its source');}
      require(stale,'Stale source/module accepted');
      const corrupted=structuredClone(artifact);corrupted.module_bytes[0]^=1;
      let corrupt=false;try{await NativeProgram.instantiate(corrupted,data.source);}catch(error){corrupt=String(error).includes('digest mismatch');}
      require(corrupt,'Corrupt module accepted');
      program=await NativeProgram.instantiate(JSON.parse(JSON.stringify(artifact)),data.source);
      const restored=check(program,artifact,'JSON source-bound reload',frame);
      require(JSON.stringify(restored.owned)===JSON.stringify(first.owned),'JSON reload changed full output');
      const outputNames=Object.keys(first.owned),iterations=1000,start=performance.now();let last;
      for(let i=0;i<iterations;i++) {
        for(const [key,value] of Object.entries(frame))program.input(key).set(Array.isArray(value)?value:[value]);
        program.evaluate(0);last=Object.fromEntries(outputNames.map(name=>[name,program.output(name).slice()]));
      }
      const totalMs=performance.now()-start;
      require(outputNames.every(name=>last[name].every((v,i)=>v===first.owned[name][i])),'Benchmark lost full outputs');
      const editedProgram=await NativeProgram.instantiate(edited,data.editedSource);
      const changed=check(editedProgram,edited,'coordinateLimit source edit',frame,1);
      require(changed.owned.invalidCount[0]===350,'Source parameter edit not executed');
      await save({source:data.editedSource,artifact:edited,outputs:changed.owned});
      return {cases:[...cases,first.summary,reset.summary,restored.summary,changed.summary],
        reset:true,sourceBinding:true,moduleDigest:true,jsonReload:true,sourceEdit:true,inputBytesImmutable:true,
        benchmark:{iterations,totalMs,meanMs:totalMs/iterations,fullInputValues:1426,ownedOutputValues:1404,
          scope:'Full frame field copies + NativeProgram.evaluate + owned copies of all public outputs; no compiler, render, sensor, map or fullSLAM time'}};
    } finally {db.close();}
  };
  const invoke=payload=>page.evaluate(async({body,payload})=>{
    const url=URL.createObjectURL(new Blob([`const run=${body};onmessage=async e=>{try{postMessage({result:await run(e.data)})}catch(error){postMessage({error:String(error.stack||error)})}}`],{type:'text/javascript'}));
    const worker=new Worker(url);
    try{return await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Landmark worker timed out')),60000);
      worker.onmessage=({data})=>{clearTimeout(timer);data.error?reject(new Error(data.error)):resolve(data.result);};
      worker.onerror=error=>{clearTimeout(timer);reject(new Error(error.message));};worker.postMessage({...payload,base:location.origin});
    });}finally{worker.terminate();URL.revokeObjectURL(url);}
  },{body:run.toString(),payload});
  const first=await invoke({source:sources[0],editedSource:sources[1]});
  await page.reload();const reload=await invoke({reload:true,editedSource:sources[1]});
  const report={status:'ACTUAL_FULL350_LANDMARK_CHROMIUM_NUMERIC_RELOAD_PASS',recordedAt:new Date().toISOString(),
    browser:browser.version(),sourceSha256:sha(sources[0]),editedSourceSha256:sha(sources[1]),
    artifactSha256:sha(rawArtifacts[0]),editedArtifactSha256:sha(rawArtifacts[1]),
    moduleSha256:artifacts[0].module_sha256,editedModuleSha256:artifacts[1].module_sha256,
    compiler:artifacts[0].compiler,consumerSha256:sha(fs.readFileSync('src/modelica-native-program.ts')),
    consumerBundleSha256:sha(consumer.outputFiles[0].contents),fixtureSha256:sha(fs.readFileSync('dev/rgbd-landmark-browser-fixtures.mjs')),
    probeSha256:sha(fs.readFileSync('dev/probe-rgbd-landmark-browser.mjs')),...first,...reload,
    actualCases:first.cases.length+1,actualOutputComparisons:first.cases.reduce((sum,c)=>sum+c.outputsChecked,0)+reload.reloadCase.outputsChecked,
    runtimeIntegrated:false,productionPinChanged:false,persistentMap:false,fullSlam:false,
    scope:'Actual Chromium dedicated worker executes frozen compiler-issued full350 modules. Independent analytic oracle, input immutability/reset/source edit, IndexedDB page/worker reload. Compiler preparation has separate evidence.'};
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
} catch(error) {
  fs.writeFileSync(reportFile,JSON.stringify({status:'ACTUAL_CHROMIUM_GATE_FAILED',error:String(error.stack||error),runtimeIntegrated:false},null,2)+'\n');
  throw error;
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
