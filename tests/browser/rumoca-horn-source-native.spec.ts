import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {startHornWorkerProfile} from './horn-worker-profiler';

const directory=process.env.RUMOCA_NATIVE_HORN_MODULE_DIR;
const sourcePath=process.env.RUMOCA_NATIVE_HORN_SOURCE_FIXTURE;
const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');

// Test-only analytic geometry. Production fitting is entirely the source-issued
// Modelica WASM owner, with the declared scalar target Math.pow intrinsic.
function hornWorker(){
  self.onmessage=async(event:MessageEvent)=>{
    try{
      const {bytes,layout}=event.data,N=14400;
      const inputBytes=(7*N+4)*8,outputBytes=26*8;
      if(layout.input_bytes!==inputBytes||layout.output_bytes!==outputBytes||![layout.input_bytes,layout.output_bytes,layout.scratch_bytes].every(v=>Number.isSafeInteger(v)&&v>=0&&v%8===0))throw new Error('Full source tuple layout mismatch');
      const output=inputBytes+8,scratch=output+outputBytes+8,pages=Math.ceil((scratch+layout.scratch_bytes+8)/65536);
      const memory=new WebAssembly.Memory({initial:pages,maximum:pages}),raw=new Uint8Array(memory.buffer),cells=new Float64Array(memory.buffer);
      const module=await WebAssembly.compile(new Uint8Array(bytes));
      const imports=WebAssembly.Module.imports(module);
      if(imports.length!==2||!imports.some(i=>i.module==='env'&&i.name==='memory'&&i.kind==='memory')||!imports.some(i=>i.module==='env'&&i.name==='pow'&&i.kind==='function'))throw new Error('Unexpected native math ABI');
      let powCalls=0,powMs=0,measurePow=false;
      const pow=(base:number,exponent:number)=>{powCalls++;if(!measurePow)return Math.pow(base,exponent);const start=performance.now(),value=Math.pow(base,exponent);powMs+=performance.now()-start;return value;};
      const instance=await WebAssembly.instantiate(module,{env:{memory,pow}}),execute=instance.exports.eval_typed_call as (i:number,o:number,s:number)=>number;
      const identity=[1,0,0,0,1,0,0,0,1];
      const rotation=(axis:number[],angle:number)=>{
        const norm=Math.hypot(...axis),[x,y,z]=axis.map(v=>v/norm),c=Math.cos(angle),s=Math.sin(angle),d=1-c;
        return [c+x*x*d,x*y*d-z*s,x*z*d+y*s,y*x*d+z*s,c+y*y*d,y*z*d-x*s,z*x*d-y*s,z*y*d+x*s,c+z*z*d];
      };
      const rigid=rotation([.3,-.7,.5],.81),translation=[.2,-.35,.09];
      const near=(actual:number,expected:number,label:string)=>{if(!Number.isFinite(actual)||Math.abs(actual-expected)>2e-8*Math.max(1,Math.abs(expected)))throw new Error(`${label}: ${actual} != ${expected}`);};
      const same=(a:Uint8Array,b:Uint8Array)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
      type Fixture={name:string;geometry?:string;reason?:number;count?:number;noise?:number;last?:string;rank?:number;maximum?:number;nearPi?:boolean};
      const fixtures:Fixture[]=[
        {name:'full non-axis transform',rank:3}, {name:'planar non-collinear',geometry:'planar',rank:2},
        {name:'near half turn',nearPi:true,rank:3}, {name:'known orthogonal residual',noise:.01,rank:3},
        {name:'finite RMS refusal',noise:.03,reason:6,rank:3}, {name:'collinear refusal',geometry:'line',reason:4,rank:1},
        {name:'near-collinear refusal',geometry:'nearLine',reason:4,rank:1}, {name:'coincident refusal',geometry:'coincident',reason:4},
        {name:'collapsed target refusal',geometry:'collapsed',reason:4,rank:3}, {name:'empty observation',count:0,reason:3},
        {name:'fractional count',count:N-.5,reason:1},{name:'oversized count',count:N+1,reason:1},{name:'negative count',count:-1,reason:1},
        {name:'insufficient pairs',count:2,reason:3},{name:'finite huge coordinate',last:'huge',reason:2},
        {name:'masked NaN',last:'maskedNaN',rank:3},{name:'active NaN',last:'activeNaN',reason:2},
        {name:'invalid pair flag',last:'flag',reason:2},{name:'reflection refusal',geometry:'reflection',reason:6,rank:3},
        {name:'runtime residual parameter',geometry:'reflection',maximum:.5,rank:3},{name:'recovery and repeat',rank:3},
      ];
      const inputFor=(fixture:Fixture)=>{
        const input=new Float64Array(inputBytes/8),R=fixture.nearPi?rotation([1,2,-3],Math.PI-1e-8):rigid;
        for(let i=0;i<N;i++){
          let p=[i%120/120-59.5/120,Math.floor(i/120)/240-59.5/240,(i%2===0)===(Math.floor(i/120)%2===0)?.13:-.13];
          if(fixture.geometry==='planar')p[2]=0;
          if(fixture.geometry==='line')p=[p[0],0,0];
          if(fixture.geometry==='nearLine')p=[p[0],p[1]*1e-6,0];
          if(fixture.geometry==='coincident')p=[.1,.2,.3];
          const q=R.filter((_,k)=>k%3===0).map((_,axis)=>translation[axis]+R.slice(3*axis,3*axis+3).reduce((sum,v,k)=>sum+v*p[k],0));
          if(fixture.geometry==='reflection')q.splice(0,3,-p[0],p[1],p[2]);
          if(fixture.geometry==='collapsed')q.splice(0,3,.1,.2,.3);
          if(fixture.noise)q[2]+=fixture.noise*[1,-1,-1,1][i%4]*(Math.floor(i/120)%2===0?1:-1);
          let enabled=1;
          if(i===N-1){
            if(fixture.last==='huge')p[0]=1e150;
            if(fixture.last==='maskedNaN'||fixture.last==='activeNaN')p.fill(NaN);
            if(fixture.last==='maskedNaN'){enabled=0;q.fill(NaN);}
            if(fixture.last==='flag')enabled=.5;
          }
          input.set(p,3*i);input.set(q,3*N+3*i);input[6*N+i]=enabled;
        }
        input.set([fixture.count??N,1e6,1e-8,fixture.maximum??.02],7*N);
        return input;
      };
      const check=(fixture:Fixture,input:Float64Array,values:Float64Array)=>{
        const reason=fixture.reason??0,R=reason?identity:fixture.geometry==='reflection'?[-1,0,0,0,1,0,0,0,-1]:fixture.nearPi?rotation([1,2,-3],Math.PI-1e-8):rigid;
        const t=reason||fixture.geometry==='reflection'?[0,0,0]:translation;
        if(values[0]!==+(reason===0)||values[1]!==reason)throw new Error(`${fixture.name}: source acceptance/refusal mismatch`);
        R.forEach((v,i)=>near(values[2+i],v,fixture.name));t.forEach((v,i)=>near(values[11+i],v,fixture.name));
        const A=values.subarray(2,11),det=A[0]*(A[4]*A[8]-A[5]*A[7])-A[1]*(A[3]*A[8]-A[5]*A[6])+A[2]*(A[3]*A[7]-A[4]*A[6]);near(det,1,'proper determinant');
        for(let row=0;row<3;row++)for(let column=0;column<3;column++)near([0,1,2].reduce((sum,k)=>sum+A[3*k+row]*A[3*k+column],0),+(row===column),'orthonormality');
        const invalid=['huge','activeNaN','flag'].includes(fixture.last??'')?1:0,valid=reason===1?0:Math.max(0,fixture.count??N)-invalid-(fixture.last==='maskedNaN'?1:0);
        if(values[14]!==valid||values[15]!==invalid)throw new Error('Pair-count diagnostic mismatch');
        if(fixture.rank!==undefined&&values[16]!==fixture.rank)throw new Error('Rank diagnostic mismatch');
        if(reason!==0)return;
        const source=[0,0,0],target=[0,0,0];let cost=0;
        for(let i=0;i<N;i++){
          if(input[6*N+i]!==1)continue;
          for(let axis=0;axis<3;axis++){
            source[axis]+=input[3*i+axis];target[axis]+=input[3*N+3*i+axis];
            const predicted=values[11+axis]+[0,1,2].reduce((sum,k)=>sum+A[3*axis+k]*input[3*i+k],0);
            cost+=(predicted-input[3*N+3*i+axis])**2;
          }
        }
        source.forEach((v,i)=>near(values[20+i],v/valid,'source centroid'));target.forEach((v,i)=>near(values[23+i],v/valid,'target centroid'));
        near(values[17],cost,'independent point residual cost');near(values[18],Math.sqrt(cost/valid),'independent rms');
      };
      let first:Uint8Array|undefined;const outcomes=[];
      for(const fixture of fixtures){
        const input=inputFor(fixture);raw.fill(0x37);cells.set(input);raw.fill(0xa5,output,output+outputBytes);raw.fill(0x7b,scratch,scratch+layout.scratch_bytes);
        const preserved=raw.slice(0,inputBytes),guardA=raw.slice(inputBytes,output),guardB=raw.slice(output+outputBytes,scratch),start=performance.now();
        const status=execute(0,output,scratch),elapsedMs=performance.now()-start,owned=raw.slice(output,output+outputBytes);
        if(status!==0||!same(preserved,raw.subarray(0,inputBytes))||!same(guardA,raw.subarray(inputBytes,output))||!same(guardB,raw.subarray(output+outputBytes,scratch)))throw new Error('Native input/guard or status mismatch');
        check(fixture,input,new Float64Array(owned.buffer));
        if(!first)first=owned;else if(fixture.name==='recovery and repeat'&&!same(first,owned))throw new Error('Recovery changed complete output tuple');
        outcomes.push({name:fixture.name,reason:fixture.reason??0,elapsedMs,immutableInputs:true});
        self.postMessage({progress:{phase:'numerical',name:fixture.name,elapsedMs}});
      }
      const input=inputFor(fixtures[0]);cells.set(input);raw.fill(0xa5,output,output+outputBytes);
      const preserved=raw.slice(0,inputBytes),invalidStatus=execute(0,output+1,scratch);
      if(invalidStatus<=0||!raw.subarray(output,output+outputBytes).every(v=>v===0xa5)||!same(preserved,raw.subarray(0,inputBytes)))throw new Error('Invalid ABI call was not atomic');
      if(execute(0,output,scratch)!==0||!same(first!,raw.subarray(output,output+outputBytes)))throw new Error('ABI fault recovery changed output');
      if(execute(0,output,scratch)!==0)throw new Error('Warmup fault');
      const calls=10;let inputMs=0,executeMs=0,outputMs=0,checksum=0;const beforePow=powCalls;
      for(let i=0;i<calls;i++){
        let start=performance.now();cells.set(input);inputMs+=performance.now()-start;
        start=performance.now();if(execute(0,output,scratch)!==0)throw new Error('Benchmark fault');executeMs+=performance.now()-start;
        start=performance.now();const owned=raw.slice(output,output+outputBytes);checksum^=owned[0];outputMs+=performance.now()-start;
        self.postMessage({progress:{phase:'benchmark',iteration:i+1,executeMeanMs:executeMs/(i+1)}});
      }
      const benchmarkPowCalls=powCalls-beforePow;measurePow=true;powMs=0;
      execute(0,output,scratch);measurePow=false;
      self.postMessage({outcomes,invalidStatus,atomicAbiFailure:true,calls,checksum,meanInputMs:inputMs/calls,meanExecuteMs:executeMs/calls,meanOwnedOutputMs:outputMs/calls,meanInputExecuteOutputMs:(inputMs+executeMs+outputMs)/calls,
        benchmarkPowCalls,powCallsPerCall:benchmarkPowCalls/calls,instrumentedPowMsPerCall:powMs,
        powQualification:'Math.pow target intrinsic; no portable bit parity with host Rust powf; timing is coarse and instrumentation overhead excluded from benchmark',
        scope:'full14400 source-issued standalone registration owner in Chromium worker; not model schedule, RGB-D correspondence production, visual odometry or SLAM'});
    }catch(error){self.postMessage({error:String(error),stack:error instanceof Error?error.stack:undefined});}
  };
}

test('unchanged full14400 Modelica Horn owner preserves rigid geometry in a browser worker',async({page,browser})=>{
  test.setTimeout(480_000);
  test.skip(!directory||!sourcePath,'Requires exact source-issued Horn module and manifest');
  const source=await readFile(sourcePath!,'utf8'),bytes=await readFile(path.join(directory!,'horn-full14400.wasm'));
  const manifest=JSON.parse(await readFile(path.join(directory!,'horn-full14400.json'),'utf8'));
  expect(manifest.source).toBe(source);expect(manifest.source_sha256).toBe(sha(source));expect(manifest.module_sha256).toBe(sha(bytes));
  expect(manifest.variant).toEqual({registration:true,capacity:14400});expect(manifest.math_imports).toHaveLength(1);expect(manifest.math_imports[0]).toMatchObject({module:'env',name:'pow',parameters:['f64','f64'],results:['f64']});
  await page.setContent('<!doctype html><title>Native source-owned Horn worker proof</title>');
  page.on('console',message=>console.log(message.text()));
  await page.evaluate(workerSource=>{
    const url=URL.createObjectURL(new Blob([`(${workerSource})();`],{type:'application/javascript'}));
    (globalThis as unknown as {hornProof:{url:string;worker:Worker}}).hornProof={url,worker:new Worker(url)};
  },hornWorker.toString());
  const stopProfile=process.env.RUMOCA_NATIVE_HORN_PROFILE_DIR?await startHornWorkerProfile(browser,process.env.RUMOCA_NATIVE_HORN_PROFILE_DIR):undefined;
  let result:Record<string,unknown>;
  try{
    result=await page.evaluate(async({bytes,layout})=>{
      const {worker}=(globalThis as unknown as {hornProof:{worker:Worker}}).hornProof;
      return await new Promise<Record<string,unknown>>((resolve,reject)=>{worker.onmessage=event=>{if(event.data.progress){console.log('HORN_WORKER_PROGRESS',JSON.stringify(event.data.progress));return;}event.data.error?reject(new Error(event.data.error)):resolve(event.data);};worker.onerror=event=>reject(new Error(event.message));worker.postMessage({bytes,layout});});
    },{bytes:[...bytes],layout:manifest.layout});
  }finally{
    try{await stopProfile?.();}finally{
      await page.evaluate(()=>{const {worker,url}=(globalThis as unknown as {hornProof:{worker:Worker;url:string}}).hornProof;worker.terminate();URL.revokeObjectURL(url);});
    }
  }
  expect(result.outcomes).toHaveLength(21);expect(result.atomicAbiFailure).toBe(true);expect(result.powCallsPerCall).toBe(6);
  console.log('SOURCE HORN BROWSER WORKER',JSON.stringify({browser:browser.version(),sourceSha256:manifest.source_sha256,moduleSha256:manifest.module_sha256,layout:manifest.layout,...result}));
});
