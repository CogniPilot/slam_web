// Source-to-WASM component gate in an actual browser compiler worker.
// Fixtures contain independent expected values; no production numerical fallback.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const [directory,sourceFile,model,fixtureFile,reportFile]=process.argv.slice(2);
if(!reportFile)throw new Error('COMPILER_DIRECTORY SOURCE MODEL FIXTURES REPORT required');
const sha=value=>createHash('sha256').update(value).digest('hex');
const source=fs.readFileSync(sourceFile,'utf8'),fixture=JSON.parse(fs.readFileSync(fixtureFile,'utf8'));
if(sha(source)!==fixture.sourceSha256)throw new Error('Fixtures belong to a different source');
const consumer=await build({entryPoints:['src/modelica-native-program.ts'],bundle:true,format:'esm',platform:'browser',write:false});
const files=new Map([
  ['/compiler.js',['text/javascript',fs.readFileSync(path.join(directory,'rumoca_bind_wasm.js'))]],
  ['/compiler.wasm',['application/wasm',fs.readFileSync(path.join(directory,'rumoca_bind_wasm_bg.wasm'))]],
  ['/consumer.js',['text/javascript',consumer.outputFiles[0].contents]],
]);
const server=createServer((request,response)=>{
  if(request.url==='/'){response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Modelica component review</title>');return;}
  const file=files.get(request.url);if(!file){response.statusCode=404;response.end();return;}
  response.setHeader('Content-Type',file[0]);response.end(file[1]);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
try{
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const run=async(data)=>{
    const {NativeProgram}=await import(`${data.base}/consumer.js`);
    const compiler=await import(`${data.base}/compiler.js`);await compiler.default({module_or_path:`${data.base}/compiler.wasm`});
    const require=(ok,message)=>{if(!ok)throw new Error(message);};
    const check=async(artifact,text,edited=false)=>{
      require(artifact.abi.y_count===data.fixture.yCount&&artifact.abi.p_count===data.fixture.pCount,'Unexpected storage size');
      require(JSON.stringify(artifact.var_layout)===JSON.stringify(data.fixture.layout),'Compiler changed fixture layout');
      const program=await NativeProgram.instantiate(artifact,text),a=artifact.abi;
      const p=new Float64Array(program.memory.buffer,a.p_offset,a.p_count),y=new Float64Array(program.memory.buffer,0,a.y_count);
      const cases=[];
      for(const item of data.fixture.cases){
        p.set(item.inputs.map(v=>typeof v==='number'?v:Number(v)));y.fill(NaN);
        const before=new Uint8Array(p.buffer,p.byteOffset,p.byteLength).slice();
        program.evaluate(cases.length/90);
        const valid=item.expected.find(e=>e.index===data.fixture.edit.validIndex)?.value;
        for(const expected of item.expected){
          const wanted=expected.value+(edited&&valid===1&&expected.index===data.fixture.edit.outputIndex?1:0);
          require(Number.isFinite(y[expected.index])&&Math.abs(y[expected.index]-wanted)<expected.tolerance,
            `${item.name}/${expected.index}: ${y[expected.index]} != ${wanted}`);
        }
        require(new Uint8Array(p.buffer,p.byteOffset,p.byteLength).every((v,i)=>v===before[i]),'Inputs mutated');
        cases.push({name:item.name,outputsChecked:item.expected.length});
      }
      program.reset();p.set(data.fixture.cases[0].inputs.map(v=>typeof v==='number'?v:Number(v)));program.evaluate(0);
      require(y[data.fixture.edit.validIndex]===1,'Reset failed');return cases;
    };
    const start=performance.now(),artifact=JSON.parse(compiler.prepare_native_program(data.source,data.model));
    const compileMs=performance.now()-start,cases=await check(artifact,data.source);
    const editedSource=data.source.replace(data.fixture.edit.from,data.fixture.edit.to);
    require(editedSource!==data.source,'Source edit missing');
    const edited=JSON.parse(compiler.prepare_native_program(editedSource,data.model));
    require(edited.module_sha256!==artifact.module_sha256,'Edited source reused old executable');
    let staleRefused=false;try{await NativeProgram.instantiate(artifact,editedSource);}catch(error){staleRefused=String(error).includes('does not match its source');}
    require(staleRefused,'Stale artifact accepted');
    const restored=JSON.parse(JSON.stringify({source:editedSource,artifact:edited}));
    const editedCases=await check(restored.artifact,restored.source,true);
    return {compileMs,cases,editedCases,staleRefused,jsonReload:true,compiler:{version:compiler.get_version(),revision:compiler.get_git_commit()},
      artifact:{sourceSha256:artifact.source_sha256,moduleSha256:artifact.module_sha256,moduleBytes:artifact.module_bytes.length},
      editedArtifact:{sourceSha256:edited.source_sha256,moduleSha256:edited.module_sha256}};
  };
  const result=await page.evaluate(async({body,payload})=>{
    const url=URL.createObjectURL(new Blob([`const run=${body};onmessage=async e=>{try{postMessage({result:await run(e.data)})}catch(error){postMessage({error:String(error.stack||error)})}}`],{type:'text/javascript'}));
    const worker=new Worker(url);
    try{return await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Component worker timed out')),60000);
      worker.onmessage=({data})=>{clearTimeout(timer);data.error?reject(new Error(data.error)):resolve(data.result);};
      worker.onerror=error=>{clearTimeout(timer);reject(new Error(error.message));};worker.postMessage({...payload,base:location.origin});
    });}finally{worker.terminate();URL.revokeObjectURL(url);}
  },{body:run.toString(),payload:{source,model,fixture}});
  const report={status:'BROWSER_COMPILER_COMPONENT_NUMERICAL_SOURCE_EDIT_PASS',recordedAt:new Date().toISOString(),model,browser:browser.version(),
    compilerModuleSha256:sha(files.get('/compiler.wasm')[1]),fixtureSha256:sha(fs.readFileSync(fixtureFile)),...result,
    runtimeIntegrated:false,productionPinChanged:false,scope:'Actual dedicated compiler worker, independent fixtures, edited-source execution and JSON artifact reload. Full SLAM integration pending.'};
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
