// Build the actual application and qualify its source-editing/persistence UI.
// All served content is ordinary static output; there is no compiler server.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {build,preview} from 'vite';
import {rgbdSlamNativeSourceManifest} from '../src/modelica-slam-source-manifest.mjs';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const buildCheck=process.argv[2]==='--build-check';
const hardware=buildCheck&&process.env.SLAM_BROWSER_GPU==='1';
if(process.argv.length>(buildCheck?3:2))throw Error('Only --build-check is supported');
if(buildCheck&&!process.env.SLAM_BUILD_CANDIDATE)throw Error('Build qualification requires SLAM_BUILD_CANDIDATE paired compiler assets');
const scratchRoot=path.join(os.homedir(),'scratch/slam_web/build');
fs.mkdirSync(scratchRoot,{recursive:true});
const scratch=fs.mkdtempSync(path.join(scratchRoot,'slam-workspace-browser-'));
const evidenceRoot=path.join(app,'dev/artifacts',buildCheck?'modelica-slam-build-browser':'modelica-slam-workspace-browser');
fs.mkdirSync(evidenceRoot,{recursive:true});
const evidence=fs.mkdtempSync(path.join(evidenceRoot,'browser-'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const owned=['src/main.ts','src/project.ts','src/editor.css','src/source-editor.ts',
  'src/modelica-lsp.worker.ts','src/modelica-slam-workspace.ts','src/modelica-slam-source.ts',
  'src/modelica-slam-source-manifest.mjs','src/modelica-slam-source-manifest.d.mts','tests/browser/slam-workspace.spec.ts',
  'dev/probe-modelica-slam-workspace.mjs',...(buildCheck?['src/modelica-slam-build.ts','src/modelica-slam-build.worker.ts',
    'src/modelica-native-program.ts','src/source-digest.ts','tests/browser/slam-build.spec.ts',...rgbdSlamNativeSourceManifest.paths]:[])];
const candidate=buildCheck?['rumoca_bind_wasm.js','rumoca_bind_wasm_bg.wasm'].map(name=>{
  const file=path.join(process.env.SLAM_BUILD_CANDIDATE,name),bytes=fs.readFileSync(file);
  return {name,bytes:bytes.length,sha256:sha(bytes)};
}):undefined;
const sources=owned.map(file=>({path:file,sha256:sha(fs.readFileSync(path.join(app,file)))}));
for(const file of sources){
  const dest=path.join(evidence,'sources',file.path);fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.copyFileSync(path.join(app,file.path),dest);
}
let server;
try{
  const output=path.join(scratch,'static');
  await build({root:app,configFile:path.join(app,'vite.config.ts'),logLevel:'error',
    build:{outDir:output,emptyOutDir:true}});
  const assets=[];
  function inventory(directory){
    for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
      const file=path.join(directory,entry.name);
      if(entry.isDirectory())inventory(file);
      else{const bytes=fs.readFileSync(file);assets.push({path:path.relative(output,file),bytes:bytes.length,sha256:sha(bytes)});}
    }
  }
  inventory(output);
  server=await preview({root:app,configFile:false,logLevel:'error',build:{outDir:output},
    preview:{host:'127.0.0.1',port:0,strictPort:true}});
  const address=server.httpServer.address();
  if(!address||typeof address==='string')throw Error('Static preview did not listen');
  const config=path.join(scratch,'playwright.config.mjs');
  fs.writeFileSync(config,'export default '+JSON.stringify({
    testDir:path.join(app,'tests/browser'),testMatch:buildCheck?['slam-workspace.spec.ts','slam-build.spec.ts']:'slam-workspace.spec.ts',timeout:90000,workers:1,
    outputDir:path.join(scratch,'test-results'),
    use:{baseURL:`http://127.0.0.1:${address.port}`,headless:true,viewport:{width:1440,height:1000},
      launchOptions:{executablePath:process.env.CHROMIUM_PATH,
        args:['--no-sandbox',...(hardware?['--enable-gpu','--use-gl=angle','--use-angle=gl']:['--use-angle=swiftshader','--enable-unsafe-swiftshader'])]}}
  },null,2)+';\n');
  const out=fs.createWriteStream(path.join(evidence,'playwright.json'));
  const errors=fs.createWriteStream(path.join(evidence,'playwright-stderr.log'));
  const child=spawn(process.execPath,[path.join(app,'node_modules/@playwright/test/cli.js'),
    'test','--config',config,'--reporter=json'],{cwd:app,
      env:{...process.env,SLAM_WORKSPACE_PROGRESS:path.join(evidence,'progress.log')},stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(out);child.stderr.pipe(errors);
  const terminal=await new Promise((resolve,reject)=>{
    child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));
  });
  await Promise.all([new Promise(resolve=>out.end(resolve)),new Promise(resolve=>errors.end(resolve))]);
  const result=JSON.parse(fs.readFileSync(path.join(evidence,'playwright.json'),'utf8'));
  const tests=[];
  function collect(suites){for(const suite of suites){
    for(const spec of suite.specs??[])for(const test of spec.tests??[])tests.push({title:spec.title,ok:spec.ok,
      status:test.status,results:test.results.map(r=>({status:r.status,duration:r.duration,error:r.error}))});
    collect(suite.suites??[]);
  }}
  collect(result.suites??[]);
  const bookends=sources.every(file=>sha(fs.readFileSync(path.join(app,file.path)))===file.sha256)
    &&(!candidate||candidate.every(file=>sha(fs.readFileSync(path.join(process.env.SLAM_BUILD_CANDIDATE,file.name)))===file.sha256));
  const pass=terminal.code===0&&bookends&&tests.length===(buildCheck?3:1)&&tests.every(t=>t.ok&&t.status==='expected');
  const report={status:pass?(buildCheck?'STATIC_APPLICATION_SLAM_BUILD_CHECK_PASS':'STATIC_APPLICATION_SLAM_WORKSPACE_PASS'):'FAILED_OR_INCOMPLETE',
    sources,candidate,graphics:hardware?'hardware-requested':'software',sourceBookendsEqual:bookends,assets,terminal,tests,scratchHomeRelative:path.relative(os.homedir(),scratch),
    scope:'Actual built application served as static assets. Browser source picker, actual Rumoca LSP errors, native59 dependency snapshot and historical56 import, editor edits, project download, IndexedDB save/page reload and active estimator preservation. '+(buildCheck?'Also exact-source WASM build requests, real installed/CI compiler refusals, synchronous compiler cancellation and retry. ':'')+'No full SLAM numerical execution or performance claim.'};
  fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({directory:path.relative(app,evidence),status:report.status,terminal,tests,sourceBookendsEqual:bookends}));
  if(!pass)process.exitCode=1;
}catch(error){
  fs.writeFileSync(path.join(evidence,'failure.json'),JSON.stringify({error:String(error.stack||error),sources,
    scratchHomeRelative:path.relative(os.homedir(),scratch)},null,2)+'\n');
  throw error;
}finally{
  if(server)await new Promise(resolve=>server.httpServer.close(resolve));
}
