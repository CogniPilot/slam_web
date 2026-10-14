// Restore the exact build tested/deployed by this run. Use gh's native HTTP
// client instead of the download action's deprecated Node ZIP implementation,
// retaining verification against GitHub's recorded archive digest.
import {execFile,spawn} from 'node:child_process';
import {promisify,parseArgs} from 'node:util';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';

const run=promisify(execFile);
const {values}=parseArgs({options:{repository:{type:'string'},'run-id':{type:'string'},destination:{type:'string'}}});
const repository=values.repository??process.env.GITHUB_REPOSITORY;
const runId=values['run-id']??process.env.GITHUB_RUN_ID;
if(!repository||!/^[-\w.]+\/[-\w.]+$/.test(repository)||!runId||!/^\d+$/.test(runId))throw new Error('Supply a GitHub repository and run ID');
const {stdout}=await run('gh',['api',`repos/${repository}/actions/runs/${runId}/artifacts`,'--paginate','--slurp']);
const artifacts=JSON.parse(stdout).flatMap(page=>page.artifacts).filter(artifact=>artifact.name==='github-pages'&&!artifact.expired);
if(artifacts.length!==1)throw new Error('Expected one unexpired github-pages artifact for this run');
const artifact=artifacts[0];
if(!/^sha256:[a-f0-9]{64}$/.test(artifact.digest??''))throw new Error('GitHub artifact lacks a SHA-256 digest');
const parent=join(homedir(),'scratch/slam_web/tmp');await mkdir(parent,{recursive:true});
const temporary=await mkdtemp(join(parent,'pages-artifact-'));
try{
  const archive=join(temporary,'artifact.zip');
  const child=spawn('gh',['api',`repos/${repository}/actions/artifacts/${artifact.id}/zip`],{stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',chunk=>{stderr+=String(chunk);});
  const completed=new Promise((accept,reject)=>{
    child.on('error',reject);child.on('close',code=>code===0?accept():reject(new Error(`Artifact download failed (${code}): ${stderr}`)));
  });
  try{await Promise.all([pipeline(child.stdout,createWriteStream(archive)),completed]);}
  finally{if(child.exitCode===null)child.kill();}
  const hash=createHash('sha256');for await(const chunk of createReadStream(archive))hash.update(chunk);
  if(`sha256:${hash.digest('hex')}`!==artifact.digest)throw new Error('GitHub Pages archive digest mismatch');
  const tar=join(temporary,'artifact.tar');
  await run('python3',['-c',`import sys, zipfile, shutil
with zipfile.ZipFile(sys.argv[1]) as archive:
    if archive.namelist() != ['artifact.tar']:
        raise ValueError('Unexpected Pages archive contents')
    with archive.open('artifact.tar') as source, open(sys.argv[2], 'wb') as target:
        shutil.copyfileobj(source, target)
`,archive,tar]);
  const destination=resolve(values.destination??'dist');await mkdir(destination,{recursive:true});
  await run('tar',['--extract','--file',tar,'--directory',destination,'--no-same-owner','--no-same-permissions']);
  console.log(`Restored verified Pages artifact ${artifact.id} from run ${runId}`);
}finally{await rm(temporary,{recursive:true,force:true});}
