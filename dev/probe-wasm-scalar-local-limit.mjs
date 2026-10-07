// Browser-engine boundary probe; this does not compile or benchmark Rumoca.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';

const directory=process.argv[2]??path.join(os.homedir(),'scratch/slam_web/tmp/wasm-scalar-local-limit');
fs.mkdirSync(directory,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const uint=value=>{
  const bytes=[];
  do{let byte=value&127;value=Math.floor(value/128);if(value)byte|=128;bytes.push(byte);}while(value);
  return bytes;
};
const vector=entries=>[...uint(entries.length),...entries.flat()];
const section=(id,bytes)=>[id,...uint(bytes.length),...bytes];
function module(extraLocals){
  // Same three parameters and seven fixed locals as the typed-call emitter.
  const type=vector([[0x60,...vector([[0x7f],[0x7f],[0x7f]]),...vector([[0x7f]])]]);
  const functions=vector([[0]]),exports=vector([[4,116,101,115,116,0,0]]);
  const locals=[[1,0x7f],[4,0x7e],[2,0x7c]];
  if(extraLocals)locals.push([...uint(extraLocals),0x7c]);
  const body=[...vector(locals),0x20,0,0x0b];
  return Uint8Array.from([0,97,115,109,1,0,0,0,...section(1,type),...section(3,functions),
    ...section(7,exports),...section(10,vector([[...uint(body.length),...body]]))]);
}
const cases=[0,49989,49990,49991].map(extraLocals=>{
  const bytes=module(extraLocals),name=`extra-${extraLocals}.wasm`;
  fs.writeFileSync(path.join(directory,name),bytes);
  return {extraLocals,parameters:3,fixedLocals:7,totalLocalsAndParameters:extraLocals+10,
    expectedValid:extraLocals<=49990,moduleSha256:sha(bytes),file:name,bytes:Array.from(bytes)};
});
async function verify(cases){
  const result=[];
  for(const fixture of cases){
    const bytes=Uint8Array.from(fixture.bytes),valid=WebAssembly.validate(bytes);
    let value,error;
    try{value=(await WebAssembly.instantiate(bytes)).instance.exports.test(42,0,0);}
    catch(reason){error={name:reason.name,message:reason.message};}
    if(valid!==fixture.expectedValid||(valid?value!==42||error:error?.name!=='CompileError'))
      throw Error(`Unexpected local-limit behavior at ${fixture.totalLocalsAndParameters}`);
    result.push({extraLocals:fixture.extraLocals,totalLocalsAndParameters:fixture.totalLocalsAndParameters,valid,value,error});
  }
  return result;
}
let browser;
try{
  const node=await verify(cases);
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-gpu']});
  const page=await browser.newPage();
  const worker=await page.evaluate(async({body,cases})=>{
    const code=`const verify=${body};onmessage=async e=>{try{postMessage({result:await verify(e.data)})}catch(e){postMessage({error:String(e.stack||e)})}}`;
    const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'})),worker=new Worker(url);
    try{return await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Local-limit worker timed out')),30000);
      worker.onmessage=e=>{clearTimeout(timer);e.data.error?reject(Error(e.data.error)):resolve(e.data.result);};
      worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};worker.postMessage(cases);
    });}finally{worker.terminate();URL.revokeObjectURL(url);}
  },{body:verify.toString(),cases});
  const report={schemaVersion:1,status:'NODE_CHROMIUM_TYPED_CALL_LOCAL_BUDGET_BOUNDARY_PASS',recordedAt:new Date().toISOString(),
    probeSha256:sha(fs.readFileSync(import.meta.filename)),node:{engine:process.version,v8:process.versions.v8,result:node},
    browser:{version:browser.version(),execution:'Dedicated worker; GPU disabled',result:worker},
    cases:cases.map(({bytes,...fixture})=>fixture),
    source:{url:'https://chromium.googlesource.com/v8/v8/+/refs/heads/main/src/wasm/wasm-limits.h',
      inspectedBlob:'4f32fe1392cdd8411ae03a24342ce9598244dee6',declaredLimit:50000},
    scope:'Tiny hand-encoded modules with the typed-call emitter parameter/fixed-local counts. Exact acceptance/rejection and successful execution at the engine limit. No Rumoca compilation, scalar-plan semantics, local-allocation implementation, runtime speedup, other-browser or full-SLAM claim.'};
  fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,browser:report.browser.version,maximumExtraLocals:49990}));
}catch(error){
  fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify({status:'FAIL',error:String(error.stack||error)},null,2)+'\n');throw error;
}finally{if(browser)await browser.close();}
