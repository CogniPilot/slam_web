import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const directory=process.env.RUMOCA_NATIVE_SOURCE_MODULE_DIR;
const sourcePath=process.env.RUMOCA_NATIVE_SOURCE_FIXTURE;
const integerDirectory=process.env.RUMOCA_NATIVE_INTEGER_MODULE_DIR;
const integerSourcePath=process.env.RUMOCA_NATIVE_INTEGER_SOURCE_FIXTURE;
const tensorDirectory=process.env.RUMOCA_NATIVE_TENSOR_MODULE_DIR;
const tensorSourcePath=process.env.RUMOCA_NATIVE_TENSOR_SOURCE_FIXTURE;
const digest=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');

test('source-issued full-image tensor recurrence preserves sequential updates in browser WASM',async({page,browser})=>{
  test.skip(!tensorDirectory||!tensorSourcePath,'Requires unchanged tensor source and actual source-issued modules');
  const original=await readFile(tensorSourcePath!,'utf8'),artifacts=[];
  for(const gain of [1,2]){
    const bytes=await readFile(path.join(tensorDirectory!,`tensor-gain-${gain}.wasm`));
    const manifest=JSON.parse(await readFile(path.join(tensorDirectory!,`tensor-gain-${gain}.json`),'utf8'));
    const source=original.replace('gain = 1.0',`gain = ${gain}.0`);
    expect(manifest.source).toBe(source);expect(manifest.source_sha256).toBe(digest(source));expect(manifest.module_sha256).toBe(digest(bytes));
    expect(manifest.variant).toEqual({gain,tensor:true});expect(manifest.producer_source_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Number.isSafeInteger(manifest.late_failure_status)&&manifest.late_failure_status>0).toBe(true);
    expect(manifest.late_failure_kind).toBe('IntegerConversion');
    const conversion='integer(finalValue)',start=Buffer.byteLength(source.slice(0,source.indexOf(conversion)));
    expect(manifest.late_failure_source_span).toMatchObject({start,end:start+Buffer.byteLength(conversion)});
    expect(typeof manifest.late_failure_source_span.source_id).toBe('string');
    expect(manifest.abi).toEqual({export:'eval_typed_call',memory_import:'env.memory',arguments:['inputPtr:i32','outputPtr:i32','scratchPtr:i32'],result:'status:i32'});
    artifacts.push({bytes:[...bytes],manifest});
  }
  await page.setContent('<!doctype html><title>Source-issued tensor Modelica WASM</title>');
  const report=await page.evaluate(async artifacts=>{
    const pixelCount=160*90,results=[];
    for(const {bytes,manifest} of artifacts){
      const {input_bytes:inputBytes,output_bytes:outputBytes,scratch_bytes:scratchBytes}=manifest.layout;
      if(inputBytes!==(pixelCount+2)*8||outputBytes!==32||![inputBytes,outputBytes,scratchBytes].every(v=>Number.isSafeInteger(v)&&v>=0&&v%8===0))throw new Error('Tensor source ABI shape mismatch');
      const output=inputBytes+8,scratch=output+outputBytes+8,pages=Math.ceil((scratch+scratchBytes+8)/65536);
      const memory=new WebAssembly.Memory({initial:pages,maximum:pages}),raw=new Uint8Array(memory.buffer),cells=new Float64Array(memory.buffer);
      const module=await WebAssembly.compile(new Uint8Array(bytes)),imports=WebAssembly.Module.imports(module);
      if(imports.length!==1||imports[0].module!=='env'||imports[0].name!=='memory'||imports[0].kind!=='memory')throw new Error('Unexpected tensor imports');
      const instance=await WebAssembly.instantiate(module,{env:{memory}}),execute=instance.exports.eval_typed_call as (input:number,output:number,scratch:number)=>number;
      const gain=manifest.variant.gain;
      const expected=(values:Float64Array,initial:number)=>{
        let first=initial,second=initial,third=-0;
        for(const value of values){second=first;first=first+gain*value;third=third+value;}
        const result=new Uint8Array(32),view=new DataView(result.buffer);
        [first,second,third,-9].forEach((value,i)=>view.setFloat64(i*8,value,true));return result;
      };
      const same=(a:Uint8Array,b:Uint8Array)=>a.length===b.length&&a.every((value,i)=>value===b[i]);
      const cases=[
        {name:'dyadic',values:Float64Array.from({length:pixelCount},(_,i)=>(i%17)/8-1),initial:7.25},
        {name:'ordered cancellation',values:Float64Array.from({length:pixelCount},(_,i)=>[1e16,1,-1e16,3][i%4]),initial:7.25},
        {name:'signed zero',values:new Float64Array(pixelCount).fill(-0),initial:-0},
      ];
      if(gain===1){const values=new Float64Array(pixelCount);values[0]=Number.MAX_VALUE;values[1]=-Number.MAX_VALUE;cases.push({name:'source IEEE overflow',values,initial:Number.MAX_VALUE});}
      const outcomes=[];
      for(const {name,values,initial} of cases){
        raw.fill(0x37);cells.set(values);cells[pixelCount]=initial;cells[pixelCount+1]=-8.3;
        const input=raw.slice(0,inputBytes),guards=[raw.slice(inputBytes,output),raw.slice(output+outputBytes,scratch)],oracle=expected(values,initial);
        raw.fill(0xa5,output,output+outputBytes);raw.fill(0x7b,scratch,scratch+scratchBytes);
        const status=execute(0,output,scratch);
        if(status!==0||!same(raw.slice(output,output+outputBytes),oracle)||!same(raw.slice(0,inputBytes),input))throw new Error(`Tensor sequential update mismatch: ${name}`);
        cells[pixelCount+1]=Infinity;const failedInput=raw.slice(0,inputBytes);raw.fill(0xa5,output,output+outputBytes);
        const failure=execute(0,output,scratch);
        if(failure!==manifest.late_failure_status||!raw.slice(output,output+outputBytes).every(v=>v===0xa5)||!same(raw.slice(0,inputBytes),failedInput))throw new Error('Tensor late conversion fault was not atomic');
        cells[pixelCount+1]=-8.3;
        if(execute(0,output,scratch)!==0||!same(raw.slice(output,output+outputBytes),oracle)||!same(raw.slice(0,inputBytes),input))throw new Error('Tensor recovery mismatch');
        if(!same(raw.slice(inputBytes,output),guards[0])||!same(raw.slice(output+outputBytes,scratch),guards[1]))throw new Error('Tensor ABI guards overwritten');
        outcomes.push({name,status,failure,bitExact:true,atomic:true,recovery:true});
      }
      const input=new Float64Array(pixelCount+2);input.fill(1,0,pixelCount);input[pixelCount]=7.25;input[pixelCount+1]=-8.3;
      for(let i=0;i<20;i++){cells.set(input);if(execute(0,output,scratch)!==0)throw new Error('Tensor warmup fault');}
      const iterations=1000,started=performance.now();let checksum=0;
      for(let i=0;i<iterations;i++){
        cells.set(input);if(execute(0,output,scratch)!==0)throw new Error('Tensor benchmark fault');
        const owned=raw.slice(output,output+outputBytes);checksum^=owned[0];
      }
      const elapsedMs=performance.now()-started;
      if(!same(raw.slice(output,output+outputBytes),expected(input.subarray(0,pixelCount),7.25)))throw new Error('Tensor benchmark output mismatch');
      results.push({gain,moduleBytes:bytes.length,layout:manifest.layout,outcomes,iterations,checksum,elapsedMs,meanInputExecuteOutputMs:elapsedMs/iterations});
    }
    return {results,scope:'Unchanged source-issued tensor function plus source edit; not full Modelica model schedule, feature detector or SLAM'};
  },artifacts);
  expect(report.results).toHaveLength(2);expect(report.results.every(result=>result.outcomes.every(outcome=>outcome.bitExact&&outcome.atomic&&outcome.recovery))).toBe(true);
  console.log('SOURCE TENSOR BROWSER WASM',JSON.stringify({browser:browser.version(),...report}));
});

test('source-issued full-image ordered Modelica functions execute exactly in browser WASM',async({page,browser})=>{
  test.skip(!directory||!sourcePath,'Requires actual isolated compiler source fixture and exported source-issued modules/manifests');
  const original=await readFile(sourcePath!,'utf8'),artifacts=[];
  for(const [gain,subtract] of [[1,false],[2,false],[1,true]] as const){
    const basename=`gain-${gain}-subtract-${subtract}`;
    const bytes=await readFile(path.join(directory!,`${basename}.wasm`));
    const manifest=JSON.parse(await readFile(path.join(directory!,`${basename}.json`),'utf8'));
    const source=subtract?original.replace('total + gain*values','total - gain*values'):original.replace('gain = 1.0',`gain = ${gain}.0`);
    expect(manifest.source_sha256).toBe(digest(source));expect(manifest.module_sha256).toBe(digest(bytes));
    expect(manifest.source).toBe(source);
    expect(manifest.abi).toEqual({export:'eval_typed_call',memory_import:'env.memory',arguments:['inputPtr:i32','outputPtr:i32','scratchPtr:i32'],result:'status:i32'});
    expect(manifest.producer_source_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.variant).toEqual({gain,subtract});
    artifacts.push({bytes:[...bytes],manifest});
  }
  await page.setContent('<!doctype html><title>Source-issued Modelica WASM execution</title>');
  const report=await page.evaluate(async artifacts=>{
    const pixelCount=160*90,results=[];
    for(const {bytes,manifest} of artifacts){
      const {input_bytes:inputBytes,output_bytes:outputBytes,scratch_bytes:scratchBytes}=manifest.layout;
      if(inputBytes!==(pixelCount+2)*8||outputBytes!==16)throw new Error('Source fixture ABI shape mismatch');
      if(![inputBytes,outputBytes,scratchBytes].every(n=>Number.isSafeInteger(n)&&n>=0&&n%8===0))throw new Error('Invalid issued layout');
      const output=inputBytes+8,scratch=output+outputBytes+8,pages=Math.ceil((scratch+scratchBytes+8)/65536);
      const memory=new WebAssembly.Memory({initial:pages,maximum:pages}),cells=new Float64Array(memory.buffer),raw=new Uint8Array(memory.buffer);
      const module=await WebAssembly.compile(new Uint8Array(bytes)),imports=WebAssembly.Module.imports(module);
      if(imports.length!==1||imports[0].module!=='env'||imports[0].name!=='memory'||imports[0].kind!=='memory')throw new Error('Unexpected source module imports');
      const instance=await WebAssembly.instantiate(module,{env:{memory}});
      const execute=instance.exports.eval_typed_call as (input:number,output:number,scratch:number)=>number;
      const {gain,subtract}=manifest.variant;
      const oracle=(values:Float64Array,initial:number)=>{
        let total=initial;for(const value of values)total=subtract?total-gain*value:total+gain*value;return total;
      };
      const same=(a:Uint8Array,b:Uint8Array)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
      const cases=[
        {name:'dyadic',values:Float64Array.from({length:pixelCount},(_,i)=>(i%17)/8-1),initial:7.25},
        {name:'ordered cancellation',values:Float64Array.from({length:pixelCount},(_,i)=>[1e16,1,-1e16,3][i%4]),initial:7.25},
        {name:'signed zero',values:new Float64Array(pixelCount).fill(-0),initial:-0},
      ];
      if(gain===1&&!subtract){
        const values=new Float64Array(pixelCount);values[0]=Number.MAX_VALUE;values[1]=-Number.MAX_VALUE;
        cases.push({name:'source IEEE overflow',values,initial:Number.MAX_VALUE});
      }
      const outcomes=[];
      for(const {name,values,initial} of cases){
        raw.fill(0x37);cells.set(values);cells[pixelCount]=initial;cells[pixelCount+1]=-8.3;
        const input=raw.slice(0,inputBytes),guards=[raw.slice(inputBytes,output),raw.slice(output+outputBytes,scratch)];
        raw.fill(0xa5,output,output+outputBytes);raw.fill(0x7b,scratch,scratch+scratchBytes);
        const expected=new Uint8Array(16),view=new DataView(expected.buffer);
        view.setFloat64(0,oracle(values,initial),true);view.setFloat64(8,-9,true);
        const status=execute(0,output,scratch);
        if(status!==0||!same(raw.slice(output,output+outputBytes),expected)||!same(raw.slice(0,inputBytes),input))throw new Error(`Source recurrence mismatch: ${name}`);
        if(!same(raw.slice(inputBytes,output),guards[0])||!same(raw.slice(output+outputBytes,scratch),guards[1]))throw new Error('ABI guard overwritten');
        cells[pixelCount+1]=Infinity;raw.fill(0xa5,output,output+outputBytes);
        const failure=execute(0,output,scratch);
        if(!failure||!raw.slice(output,output+outputBytes).every(v=>v===0xa5))throw new Error('Late fault published partial output');
        cells[pixelCount+1]=-8.3;
        if(execute(0,output,scratch)!==0||!same(raw.slice(output,output+outputBytes),expected))throw new Error('Failure recovery changed source result');
        outcomes.push({name,status,failure,bitExact:true,atomic:true,recovery:true});
      }
      const input=new Float64Array(pixelCount+2);input.fill(1,0,pixelCount);input[pixelCount]=7.25;input[pixelCount+1]=-8.3;
      const iterations=1000;
      for(let i=0;i<20;i++){cells.set(input);if(execute(0,output,scratch)!==0)throw new Error('Warmup fault');}
      const started=performance.now();let checksum=0;
      for(let i=0;i<iterations;i++){
        cells.set(input);if(execute(0,output,scratch)!==0)throw new Error('Benchmark fault');
        // Include complete input copy and owned output copy in this component benchmark.
        const ownedOutput=raw.slice(output,output+outputBytes);checksum^=ownedOutput[0];
      }
      const elapsedMs=performance.now()-started;
      if(!Object.is(new DataView(memory.buffer).getFloat64(output,true),oracle(input.subarray(0,pixelCount),7.25)))throw new Error('Final benchmark result mismatch');
      results.push({gain,subtract,moduleBytes:bytes.length,layout:manifest.layout,outcomes,iterations,elapsedMs,checksum,meanInputExecuteOutputMs:elapsedMs/iterations});
    }
    return {results,scope:'Source-issued single-function component; not full SLAM or whole simulation throughput'};
  },artifacts);
  expect(report.results).toHaveLength(3);expect(report.results.every(r=>r.outcomes.every(c=>c.bitExact&&c.atomic&&c.recovery))).toBe(true);
  console.log('SOURCE MODELICA BROWSER WASM',JSON.stringify({browser:browser.version(),...report}));
});

test('source-issued Integer array recurrence preserves all64-bit inputs and checked fault atomicity in browser WASM',async({page,browser})=>{
  test.skip(!integerDirectory||!integerSourcePath,'Requires source-issued Integer artifacts and unchanged source fixture');
  const source=await readFile(integerSourcePath!,'utf8');
  const bytes=await readFile(path.join(integerDirectory!,'integer-seed.wasm'));
  const manifest=JSON.parse(await readFile(path.join(integerDirectory!,'integer-seed.json'),'utf8'));
  expect(manifest.source).toBe(source);expect(manifest.source_sha256).toBe(digest(source));expect(manifest.module_sha256).toBe(digest(bytes));
  expect(manifest.variant).toEqual({integer_seed:true});
  expect(manifest.abi).toEqual({export:'eval_typed_call',memory_import:'env.memory',arguments:['inputPtr:i32','outputPtr:i32','scratchPtr:i32'],result:'status:i32'});
  await page.setContent('<!doctype html><title>Source-issued Integer WASM</title>');
  const report=await page.evaluate(async({bytes,manifest})=>{
    const pixelCount=160*90,maximum=(1n<<63n)-1n,minimum=-(1n<<63n);
    const {input_bytes:inputBytes,output_bytes:outputBytes,scratch_bytes:scratchBytes}=manifest.layout;
    if(inputBytes!==(pixelCount+1)*8||outputBytes!==8||![inputBytes,outputBytes,scratchBytes].every(v=>Number.isSafeInteger(v)&&v>=0&&v%8===0))throw new Error('Integer fixture ABI mismatch');
    const output=inputBytes+8,scratch=output+outputBytes+8,pages=Math.ceil((scratch+scratchBytes+8)/65536);
    const memory=new WebAssembly.Memory({initial:pages,maximum:pages}),raw=new Uint8Array(memory.buffer),cells=new BigInt64Array(memory.buffer);
    const module=await WebAssembly.compile(new Uint8Array(bytes)),imports=WebAssembly.Module.imports(module);
    if(imports.length!==1||imports[0].kind!=='memory'||imports[0].module!=='env'||imports[0].name!=='memory')throw new Error('Unexpected Integer module imports');
    const instance=await WebAssembly.instantiate(module,{env:{memory}}),execute=instance.exports.eval_typed_call as (i:number,o:number,s:number)=>number;
    const same=(a:Uint8Array,b:Uint8Array)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
    const seeded=new BigInt64Array(pixelCount);seeded[0]=maximum;seeded[1]=1n;
    const cases=[{name:'seeded source order',values:seeded,initial:-maximum},
      {name:'minimum endpoint',values:new BigInt64Array(pixelCount),initial:minimum},
      {name:'maximum endpoint',values:new BigInt64Array(pixelCount),initial:maximum},
      {name:'full domain',values:BigInt64Array.from({length:pixelCount},(_,i)=>BigInt(i%7)-3n),initial:9n}];
    const outcomes=[];
    for(const {name,values,initial} of cases){
      raw.fill(0x37);cells.set(values);cells[pixelCount]=initial;const input=raw.slice(0,inputBytes);
      let expected=initial;for(const value of values){expected+=value;if(expected>maximum||expected<minimum)throw new Error('Invalid successful oracle case');}
      raw.fill(0xa5,output,output+outputBytes);raw.fill(0x7b,scratch,scratch+scratchBytes);
      if(execute(0,output,scratch)!==0||new DataView(memory.buffer).getBigInt64(output,true)!==expected||!same(raw.slice(0,inputBytes),input))throw new Error(`Integer source result mismatch: ${name}`);
      for(const [first,second] of [[maximum,1n],[minimum,-1n]]){
        cells.fill(0n,0,pixelCount+1);cells[0]=first;cells[1]=second;raw.fill(0xa5,output,output+outputBytes);
        const badInput=raw.slice(0,inputBytes),failure=execute(0,output,scratch);
        if(!failure||!raw.slice(output,output+outputBytes).every(v=>v===0xa5)||!same(raw.slice(0,inputBytes),badInput))throw new Error('Checked Integer fault mutated public memory');
        raw.set(input,0);
        if(execute(0,output,scratch)!==0||new DataView(memory.buffer).getBigInt64(output,true)!==expected)throw new Error('Integer fault recovery mismatch');
      }
      outcomes.push({name,expected:expected.toString(),exact:true,atomic:true,recovery:true});
    }
    return {moduleBytes:bytes.length,layout:manifest.layout,outcomes,scope:'Standalone source-issued Integer function; model caller and full SLAM not executed'};
  },{bytes:[...bytes],manifest});
  expect(report.outcomes).toHaveLength(4);expect(report.outcomes[0].expected).toBe('1');
  console.log('SOURCE INTEGER BROWSER WASM',JSON.stringify({browser:browser.version(),...report}));
});
