// Diagnostic input packaging: original RGB8/Z16 bytes and held IMU, no oracle.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {rgbdSlamSourceManifest as sources} from '../src/modelica-slam-source-manifest.mjs';

const [capturePath, referenceFile, generatedDirectory, outputFile] = process.argv.slice(2);
if (!outputFile) throw Error('CAPTURE REFERENCE_REPORT GENERATED_DIRECTORY NEW_INPUT required');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const capture = fs.realpathSync(capturePath);
const referenceBytes = fs.readFileSync(referenceFile), reference = JSON.parse(referenceBytes);
assert.equal(reference.status, 'OMC_RENDERED_FLIGHT_SLAM_REFERENCE_PASS');
assert.equal(reference.scenario, 'revisit');
assert.equal(reference.referenceCflags, '-O2');
assert.equal(reference.bookendsEqual, true);
assert.equal(reference.renderedFlightReferenceQualified, true);
assert.equal(reference.result.checks.length, 24);
assert.ok(reference.result.checks.every(check => check === true));
const manifestBytes = fs.readFileSync(path.join(capture, 'manifest.json'));
assert.equal(sha(manifestBytes), reference.captureManifestSha256);
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.schema, 'modelica-rendered-flight-frames-v2');
assert.equal(manifest.status, 'ACTUAL_RUMOCA_FLIGHT_RGBD_CAPTURE_PASS');
assert.equal(manifest.frameCount, reference.frames.length);
assert.ok(manifest.frames.length >= 2 && manifest.frames.length <= 121);
const currentSources = [...sources.paths, 'models/SLAM/RGBDFastSLAMIntervals.mo'].map(file => {
  const bytes = fs.readFileSync(file), entry = reference.sources.find(source => source.path === file);
  assert.equal(sha(bytes), entry?.sha256, `Changed authored source: ${file}`);
  return {path: file, sha256: sha(bytes)};
});
const generated = ['functions.c', 'functions.h', 'records.c', 'literals.h'].map(suffix => {
  const name = `RGBDRenderedRevisitGridAcceptance_${suffix}`;
  const bytes = fs.readFileSync(path.join(generatedDirectory, name));
  assert.equal(sha(bytes), reference.generated.find(entry => entry.path === name)?.sha256,
    `Changed generated source: ${name}`);
  return {path: name, bytes: bytes.length, sha256: sha(bytes)};
});
function read(name, digest) {
  assert.ok(typeof name === 'string' && !path.isAbsolute(name));
  const file = fs.realpathSync(path.join(capture, name));
  assert.ok(file.startsWith(capture + path.sep), 'Capture path escapes root');
  const bytes = fs.readFileSync(file);
  assert.equal(sha(bytes), digest, `Changed capture bytes: ${name}`);
  return bytes;
}
const measurements = JSON.parse(read(manifest.measurements.path, manifest.measurements.sha256));
const c = manifest.calibration, {height, width} = c;
assert.deepEqual(reference.imageSize, [height, width]);
const units = manifest.frames[0].depth.unitsMeters;
assert.ok(Number.isFinite(units) && units > 0);
const fd = fs.openSync(outputFile, 'wx'), hash = createHash('sha256');
let written = 0;
function write(bytes) {
  assert.equal(fs.writeSync(fd, bytes), bytes.length);
  hash.update(bytes); written += bytes.length;
}
function integers(values) {
  const bytes = Buffer.alloc(values.length * 8);
  values.forEach((value, index) => {
    assert.ok(Number.isSafeInteger(value) && value >= 0);
    bytes.writeBigUInt64LE(BigInt(value), index * 8);
  });
  write(bytes);
}
function reals(values) {
  const bytes = Buffer.alloc(values.length * 8);
  values.forEach((value, index) => {assert.ok(Number.isFinite(value)); bytes.writeDoubleLE(value, index * 8);});
  write(bytes);
}
const frames = [];
try {
  integers([1, manifest.frames.length, height, width, 3]);
  reals([c.fx,c.fy,c.cx,c.cy,c.rgbFx,c.rgbFy,c.baseline,c.depthNoiseDisparityPx,
    c.depthNoiseReferenceFx,...c.originFlu,c.near,c.far]);
  reals(c.opticalToBody);
  reals([...measurements.samples[0].imu.accel,...measurements.samples[0].imu.gyro,units]);
  for (const [index, frame] of manifest.frames.entries()) {
    assert.equal(frame.sequence, index);
    assert.equal(frame.time, reference.frames[index].time);
    assert.deepEqual(frame.rgb.shape, [height,width,3]);
    assert.deepEqual(frame.depth.shape, [height,width]);
    assert.equal(frame.rgb.type, 'Uint8'); assert.equal(frame.depth.type, 'Uint16');
    assert.equal(frame.depth.endianness, 'little'); assert.equal(frame.depth.unitsMeters, units);
    assert.deepEqual(frame.imuIntervals, index ? measurements.batches[index-1].imuIntervals : []);
    const rgb = read(frame.rgb.path, frame.rgb.sha256), depth = read(frame.depth.path, frame.depth.sha256);
    assert.equal(rgb.length, height*width*3); assert.equal(depth.length, height*width*2);
    assert.equal(sha(rgb), reference.frames[index].rgbSha256);
    assert.equal(sha(depth), reference.frames[index].depthSha256);
    assert.ok(frame.imuIntervals.length <= 36);
    reals([frame.time]); integers([frame.imuIntervals.length]);
    for (const hold of frame.imuIntervals) reals([hold.time,hold.dt,...hold.imu.accel,...hold.imu.gyro]);
    write(rgb); write(depth);
    frames.push({sequence:index,time:frame.time,holds:frame.imuIntervals.length,
      rgbSha256:sha(rgb),depthSha256:sha(depth)});
  }
} finally {fs.closeSync(fd);}
const report = {status:'REFERENCE_BOUND_RAW_CAMERA_INPUT_PACKED',
  referenceReportSha256:sha(referenceBytes),captureManifestSha256:sha(manifestBytes),
  input:{bytes:written,sha256:hash.digest('hex')},currentSources,generated,frames,
  packerSha256:sha(fs.readFileSync(import.meta.filename)),
  scope:'Test-only binary packaging of captured raw bytes, calibration and held IMU. '
    + 'No camera conversion, estimator math, oracle poses or supplied loop edges in the input.'};
fs.writeFileSync(outputFile+'.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,input:report.input,frames:frames.length}));
