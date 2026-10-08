// Actual static browser compiler timeout, worker termination and fresh retry.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'vite';
import {chromium} from '@playwright/test';
import {rgbdSlamNativeSourceManifest as manifest} from '../src/modelica-slam-source-manifest.mjs';

const [compilerDirectory,outputDirectory]=process.argv.slice(2);
if(!outputDirectory)throw Error('COMPILER_DIRECTORY NEW_OUTPUT_DIRECTORY required');
assert.ok(!fs.existsSync(outputDirectory),'Choose a fresh output directory');
const compiler=path.resolve(compilerDirectory),root=path.resolve(outputDirectory),app=process.cwd();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const owned=['src/modelica-slam-build.ts','src/modelica-slam-build.worker.ts','src/modelica-slam-workspace.ts',
  'src/modelica-slam-source.ts','src/modelica-slam-source-manifest.mjs','src/modelica-source-locations.mjs',
  'src/modelica-native-program.ts','src/modelica-native-artifact.ts','src/source-digest.ts',
  'tests/compiler-probes/fixtures/DescriptorZeroFill.mo',...manifest.paths];
const sources=owned.map(file=>({path:file,sha256:sha(fs.readFileSync(file))}));
const compilerFiles=['rumoca_bind_wasm.js','rumoca_bind_wasm_bg.wasm'].map(file=>
  ({path:file,sha256:sha(fs.readFileSync(path.join(compiler,file)))}));
fs.mkdirSync(root,{recursive:true});
const entry=path.join(root,'entry.ts');
fs.writeFileSync(entry,`export {checkRGBDSlamBuild} from ${JSON.stringify(path.join(app,'src/modelica-slam-build.ts'))};\n`);
await build({root:app,configFile:false,publicDir:false,base:'./',logLevel:'error',worker:{format:'es'},
  build:{outDir:path.join(root,'static'),emptyOutDir:false,target:'es2022',minify:false,
    lib:{entry,formats:['es'],fileName:()=> 'harness.js'}}});
const server=createServer((request,response)=>{
  const pathname=new URL(request.url,'http://localhost').pathname;
  if(pathname==='/'){response.end('<!doctype html><title>SLAM build deadline control</title>');return;}
  const vendor=pathname.startsWith('/vendor/rumoca/');
  const relative=vendor?pathname.slice('/vendor/rumoca/'.length):pathname.slice(1);
  const base=vendor?compiler:path.join(root,'static'),file=path.resolve(base,relative);
  if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
    response.statusCode=404;response.end();return;
  }
  response.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':'text/javascript');
  fs.createReadStream(file).on('error',error=>response.destroy(error)).pipe(response);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const empty=Object.fromEntries(manifest.paths.map(file=>[file,'']));
  const resetPath='models/SLAM/RGBDFastSLAMReset.mo';assert.ok(manifest.paths.includes(resetPath));
  const timeoutSources={...empty,[resetPath]:fs.readFileSync('tests/compiler-probes/fixtures/DescriptorZeroFill.mo','utf8')
    .replaceAll('DescriptorZeroFill','RGBDFastSLAMReset')};
  const retrySources={...empty,[resetPath]:manifest.modelNames.map(name=>
    `model ${name}\n  input Real x;\n  output Real y;\nequation\n  y = x;\nend ${name};`).join('\n')};
  const results=[];
  for(const [name,sources,timeoutMs]of [['timeout',timeoutSources,5000],['retry',retrySources,15000]]){
    const source=manifest.paths.map(file=>sources[file]).join(manifest.separator);
    fs.writeFileSync(path.join(root,name+'.mo'),source);
    const result=await page.evaluate(async({sources,timeoutMs})=>{
      const {checkRGBDSlamBuild}=await import('/harness.js');
      const progress=[];
      const receipt=await checkRGBDSlamBuild({schemaVersion:2,sources},{base:'/',timeoutMs,
        onProgress:value=>progress.push(value)});
      return {receipt,progress};
    },{sources,timeoutMs});
    assert.equal(result.receipt.sourceSha256,sha(source));
    if(name==='timeout'){
      assert.equal(result.receipt.status,'failed');assert.equal(result.receipt.timedOut,true);
      assert.deepEqual(result.receipt.failedAt,{phase:'compiling',model:'RGBDFastSLAMReset'});
      assert.match(result.receipt.error,/timed out after 5000 ms/);
      assert.ok(result.receipt.compiler?.revision);assert.equal(result.receipt.programs.length,0);
    }else{
      assert.equal(result.receipt.status,'pass');assert.equal(result.receipt.timedOut,undefined);
      assert.deepEqual(result.receipt.programs.map(program=>program.model),manifest.modelNames);
      assert.deepEqual(result.receipt.compiler,results[0].receipt.compiler);
    }
    for(let attempt=0;page.workers().length&&attempt<40;attempt++)await page.waitForTimeout(50);
    assert.equal(page.workers().length,0,'Build worker must terminate before retry');
    results.push({name,...result,workersAfterCompletion:0});
    fs.writeFileSync(path.join(root,name+'.json'),JSON.stringify(results.at(-1),null,2)+'\n');
  }
  for(const file of sources)assert.equal(sha(fs.readFileSync(file.path)),file.sha256);
  for(const file of compilerFiles)assert.equal(sha(fs.readFileSync(path.join(compiler,file.path))),file.sha256);
  const report={status:'STATIC_BROWSER_SLAM_BUILD_DEADLINE_PASS',browser:browser.version(),sources,compilerFiles,
    sourceBookendsEqual:true,results,probeSha256:sha(fs.readFileSync(import.meta.filename)),
    scope:'Production build API and worker served as static assets with the actual compiler. '
      +'Standalone full-size constant-array timeout and four small actual source-issued/admitted retry programs. '
      +'No numerical execution, full SLAM or throughput qualification.'};
  fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,compiler:results[0].receipt.compiler,
    timeoutAt:results[0].receipt.failedAt,retryPrograms:results[1].receipt.programs.length,workersAfterCompletion:0}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
