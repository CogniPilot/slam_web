// Execute a browser-issued module and compare ordered faults across revisions.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const [sourcePath,directory,output,referencePath]=process.argv.slice(2);
if(!output)throw Error('SOURCE ISSUANCE_DIRECTORY NEW_REPORT [REFERENCE_REPORT] required');
assert.ok(!fs.existsSync(output),'Choose a fresh report path');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const source=fs.readFileSync(sourcePath,'utf8');
const receipt=JSON.parse(fs.readFileSync(path.join(directory,'browser.json'),'utf8'));
const artifactBytes=fs.readFileSync(path.join(directory,'artifact.json'));
const artifact=JSON.parse(artifactBytes);
assert.equal(receipt.status,'ACTUAL_BROWSER_COMPILER_NATIVE_PROGRAM_ISSUANCE_AND_ABI_ADMISSION_PASS');
assert.equal(receipt.sourceSha256,sha(source));
assert.equal(receipt.artifactSha256,sha(artifactBytes));
assert.equal(artifact.source_sha256,sha(source));
assert.equal(artifact.module_sha256,sha(Uint8Array.from(artifact.module_bytes)));
assert.equal(receipt.moduleSha256,artifact.module_sha256);
assert.equal(artifact.model_name,'ConditionalCallFaultOrder');
assert.equal(artifact.profile,'native-direct-program-f64-v3');
const bundle=await build({entryPoints:['src/modelica-native-program.ts'],bundle:true,format:'esm',platform:'browser',write:false});
const consumer=bundle.outputFiles[0].contents;
assert.equal(sha(consumer),receipt.consumerBundleSha256);
const server=createServer((request,response)=>{
  if(request.url==='/consumer.js'){response.setHeader('Content-Type','text/javascript');response.end(consumer);}
  else if(request.url==='/'){response.end('<!doctype html><title>Conditional call fault checks</title>');}
  else{response.statusCode=404;response.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const execution=await page.evaluate(async({artifact,source})=>{
    const {NativeProgram}=await import('/consumer.js');
    const program=await NativeProgram.instantiate(artifact,source),abi=artifact.abi;
    const memory=program.memory.buffer;
    const published=new Uint8Array(memory,abi.y_offset,abi.y_count*8);
    const parameters=new Uint8Array(memory,abi.p_offset,abi.p_count*8);
    const lanes=new Uint8Array(memory,abi.input_lanes_offset,abi.input_lanes_bytes);
    const values=program.input('values'),result=program.output('result');
    if(values.length!==3||result.length!==2)throw Error('Unexpected fixture shape');
    const same=(actual,expected,label)=>{
      if(actual.length!==expected.length)throw Error(label+' length differs');
      for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i])throw Error(label+' differs at byte '+i);
    };
    const cases=[
      {name:'valid',first:1,second:1,enabled:true,expected:[22,22]},
      {name:'different-input',first:2,second:1,enabled:true,expected:[33,22]},
      {name:'direct-first-iteration',first:0,second:1,enabled:true,fault:'IndexBounds'},
      {name:'call-first-iteration',first:1,second:0,enabled:true,fault:'IndexBounds'},
      {name:'both-first-iteration',first:0,second:0,enabled:true,fault:'IndexBounds'},
      {name:'unselected-invalid-reads',first:0,second:0,enabled:false,expected:[-10,-20]},
      {name:'direct-second-iteration',first:3,second:1,enabled:true,fault:'IndexBounds'},
      {name:'call-second-iteration',first:1,second:3,enabled:true,fault:'IndexBounds'},
      {name:'both-second-iteration',first:3,second:3,enabled:true,fault:'IndexBounds'},
      {name:'recovery',first:1,second:2,enabled:true,expected:[22,33]},
    ];
    const observations=[];
    for(const [index,test]of cases.entries()){
      values.set([11,22,33]);
      program.integerInput('firstIndex')[0]=BigInt(test.first);
      program.integerInput('secondIndex')[0]=BigInt(test.second);
      program.booleanInput('enabled')[0]=test.enabled?1:0;
      result.set([123.5+index,-987.25-index]);
      const before=published.slice(),pBefore=parameters.slice(),lanesBefore=lanes.slice();
      let fault;
      try{program.evaluate(index/90);}
      catch(error){
        const match=/rejected \((\d+):/.exec(String(error));
        if(!match)throw error;
        fault=artifact.faults.find(site=>site.status===Number(match[1]));
        if(!fault)throw Error('Unmapped native status');
      }
      same(parameters,pBefore,test.name+' readonly parameters');
      same(lanes,lanesBefore,test.name+' readonly typed inputs');
      if(program.memory.buffer!==memory)throw Error('WASM memory changed');
      if(test.fault){
        if(fault?.kind!==test.fault)throw Error(test.name+' expected '+test.fault);
        same(published,before,test.name+' complete output rollback');
        if(!fault.provenance||typeof fault.provenance.source!=='string')throw Error('Missing lossless fault provenance');
        const {start,end}=fault.provenance,encoded=new TextEncoder().encode(source);
        if(start<0||end<start||end>encoded.length)throw Error('Invalid fault source span');
        observations.push({name:test.name,fault,sourceText:new TextDecoder().decode(encoded.slice(start,end)),rollback:true});
      }else{
        if(fault)throw Error(test.name+' unexpectedly faulted');
        same(new Uint8Array(result.buffer,result.byteOffset,result.byteLength),
          new Uint8Array(new Float64Array(test.expected).buffer),test.name+' output');
        observations.push({name:test.name,output:[...result]});
      }
    }
    const identity=name=>JSON.stringify(observations.find(row=>row.name===name).fault.provenance);
    return {observations,firstFaultSourceOrderPreserved:
      identity('direct-first-iteration')===identity('both-first-iteration')
      &&identity('direct-second-iteration')===identity('both-second-iteration'),
      readonlyParametersAndTypedInputs:true,completePublishedOutputRollback:true,
      unselectedFaultingCallsRemainLazy:true,recoveryWithoutReset:true,memoryBufferStable:true};
  },{artifact,source});
  assert.equal(execution.firstFaultSourceOrderPreserved,true,'First fault no longer follows source order');
  const report={status:'ACTUAL_BROWSER_CONDITIONAL_CALL_FAULT_CHECKS_PASS',
    sourceSha256:sha(source),artifactSha256:sha(artifactBytes),moduleSha256:artifact.module_sha256,
    compiler:receipt.compiler,compilerWasmSha256:receipt.compilerModuleSha256,
    browser:browser.version(),consumerBundleSha256:sha(consumer),probeSha256:sha(fs.readFileSync(import.meta.filename)),
    ...execution,scope:'Exact browser-issued executable; ordered fault observations, lazy disabled branch, '
      +'readonly inputs and all published output bytes. No full SLAM or throughput qualification.'};
  if(referencePath){
    const reference=JSON.parse(fs.readFileSync(referencePath,'utf8'));
    assert.equal(reference.status,report.status);
    assert.equal(reference.sourceSha256,report.sourceSha256);
    const semantics=rows=>rows.map(({name,output,fault})=>({name,output,
      fault:fault?{kind:fault.kind,provenance:fault.provenance}:undefined}));
    assert.deepEqual(semantics(report.observations),semantics(reference.observations),'Fault provenance or outputs changed');
    report.referenceReportSha256=sha(fs.readFileSync(referencePath));
    report.referenceSemanticsMatch=true;
  }
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{
  await browser?.close();await new Promise(resolve=>server.close(resolve));
}
