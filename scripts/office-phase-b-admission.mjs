// Phase B job-1 admission: the one reviewed exception for the original capture artifact, whose only failure is the
// post-seal diagnostic line of the CI verifier (pipeline {stage: seal, exitCode: 1}). The original bytes and status are
// never edited. Without a granted admission receipt the existing rule stands: job 1 must be complete with exit 0.
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
export const CAPTURE_HEAD='064a76ed652fca1461ed2546ca0ba196c42d670d';
// The exact paths a successor head may change relative to the capture head. Nothing that the replay or comparison
// bundles, drivers, contracts, run scripts or src/ contain is here, so those stay byte-identical to the capture commit.
export const SUCCESSOR_PATHS=Object.freeze([
 '.github/workflows/pages.yml','docs/guides/office-phase-b.md','package.json',
 'scripts/admit-phase-b-capture.mjs','scripts/admit-phase-b-capture.test.mjs',
 'scripts/build-office-compare.mjs','scripts/build-office-replay.mjs','scripts/office-comparison-input.mjs',
 'scripts/office-phase-b-admission.mjs','scripts/office-phase-b-admission.test.mjs',
 'scripts/office-replay.test.mjs',
 'scripts/verify-office-ci-artifacts.mjs','scripts/verify-office-ci-artifacts.test.mjs']);
const HEX=/^[a-f0-9]{64}$/,COMMIT=/^[a-f0-9]{40}$/;
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const RECEIPT_FIELDS=['schemaVersion','status','grantSha256','runId','attempt','head','artifactId','archiveBytes','archiveSha256',
 'sealManifestSha256','sealedFiles','excluded','pipeline','failure','reproduced','scope'].sort();
/** A granted admission receipt, or null when none is named. */
export function loadAdmission(env=process.env){
 if(!env.OFFICE_PHASE_B_ADMISSION)return null;
 if(!HEX.test(env.OFFICE_PHASE_B_ADMISSION_SHA256??''))throw Error('Phase B admission requires the granted sha256');
 const raw=readFileSync(env.OFFICE_PHASE_B_ADMISSION);if(sha(raw)!==env.OFFICE_PHASE_B_ADMISSION_SHA256)throw Error('Phase B admission hash mismatch');
 const a=JSON.parse(raw);
 if(Object.keys(a).sort().join()!==RECEIPT_FIELDS.join()||a.schemaVersion!==1||a.status!=='admitted'||a.attempt!==1||a.head!==CAPTURE_HEAD
   ||!HEX.test(a.archiveSha256)||!HEX.test(a.sealManifestSha256)||a.pipeline?.stage!=='seal'||a.pipeline?.exitCode!==1
   ||a.failure?.error!=='ReferenceError: consensus is not defined'||a.failure?.line!=='scripts/verify-office-ci-artifacts.mjs:54')
  throw Error('Phase B admission receipt is not valid');
 return a;
}
/** Job 1's pipeline: complete/0, or exactly seal/1 with an admission bound to this same archive and seal. */
export function requireJob1Pipeline(pipeline,pin,admission=loadAdmission()){
 if(pipeline.stage==='complete'&&pipeline.exitCode===0)return 'complete';
 if(!admission)throw Error('Job-1 pipeline incomplete');
 if(pipeline.stage!=='seal'||pipeline.exitCode!==1||admission.runId!==pin.runId||admission.head!==pin.head||admission.artifactId!==pin.artifactId
   ||admission.archiveBytes!==pin.archiveBytes||admission.archiveSha256!==pin.archiveSha256||admission.sealManifestSha256!==pin.sealManifestSha256
   ||admission.sealedFiles!==pin.originalFiles)throw Error('Job-1 pipeline differs from its admission');
 return 'admitted';
}
/** The replay and comparison host: the capture commit itself, or a descendant whose diff from it is only SUCCESSOR_PATHS,
 * with package.json changed in exactly its one test:office-ci line. */
export function requirePhaseBHost(captureHead,host=process.env.GITHUB_SHA,git=(...a)=>execFileSync('git',a,{encoding:'utf8'})){
 if(!COMMIT.test(host??'')||!COMMIT.test(captureHead??''))throw Error('Phase B host and capture head must be commits');
 if(host===captureHead)return 'capture';
 try{git('merge-base','--is-ancestor',captureHead,host);}catch{throw Error('Phase B host does not descend from the capture commit');}
 const changed=git('diff','--name-only',captureHead,host).trim().split('\n').filter(Boolean);
 const extra=changed.filter(path=>!SUCCESSOR_PATHS.includes(path));
 if(extra.length)throw Error('Phase B successor changes paths outside the admission list: '+extra.join(', '));
 const pkg=git('diff','-U0',captureHead,host,'--','package.json').split('\n').filter(l=>/^[-+](?![-+])/.test(l));
 if(pkg.length&&(pkg.length!==2||!pkg.every(l=>/^[-+]\s*"test:office-ci": /.test(l))))throw Error('Phase B successor changes package.json beyond the test:office-ci line');
 return 'successor';
}
