// Numerical qualification of actual compiler-issued eligibility/floor modules.
// Fixture packaging is independent test code, never application feature math.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';import {createServer} from 'node:http';
import {build} from 'esbuild';import {chromium} from '@playwright/test';
const [directory]=process.argv.slice(2);if(!directory)throw Error('Expected fresh probe directory with baseline/edited sources and artifacts');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const require=(ok,message)=>{if(!ok)throw Error(message);};
const source=fs.readFileSync('models/Vision/Features/FastNativeFrame.mo','utf8');
const sources=['baseline','edited'].map(name=>fs.readFileSync(path.join(directory,name+'.mo'),'utf8'));
const edit='FastSelectionScoreFloor(18.0,1e8)';
require(sources[0].startsWith(source+'\n')&&sources[0].split(edit).length===2
  &&sources[1]===sources[0].replace(edit,'FastSelectionScoreFloor(0.0,1e8)'),'Exact production source and separately authored threshold edit');
const bytes=['baseline','edited'].map(name=>fs.readFileSync(path.join(directory,name+'.artifact.json'))),artifacts=bytes.map(x=>JSON.parse(x));
require(artifacts.every((x,i)=>x.source_sha256===sha(sources[i])&&x.model_name==='FastScoreGateNativeProbe'
  &&x.module_sha256===sha(Buffer.from(x.module_bytes))),'Exact source-issued modules');
const fixtureFile='dev/artifacts/fast-native-frame/independent-fixtures.json',fixtureBytes=fs.readFileSync(fixtureFile),fixture=JSON.parse(fixtureBytes);
const owner=fs.readFileSync('dev/artifacts/merged-runtime-guard/original-FastNativeFrame.mo');
require(sha(owner)===fixture.sourceSha256&&fixture.patches.length===23,'Historical fixture ownership');
const coordinates=[[0,3],[0,4],[1,5],[2,6],[3,6],[4,6],[5,5],[6,4],[6,3],[6,2],[5,1],[4,0],[3,0],[2,0],[1,1],[0,2]];
const cases=fixture.patches.map(patch=>{
  const values=patch.patchBits.map(word=>Buffer.from(word,'hex').readDoubleLE());
  return {name:patch.name,differences:coordinates.map(([r,c])=>values[r*7+c]-values[24])};
});
for(const [name,indices,value]of [['one-cardinal',[0],18],['two-cardinals',[0,4],18],['two-dark',[4,8],-18],
  ['below-conservative-floor',[0,4],18-3e-8],['inside-rank-tie-bin',[0,4],18-1e-9]]){
  const differences=new Array(16).fill(0);for(const index of indices)differences[index]=value;cases.push({name,differences});
}
// Exhaust all zero/bright/dark combinations of cardinal samples, including
// opposite-only pairs, mixed signs and the adjacent wraparound pair.
for(let pattern=0;pattern<81;pattern++){
  const differences=new Array(16).fill(0);
  for(let cardinal=0;cardinal<4;cardinal++)differences[cardinal*4]=[-18,0,18][Math.floor(pattern/3**cardinal)%3];
  cases.push({name:'ternary-cardinals-'+pattern,differences});
}
// Independent necessary-condition oracle. No FAST score or selector is computed.
for(const c of cases){const floor=(Math.floor(18*1e8)-2)/1e8;
  const cardinal=[c.differences[0],c.differences[4],c.differences[8],c.differences[12]];
  c.expected=cardinal.some((x,i)=>(x>=floor&&cardinal[(i+1)%4]>=floor)
    ||(-x>=floor&&-cardinal[(i+1)%4]>=floor))?1:0;
}
const bundle=await build({stdin:{contents:"export {NativeProgram} from './src/modelica-native-program';",resolveDir:process.cwd()},bundle:true,write:false,platform:'neutral',format:'esm'});
const moduleFile=path.join(directory,'consumer.mjs');fs.writeFileSync(moduleFile,bundle.outputFiles[0].contents);
const {NativeProgram}=await import(pathToFileURL(path.resolve(moduleFile)));
async function verify(NativeProgram,data){
  const require=(ok,message)=>{if(!ok)throw Error(message);};const results=[];
  for(let variant=0;variant<2;variant++){
    const p=await NativeProgram.instantiate(data.artifacts[variant],data.sources[variant]);
    const input=p.input('differences');require(input.length===16&&p.output('possible').length===1&&p.output('scoreFloor').length===1,'Exact gate layout');
    let checks=0;
    for(let round=0;round<2;round++){
      if(round)p.reset();
      for(const c of data.cases){
        input.set(c.differences);const before=new Uint8Array(input.buffer,input.byteOffset,input.byteLength).slice();
        p.evaluate(checks/90);
        require(p.output('possible')[0]===(variant?1:c.expected),'Incorrect eligibility: '+c.name);
        require(p.output('scoreFloor')[0]===(variant?0:(Math.floor(18*1e8)-2)/1e8),'Incorrect conservative floor');
        require(before.every((x,i)=>x===new Uint8Array(input.buffer,input.byteOffset,input.byteLength)[i]),'Input modified');checks++;
      }
    }
    let stale=false;try{await NativeProgram.instantiate(data.artifacts[variant],data.sources[variant]+'\n// stale');}catch(error){stale=String(error).includes('does not match its source');}
    require(stale,'Stale source accepted');results.push({variant,checks,reset:true,inputReadonly:true,staleSourceRejected:true});
  }
  return results;
}
const data={artifacts,sources,cases};let server,browser;
try{
  const node=await verify(NativeProgram,data);
  server=createServer((request,response)=>{if(request.url==='/consumer.mjs'){response.setHeader('Content-Type','text/javascript');response.end(bundle.outputFiles[0].contents);}else response.end('<!doctype html><title>Modelica FAST score gate</title>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-gpu']});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const browserResult=await page.evaluate(async({body,data})=>{
    const code=`const verify=${body};onmessage=async({data})=>{try{const {NativeProgram}=await import(data.base+'/consumer.mjs');postMessage({results:await verify(NativeProgram,data.data)});}catch(error){postMessage({error:String(error.stack||error)});}}`;
    const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'})),worker=new Worker(url);
    try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Owned gate worker timeout')),30000);
      worker.onmessage=({data})=>{clearTimeout(timer);data.error?reject(Error(data.error)):resolve(data);};
      worker.onerror=event=>{clearTimeout(timer);reject(Error(event.message));};worker.postMessage({base:location.origin,data});
    });}finally{worker.terminate();URL.revokeObjectURL(url);}
  },{body:verify.toString(),data});
  const report={status:'SOURCE_ISSUED_FAST_SCORE_GATE_WASM_COMPONENT_PASS',sourceSha256:sha(source),cases:cases.length,
    fixture:{path:fixtureFile,sha256:sha(fixtureBytes),ownerSourceSha256:sha(owner)},
    probeSha256:sha(fs.readFileSync(import.meta.filename)),consumerSha256:sha(bundle.outputFiles[0].contents),
    issued:artifacts.map((x,i)=>({sourceSha256:x.source_sha256,moduleSha256:x.module_sha256,artifactSha256:sha(bytes[i]),compiler:x.compiler})),
    node:{version:process.version,results:node},browser:{version:browser.version(),...browserResult},
    eligibilityChecks:node.reduce((s,x)=>s+x.checks,0)+browserResult.results.reduce((s,x)=>s+x.checks,0),
    scope:'Adjacent-cardinal necessary condition and conservative floor only,109 finite circle fixtures including all81 ternary cardinal patterns, rank ties, separate Modelica threshold edit, reset, readonly inputs and stale-source refusal. No full raster, typed raw ingress, State carry or runtime speed acceptance.',
    fullSlamAccepted:false,tenTimesRealtimeQualified:false};
  fs.writeFileSync(path.join(directory,'numerical-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
