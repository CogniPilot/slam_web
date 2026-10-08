import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
const [directory,output]=process.argv.slice(2);
if(!output)throw Error('COMPILER_DIRECTORY NEW_REPORT required');
assert.ok(!fs.existsSync(output));
const source=fs.readFileSync('tests/compiler-probes/fixtures/AssertionOutputProbe.mo','utf8');
const js=fs.readFileSync(path.join(directory,'rumoca_bind_wasm.js')),wasm=fs.readFileSync(path.join(directory,'rumoca_bind_wasm_bg.wasm'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const files=new Map([['/compiler.js',['text/javascript',js]],['/compiler.wasm',['application/wasm',wasm]]]);
const server=createServer((request,response)=>{const file=files.get(request.url);if(file){response.setHeader('Content-Type',file[0]);response.end(file[1]);}else response.end('<!doctype html><title>Assertion outputs</title>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result=await page.evaluate(async source=>{
    const body=`onmessage=async({data:source})=>{try{
      const compiler=await import(location.origin+'/compiler.js');
      await compiler.default({module_or_path:location.origin+'/compiler.wasm'});
      const rows=[];
      for(const policy of ['auto','interpreter']){
        const session=compiler.WasmSimulationSession.withInteractiveConfiguration(source,'AssertionOutputProbe',JSON.stringify({dt:.005,solver:'rk-like',atol:1e-8,rtol:1e-6,initial_inputs:[['command',1]],execution_policy:policy}));
        try{
          const receipts=[{time:0,receipt:JSON.parse(session.execution_receipt_json())}];
          for(let step=1;step<=100;step++){
            session.advance_to(step/100);
            if(step===10||step===100)receipts.push({time:session.time(),receipt:JSON.parse(session.execution_receipt_json())});
          }
          const values=JSON.parse(session.state_json()).values;
          if(Math.abs(values.x-Math.exp(-1))>1e-6)throw Error('Incorrect trajectory');
          let fault,invalid;
          try{
            invalid=compiler.WasmSimulationSession.withInteractiveConfiguration(source,'AssertionOutputProbe',JSON.stringify({dt:.005,solver:'rk-like',atol:1e-8,rtol:1e-6,initial_inputs:[['command',-1]],execution_policy:policy}));
            invalid.advance_to(.01);
          }catch(error){fault=String(error);}finally{invalid?.free();}
          if(!fault?.includes('Command must be positive'))throw Error('Assertion was not preserved: '+fault);
          session.reset();session.advance_to(.1);
          const reset=JSON.parse(session.state_json());
          if(Math.abs(reset.values.x-Math.exp(-.1))>1e-6)throw Error('Reset did not recover');
          rows.push({policy,values,receipts,fault,reset});
        }finally{session.free();}
      }
      postMessage({compiler:{version:compiler.get_version(),revision:compiler.get_git_commit()},rows});
    }catch(error){postMessage({error:String(error.stack||error)})}}`;
    const url=URL.createObjectURL(new Blob([body],{type:'text/javascript'})),worker=new Worker(url);
    try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Assertion probe timed out')),30000);worker.onmessage=({data})=>{clearTimeout(timer);resolve(data);};worker.onerror=event=>{clearTimeout(timer);reject(Error(event.message));};worker.postMessage(source);});}
    finally{worker.terminate();URL.revokeObjectURL(url);}
  },source);
  if(result.error)throw Error(result.error);
  assert.deepEqual(result.rows[0].values,result.rows[1].values);
  assert.deepEqual(result.rows[0].reset,result.rows[1].reset);
  const report={status:'ACTUAL_BROWSER_ASSERTION_OUTPUT_POLICY_PARITY_PASS',...result,sourceSha256:hash(source),compilerWasmSha256:hash(wasm),compilerJsSha256:hash(js),probeSha256:hash(fs.readFileSync(import.meta.filename)),scope:'Small compiler regression reproducer only; both policies retain the Modelica assert, reject invalid initialization and reset a valid session. Declines remain explicit; no compiled-coverage, post-fault rollback, full SLAM or throughput qualification.'};
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
