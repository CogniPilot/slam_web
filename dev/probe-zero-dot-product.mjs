// Compare the public session APIs without changing either compiler or source.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {chromium} from '@playwright/test';

const [baseline,candidate,destination]=process.argv.slice(2);
if(!destination||fs.existsSync(destination))throw Error('BASELINE_PACKAGE CANDIDATE_PACKAGE FRESH_REPORT required');
const source=fs.readFileSync('tests/compiler-probes/fixtures/NativeZeroDotProduct.mo','utf8');
const plantSource=fs.readFileSync('models/Vehicles/LabQuadrotor.mo','utf8');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=new Map(),artifacts={};
for(const [name,directory] of [['baseline',baseline],['candidate',candidate]]){
  const js=fs.readFileSync(path.join(directory,'rumoca_bind_wasm.js'));
  const wasm=fs.readFileSync(path.join(directory,'rumoca_bind_wasm_bg.wasm'));
  artifacts[name]={jsSha256:sha(js),wasmSha256:sha(wasm)};
  files.set(`/${name}.js`,['text/javascript',js]);files.set(`/${name}.wasm`,['application/wasm',wasm]);
}
const server=createServer((request,response)=>{
  const file=files.get(request.url);
  if(file){response.setHeader('Content-Type',file[0]);response.end(file[1]);}
  else if(request.url==='/')response.end('<!doctype html><title>Modelica zero dot product</title>');
  else response.writeHead(404).end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
const run=async({base,source,plantSource})=>{
  const rows=[],encode=value=>Object.is(value,-0)?'-0':String(value);
  for(const name of ['baseline','candidate']){
    const compiler=await import(`${base}/${name}.js`);
    await compiler.default({module_or_path:`${base}/${name}.wasm`});
    const configurable=typeof compiler.WasmSimulationSession.withInteractiveConfiguration==='function';
    for(const policy of configurable?['auto','interpreter']:['default']){
      const open=(text,model,initialInputs=[])=>configurable
        ?compiler.WasmSimulationSession.withInteractiveConfiguration(text,model,JSON.stringify({dt:.005,solver:'rk-like',atol:1e-8,rtol:1e-6,execution_policy:policy,initial_inputs:initialInputs}))
        :compiler.WasmSimulationSession.withInteractiveOptions(text,model,.005,'rk-like',1e-8,1e-6,JSON.stringify(initialInputs));
      const session=open(source,'NativeZeroDotProduct');
      let row;
      try{
        const cases=[];
        for(const [index,values] of [[1,0,0],[1,-0,0],[1,1e-12,0],[1,-1e-12,0]].entries()){
          // set_input preserves an intentional -0; JSON input encoding would not.
          values.forEach((v,i)=>session.set_input(`value[${i+1}]`,v));
          session.advance_to((index+1)/180);
          const names=['rotated[1]','rotated[2]','rotated[3]','direct','bearing'];
          const observed=Object.fromEntries(names.map(key=>{
            const value=session.get(key);if(!Number.isFinite(value))throw Error(`Nonfinite ${key}`);
            return [key,encode(value)];
          }));
          cases.push({inputs:values.map(encode),observed});
        }
        row={name,policy,version:compiler.get_version(),revision:compiler.get_git_commit(),cases};
      }finally{session.free();}
      // Observe both APIs on the unchanged full plant. This distinguishes a
      // numerical/compiler change from a JSON serializer-only sign change.
      const plant=open(plantSource,'LabQuadrotor',[['forward',0],['left',0],['up',0],['yaw',0]]);
      try{
        const names=['vehicle.gravity_b[2]','orientation[1,2]','vehicle.R[2,2]','heading','roll'];
        row.plant=[];
        for(let i=0;i<4;i++){
          plant.advance_to((i+1)/180);
          const snapshot=JSON.parse(plant.state_json()).values;
          row.plant.push({time:plant.time(),snapshot:Object.fromEntries(names.map(key=>[key,encode(snapshot[key])])),
            scalar:Object.fromEntries(names.map(key=>[key,encode(plant.get(key))]))});
        }
      }finally{plant.free();}
      rows.push(row);
    }
  }
  return rows;
};
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-gpu']});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const rows=await page.evaluate(async({body,source,plantSource})=>{
    const url=URL.createObjectURL(new Blob([`onmessage=async e=>{try{postMessage({rows:await (${body})(e.data)});}catch(error){postMessage({error:String(error.stack||error)});}}`],{type:'text/javascript'}));
    const worker=new Worker(url);
    try{return await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Zero dot-product worker timeout')),30000);
      worker.onmessage=({data})=>{clearTimeout(timer);data.error?reject(Error(data.error)):resolve(data.rows);};
      worker.onerror=error=>{clearTimeout(timer);reject(Error(error.message));};
      worker.postMessage({source,plantSource,base:location.origin});
    });}finally{worker.terminate();URL.revokeObjectURL(url);}
  },{body:run.toString(),source,plantSource});
  const reference=rows[0].cases,differences=[];
  for(const row of rows.slice(1))for(const [index,item] of row.cases.entries())for(const [key,value] of Object.entries(item.observed)){
    const expected=reference[index].observed[key];
    if(value!==expected)differences.push({compiler:row.name,policy:row.policy,case:index,key,expected,actual:value});
  }
  const plantDifferences=[];
  for(const row of rows.slice(1))for(const [index,item] of row.plant.entries())for(const api of ['scalar','snapshot'])for(const [key,value] of Object.entries(item[api])){
    const expected=rows[0].plant[index][api][key];
    if(value!==expected)plantDifferences.push({compiler:row.name,policy:row.policy,case:index,api,key,expected,actual:value});
  }
  const report={status:'BROWSER_ZERO_DOT_PRODUCT_DIAGNOSTIC_COMPLETE',recordedAt:new Date().toISOString(),browser:browser.version(),sourceSha256:sha(source),plantSourceSha256:sha(plantSource),probeSha256:sha(fs.readFileSync(import.meta.filename)),artifacts,rows,differences,plantDifferences,productionPinChanged:false,
    scope:'Diagnostic reduction using immutable compiler packages in an actual dedicated browser worker. Values are strings to preserve signed zeros in the receipt. Differences describe compiler-version behavior; this does not assert a language requirement for IEEE expression evaluation or qualify the full plant/SLAM.'};
  fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,differences,plantDifferences}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
