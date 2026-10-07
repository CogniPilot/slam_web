// Review-only browser execution of actual source-issued Integer-index programs.
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
const raw=['baseline.json','edited.json'].map(name=>fs.readFileSync(path.join(directory,name)));
const artifacts=raw.map(bytes=>JSON.parse(bytes));
for(let i=0;i<2;i++)if(sha(sources[i])!==artifacts[i].source_sha256)throw new Error('Source/artifact mismatch');
const bundle=await build({entryPoints:['src/modelica-native-program.ts'],bundle:true,format:'esm',platform:'browser',write:false});
const files=new Map([
  ['/consumer.js',['text/javascript',bundle.outputFiles[0].contents]],
  ['/baseline.json',['application/json',raw[0]]],['/edited.json',['application/json',raw[1]]],
]);
const server=createServer((request,response)=>{
  if(request.url==='/'){response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Integer indexing compiler review</title>');return;}
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
    const require=(ok,message)=>{if(!ok)throw new Error(message);};
    const database=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('integer-index-review',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('projects');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    const load=()=>new Promise((resolve,reject)=>{
      const request=database.transaction('projects').objectStore('projects').get('source');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    const check=(program,artifact,values,divisor)=>{
      program.input('values').set(values);
      const p=new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8);
      const before=p.slice();program.evaluate(0);
      let expected=0;for(let i=0;i<49;i++)expected+=values[Math.trunc(i/divisor)];
      const actual=program.output('total')[0];
      require(Object.is(actual,expected),`Integer index result ${actual} != ${expected}`);
      require(p.every((value,index)=>value===before[index]),'Changed input bytes');
      return actual;
    };
    try {
      if(data.reload){
        const saved=await load();require(saved.source===data.sources[1],'Editable source lost');
        const program=await NativeProgram.instantiate(saved.artifact,saved.source);
        const actual=check(program,saved.artifact,saved.values,5);
        require(Object.is(actual,saved.output),'Reload changed output');
        return {cases:1,indexedDbReload:true};
      }
      const artifacts=await Promise.all(['baseline','edited'].map(async name=>(await fetch(`${data.base}/${name}.json`)).json()));
      const records=[];
      for(let revision=0;revision<2;revision++){
        const artifact=artifacts[revision];
        require(JSON.stringify(artifact.var_layout.shapes.values)==='[49]','Changed original source domain');
        const program=await NativeProgram.instantiate(artifact,data.sources[revision]);
        for(let frame=0;frame<20;frame++){
          const values=Array.from({length:49},(_,index)=>((index*23+frame*7)%113)-56);
          records.push({revision,frame,output:check(program,artifact,values,revision?5:7)});
        }
        const values=Array.from({length:49},(_,index)=>index+1);
        const first=check(program,artifact,values,revision?5:7);program.reset();
        require(Object.is(first,check(program,artifact,values,revision?5:7)),'Reset changed output');
        records.push({revision,reset:true,output:first});
      }
      let stale=false;try{await NativeProgram.instantiate(artifacts[0],data.sources[1]);}catch(error){stale=String(error).includes('does not match its source');}
      require(stale,'Accepted stale artifact');
      const corrupted=structuredClone(artifacts[0]);corrupted.module_bytes[0]^=1;
      let refused=false;try{await NativeProgram.instantiate(corrupted,data.sources[0]);}catch(error){refused=String(error).includes('digest');}
      require(refused,'Accepted corrupted module');
      const values=Array.from({length:49},(_,index)=>index+1);
      const program=await NativeProgram.instantiate(artifacts[1],data.sources[1]);
      const output=check(program,artifacts[1],values,5);
      await new Promise((resolve,reject)=>{
        const tx=database.transaction('projects','readwrite');
        tx.objectStore('projects').put(JSON.parse(JSON.stringify({source:data.sources[1],artifact:artifacts[1],values,output})),'source');
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
      });
      return {cases:records.length,records,staleSourceRefused:stale,corruptModuleRefused:refused,jsonReloadSaved:true};
    } finally {database.close();}
  };
  const invoke=async reload=>{
    const source=`(${run.toString()})`;
    const workerSource=`onmessage=async event=>{try{postMessage({result:await ${source}(event.data)})}catch(error){postMessage({error:String(error.stack||error)})}}`;
    return page.evaluate(({workerSource,data})=>new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));
      const worker=new Worker(url,{type:'module'});
      worker.onmessage=event=>{worker.terminate();URL.revokeObjectURL(url);event.data.error?reject(new Error(event.data.error)):resolve(event.data.result);};
      worker.onerror=event=>{worker.terminate();URL.revokeObjectURL(url);reject(new Error(event.message));};
      worker.postMessage(data);
    }),{workerSource,data:{base:`http://127.0.0.1:${server.address().port}`,sources,reload}});
  };
  const first=await invoke(false);await page.reload();const reload=await invoke(true);
  fs.writeFileSync(reportFile,JSON.stringify({status:'SOURCE_ISSUED_INTEGER_INDEX_CHROMIUM_RELOAD_PASS',
    browser:browser.version(),sourceSha256:sources.map(sha),artifactSha256:raw.map(sha),
    moduleSha256:artifacts.map(a=>a.module_sha256),first,reload,
    scope:'Original49-index source and source edit, actual WASM worker, reset/JSON/IndexedDB page+worker reload. Full14400 typed quotient semantics are a separate gate. No fullSLAM or production compiler activation.'},null,2)+'\n');
  console.log(JSON.stringify({status:'PASS',cases:first.cases+reload.cases,browser:browser.version()}));
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
