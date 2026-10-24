import {execFile,spawn} from 'node:child_process';import {promisify} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';import {createReadStream,createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';import {createHash} from 'node:crypto';import {resolve,join} from 'node:path';
import {exact} from './office-replay-contract.mjs';
import {QUALIFIED_BASELINE} from './office-compare-contract.mjs';
import {loadPhaseBReplayPin,loadPhaseBCandidatePin} from './office-phase-b-replay-pin.mjs';
// Phase B pass 1 restores the granted job-1 capture artifact, pass 2 the granted job-2 artifact; Phase A its fixed baseline.
const pass=process.env.OFFICE_PHASE_B_PASS;
const pin=pass==='2'?loadPhaseBCandidatePin(process.env.OFFICE_PHASE_B_CANDIDATE_PIN,process.env.OFFICE_PHASE_B_CANDIDATE_PIN_SHA256)
 :pass?loadPhaseBReplayPin(process.env.OFFICE_PHASE_B_PIN,process.env.OFFICE_PHASE_B_PIN_SHA256):QUALIFIED_BASELINE;
const[output,archive]=process.argv.slice(2);if(!archive||process.argv.length!==4)throw Error('Usage: restore-office-comparison-input.mjs NEW_OUTPUT NEW_ARCHIVE');
const root=resolve(output);await mkdir(root);const run=promisify(execFile);
// Keep same-repository Actions access separate from dependency artifact access.
const artifactEnv={...process.env,GH_TOKEN:process.env.OFFICE_REPLAY_ARTIFACT_TOKEN??process.env.GH_TOKEN};
const api=async path=>JSON.parse((await run('gh',['api',`repos/${pin.repository}/${path}`],{env:artifactEnv,maxBuffer:4*1024**2})).stdout);
const originalRun=await api(`actions/runs/${pin.runId}`);exact(originalRun.head_sha,pin.head,'Original run head');
const artifact=await api(`actions/artifacts/${pin.artifactId}`);
exact(artifact.id,pin.artifactId,'Artifact ID');exact(artifact.name,pin.artifactName,'Artifact name');
exact(artifact.size_in_bytes,pin.archiveBytes,'Artifact size');exact(artifact.digest,'sha256:'+pin.archiveSha256,'Artifact API digest');
if(artifact.expired||String(artifact.workflow_run?.id)!==pin.runId)throw Error('Pinned artifact unavailable or run differs');
const child=spawn('gh',['api',`repos/${pin.repository}/actions/artifacts/${pin.artifactId}/zip`],{env:artifactEnv,stdio:['ignore','pipe','pipe']});
let stderr='';child.stderr.on('data',b=>{stderr+=String(b);});
const done=new Promise((ok,fail)=>{child.on('error',fail);child.on('close',code=>code===0?ok():fail(Error('Pinned artifact download failed: '+stderr)));});
try{await Promise.all([pipeline(child.stdout,createWriteStream(archive,{flags:'wx'})),done]);}finally{if(child.exitCode===null)child.kill();}
const h=createHash('sha256');for await(const b of createReadStream(archive))h.update(b);exact(h.digest('hex'),pin.archiveSha256,'Original archive digest');
const destination=join(root,'qualified');
await run('python3',['-c',`import pathlib,stat,sys,zipfile
root=pathlib.Path(sys.argv[2]);root.mkdir()
with zipfile.ZipFile(sys.argv[1]) as archive:
    entries=archive.infolist()
    if len(entries)>5000 or sum(e.file_size for e in entries)>4*1024**3: raise ValueError('Archive exceeds fixed replay budget')
    seen=set()
    for entry in entries:
        name=pathlib.PurePosixPath(entry.filename)
        if name.is_absolute() or '..' in name.parts or entry.filename in seen or stat.S_ISLNK(entry.external_attr>>16): raise ValueError('Unsafe archive member')
        seen.add(entry.filename)
    archive.extractall(root)
`,archive,destination],{maxBuffer:1024**2});
await writeFile(join(root,'input-receipt.json'),JSON.stringify({pin,apiDigest:artifact.digest,archiveSha256:pin.archiveSha256,sourceHead:originalRun.head_sha,original:destination},null,2)+'\n');
console.log(JSON.stringify({artifactId:pin.artifactId,sourceHead:pin.head,archiveSha256:pin.archiveSha256,destination}));
