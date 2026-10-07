// Static browser build of source transport. This does not compile Modelica.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'vite';
import {chromium} from '@playwright/test';
import {rgbdSlamSourceManifest as manifest} from '../src/modelica-slam-source-manifest.mjs';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const require=(value,message)=>{if(!value)throw new Error(message);};
const root=path.join(os.homedir(),'scratch/slam_web');
fs.mkdirSync(path.join(root,'build'),{recursive:true});
const scratch=fs.mkdtempSync(path.join(root,'build/slam-source-browser-'));
const parent=path.join(app,'dev/artifacts/modelica-slam-browser-source');
fs.mkdirSync(parent,{recursive:true});
const durable=fs.mkdtempSync(path.join(parent,'source-'));
const files=manifest.paths.map(file=>({path:file,source:fs.readFileSync(path.join(app,file),'utf8')}));
const source=files.map(file=>file.source).join(manifest.separator);
const editedPath='models/RGBDFastSLAMInterface.mo';
const original=files.find(file=>file.path===editedPath).source;
const edited=original.replace('parameter Integer minimumMeasuredDescriptors = 8;',
  'parameter Integer minimumMeasuredDescriptors = 12;');
require(edited!==original,'Actual Modelica source edit');
const expected={sourceSha256:sha(source),sourceBytes:Buffer.byteLength(source),
  editedPath,editedFileSha256:sha(edited),editedSourceSha256:sha(files.map(file=>file.path===editedPath?edited:file.source).join(manifest.separator)),
  modelNames:manifest.modelNames,sources:files.map(file=>({path:file.path,sha256:sha(file.source),bytes:Buffer.byteLength(file.source)}))};
const entry=path.join(scratch,'entry.ts'),output=path.join(scratch,'static');
fs.writeFileSync(entry,`export {assembleRGBDSlamSource} from ${JSON.stringify(path.join(app,'src/modelica-slam-source.ts'))};\n`);
fs.writeFileSync(path.join(durable,'source-manifest.json'),JSON.stringify(expected,null,2)+'\n');
fs.writeFileSync(path.join(durable,'source.mo'),source);
let server,browser;
try{
  await build({root:app,configFile:false,logLevel:'error',build:{outDir:output,emptyOutDir:true,
    rollupOptions:{input:entry,preserveEntrySignatures:'strict',output:{entryFileNames:'assembly.mjs',chunkFileNames:'chunks/[name]-[hash].mjs'}}}});
  const assets=new Map();
  function inventory(directory){
    for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
      const file=path.join(directory,entry.name);
      if(entry.isDirectory())inventory(file);
      else assets.set('/'+path.relative(output,file).split(path.sep).join('/'),fs.readFileSync(file));
    }
  }
  inventory(output);
  server=createServer((request,response)=>{
    const key=new URL(request.url,'http://localhost').pathname;
    if(key==='/'){response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Modelica source assembly probe</title>');return;}
    const bytes=assets.get(key);
    if(!bytes){response.writeHead(404);response.end();return;}
    response.setHeader('Content-Type','text/javascript');response.end(bytes);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,
    args:['--no-sandbox','--disable-gpu']});
  const page=await browser.newPage(),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>requests.push(new URL(request.url()).pathname));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const browserResult=await page.evaluate(async({expected,edited})=>{
    const {assembleRGBDSlamSource}=await import('/assembly.mjs');
    const initial=await assembleRGBDSlamSource();
    const candidate=await assembleRGBDSlamSource({[expected.editedPath]:edited});
    const require=(value,message)=>{if(!value)throw new Error(message);};
    require(initial.sourceSha256===expected.sourceSha256,'Static browser exact source');
    require(JSON.stringify(initial.modelNames)===JSON.stringify(expected.modelNames),'All entrypoints');
    require(initial.sources.length===expected.sources.length,'Complete source inventory');
    for(let index=0;index<expected.sources.length;index++){
      const actual=initial.sources[index],file=expected.sources[index];
      require(actual.path===file.path&&actual.sha256===file.sha256&&actual.bytes===file.bytes&&!actual.overridden,'Exact ordered file identity');
    }
    require(new TextEncoder().encode(initial.source).byteLength===expected.sourceBytes,'Exact UTF8 byte size');
    require(candidate.sourceSha256===expected.editedSourceSha256,'Student source edit retained');
    require(candidate.sources.filter(file=>file.overridden).length===1,'Only supplied source overridden');
    require(candidate.sources.find(file=>file.path===expected.editedPath).sha256===expected.editedFileSha256,'Edited file identity');
    let refused=false;
    try{await assembleRGBDSlamSource({'models/Unknown.mo':'model Unknown end Unknown;'});}catch{refused=true;}
    require(refused,'Unknown source override refused');
    return {sourceSha256:initial.sourceSha256,sourceBytes:expected.sourceBytes,files:initial.sources.length,
      modelNames:initial.modelNames,editedSourceSha256:candidate.sourceSha256,unknownOverrideRefused:refused};
  },{expected,edited});
  require(errors.length===0,'No browser errors');
  require(files.every(file=>fs.readFileSync(path.join(app,file.path),'utf8')===file.source),'Authored source bookends');
  const owned=['src/modelica-slam-source.ts','src/modelica-slam-source-manifest.mjs',
    'src/modelica-slam-source-manifest.d.mts','src/source-digest.ts','dev/probe-modelica-slam-source.mjs'];
  const report={status:'STATIC_BROWSER_SOURCE_ASSEMBLY_PASS',...browserResult,browser:browser.version(),errors,requests,
    authoredBookendsEqual:true,owned:owned.map(file=>({path:file,sha256:sha(fs.readFileSync(path.join(app,file)))})),
    staticAssets:[...assets].map(([file,bytes])=>({path:file,bytes:bytes.length,sha256:sha(bytes)})),
    scratchHomeRelative:path.relative(os.homedir(),scratch),
    scope:'Static Vite bundle served as ordinary assets. Actual browser assembles all authored sources and a Modelica policy edit byte-exactly. No compiler API, Modelica numerical execution, runtime promotion or full SLAM/performance qualification.'};
  fs.writeFileSync(path.join(durable,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({directory:path.relative(app,durable),status:report.status,...browserResult}));
}catch(error){
  fs.writeFileSync(path.join(durable,'report.json'),JSON.stringify({status:'FAIL',expected,error:String(error.stack||error)},null,2)+'\n');
  throw error;
}finally{
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
}
