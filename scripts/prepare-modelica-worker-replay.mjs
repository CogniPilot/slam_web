import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const [profilePath,initialRecordPath,output]=process.argv.slice(2);
if(!output)throw Error('Usage: prepare-modelica-worker-replay.mjs PROFILE INITIAL_CAPTURE_RECORD NEW_CACHE');
await mkdir(output);
await mkdir(join(output,'vendor/slam'),{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const profileBytes=await readFile(profilePath),profile=JSON.parse(profileBytes);
const initialBytes=await readFile(initialRecordPath),initial=JSON.parse(initialBytes);
// Extract only declared configuration. No truth, estimate or carried state is exposed.
await writeFile(join(output,'configuration.json'),JSON.stringify(initial.state.parameters)+'\n');
const workerUrl='https://cognipilot.github.io/slam_web/assets/modelica-slam.worker-D58knKIP.js';
const response=await fetch(workerUrl);if(!response.ok)throw Error('Published worker unavailable');
const worker=new Uint8Array(await response.arrayBuffer());
const workerSha='90db19412d5c7068a9d3f1a1565292fcc4adf272433b86d257ff9bfce820734b';
if(sha(worker)!==workerSha)throw Error('Published worker hash changed');
await writeFile(join(output,'worker.js'),worker);
await writeFile(join(output,'vendor/slam/manifest.json'),JSON.stringify({schemaVersion:1,...profile}));
const files=[];
for(const layout of Object.values(profile.models))for(const f of Object.values(layout.files)){
  if(!/^[\w.-]+$/.test(f.file))throw Error('Unsafe asset filename');
  const r=await fetch('https://cognipilot.github.io/slam_web/vendor/slam/'+f.file);
  if(!r.ok)throw Error('Published asset unavailable');
  const bytes=new Uint8Array(await r.arrayBuffer());
  const decoded=f.encoding==='gzip'&&bytes[0]===31&&bytes[1]===139?gunzipSync(bytes):bytes;
  if(decoded.length!==f.bytes||sha(decoded)!==f.sha256)throw Error('Asset integrity failure: '+f.file);
  await writeFile(join(output,'vendor/slam',f.file),bytes);
  files.push({file:f.file,storedSha256:sha(bytes),decodedSha256:sha(decoded),decodedBytes:decoded.length});
}
await writeFile(join(output,'receipt.json'),JSON.stringify({workerUrl,workerSha256:workerSha,
  profileSha256:sha(profileBytes),initialConfigurationSourceSha256:sha(initialBytes),sourceSha256:profile.sourceSha256,files},null,2)+'\n');
console.log(JSON.stringify({workerSha256:workerSha,files:files.length,output}));
