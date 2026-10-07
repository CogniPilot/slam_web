// Numerical component qualification for actual source-issued Rumoca WASM.
// This patch probe cannot qualify full-raster compilation or full browser SLAM.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
const [directory,mode='patch']=process.argv.slice(2);if(!directory||!['patch','differences'].includes(mode))throw Error('Expected directory containing baseline/edited sources and artifacts, optional patch|differences');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const source=fs.readFileSync('models/Vision/Features/FastNativeFrame.mo','utf8');
const fixturePath='dev/artifacts/fast-native-frame/independent-fixtures.json';
const fixtureBytes=fs.readFileSync(fixturePath),fixture=JSON.parse(fixtureBytes);
const fixtureOwner=fs.readFileSync('dev/artifacts/merged-runtime-guard/original-FastNativeFrame.mo');
if(sha(fixtureOwner)!==fixture.sourceSha256||fixture.patches.length!==23)throw Error('Independent historical fixture identity');
const sources=['baseline.mo','edited.mo'].map(name=>fs.readFileSync(path.join(directory,name),'utf8'));
const floor='score := 0.0;';
if(source.split(floor).length!==2||!sources[0].startsWith(source+'\n')
  ||sources[1]!==sources[0].replace(floor,'score := 1.0;'))throw Error('Exact current source and editable score floor required');
const bytes=['baseline.artifact.json','edited.artifact.json'].map(name=>fs.readFileSync(path.join(directory,name))),artifacts=bytes.map(value=>JSON.parse(value));
const model=mode==='patch'?'FastPatchNativeProbe':'FastCircleNativeProbe';
if(artifacts.some((artifact,i)=>artifact.source_sha256!==sha(sources[i])||artifact.model_name!==model
  ||sha(Buffer.from(artifact.module_bytes))!==artifact.module_sha256))throw Error('Source-issued artifact identity');
const bundle=await build({stdin:{contents:"export {NativeProgram} from './src/modelica-native-program';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'neutral'});
const consumerFile=path.join(directory,'consumer.mjs');fs.writeFileSync(consumerFile,bundle.outputFiles[0].contents);
const {NativeProgram}=await import(pathToFileURL(path.resolve(consumerFile)));
async function verify(NativeProgram,data){
  const require=(ok,message)=>{if(!ok)throw Error(message);};const results=[];
  for(let variant=0;variant<data.artifacts.length;variant++){
    const p=await NativeProgram.instantiate(data.artifacts[variant],data.sources[variant]);
    const input=p.input(data.inputName),output=p.output('score');require(input.length===data.inputLength&&output.length===1,'Exact component ABI');
    const ib=new Uint8Array(input.buffer,input.byteOffset,input.byteLength),ob=new Uint8Array(output.buffer,output.byteOffset,output.byteLength);
    let checks=0;
    for(let round=0;round<2;round++){
      if(round)p.reset();
      for(const [i,patch]of data.patches.entries()){
        const words=patch.inputBits.join('');ib.set(Uint8Array.from(words.match(/../g),word=>parseInt(word,16)));
        const before=ib.slice();p.evaluate((round*data.patches.length+i)/90);
        require(ib.every((byte,index)=>byte===before[index]),'Input storage changed');
        const bits=Array.from(ob,byte=>byte.toString(16).padStart(2,'0')).join('');
        const expected=variant===1&&patch.expectedScore<1?'000000000000f03f':patch.expectedScoreBits;
        require(bits===expected,`${variant}/${round}/${patch.name}: ${bits} != ${expected}`);checks++;
      }
    }
    let stale=false;try{await NativeProgram.instantiate(data.artifacts[variant],data.sources[variant]+'\n// stale');}catch(error){stale=String(error).includes('does not match its source');}
    require(stale,'Stale source accepted');results.push({variant,checks,reset:true,inputReadonly:true,staleSourceRejected:true});
  }
  return results;
}
// Independent test packaging only: circle coordinates come from FAST-9, not
// the production stencil. Historical expected score bits are never regenerated.
const coordinates=[[0,3],[0,4],[1,5],[2,6],[3,6],[4,6],[5,5],[6,4],
  [6,3],[6,2],[5,1],[4,0],[3,0],[2,0],[1,1],[0,2]];
const patches=fixture.patches.map(patch=>{
  const values=patch.patchBits.map(word=>Buffer.from(word,'hex').readDoubleLE());
  const inputBits=mode==='patch'?patch.patchBits:coordinates.map(([row,column])=>{
    const bytes=Buffer.alloc(8);bytes.writeDoubleLE(values[row*7+column]-values[24]);return bytes.toString('hex');
  });
  return {...patch,inputBits};
});
const data={artifacts,sources,patches,inputName:mode==='patch'?'gray':'differences',inputLength:mode==='patch'?49:16};let server,browser;
try{
  const node=await verify(NativeProgram,data);
  server=createServer((request,response)=>{if(request.url==='/consumer.mjs'){response.setHeader('Content-Type','text/javascript');response.end(bundle.outputFiles[0].contents);}else response.end('<!doctype html><title>FAST circle WASM component</title>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-gpu']});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result=await page.evaluate(async ({body,data})=>{
    const code=`const verify=${body};onmessage=async event=>{try{const {NativeProgram}=await import(event.data.base+'/consumer.mjs');postMessage({results:await verify(NativeProgram,event.data.data)});}catch(error){postMessage({error:String(error.stack||error)});}}`;
    const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'})),worker=new Worker(url);
    try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Owned patch worker timeout')),30000);
      worker.onmessage=event=>{clearTimeout(timer);event.data.error?reject(Error(event.data.error)):resolve(event.data);};
      worker.onerror=event=>{clearTimeout(timer);reject(Error(event.message));};worker.postMessage({base:location.origin,data});
    });}finally{worker.terminate();URL.revokeObjectURL(url);}
  },{body:verify.toString(),data});
  const report={status:'SOURCE_ISSUED_FAST_CIRCLE_WASM_COMPONENT_PASS',mode,sourceSha256:sha(source),
    fixture:{path:fixturePath,sha256:sha(fixtureBytes),ownerSourceSha256:sha(fixtureOwner)},
    compiler:artifacts.map(artifact=>artifact.compiler),consumerSha256:sha(bundle.outputFiles[0].contents),
    issued:artifacts.map((artifact,i)=>({sourceSha256:sha(sources[i]),artifactSha256:sha(bytes[i]),moduleSha256:artifact.module_sha256,moduleBytes:artifact.module_bytes.length})),
    node:{version:process.version,results:node},browser:{version:browser.version(),...result},
    rawBitChecks:node.reduce((sum,r)=>sum+r.checks,0)+result.results.reduce((sum,r)=>sum+r.checks,0),
    fullRasterCompilationQualified:false,fullSlamAccepted:false,
    scope:`Actual production circle scorer through ${mode==='patch'?'7x7 compatibility input':'16 prepackaged differences (gather excluded)'},23 independent historical patch goldens, signed zero, separately compiled Modelica score-floor edit, repeat/reset/readonly input and stale-source rejection in Node and dedicated Chromium worker. No full-frame/nativeState/runtime SLAM or throughput claim.`};
  fs.writeFileSync(path.join(directory,'numerical-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
