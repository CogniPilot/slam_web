// Review-only CI candidate qualification. No production package or Modelica edits.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const self = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(self), '..');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const identity = file => ({ path: file, bytes: fs.statSync(file).size, sha256: sha(fs.readFileSync(file)) });
const json = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');

// Only transport and an independent analytic oracle run in JavaScript. All
// kernel evaluation runs in the actual candidate WasmSimulationSession worker.
function workerSource() {
  return `import init, * as rumoca from '/compiler/rumoca_bind_wasm.js';
const phase = name => postMessage({ phase: name });
let session;
try {
  phase('initialize-package');
  const source = await (await fetch('/source.mo')).text();
  const wasm = await (await fetch('/compiler/rumoca_bind_wasm_bg.wasm')).arrayBuffer();
  const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2,'0')).join('');
  const sourceSha256 = await digest(new TextEncoder().encode(source));
  const wasmSha256 = await digest(wasm);
  await init({module_or_path: wasm});
  const version = rumoca.get_version(), commit = rumoca.get_git_commit();
  phase('prepare-session');
  const start = performance.now();
  session = rumoca.WasmSimulationSession.withInteractiveOptions(source, 'LoopCapturedReduction', .01, 'rk-like', 1e-8, 1e-6, '[]');
  const preparationMs = performance.now() - start;
  const patterns = ['default-zero','linear','checkerboard','far-edge-impulse'];
  const results = [];
  for (let p=0;p<patterns.length;p++) {
    const name = patterns[p]; phase(name);
    const inputs = {};
    if (p) {
      for(let y=1;y<=13;y++) for(let x=1;x<=17;x++) inputs['image['+y+','+x+']'] = p===1 ? y*1000+x : p===2 ? ((y+x)%2===0 ? 10:-10) : (y===13&&x===17?4096:0);
      session.set_inputs(JSON.stringify(Object.entries(inputs)));
      session.advance_to(p*.1);
    }
    const rawState = session.state_json(), state=JSON.parse(rawState), values=state.values;
    if (!values || typeof values !== 'object') throw new Error('Missing state.values');
    const failures = [];
    let outputChecks=0, inputChecks=0;
    for(let y=1;y<=13;y++) for(let x=1;x<=17;x++) {
      const key='image['+y+','+x+']', expected=p ? inputs[key]:0;
      if(!Number.isFinite(values[key]) || values[key]!==expected) failures.push({key,expected,actual:values[key]});
      inputChecks++;
    }
    for(let y=1;y<=9;y++) for(let x=1;x<=13;x++) {
      const key='score['+y+','+x+']';
      const expected=p===0?0:p===1?(y+2)*1000+x+2:p===2?((y+x)%2===0?.4:-.4):(y===9&&x===13?163.84:0);
      if(!Number.isFinite(values[key]) || values[key]!==expected) failures.push({key,expected,actual:values[key]});
      outputChecks++;
    }
    results.push({name,time:state.time,outputChecks,inputChecks,failures,rawState});
  }
  postMessage({result:{version,commit,sourceSha256,wasmSha256,preparationMs,results,passed:results.every(r=>r.failures.length===0)}});
} catch(error) { postMessage({error:String(error),stack:error.stack}); }
finally { session?.free(); }
`;
}

async function execute(run) {
  const plan = JSON.parse(fs.readFileSync(path.join(run, 'plan.json')));
  let browser;
  const server = http.createServer((req,res) => {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1);
    const file = path.resolve(run, relative || 'index.html');
    if (!file.startsWith(run + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.setHeader('Cross-Origin-Opener-Policy','same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'text/plain');
    res.end(fs.readFileSync(file));
  });
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    browser = await chromium.launch({executablePath:plan.chromium.path,headless:true,args:['--no-sandbox','--disable-gpu'],timeout:20000});
    const page=await browser.newPage();
    await page.exposeFunction('recordPhase', phase=>fs.appendFileSync(path.join(run,'phases.jsonl'),JSON.stringify({phase,date:new Date().toISOString()})+'\n'));
    await page.goto('http://127.0.0.1:'+server.address().port+'/');
    const result=await page.evaluate(()=>new Promise((resolve,reject)=>{
      const worker=new Worker('/worker.js',{type:'module'});
      worker.onerror=event=>reject(new Error(event.message));
      worker.onmessage=event=>{if(event.data.phase) window.recordPhase(event.data.phase);else {worker.terminate();resolve(event.data);}};
    }));
    json(path.join(run,'worker-result.json'),result);
    json(path.join(run,'browser.json'),{version:browser.version(),userAgent:await page.evaluate(()=>navigator.userAgent),execution:'dedicated module worker',graphics:'disabled; numerical qualification only'});
    if (result.error || !result.result?.passed) throw new Error(result.error ?? 'Analytic comparison failed');
    if(result.result.version!=='0.10.2'||!result.result.commit.startsWith('30f0ee71a59c')) throw new Error('Unexpected embedded CI candidate identity');
    if(result.result.sourceSha256!==plan.source.sha256 || result.result.wasmSha256!==plan.compiler.find(f=>f.name.endsWith('.wasm')).sha256) throw new Error('Browser-loaded source/WASM identity mismatch');
  } finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
}

if(process.argv[2]==='--execute') {
  await execute(path.resolve(process.argv[3]));
} else {
  const scratch=path.join(os.homedir(),'scratch/slam_web/tmp'); fs.mkdirSync(scratch,{recursive:true});
  const run=fs.mkdtempSync(path.join(scratch,'ci-loop-reduction-browser-'));
  // Chromium appends its singleton socket directory to TMPDIR; keep that path
  // below the Unix socket limit while retaining all disposable data on scratch.
  const browserTmp=fs.mkdtempSync(path.join(os.homedir(),'scratch/cb-'));
  const packageRoot=path.join(os.homedir(),'scratch/slam_web/downloads/rumoca-pr382-74f9c82/package/release-full-web');
  const chromiumPath=process.env.CHROMIUM_PATH;
  if(!chromiumPath || !fs.existsSync(chromiumPath)) throw new Error('Set CHROMIUM_PATH to the pinned existing Chromium executable');
  const source=path.join(root,'tests/compiler-probes/fixtures/LoopCapturedReduction.mo');
  const guard=path.join(root,'dev/rumoca-bounded-run.mjs');
  const metadata=path.resolve(packageRoot,'../../artifact-metadata.json');
  fs.mkdirSync(path.join(run,'compiler'));
  const compiler=['rumoca_bind_wasm.js','rumoca_bind_wasm_bg.wasm','rumoca_bind_wasm.d.ts','package.json','rumoca_package_meta.json'].map(name=>{
    const original=path.join(packageRoot,name); fs.copyFileSync(original,path.join(run,'compiler',name));return {name,...identity(original)};
  });
  for(const [file,name] of [[source,'source.mo'],[self,'driver.mjs'],[guard,'guard.mjs'],[metadata,'artifact-metadata.json']]) fs.copyFileSync(file,path.join(run,name));
  fs.writeFileSync(path.join(run,'worker.js'),workerSource());fs.writeFileSync(path.join(run,'index.html'),'<!doctype html><title>CI SolveIR worker qualification</title>');
  const plan={createdAt:new Date().toISOString(),run,browserTmp,source:identity(source),driver:identity(self),guard:identity(guard),compiler,chromium:identity(chromiumPath),artifact:JSON.parse(fs.readFileSync(metadata)),limits:{seconds:90,rssMiB:4096,availableMiB:16384,cpus:'6,7',nice:15,OMP_NUM_THREADS:1},oracle:'Exact finite equality: analytic 5x5 mean, odd checkerboard imbalance, far-edge support; all 221 inputs and 117 outputs each pattern',scope:'Actual unchanged Modelica through candidate WasmSimulationSession in dedicated browser worker; no production pin or full SLAM acceptance'};
  json(path.join(run,'plan.json'),plan);
  console.log(JSON.stringify({phase:'launch',run,sourceSha256:plan.source.sha256,wasmSha256:compiler[1].sha256}));
  const args=[guard,'--seconds','90','--rss-mib','4096','--available-mib','16384','--log',path.join(run,'execution.log'),'--','env','OMP_NUM_THREADS=1','TMPDIR='+browserTmp,'nice','-n','15','taskset','-c','6,7',process.execPath,self,'--execute',run];
  const child=spawnSync(process.execPath,args,{encoding:'utf8',env:process.env});
  fs.writeFileSync(path.join(run,'resources.stdout'),child.stdout??'');fs.writeFileSync(path.join(run,'resources.stderr'),child.stderr??'');
  let resources;try{resources=JSON.parse(child.stdout.trim().split('\n').at(-1));}catch{}
  const sources=[plan.source,plan.driver,plan.guard,...compiler,identity(metadata)];
  const bookends=sources.map(before=>({before,after:identity(before.path),equal:before.sha256===sha(fs.readFileSync(before.path))}));
  const workerFile=path.join(run,'worker-result.json');const worker=fs.existsSync(workerFile)?JSON.parse(fs.readFileSync(workerFile)):null;
  const passed=child.status===0&&worker?.result?.passed===true&&bookends.every(b=>b.equal);
  const report={status:passed?'LOOP_REDUCTION_BROWSER_PASS':'LOOP_REDUCTION_BROWSER_FAIL',processStatus:child.status,resources,sourceBookendsEqual:bookends.every(b=>b.equal),bookends,plan,worker,browser:fs.existsSync(path.join(run,'browser.json'))?JSON.parse(fs.readFileSync(path.join(run,'browser.json'))):null,limitations:['Single exact 13x17 fixture and candidate package; no production promotion or full detector/SLAM claim','No graphics throughput claim','Artifact workflow head and embedded package commit are recorded separately; merge parents unavailable in local artifact metadata']};
  json(path.join(run,'report.json'),report);
  const durable=path.join(root,'dev/artifacts/rumoca-ci-readable-kernels',path.basename(run));fs.mkdirSync(durable,{recursive:true});
  for(const name of ['source.mo','driver.mjs','guard.mjs','worker.js','index.html','artifact-metadata.json','plan.json','resources.stdout','resources.stderr','execution.log','phases.jsonl','worker-result.json','browser.json','report.json']) if(fs.existsSync(path.join(run,name))) fs.copyFileSync(path.join(run,name),path.join(durable,name));
  json(path.join(durable,'manifest.json'),fs.readdirSync(durable).sort().map(name=>({name,...identity(path.join(durable,name))})));
  fs.writeFileSync(path.join(durable,'README.md'),`Actual browser-worker qualification of unchanged LoopCapturedReduction.mo. Status: ${report.status}. Raw states and exact analytic comparisons are in worker-result.json. Package JS/WASM bytes remain in the owned scratch compiler directory recorded by plan.json; their SHA-256 identities and original artifact provenance are frozen here. Resource monitor covers the owned process group and Chromium descendants. No production package changes.\n`);
  console.log(JSON.stringify({status:report.status,receipt:durable,resources}));process.exitCode=passed?0:1;
}
