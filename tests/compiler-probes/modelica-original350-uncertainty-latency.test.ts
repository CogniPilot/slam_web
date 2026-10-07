import {expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {NativeProgram,type NativeProgramArtifact} from '../../src/modelica-native-program';
const hash=(data:string|Uint8Array)=>createHash('sha256').update(data).digest('hex');
const summarize=(samples:number[])=>{const ordered=[...samples].sort((a,b)=>a-b);return {count:samples.length,meanMs:samples.reduce((a,b)=>a+b,0)/samples.length,p50Ms:ordered[Math.ceil(.5*ordered.length)-1],p95Ms:ordered[Math.ceil(.95*ordered.length)-1],maxMs:ordered.at(-1),samplesMs:samples};};
it('isolated warmed full350 native evaluate and P-copy latency preserve exact storage',async()=>{
 const dir=process.env.RUMOCA_ORIGINAL350_LATENCY_DIR!;mkdirSync(dir,{recursive:true});
 const source=readFileSync('models/Estimation/Localization/RGBDRegistrationUncertainty.mo','utf8'),artifactText=readFileSync('dev/artifacts/modelica-typed-slice-updates/original350-native.json','utf8'),artifact=JSON.parse(artifactText) as NativeProgramArtifact;
 const fixtureText=readFileSync('dev/artifacts/original350-uncertainty-native/independent-browser-fixtures.json','utf8'),fixtures=JSON.parse(fixtureText),input=new Uint8Array(fixtures.cases[0].pBytes);
 const report:Record<string,unknown>={status:'RUNNING',engine:'Node/V8 WebAssembly',scope:'Only original full350 compiled NativeProgram.evaluate and separate full P-byte copy; excludes preparation, oracle, output comparisons, SLAM frontend/filter/physics, sensors and rendering',sourceSha256:hash(source),artifactSha256:hash(artifactText),moduleSha256:artifact.module_sha256,fixtureSha256:hash(fixtureText),testSha256:hash(readFileSync('tests/compiler-probes/modelica-original350-uncertainty-latency.test.ts')),consumerSha256:hash(readFileSync('src/modelica-native-program.ts')),compiler:artifact.compiler,capacity:350,warmupCalls:30,timedCalls:100,affinity:'12',nice:15,throughputClaim:false};const save=()=>writeFileSync(dir+'/report.json',JSON.stringify(report,null,2)+'\n');save();
 try{
 expect(hash(source)).toBe('8074f170f8316c4874f4517e1f4875924434fa1f58d27611a1ff93d719441ecd');expect(hash(new Uint8Array(artifact.module_bytes))).toBe('58de05687b5fa28c50d54b102d80c1b5cfb7ae131faf2a412fcad346057ccad5');
 const program=await NativeProgram.instantiate(artifact,source),P=new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8),Y=new Uint8Array(program.memory.buffer,0,artifact.abi.y_count*8);expect(input.length).toBe(P.length);P.set(input);for(let i=0;i<30;i++)program.evaluate(0);
 const beforeY=Y.slice(),beforeP=P.slice();expect(program.output('valid')[0]).toBe(1);expect(program.output('validCount')[0]).toBe(350);
 const evaluate:number[]=[];for(let i=0;i<100;i++){const begin=performance.now();program.evaluate(0);evaluate.push(performance.now()-begin);}
 expect(Y).toEqual(beforeY);expect(P).toEqual(beforeP);
 for(let i=0;i<30;i++)P.set(input);
 const copy:number[]=[];for(let i=0;i<100;i++){const begin=performance.now();P.set(input);copy.push(performance.now()-begin);}
 expect(Y).toEqual(beforeY);expect(P).toEqual(beforeP);
 report.status='ISOLATED_FULL350_NATIVE_LATENCY_PASS';report.evaluate=summarize(evaluate);report.inputCopy=summarize(copy);report.storage={all185YBitwiseIdentical:true,all2498PBitwiseImmutable:true,pBytes:P.length,yBytes:Y.length};save();
 }catch(error){report.status='FAILED';report.failure=String(error);save();throw error;}
},30000);
