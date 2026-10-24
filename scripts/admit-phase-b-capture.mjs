// Admission check for the original Phase B job-1 artifact (read-only on the zip it is handed). It writes only NEW_OUT:
// an admission receipt on success, a refusal receipt otherwise. Its extraction and scratch copies are removed afterwards.
// Usage: node scripts/admit-phase-b-capture.mjs GRANT.json GRANT_SHA256 ARTIFACT.zip NEW_OUT
import {readFileSync,writeFileSync,mkdirSync,readdirSync,lstatSync,linkSync,rmSync} from 'node:fs';
import {join,relative} from 'node:path';import {createHash} from 'node:crypto';import {execFileSync,spawnSync} from 'node:child_process';
import {CAPTURE_HEAD} from './office-phase-b-admission.mjs';
const sha=raw=>createHash('sha256').update(raw).digest('hex');
export const EXCLUDED=Object.freeze(['pipeline-status.json','seal.log']);
export const FAILURE=Object.freeze({error:'ReferenceError: consensus is not defined',line:'scripts/verify-office-ci-artifacts.mjs:54'});
const check=(ok,why)=>{if(!ok)throw Error(why);};
const GRANT_FIELDS=['schemaVersion','experiment','repository','runId','attempt','head','artifactId','artifactName','archiveBytes','archiveSha256'].sort();
/** The admission grant: exact bytes and fields, the frozen capture head, attempt 1. */
export function validateGrant(raw,grantSha){
 check(/^[a-f0-9]{64}$/.test(grantSha??'')&&sha(raw)===grantSha,'grant hash mismatch');
 const g=JSON.parse(raw);check(Object.keys(g).sort().join()===GRANT_FIELDS.join(),'grant fields differ');
 check(g.schemaVersion===1&&g.experiment==='phase-b-job1-admission'&&g.repository==='CogniPilot/slam_web'&&/^[0-9]+$/.test(g.runId)&&g.attempt===1
  &&g.head===CAPTURE_HEAD&&Number.isInteger(g.artifactId)&&g.artifactName===`office-loop-software-${g.runId}-1`&&Number.isInteger(g.archiveBytes)
  &&/^[a-f0-9]{64}$/.test(g.archiveSha256),'grant is not valid');
 return g;
}
/** The exact original zip, then a safe extraction (absolute, parent, duplicate or symlink members refused). */
export function extractArchive(zipPath,g,root){
 const zip=readFileSync(zipPath);check(zip.length===g.archiveBytes&&sha(zip)===g.archiveSha256,'archive is not the granted original');
 execFileSync('python3',['-I','-B','-c',`import pathlib,stat,sys,zipfile
root=pathlib.Path(sys.argv[2]);root.mkdir()
with zipfile.ZipFile(sys.argv[1]) as archive:
    entries=archive.infolist()
    if len(entries)>8000 or sum(e.file_size for e in entries)>4*1024**3: raise ValueError('archive exceeds the admission budget')
    seen=set()
    for entry in entries:
        name=pathlib.PurePosixPath(entry.filename)
        if name.is_absolute() or '..' in name.parts or entry.filename in seen or stat.S_ISLNK(entry.external_attr>>16): raise ValueError('unsafe member')
        seen.add(entry.filename)
    archive.extractall(root)
`,zipPath,root],{stdio:['ignore','ignore','pipe']});
 return{archiveBytes:zip.length,archiveSha256:sha(zip)};
}
/** Every admission check on an extracted artifact. Throws on the first failure; work/ holds the scratch copies. */
export function admitExtracted(root,g,work){
 const files=[];const walk=d=>{for(const e of readdirSync(d)){const p=join(d,e),s=lstatSync(p);check(!s.isSymbolicLink(),'symlink in artifact');s.isDirectory()?walk(p):files.push(relative(root,p));}};walk(root);
 // Inventory == manifest, excluding exactly pipeline-status.json and seal.log; every sealed hash.
 const manifest=readFileSync(join(root,'SHA256SUMS'));const lines=manifest.toString().trim().split('\n').map(l=>{const i=l.indexOf('  ');return [l.slice(0,i),l.slice(i+2)];});
 const listed=new Set(lines.map(([,n])=>n));check(listed.size===lines.length,'duplicate manifest entry');
 for(const name of EXCLUDED)check(files.includes(name)&&!listed.has(name),'missing or sealed '+name);
 const rest=files.filter(f=>f!=='SHA256SUMS'&&!EXCLUDED.includes(f));
 check(rest.length===listed.size&&rest.every(f=>listed.has(f)),'artifact inventory differs from SHA256SUMS');
 for(const [digest,name] of lines)check(sha(readFileSync(join(root,name)))===digest,'sealed file differs: '+name);
 // The recorded failure: exactly seal/1, and seal.log's only error is the post-seal ReferenceError at line 54.
 const pipeline=JSON.parse(readFileSync(join(root,'pipeline-status.json')));
 check(Object.keys(pipeline).sort().join()==='exitCode,finishedAt,schemaVersion,scope,stage'&&pipeline.schemaVersion===1&&pipeline.stage==='seal'&&pipeline.exitCode===1,'pipeline status is not exactly seal/1');
 const log=readFileSync(join(root,'seal.log'),'utf8'),errors=log.split('\n').filter(l=>/^\s*\w*Error\b/.test(l));
 check(errors.length===1&&errors[0].trim()===FAILURE.error&&log.includes('verify-office-ci-artifacts.mjs:54'),'seal.log is not the sole post-seal ReferenceError');
 // Identity of the run and the capture.
 const origin=JSON.parse(readFileSync(join(root,'build-origin.json')));check(origin.runId===g.runId&&origin.head===g.head,'build origin differs from the grant');
 const capture=JSON.parse(readFileSync(join(root,'capture/receipt.json')));check(capture.scene==='office-loop-two-circuit'&&capture.complete===true,'not a complete two-circuit capture');
 // Independent reproduction on a scratch copy: the repaired verifier must regenerate summary.json and SHA256SUMS byte for
 // byte, and both flight checks must regenerate their receipts byte for byte. Only files the verifier reads are linked.
 const scratch=join(work,'scratch');
 for(const f of rest.filter(f=>f!=='summary.json')){mkdirSync(join(scratch,f,'..'),{recursive:true});linkSync(join(root,f),join(scratch,f));}
 const node=args=>spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:8*1024**2});
 const seal=node([new URL('./verify-office-ci-artifacts.mjs',import.meta.url).pathname,scratch]);check(seal.status===0,'repaired verifier refused the copy: '+seal.stderr.slice(-400));
 check(sha(readFileSync(join(scratch,'summary.json')))===sha(readFileSync(join(root,'summary.json'))),'regenerated summary.json differs');
 check(sha(readFileSync(join(scratch,'SHA256SUMS')))===sha(manifest),'regenerated SHA256SUMS differs');
 const flight={};
 for(const mode of ['envelope','return']){
  const dir=join(work,'reproduced-'+mode),run=node([new URL('./office-phase-b-checks.mjs',import.meta.url).pathname,mode,'--capture',join(scratch,'capture'),'--route','two-circuit','--out',dir]);
  check(run.status===0,'flight '+mode+' reproduction refused');
  const archived=readFileSync(join(root,'flight',mode,mode+'-receipt.json'));
  check(sha(readFileSync(join(dir,mode+'-receipt.json')))===sha(archived),'flight '+mode+' receipt differs on reproduction');flight[mode]=sha(archived);
 }
 return{sealManifestSha256:sha(manifest),sealedFiles:lines.length,excluded:[...EXCLUDED],pipeline:{stage:pipeline.stage,exitCode:pipeline.exitCode},
  failure:{...FAILURE,after:'SHA256SUMS written at line 53'},reproduced:{summarySha256:sha(readFileSync(join(root,'summary.json'))),sealManifestSha256:sha(manifest),flight}};
}
if(import.meta.url===`file://${process.argv[1]}`){
 const [grantPath,grantSha,zipPath,out]=process.argv.slice(2);
 if(!out||process.argv.length!==6)throw Error('Usage: admit-phase-b-capture.mjs GRANT.json GRANT_SHA256 ARTIFACT.zip NEW_OUT');
 mkdirSync(out);
 const receipt={schemaVersion:1,status:'refused',grantSha256:grantSha,scope:'Admission of the original job-1 artifact for Phase B continuation only. '
  +'Its recorded failure stays part of the evidence; no capture, label or outcome is assessed here.'};
 try{
  const g=validateGrant(readFileSync(grantPath),grantSha);
  Object.assign(receipt,{runId:g.runId,attempt:g.attempt,head:g.head,artifactId:g.artifactId},extractArchive(zipPath,g,join(out,'extracted')));
  Object.assign(receipt,admitExtracted(join(out,'extracted'),g,out));receipt.status='admitted';
 }catch(error){receipt.error=String(error.message??error);process.exitCode=2;}
 finally{
  for(const d of ['scratch','extracted','reproduced-envelope','reproduced-return'])rmSync(join(out,d),{recursive:true,force:true});
  writeFileSync(join(out,receipt.status==='admitted'?'admission-receipt.json':'refusal-receipt.json'),JSON.stringify(receipt,null,1)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:receipt.status,error:receipt.error??null}));
 }
}
