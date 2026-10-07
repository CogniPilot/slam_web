// Independent oracle analysis only. Never imported by application/Modelica runtime.
// Evaluates captured correspondences; it does not fit or publish an SLAM pose.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Matrix3,Matrix4,Quaternion,Vector3} from 'three';

const [replayDirectory,captureDirectory,destination]=process.argv.slice(2);
if(!destination||fs.existsSync(destination))throw Error('REPLAY_DIRECTORY CAPTURE_DIRECTORY FRESH_REPORT required');
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p));
const replay=read(path.join(replayDirectory,'report.json')),capture=read(path.join(captureDirectory,'manifest.json'));
assert.equal(replay.captureManifestSha256,sha(fs.readFileSync(path.join(captureDirectory,'manifest.json'))));
assert.equal(replay.bookendsEqual,true);assert.equal(replay.result.rowsValid,true);
const proof=replay.matchedPairDiagnostic;assert.equal(proof?.present,true);
const bytes=fs.readFileSync(path.join(replayDirectory,proof.path));assert.equal(sha(bytes),proof.sha256);
// Independently decode the one matrix written by Modelica's MATv4 API.
assert.equal(bytes.readInt32LE(0),0);assert.equal(bytes.readInt32LE(12),0);
const rows=bytes.readInt32LE(4),columns=bytes.readInt32LE(8),labelBytes=bytes.readInt32LE(16);
assert.ok(rows>0&&rows<=10000);assert.equal(columns,7);assert.ok(labelBytes>0&&labelBytes<100);
assert.equal(bytes.subarray(20,20+labelBytes).toString('ascii'),'pairs\0');
const start=20+labelBytes;assert.equal(bytes.length,start+rows*columns*8);
const pairs=Array.from({length:rows},(_,row)=>Array.from({length:columns},(_,column)=>bytes.readDoubleLE(start+(column*rows+row)*8)));
assert.ok(pairs.every(row=>row.every(Number.isFinite)&&[0,1].includes(row[6])));
assert.ok(pairs.every(row=>row[6]===1||row.slice(0,6).every(x=>x===0)));

const oracleFile=path.join(captureDirectory,capture.oracle.path),oracleBytes=fs.readFileSync(oracleFile);
assert.equal(sha(oracleBytes),capture.oracle.sha256);
const poses=JSON.parse(oracleBytes).poses.slice(0,2),k=capture.calibration;
assert.equal(poses.length,2);assert.equal(poses[0].time,0);assert.ok(Math.abs(poses[1].time-1/30)<1e-12);
const bodyRotation=pose=>new Matrix3().setFromMatrix4(new Matrix4().makeRotationFromQuaternion(
  new Quaternion(pose.quaternion[1],pose.quaternion[2],pose.quaternion[3],pose.quaternion[0]).normalize()));
const opticalToBody=new Matrix3().set(...k.opticalToBody),body=poses.map(bodyRotation);
const camera=body.map(rotation=>rotation.clone().multiply(opticalToBody));
const cameraOrigin=poses.map((pose,i)=>new Vector3(pose.x,pose.y,pose.z).add(new Vector3(...k.originFlu).applyMatrix3(body[i])));
const rotation=camera[1].clone().transpose().multiply(camera[0]);
const translation=cameraOrigin[0].clone().sub(cameraOrigin[1]).applyMatrix3(camera[1].clone().transpose());
// Independent Jacobian form of the existing Modelica point covariance.
// Quantization is reported separately; no arbitrary isotropic noise floor.
const covariance=(point,quantization=0)=>{
  const [x,y,z]=point,bearing=[x/z,y/z,1],sigma=z*z*k.depthNoiseDisparityPx/(k.depthNoiseReferenceFx*k.baseline);
  const cells=bearing.flatMap((a,i)=>bearing.map((b,j)=>a*b*(sigma*sigma+quantization*quantization/12)
    +(i===j&&i<2?(z*.5/[k.rgbFx,k.rgbFy][i])**2:0)));
  return new Matrix3().set(...cells);
};
const add=(a,b)=>{const out=a.clone();out.elements=out.elements.map((v,i)=>v+b.elements[i]);return out;};
const inspected=[];
for(const [index,row] of pairs.entries())if(row[6]===1){
  const source=row.slice(0,3),target=row.slice(3,6);assert.ok(source[2]>0&&target[2]>0);
  const residual=new Vector3(...source).applyMatrix3(rotation).add(translation).sub(new Vector3(...target));
  const score=quantization=>{
    const reference=covariance(source,quantization),current=covariance(target,quantization);
    const total=add(rotation.clone().multiply(reference).multiply(rotation.clone().transpose()),current);
    assert.ok(Number.isFinite(total.determinant())&&total.determinant()>0);
    const value=residual.dot(residual.clone().applyMatrix3(total.invert()));assert.ok(Number.isFinite(value)&&value>=0);return value;
  };
  inspected.push({slot:index+1,source,target,residual:residual.toArray(),distance:residual.length(),normalizedSquared:score(0),withQuantizationSquared:score(capture.frames[0].depth.unitsMeters)});
}
assert.equal(inspected.length,replay.result.diagnostics[0][1][7]);
const quantiles=values=>{const sorted=values.toSorted((a,b)=>a-b);return [.05,.5,.95].map(q=>sorted[Math.min(sorted.length-1,Math.floor(q*sorted.length))]);};
const summary={status:'CAPTURED_PAIR_ORACLE_ANALYSIS_COMPLETE',recordedAt:new Date().toISOString(),
  replayReportSha256:sha(fs.readFileSync(path.join(replayDirectory,'report.json'))),captureManifestSha256:replay.captureManifestSha256,
  pairMatrixSha256:proof.sha256,probeSha256:sha(fs.readFileSync(import.meta.filename)),pairs:inspected.length,
  originalRegistrationReason:replay.result.diagnostics[0][1][1],originalFitRms:replay.result.diagnostics[0][1][2],
  oracleRotation:rotation.toArray(),oracleTranslation:translation.toArray(),
  oracleQuaternionNormErrors:poses.map(p=>Math.abs(Math.hypot(...p.quaternion)-1)),
  euclideanGate:.02,withinEuclideanGate:inspected.filter(p=>p.distance<=.02).length,
  normalizedSquaredGate:9,withinNormalizedGate:inspected.filter(p=>p.normalizedSquared<=9).length,
  withinNormalizedGateWithQuantization:inspected.filter(p=>p.withQuantizationSquared<=9).length,
  distanceQuantiles:quantiles(inspected.map(p=>p.distance)),normalizedSquaredQuantiles:quantiles(inspected.map(p=>p.normalizedSquared)),
  matchedReferenceDepthQuantiles:quantiles(inspected.map(p=>p.source[2])),inspected,
  scope:'Independent geometric/noise analysis using separate captured oracle poses, never production estimator input. Normalized quaternion is used for evaluation only. Covariance assumes 0.5px independent localization and captured stereo disparity noise; quantization is a separate comparison. Inverse-depth interpolation/association/selection correlations are not modeled. No pose fit, gate acceptance, browser SLAM or performance claim.'};
fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({pairs:summary.pairs,withinEuclideanGate:summary.withinEuclideanGate,withinNormalizedGate:summary.withinNormalizedGate,distanceQuantiles:summary.distanceQuantiles,normalizedSquaredQuantiles:summary.normalizedSquaredQuantiles}));
