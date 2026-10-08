// Actual browser WASM session qualification; no native compiler or fallback.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {chromium} from '@playwright/test';

const [directory,reportFile]=process.argv.slice(2);
if(!reportFile||fs.existsSync(reportFile))throw Error('COMPILER_DIRECTORY FRESH_REPORT required');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const source=fs.readFileSync('tests/compiler-probes/fixtures/PeriodicControllerClock.mo','utf8');
const js=fs.readFileSync(path.join(directory,'rumoca_bind_wasm.js'));
const wasm=fs.readFileSync(path.join(directory,'rumoca_bind_wasm_bg.wasm'));
const files=new Map([
  ['/compiler.js',['text/javascript',js]],
  ['/compiler.wasm',['application/wasm',wasm]],
]);
const server=createServer((request,response)=>{
  const file=files.get(request.url);
  if(file){response.setHeader('Content-Type',file[0]);response.end(file[1]);return;}
  if(request.url==='/'){response.end('<!doctype html><title>Periodic clock qualification</title>');return;}
  response.statusCode=404;response.end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
const report={recordedAt:new Date().toISOString(),sourceSha256:hash(source),
  compilerModuleSha256:hash(wasm),compilerJsSha256:hash(js),
  probeSha256:hash(fs.readFileSync(import.meta.filename)),
  scope:'Actual dedicated browser worker, live WASM session, periodic events and reset. No SLAM or throughput qualification.',
  fullSlam:false,productionPinChanged:false};
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
  report.browser=browser.version();
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result=await page.evaluate(async source=>{
    const body=`onmessage=async({data})=>{let session;const result={};try{
      const compiler=await import(data.base+'/compiler.js');
      await compiler.default({module_or_path:data.base+'/compiler.wasm'});
      result.compiler={version:compiler.get_version(),revision:compiler.get_git_commit()};
      session=compiler.WasmSimulationSession.withInteractiveOptions(
        data.source,'PeriodicControllerClock',.005,'rk-like',1e-8,1e-6,'[]');
      result.samples=[{time:0,expected:1,actual:session.get('ticks')}];
      for(const time of [.1,.5,1,1.1,2,3]){
        session.advance_to(time);
        result.samples.push({time,expected:Math.round(time/.01)+1,actual:session.get('ticks')});
      }
      session.reset();session.advance_to(3);
      result.resetTicks=session.get('ticks');
      if(result.samples.some(row=>row.actual!==row.expected)||result.resetTicks!==301)
        throw Error('Periodic controller events stopped or reset changed the clock lattice');
      if(typeof session.execution_receipt_json!=='function')throw Error('Execution receipt unavailable');
      result.receipt=JSON.parse(session.execution_receipt_json());
      if(result.receipt.engine!=='interpreter'||result.receipt.refusal!=='no_continuous_states')
        throw Error('Unexpected engine receipt for a discrete-only clock fixture');
      result.status='ACTUAL_BROWSER_PERIODIC_CLOCK_AND_ENGINE_RECEIPT_PASS';
    }catch(error){result.status='ACTUAL_BROWSER_PERIODIC_CLOCK_OR_ENGINE_RECEIPT_FAILED';
      result.error=String(error.stack||error);
    }finally{session?.free();}postMessage(result);}`;
    const url=URL.createObjectURL(new Blob([body],{type:'text/javascript'}));
    const worker=new Worker(url);
    try{return await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Browser periodic clock qualification timed out')),60000);
      worker.onmessage=({data})=>{clearTimeout(timer);resolve(data);};
      worker.onerror=error=>{clearTimeout(timer);reject(Error(error.message));};
      worker.postMessage({base:location.origin,source});
    });}finally{worker.terminate();URL.revokeObjectURL(url);}
  },source);
  Object.assign(report,result);
  if(result.error)process.exitCode=1;
}catch(error){
  report.status='ACTUAL_BROWSER_PERIODIC_CLOCK_OR_ENGINE_RECEIPT_FAILED';
  report.error=String(error.stack||error);process.exitCode=1;
}finally{
  await browser?.close();await new Promise(resolve=>server.close(resolve));
  fs.mkdirSync(path.dirname(reportFile),{recursive:true});
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}
