// Alternating comparison of complete compiler-issued registration modules.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
const [fixtureFile,baselineFile,candidateFile,reportFile]=process.argv.slice(2);
if(!reportFile)throw new Error('FIXTURE BASELINE CANDIDATE REPORT required');
const sha=v=>createHash('sha256').update(v).digest('hex');
const fixtureBytes=fs.readFileSync(fixtureFile),fixtures=JSON.parse(fixtureBytes);
const source=fs.readFileSync(fixtures.artifacts.registration.sourcePath,'utf8');
const artifacts=[baselineFile,candidateFile].map(f=>JSON.parse(fs.readFileSync(f)));
if(artifacts.some(a=>a.source_sha256!==sha(source)))throw new Error('Identical full source required');
const bundle=await build({entryPoints:['src/modelica-native-program.ts'],bundle:true,format:'esm',platform:'browser',write:false});
const server=createServer((request,response)=>{
 response.setHeader('Content-Type',request.url==='/consumer.js'?'text/javascript':'text/html');
 response.end(request.url==='/consumer.js'?bundle.outputFiles[0].contents:'<!doctype html><title>Native module comparison</title>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const run=async({base,artifacts,source,frame})=>{
  const {NativeProgram}=await import(base+'/consumer.js');
  const programs=await Promise.all(artifacts.map(a=>NativeProgram.instantiate(a,source)));
  const require=(ok,message)=>{if(!ok)throw new Error(message);};
  const hash=async(v)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',v))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const pbytes=i=>new Uint8Array(programs[i].memory.buffer,artifacts[i].abi.p_offset,artifacts[i].abi.p_count*8);
  const ybytes=i=>new Uint8Array(programs[i].memory.buffer,0,artifacts[i].abi.y_count*8);
  for(const p of programs){
   require(p.input('pairEnabled').length===14400,'Reduced workload');
   for(const name of ['sourcePoint','targetPoint','pairEnabled'])p.input(name).set(frame[name]);
   p.input('activeCount')[0]=frame.activeCount;
  }
  const inputHashes=await Promise.all(programs.map((_,i)=>hash(pbytes(i).slice())));
  let tick=0;
  const check=async()=>{
   const a=ybytes(0),b=ybytes(1);require(a.length===b.length&&a.every((v,i)=>v===b[i]),'Changed full Y bytes');
   for(let i=0;i<2;i++)require(programs[i].output('accepted')[0]===1&&await hash(pbytes(i).slice())===inputHashes[i],'Output/input failure');
  };
  for(let n=0;n<100;n++)for(const p of programs)p.evaluate(++tick/90);
  await check();const blocks=[];
  for(let round=0;round<6;round++){
   for(const candidate of round%2?[1,0]:[0,1]){
    const start=performance.now();for(let n=0;n<100;n++)programs[candidate].evaluate(++tick/90);
    blocks.push({round,candidate,calls:100,meanExecutionMs:(performance.now()-start)/100});
   }
   await check();
  }
  const means=[0,1].map(i=>blocks.filter(b=>b.candidate===i).reduce((n,b)=>n+b.meanExecutionMs,0)/6);
  return {capacity:14400,warmCallsPerModule:100,blocks,baselineMeanExecutionMs:means[0],candidateMeanExecutionMs:means[1],speedup:means[0]/means[1],everyOutputBitsEqual:true,inputBytesImmutable:true};
 };
 const result=await page.evaluate(async({body,payload})=>{
  const url=URL.createObjectURL(new Blob([`const run=${body};onmessage=async e=>{try{postMessage({result:await run(e.data)})}catch(error){postMessage({error:String(error.stack||error)})}}`],{type:'text/javascript'}));
  const worker=new Worker(url);try{return await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('Comparison worker timeout')),60000);
   worker.onmessage=({data})=>{clearTimeout(timer);data.error?reject(new Error(data.error)):resolve(data.result);};
   worker.onerror=e=>{clearTimeout(timer);reject(new Error(e.message));};worker.postMessage({...payload,base:location.origin});
  });}finally{worker.terminate();URL.revokeObjectURL(url);}
 },{body:run.toString(),payload:{artifacts,source,frame:fixtures.frames[0].registration}});
 const report={status:'SOURCE_ISSUED_ALTERNATING_BROWSER_REGISTRATION_COMPARISON_PASS',recordedAt:new Date().toISOString(),browser:browser.version(),sourceSha256:sha(source),fixtureSha256:sha(fixtureBytes),moduleSha256:artifacts.map(a=>a.module_sha256),artifactSha256:[baselineFile,candidateFile].map(f=>sha(fs.readFileSync(f))),moduleBytes:artifacts.map(a=>a.module_bytes.length),probeSha256:sha(fs.readFileSync(import.meta.filename)),consumerSha256:sha(fs.readFileSync('src/modelica-native-program.ts')),consumerBundleSha256:sha(bundle.outputFiles[0].contents),...result,scope:'Uninstrumented dedicated Chromium worker, six alternating blocks per module,100calls/block, identical unchanged14400 source/inputs. Excludes preparation/input copies/frontend/filter/sensors/rendering.',runtimeIntegrated:false,productionPinChanged:false,fullSlam:false};
 fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
