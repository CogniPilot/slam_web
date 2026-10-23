import {chromium} from '@playwright/test';
import {createServer} from 'node:http';import {createReadStream} from 'node:fs';
import {readFile,writeFile,mkdir,realpath,rename} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';import {createHash} from 'node:crypto';import {gzipSync} from 'node:zlib';
import {chromiumLaunchOptions} from './browser-launch.mjs';
import {OFFICE_REPLAY,exact,requireCompleteReplay} from './office-replay-contract.mjs';
const [artifactArg,assetsArg,outputArg,bundleArg]=process.argv.slice(2);
if(!bundleArg||process.argv.length!==6)throw Error('Usage: replay-office-browser.mjs ORIGINAL_ARTIFACT NATIVE_ASSETS NEW_OUTPUT BUNDLE');
const artifact=await realpath(artifactArg),capture=join(artifact,'capture'),assets=await realpath(assetsArg),output=resolve(outputArg);
await mkdir(output);await mkdir(join(output,'snapshots-unqualified'));
const sha=b=>createHash('sha256').update(b).digest('hex'),started=performance.now();
const receipt={schemaVersion:1,status:'running',qualified:false,verifiedFrames:0,requiredFrames:OFFICE_REPLAY.frames,
 experiment:OFFICE_REPLAY,snapshotEpochs:[],snapshots:[],assets:[],scope:'Exact saved-observation native baseline in pinned sandboxed Chromium. Declared state snapshots only; transient measurement/proposal payloads are not observed. No new render, GPU or policy change.'};
receipt.observedEncoding={format:'Original JSON serialization',normalization:'-0 becomes0; NaN/Infinity/-Infinity become null; undefined object fields omitted, exactly as original capture. Finite nonzero values, gates, IDs, counts and masks have no tolerance.',snapshots:'Raw declared typed-lane bytes, no value normalization.'};
const save=()=>writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
let browser,server;await save();
try{
 const sealBytes=await readFile(join(artifact,'SHA256SUMS'));exact(sha(sealBytes),OFFICE_REPLAY.sealManifestSha256,'Pinned original seal manifest');
 const hashes=new Map();let stale=0;
 for(const line of sealBytes.toString('utf8').trim().split('\n')){
  const [expected,name]=line.split('  '),path=await realpath(join(artifact,name));if(!path.startsWith(artifact+sep))throw Error('Original artifact path escapes root');
  const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);const actual=h.digest('hex');
  if(actual!==expected){if(name!=='seal.log'||expected!==sha(Buffer.alloc(0))||actual!==OFFICE_REPLAY.staleSealSha256)throw Error('Original artifact hash mismatch: '+name);stale++;}
  hashes.set(name,actual);
 }
 if(stale!==1)throw Error('Original pinned artifact seal exception differs');
 receipt.originalFilesVerified=hashes.size-1;receipt.originalSealException={file:'seal.log',sha256:OFFICE_REPLAY.staleSealSha256};
 const origin=JSON.parse(await readFile(join(artifact,'build-origin.json'),'utf8'));
 exact(origin.runId,OFFICE_REPLAY.runId,'Original source run');exact(origin.head,OFFICE_REPLAY.head,'Original source head');
 receipt.sourceHead=origin.head;
 const captureReceipt=JSON.parse(await readFile(join(capture,'receipt.json'),'utf8'));
 if(!captureReceipt.complete||captureReceipt.framesCompleted!==1251||captureReceipt.firstTime!==0||captureReceipt.lastTime!==250||captureReceipt.failure)throw Error('Original capture incomplete');
 const manifestBytes=await readFile(join(capture,'native-manifest.json'));exact(sha(manifestBytes),captureReceipt.nativeManifestSha256,'Original native manifest');
 const originalManifest=JSON.parse(manifestBytes),assetManifest=JSON.parse(await readFile(join(assets,'manifest.json'),'utf8'));
 exact(assetManifest.profiles['424x240'],originalManifest.profiles['424x240'],'Restored native profile');
 receipt.nativeManifestSha256=sha(manifestBytes);receipt.traceWorkerSha256=captureReceipt.traceWorkerSha256;
 const bundle=await readFile(bundleArg,'utf8');receipt.bundleSha256=sha(bundle);
 const sources=JSON.parse(await readFile(bundleArg+'.source.json','utf8'));
 exact(sources.sourceHead,OFFICE_REPLAY.head,'Replay host source pin');exact(sources.bundleSha256,receipt.bundleSha256,'Built replay bundle');receipt.sources=sources;
 server=createServer(async(req,res)=>{
  try{
   if(req.method!=='GET')throw Error('Read-only replay server');
   const name=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
   if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Saved native replay</title>');return;}
   const prefix=name.startsWith('/capture/')?'/capture/':name.startsWith('/assets/')?'/assets/':null;
   if(!prefix){res.writeHead(404);res.end();return;}
   const root=prefix==='/capture/'?capture:assets,path=await realpath(resolve(root,name.slice(prefix.length)));
   if(!path.startsWith(root+sep))throw Error('Replay route escapes its root');
   res.setHeader('Content-Type','application/octet-stream');createReadStream(path).on('error',()=>res.destroy()).pipe(res);
  }catch{res.writeHead(403);res.end();}
 });
 await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
 const base=`http://127.0.0.1:${server.address().port}/`;
 browser=await chromium.launch({headless:true,...chromiumLaunchOptions(),args:['--disable-gpu'],timeout:60000});
 receipt.chromium=browser.version();exact(receipt.chromium,OFFICE_REPLAY.chromium,'Pinned Chromium version');receipt.chromiumSandbox=true;
 const page=await browser.newPage();page.setDefaultTimeout(120000);
 // The replay page cannot contact external services or load application UI.
 await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
 await page.exposeFunction('officeReplaySave',async({meta,base64})=>{
  if(!OFFICE_REPLAY.snapshots.includes(meta.epoch)||!['previous','next'].includes(meta.side))throw Error('Unexpected snapshot identity');
  const raw=Buffer.from(base64,'base64');exact(raw.length,meta.rawBytes,'Snapshot bytes');exact(sha(raw),meta.rawSha256,'Snapshot hash');
  const stem=`epoch-${String(meta.epoch).padStart(4,'0')}-${meta.side}`,data=gzipSync(raw),file=stem+'.bin.gz';
  await writeFile(join(output,'snapshots-unqualified',file),data,{flag:'wx'});
  const record={...meta,file,sha256:sha(data),bytes:data.length};await writeFile(join(output,'snapshots-unqualified',stem+'.json'),JSON.stringify(record)+'\n',{flag:'wx'});
  return{epoch:meta.epoch,side:meta.side,file,sha256:record.sha256,rawSha256:meta.rawSha256,bytes:data.length};
 });
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.addScriptTag({content:bundle});
 await page.evaluate(async({base,hash})=>globalThis.OfficeReplay.initialize(base+'capture/',base+'assets/',hash),{base,hash:sha(manifestBytes)});
 for(let epoch=0;epoch<OFFICE_REPLAY.frames;epoch++){
  const expected=hashes.get(`capture/frames/${String(epoch).padStart(4,'0')}.json`);if(!expected)throw Error('Original frame missing from seal');
  let result;
  try{result=await page.evaluate(({epoch,hash})=>globalThis.OfficeReplay.epoch(epoch,hash),{epoch,hash:expected});}
  catch(error){const failure=await page.evaluate(()=>globalThis.OfficeReplay.failure);await writeFile(join(output,'first-mismatch.json'),JSON.stringify(failure,null,2)+'\n');throw error;}
  receipt.verifiedFrames++;receipt.assets=result.assetRecords;receipt.snapshots.push(...result.snapshots);
  if(result.snapshots.length){exact(result.snapshots.map(x=>x.side),['previous','next'],'Snapshot pair');receipt.snapshotEpochs.push(epoch);}
  if(epoch%25===0){receipt.elapsedMs=performance.now()-started;await save();console.log(JSON.stringify({epoch,verified:receipt.verifiedFrames,elapsedMs:receipt.elapsedMs}));}
 }
 receipt.status='pass';requireCompleteReplay(receipt);
 await rename(join(output,'snapshots-unqualified'),join(output,'snapshots'));
 receipt.qualified=true;receipt.qualification='All1251 exact presented/native/input/sparse/reference checks passed; new snapshots are readonly declared-state observations. Original full hidden state and transient proposals were not captured for byte comparison.';
}catch(error){receipt.status='failed';receipt.qualified=false;receipt.error=String(error);process.exitCode=1;}
finally{
 await browser?.close();if(server)await new Promise(ok=>server.close(ok));receipt.elapsedMs=performance.now()-started;await save();
 console.log(JSON.stringify({status:receipt.status,qualified:receipt.qualified,verifiedFrames:receipt.verifiedFrames,error:receipt.error??null}));
}
