import{chromium}from'@playwright/test';import{createServer}from'node:http';import{createReadStream}from'node:fs';
import{readFile,writeFile,mkdir,realpath,link,copyFile,statfs}from'node:fs/promises';import{join,resolve,sep}from'node:path';
import{createHash}from'node:crypto';import{gzipSync}from'node:zlib';
import{chromiumLaunchOptions}from'./browser-launch.mjs';
import{OFFICE_REPLAY,exact}from'./office-replay-contract.mjs';
import{requireCompleteComparison,prefixSnapshot}from'./office-compare-contract.mjs';
import{verifyOfficeComparisonInput,verifyPhaseBCaptureInput}from'./office-comparison-input.mjs';
import{phaseBComparison,requireCompletePhaseBComparison}from'./office-phase-b-compare.mjs';
const[inputArg,assetsArg,outputArg,bundleArg,contractArg]=process.argv.slice(2);
if(!contractArg||process.argv.length!==7)throw Error('Usage: compare-office-browser.mjs QUALIFIED_REPLAY CANDIDATE_ASSETS NEW_OUTPUT BUNDLE CONTRACT');
if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!=='CogniPilot/slam_web')throw Error('Full native comparison requires reviewed CI');
// Phase A input is a qualified replay root; Phase B pass 1 input is the sealed job-1 capture artifact itself.
const passB=process.env.OFFICE_PHASE_B_PASS;if(passB==='2')throw Error('Phase B pass 2 comparison is wired in job 3 (checkpoint C3)');
const input=await realpath(inputArg),original=join(input,'input/original'),capture=passB?join(input,'capture'):join(original,'capture'),assets=await realpath(assetsArg),output=resolve(outputArg);
const frameKey=stem=>(passB?'capture':'input/original/capture')+`/frames/${stem}.json`;
await mkdir(output);const candidate=join(output,'capture');await mkdir(candidate);for(const part of ['frames','native-frames','declared-state'])await mkdir(join(candidate,part));
const sha=b=>createHash('sha256').update(b).digest('hex'),started=performance.now();
const receipt={schemaVersion:1,status:'running',completedFrames:0,prefixFrames:0,prefixSnapshotChecks:0,snapshots:[],assets:[],
 scope:'Whole-native candidate replay of immutable observations. Exact prefix is a gate; later collection is not loop-closure acceptance or baseline equivalence.'};
const save=()=>writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');await save();let browser,server;
try{
 const mode=await phaseBComparison(capture);if(mode)receipt.phaseB={pass:mode.pass,B:mode.B,prefixEnd:mode.prefixEnd,captureRun:mode.pin.runId,captureHead:mode.pin.head};
 const{files,manifestBytes,candidateBytes,contract}=mode?await verifyPhaseBCaptureInput(input,assets,contractArg,mode.pin):await verifyOfficeComparisonInput(input,assets,contractArg);receipt.originalReplayFilesVerified=files.size;
 receipt.contract=contract;receipt.nativeManifestSha256=sha(candidateBytes);receipt.originalNativeManifestSha256=sha(manifestBytes);
 const bundle=await readFile(bundleArg,'utf8'),sources=JSON.parse(await readFile(bundleArg+'.source.json'));
 exact(sources.sourceHead,mode?mode.pin.head:OFFICE_REPLAY.head,'Unchanged original host source');exact(sources.bundleSha256,sha(bundle),'Comparison bundle');receipt.sources=sources;
 await copyFile(join(capture,'project.json'),join(candidate,'project.json'));await writeFile(join(candidate,'native-manifest.json'),candidateBytes);
 server=createServer(async(req,res)=>{
  try{
   if(req.method!=='GET')throw Error('Read only');const name=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
   if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Saved native comparison</title>');return;}
   const prefix=name.startsWith('/capture/')?'/capture/':name.startsWith('/assets/')?'/assets/':null;if(!prefix){res.writeHead(404);res.end();return;}
   const root=prefix==='/capture/'?capture:assets,path=await realpath(resolve(root,name.slice(prefix.length)));if(!path.startsWith(root+sep))throw Error('Route escapes root');
   res.setHeader('Content-Type','application/octet-stream');createReadStream(path).on('error',()=>res.destroy()).pipe(res);
  }catch{res.writeHead(403);res.end();}
 });
 await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});const base=`http://127.0.0.1:${server.address().port}/`;
 browser=await chromium.launch({headless:true,...chromiumLaunchOptions(),args:['--disable-gpu'],timeout:60000});receipt.chromium=browser.version();exact(receipt.chromium,mode?mode.pin.chromium:OFFICE_REPLAY.chromium,'Pinned sandboxed browser');
 const page=await browser.newPage();page.setDefaultTimeout(120000);await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
 await page.exposeFunction('officeCompareReference',async({file,sha256,base64})=>{
  if(!/^native-frames\/\d+-\d+-\d+-[a-f0-9]{16}\.json$/.test(file))throw Error('Invalid candidate reference path');const bytes=Buffer.from(base64,'base64');
  if(bytes.length>2*1024**2)throw Error('Reference exceeds fixed frame domain');exact(sha(bytes),sha256,'Candidate reference bytes');await writeFile(join(candidate,file),bytes,{flag:'wx'});
 });
 await page.exposeFunction('officeCompareSnapshot',async({meta,base64})=>{
  if(!(mode?mode.snapshots:OFFICE_REPLAY.snapshots).includes(meta.epoch)||!['previous','next'].includes(meta.side))throw Error('Unexpected snapshot identity');
  const raw=Buffer.from(base64,'base64');exact(raw.length,meta.rawBytes,'Candidate declared bytes');exact(sha(raw),meta.rawSha256,'Candidate raw snapshot');
  const oldStem=`epoch-${String(meta.epoch).padStart(4,'0')}-${meta.side}`,old=JSON.parse(await readFile(join(input,'replay/snapshots',oldStem+'.json')));
  exact(meta.runs,old.runs,'Named declared-state packing');exact(meta.stateHash,old.stateHash,'Declared state name identity');
  if(prefixSnapshot(meta.epoch,meta.side)){exact(meta.rawSha256,old.rawSha256,'Exact predivergence declared state');receipt.prefixSnapshotChecks++;}
  const compressed=gzipSync(raw),file=oldStem+'.bin.gz';await writeFile(join(candidate,'declared-state',file),compressed,{flag:'wx'});
  const record={...meta,file,bytes:compressed.length,sha256:sha(compressed),prefixMatched:prefixSnapshot(meta.epoch,meta.side)};
  await writeFile(join(candidate,'declared-state',oldStem+'.json'),JSON.stringify(record)+'\n',{flag:'wx'});return record;
 });
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.addScriptTag({content:bundle});
 await page.evaluate(async({base,oldHash,newHash,phaseB})=>globalThis.OfficeCompare.initialize(base+'capture/',base+'assets/',oldHash,newHash,phaseB),
  {base,oldHash:sha(manifestBytes),newHash:sha(candidateBytes),phaseB:mode?{wanted:[...mode.snapshots],prefixEnd:mode.prefixEnd}:undefined});
 for(let epoch=0;epoch<1251;epoch++){
  if(epoch%50===0){const disk=await statfs(output);if(disk.bavail*disk.bsize<512*1024**2)throw Error('Comparison free-disk guard');}
  const stem=String(epoch).padStart(4,'0'),name=frameKey(stem),hash=files.get(name);if(!hash)throw Error('Original frame not bound to qualified replay');
  let result;try{result=await page.evaluate(({epoch,hash})=>globalThis.OfficeCompare.epoch(epoch,hash),{epoch,hash});}
  catch(error){await writeFile(join(output,'first-failure.json'),JSON.stringify(await page.evaluate(()=>globalThis.OfficeCompare.failure),null,2)+'\n');throw error;}
  const sample=JSON.parse(await readFile(join(capture,'frames',stem+'.json')));sample.native=result.native;sample.nativeTrace=result.nativeTrace;
  for(const binding of Object.values(sample.image))await link(join(capture,binding.file),join(candidate,binding.file));
  await writeFile(join(candidate,'frames',stem+'.json'),JSON.stringify(sample)+'\n');receipt.completedFrames++;
  if(epoch<(mode?mode.prefixEnd:1206))receipt.prefixFrames++;if(result.firstDifference&&!receipt.firstObservedDivergence)receipt.firstObservedDivergence={epoch,time:sample.time,...result.firstDifference};
  receipt.snapshots.push(...result.snapshots);receipt.assets=result.assetRecords;
  if(epoch%25===0){receipt.elapsedMs=performance.now()-started;await save();console.log(JSON.stringify({epoch,completed:receipt.completedFrames,prefixFrames:receipt.prefixFrames,elapsedMs:receipt.elapsedMs}));}
 }
 receipt.status='complete';if(mode)requireCompletePhaseBComparison(receipt,mode);else requireCompleteComparison(receipt);receipt.prefixQualified=true;
 await writeFile(join(candidate,'receipt.json'),JSON.stringify({complete:true,framesCompleted:1251,expectedFrames:1251,firstTime:0,lastTime:250,nativeManifestSha256:receipt.nativeManifestSha256,
  acquisition:'Immutable saved observations; no new rendering',prefixFrames:mode?mode.prefixEnd:1206,prefixSnapshotChecks:mode?mode.expectedPrefixChecks:15,scope:'Candidate capture collection, not closure/correction acceptance.'},null,2)+'\n');
}catch(error){receipt.status='failed';receipt.prefixQualified=false;receipt.error=String(error);process.exitCode=1;}
finally{await browser?.close();if(server)await new Promise(ok=>server.close(ok));receipt.elapsedMs=performance.now()-started;await save();console.log(JSON.stringify({status:receipt.status,completedFrames:receipt.completedFrames,prefixQualified:receipt.prefixQualified,error:receipt.error??null}));}
