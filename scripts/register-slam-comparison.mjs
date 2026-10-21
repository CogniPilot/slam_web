import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, join, relative, isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {registerDepth} from './rgbd-registration.mjs';

const [inputDirectory, captureDirectory, outputDirectory] = process.argv.slice(2);
const wallStart = performance.now();
if (!outputDirectory) throw Error('Usage: register-slam-comparison.mjs INPUTS CAPTURE NEW_OUTPUT');
const input = resolve(inputDirectory), capture = resolve(captureDirectory), output = resolve(outputDirectory);
const sha = b => createHash('sha256').update(b).digest('hex');
// Scene ids are sealed by prepare-slam-comparison.mjs and also name output folders.
const SCENE_ID = /^[a-z][a-z0-9-]{0,31}$/;
const raw = await readFile(join(input, 'sensors.json'));
const manifest = JSON.parse(await readFile(join(input, 'manifest.json')));
if (sha(raw) !== manifest.sensorsSha256) throw Error('Sealed sensor manifest hash mismatch');
const sensors = JSON.parse(raw);
if (sensors.sensorFrames.length !== manifest.frames) throw Error('Frame count mismatch');
await mkdir(output); // A sealed output is never overwritten.
const rows = [], timings = [], frameTimings = [];
let valid = 0, pixels = 0;
for (const frame of sensors.sensorFrames) {
  const frameStart = performance.now();
  if (typeof frame.scene !== 'string' || !SCENE_ID.test(frame.scene) || !Number.isSafeInteger(frame.index) || frame.index < 0)
    throw Error('Invalid frame identity');
  const sourceBytes = {};
  for (const kind of ['rgb', 'depth']) {
    const image = frame.images[kind], path = resolve(capture, image.path), rel = relative(capture, path);
    if (rel === '..' || rel.startsWith('../') || isAbsolute(rel)) throw Error('Source path escape');
    const bytes = await readFile(path);
    if (bytes.length !== image.bytes || sha(bytes) !== image.sha256) throw Error('Source image hash mismatch');
    sourceBytes[kind] = bytes;
  }
  const start = performance.now();
  const registered = registerDepth(sourceBytes.depth, frame.calibration, frame.imageLayout.depth);
  timings.push(performance.now() - start);
  for (let i = 0; i < registered.length; i += 2) { pixels++; if (registered.readUInt16LE(i)) valid++; }
  const folder = join(output, frame.scene);
  await mkdir(folder, {recursive:true});
  const prefix = String(frame.index).padStart(4, '0');
  const images = {};
  for (const [kind, bytes] of [['rgb', sourceBytes.rgb], ['depth', registered]]) {
    const path = join(frame.scene, prefix + '-' + kind + '.bin');
    await writeFile(join(output, path), bytes);
    images[kind] = {path, bytes:bytes.length, sha256:sha(bytes)};
  }
  // Registered RGB-D-only track: deliberately exclude IMU and all evaluator state.
  const k = frame.calibration;
  rows.push({scene:frame.scene,index:frame.index,time:frame.time,sequence:frame.sequence,
    imageLayout:{...frame.imageLayout,aligned:true},
    calibration:{...k,fx:k.rgbFx,fy:k.rgbFy},images});
  frameTimings.push(performance.now() - frameStart);
}
const bytes = JSON.stringify({schema:1,format:'slam-lab-registered-rgbd-v1',sensorFrames:rows}) + '\n';
await writeFile(join(output,'sensors.json'), bytes);
const sorted = timings.slice().sort((a,b)=>a-b), quantile = p => sorted[Math.ceil(p * sorted.length)-1];
const receipt = {schema:1,track:'RGB-D only',frames:rows.length,sourceSensorsSha256:sha(raw),sensorsSha256:sha(bytes),
  registration:'co-located pixel-footprint projection, nearest axial Z, zeros remain invalid',
  extrinsicEvidence:'world.ts captureImages uses same sensor pose; baseline is disparity-noise only',
  registrationMs:{total:timings.reduce((a,b)=>a+b,0),p50:quantile(.5),p95:quantile(.95),p99:quantile(.99)},
  offlinePreparationMs:{wall:performance.now()-wallStart,perFrame:frameTimings},
  validDepthPixels:valid,totalPixels:pixels,validFraction:valid/pixels,
  peakRssKiB:process.resourceUsage().maxRSS,estimatorRuns:0};
await writeFile(join(output,'manifest.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));
