// Execute an exact browser-issued copy or fill module; no compiler or fallback.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const [directory,output,model='DescriptorCopyMatrix']=process.argv.slice(2);
if(!output)throw Error('ARRAY_FORMS_DIRECTORY NEW_REPORT required');
assert.ok(['DescriptorCopyMatrix','DescriptorRuntimeFill'].includes(model),'Unsupported execution control');
assert.ok(!fs.existsSync(output),'Choose a fresh report path');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=name=>fs.readFileSync(path.join(directory,name));
const receipt=JSON.parse(read(model+'.json'));
const artifactBytes=read(model+'.artifact.json');
const artifact=JSON.parse(artifactBytes),source=read(model+'.mo').toString();
assert.equal(receipt.status,'ACTUAL_BROWSER_COMPILER_NATIVE_PROGRAM_ISSUANCE_AND_ABI_ADMISSION_PASS');
assert.equal(sha(artifactBytes),receipt.artifactSha256);
assert.equal(sha(source),receipt.sourceSha256);
assert.equal(artifact.module_sha256,receipt.moduleSha256);
const forms=JSON.parse(read('report.json'));
const cells=forms.rows.find(row=>row.model===model)?.cells;
assert.ok(Number.isSafeInteger(cells)&&cells>0);
const bundle=await build({entryPoints:['src/modelica-native-program.ts'],bundle:true,format:'esm',platform:'browser',write:false});
const consumer=bundle.outputFiles[0].contents;
assert.equal(sha(consumer),receipt.consumerBundleSha256);
const server=createServer((request,response)=>{
  if(request.url==='/consumer.js'){response.setHeader('Content-Type','text/javascript');response.end(consumer);}
  else if(request.url==='/'){response.end('<!doctype html><title>Native array-copy execution</title>');}
  else{response.statusCode=404;response.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const execution=await page.evaluate(async({artifact,source,cells,model})=>{
    const {NativeProgram}=await import('/consumer.js');
    const program=await NativeProgram.instantiate(artifact,source);
    const copy=model==='DescriptorCopyMatrix';
    const input=program.input(copy?'pixels':'value'),output=program.output('descriptor'),memory=program.memory.buffer;
    if(input.length!==(copy?cells:1)||output.length!==cells
      ||!(input.byteOffset+input.byteLength<=output.byteOffset||output.byteOffset+output.byteLength<=input.byteOffset))
      throw Error('Array shape or storage separation differs');
    const bytes=view=>new Uint8Array(view.buffer,view.byteOffset,view.byteLength);
    const same=(actual,expected,label)=>{
      if(actual.length!==expected.length)throw Error(label+' length differs');
      for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i])throw Error(label+' differs at byte '+i);
    };
    const special=[0,-0,Number.MIN_VALUE,-Number.MIN_VALUE,Math.PI,-Math.PI,
      Number.MAX_VALUE,-Number.MAX_VALUE,0.5,-0.5];
    const patterns=copy?[i=>((i*13)%257-128)/16,i=>special[i%special.length],
      i=>i%131===0?-0:Math.PI/(i+1)]:special.map(value=>()=>value);
    const snapshots=[];
    for(const [frame,pattern]of patterns.entries()){
      for(let i=0;i<input.length;i++)input[i]=pattern(i);
      const inputSnapshot=bytes(input).slice();
      const expected=copy?inputSnapshot:bytes(new Float64Array(cells).fill(input[0])).slice();
      output.fill(123.5);
      program.evaluate(frame/90);
      same(bytes(output),expected,'output');same(bytes(input),inputSnapshot,'readonly input');
      if(program.memory.buffer!==memory)throw Error('WASM memory changed');
      snapshots.push(bytes(output).slice());
    }
    program.reset();
    for(let i=0;i<input.length;i++)input[i]=patterns[0](i);
    const replayInput=bytes(input).slice();
    output.fill(-123.5);program.evaluate(0);
    same(bytes(output),snapshots[0],'reset replay');
    same(bytes(input),replayInput,'reset replay readonly input');
    if(program.memory.buffer!==memory)throw Error('WASM memory changed during reset/replay');
    return {cells,inputCells:input.length,patterns:patterns.length,checkedOutputValues:cells*(patterns.length+1),
      readonlyInputChecked:true,allOutputBytesCompared:true,signedZeroAndSubnormalChecked:true,
      maximumFiniteChecked:true,resetReplayChecked:true,memoryBufferStable:true};
  },{artifact,source,cells,model});
  const report={status:model==='DescriptorCopyMatrix'?'ACTUAL_BROWSER_ARRAY_COPY_EXECUTION_PASS'
      :'ACTUAL_BROWSER_ARRAY_FILL_EXECUTION_PASS',model,sourceSha256:sha(source),
    artifactSha256:sha(artifactBytes),moduleSha256:artifact.module_sha256,
    compiler:receipt.compiler,compilerWasmSha256:receipt.compilerModuleSha256,
    browser:browser.version(),consumerBundleSha256:sha(consumer),probeSha256:sha(fs.readFileSync(import.meta.filename)),
    ...execution,scope:'Exact previously browser-issued module, all descriptor cells and input bytes. '
      +'Finite patterns include signed zero, subnormals and maximum finite values. No recompilation, numeric fallback, SLAM or throughput qualification.'};
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{
  await browser?.close();await new Promise(resolve=>server.close(resolve));
}
