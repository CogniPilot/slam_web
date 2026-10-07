// Execute the constructor-issued numerical fixture in Chromium and its worker.
// This is a compiler gate, not a SLAM or whole-pipeline throughput measurement.
import {chromium} from '@playwright/test';
import fs from 'node:fs';
import crypto from 'node:crypto';

const [moduleFile, reportFile] = process.argv.slice(2);
if (!moduleFile || !reportFile) throw new Error('MODULE REPORT required');
const bytes = fs.readFileSync(moduleFile);
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH,
  args:['--no-sandbox']});
try {
  const page = await browser.newPage();
  const run = async raw => {
    const module = await WebAssembly.compile(new Uint8Array(raw));
    const imports = WebAssembly.Module.imports(module);
    const exports = WebAssembly.Module.exports(module);
    if (JSON.stringify(exports.map(e=>[e.name,e.kind])) !== JSON.stringify([['memory','memory'],['eval_assignments','function']])) {
      throw new Error('Unexpected public ABI or exported private arena');
    }
    if (imports.some(i=>i.module !== 'env' || !['memory','sin'].includes(i.name))) throw new Error('Unexpected import');
    const count=14_400, yCount=2*count, pStart=yCount*8, tail=(yCount+count)*8;
    const memory=new WebAssembly.Memory({initial:Math.ceil((tail+64)/65536)});
    const sin=[];
    const instance=await WebAssembly.instantiate(module,{env:{memory,sin:value=>{sin.push(value);return Math.sin(value);}}});
    const view=new DataView(memory.buffer), buffer=new Uint8Array(memory.buffer);
    const values=[0,-0,Number.MIN_VALUE,-Number.MIN_VALUE,1e100,-1e100,2.75];
    const expectedBits=value=>{const data=new DataView(new ArrayBuffer(8));data.setFloat64(0,value,true);return data.getBigUint64(0,true);};
    for(let frame=0;frame<3;frame++){
      for(let i=0;i<yCount;i++)view.setFloat64(i*8,-19.75+i*.001,true);
      for(let i=0;i<count;i++)view.setFloat64(pStart+i*8,values[(i+frame)%values.length],true);
      buffer.fill(0xab,tail,tail+64);sin.length=0;
      instance.exports.eval_assignments(0,pStart,0,-1,-1);
      for(let i=0;i<yCount;i++){
        if(view.getBigUint64(i*8,true)!==expectedBits(values[(i%count+frame)%values.length]))throw new Error(`Output ${i}`);
      }
      for(let i=0;i<count;i++)if(view.getBigUint64(pStart+i*8,true)!==expectedBits(values[(i+frame)%values.length]))throw new Error(`Parameter ${i}`);
      if(buffer.slice(tail,tail+64).some(v=>v!==0xab))throw new Error('Public scratch modified');
      if(sin.length!==2 || !Object.is(sin[0],-19.75+count*.001) || !Object.is(sin[1],-19.75))throw new Error('Original prefix or issued order changed');
    }
    for(const [y,p] of [[1,pStart],[0,0],[memory.buffer.byteLength-8,pStart]]){
      const before=buffer.slice();let trapped=false;
      try{instance.exports.eval_assignments(y,p,0,-1,-1);}catch(error){if(!(error instanceof WebAssembly.RuntimeError))throw error;trapped=true;}
      if(!trapped || before.some((value,i)=>value!==buffer[i]))throw new Error('Guard failed before publication');
    }
    const steps=1000;
    for(let i=0;i<50;i++)instance.exports.eval_assignments(0,pStart,0,-1,-1);
    sin.length=0;
    const start=performance.now();
    for(let i=0;i<steps;i++)instance.exports.eval_assignments(0,pStart,0,-1,-1);
    const elapsedMs=performance.now()-start;
    return {status:'PASS',frames:3,valuesPerFrame:yCount,steps,elapsedMs,msPerStep:elapsedMs/steps,imports,exports};
  };
  const raw=Array.from(bytes);
  const main=await page.evaluate(run,raw);
  const worker=await page.evaluate(async({source,raw})=>{
    const url=URL.createObjectURL(new Blob([`onmessage=async event=>{try{postMessage({result:await (${source})(event.data)});}catch(error){postMessage({error:String(error.stack)});}};`],{type:'text/javascript'}));
    const worker=new Worker(url);
    try{return await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Worker gate timed out')),10000);
      worker.onmessage=event=>{clearTimeout(timer);event.data.error?reject(new Error(event.data.error)):resolve(event.data.result);};
      worker.onerror=error=>{clearTimeout(timer);reject(new Error(error.message));};
      worker.postMessage(raw);
    });}finally{worker.terminate();URL.revokeObjectURL(url);}
  },{source:run.toString(),raw});
  const report={recordedAt:new Date().toISOString(),status:'PASS',browser:browser.version(),
    module:{bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')},main,worker,
    scope:'Construction-issued direct array fixture; not actual filter, SLAM, app integration or whole-pipeline throughput'};
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}finally{await browser.close();}
