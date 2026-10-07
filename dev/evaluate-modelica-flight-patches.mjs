// Offline evidence only: oracle motion never feeds an estimator or tracker.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseRealMat,validatePreparedRGBFlightInput} from './prepare-modelica-rgb-flight-input.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const assert=(value,message)=>{if(!value)throw Error(message);};
assert(process.argv.length===4,'Usage: node dev/evaluate-modelica-flight-patches.mjs <patch-receipt> <actual-flight-capture>');
const receipt=fs.realpathSync(process.argv[2]),capture=fs.realpathSync(process.argv[3]);
const inputFiles=[];
function read(root,name,expected){
  const file=path.resolve(root,name);assert(file.startsWith(root+path.sep),'Confined input file');
  const bytes=fs.readFileSync(file),digest=sha(bytes);
  assert(!expected||digest===expected,'Input identity differs: '+name);
  inputFiles.push({path:path.relative(repo,file),bytes:bytes.length,sha256:digest});return bytes;
}
const report=JSON.parse(read(receipt,'report.json'));
assert(report.status==='DIAGNOSTICS_EXECUTED'&&report.model==='RGBDRenderedFlightPatchDiagnostics','Completed pair diagnostics required');
const frozen=JSON.parse(read(receipt,'manifest.json'));
for(const entry of frozen.files)read(receipt,entry.path,entry.sha256);
const manifestBytes=read(capture,'manifest.json'),manifest=JSON.parse(manifestBytes);
assert(manifest.status==='ACTUAL_RUMOCA_FLIGHT_RGBD_CAPTURE_PASS'&&manifest.frameCount===13,'Actual complete flight capture required');
const parentHash=report.rgbInputPreparation?.parent.captureManifestSha256
  ??JSON.parse(read(receipt,'input-report.json')).captureManifestSha256;
assert(parentHash===sha(manifestBytes),'Pair and oracle must bind the same actual flight');
if(report.inputClass==='RGB_ONLY_VARIANT_PREPARED'){
  const proof=validatePreparedRGBFlightInput(path.resolve(repo,report.inputReceipt));
  assert(proof.reportSha256===report.inputReportSha256,'Recomputed RGB derivation binding');
  read(receipt,'input-report.json',proof.reportSha256);
  assert(proof.report.parent.captureManifestSha256===sha(manifestBytes),'Recomputed preparation and oracle flight binding');
  assert(JSON.stringify(proof.report.parent)===JSON.stringify(report.rgbInputPreparation.parent)
    &&JSON.stringify(proof.report.capture)===JSON.stringify(report.rgbInputPreparation.capture)
    &&proof.report.variant===report.rgbInputPreparation.variant,'Exact recorded and recomputed preparation identities');
  assert(sha(proof.mat)===report.mat.sha256
    &&read(receipt,report.mat.path,report.mat.sha256).equals(proof.mat),'Receipt MAT equals recomputed preparation');
}
const oracle=JSON.parse(read(capture,manifest.oracleSnapshots.path,manifest.oracleSnapshots.sha256)).snapshots;
assert(oracle.length===37&&oracle[0].time===0&&oracle[3].time===1/30,'Exact first actual camera pair chronology');
const bytes=read(receipt,report.binaryDiagnostics.path,report.binaryDiagnostics.sha256),matrix=parseRealMat(bytes);
assert(matrix.length===1&&matrix[0].name==='diagnostics'&&matrix[0].rows===1,'Exact diagnostic matrix');
const values=Array.from({length:matrix[0].columns},(_,i)=>bytes.readDoubleLE(matrix[0].dataOffset+8*i));
assert([61706,65907].includes(values.length)&&values.every(Number.isFinite),'Complete finite supported diagnostics');
const rows=(offset,count,width)=>Array.from({length:count},(_,i)=>values.slice(offset+i*width,offset+(i+1)*width));
const tracks=rows(0,350,25),details=rows(8750,350,26),fits=rows(61600,2,26);
assert(values.slice(61698,61706).every(v=>v===1),'All eight context checks must pass');

const transpose=a=>a[0].map((_,j)=>a.map(row=>row[j]));
const mv=(a,v)=>a.map(row=>row.reduce((sum,x,i)=>sum+x*v[i],0));
const mm=(a,b)=>a.map(row=>transpose(b).map(column=>row.reduce((sum,x,i)=>sum+x*column[i],0)));
const plus=(a,b)=>a.map((x,i)=>x+b[i]),minus=(a,b)=>a.map((x,i)=>x-b[i]);
const norm=a=>Math.hypot(...a);
function rotation(q){
  assert(q.length===4&&q.every(Number.isFinite)&&Math.abs(norm(q)-1)<1e-12,'Unit actual quaternion');
  const [w,x,y,z]=q.map(v=>v/norm(q));
  return [[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
    [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
    [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]];
}
const c=manifest.calibration,C=rowsFrom(c.opticalToBody,3),R0=rotation(oracle[0].quaternion),R1=rotation(oracle[3].quaternion);
function rowsFrom(v,n){return Array.from({length:n},(_,i)=>v.slice(i*n,(i+1)*n));}
const bodyPosition=s=>[s.x,s.y,s.z];
const origin0=plus(bodyPosition(oracle[0]),mv(R0,c.originFlu));
const origin1=plus(bodyPosition(oracle[3]),mv(R1,c.originFlu));
const opticalRotation=mm(mm(transpose(C),transpose(R1)),mm(R0,C));
const opticalTranslation=mv(mm(transpose(C),transpose(R1)),minus(origin0,origin1));
const project=p=>[c.rgbFx*p[0]/p[2]+c.cx,c.rgbFy*p[1]/p[2]+c.cy];
function rotationError(a,b){const relative=mm(transpose(a),b);return Math.acos(Math.max(-1,Math.min(1,(relative[0][0]+relative[1][1]+relative[2][2]-1)/2)));}
const fitEvaluation=fits.map((fit,index)=>{
  const R=rowsFrom(fit.slice(14,23),3),t=fit.slice(23,26);
  return {method:index===0?'original':'robust',accepted:fit[0]===1,reason:fit[1],count:fit[2],rms:fit[6],
    translation:t,translationErrorMetres:fit[0]===1?norm(minus(t,opticalTranslation)):null,
    rotationErrorRadians:fit[0]===1?rotationError(opticalRotation,R):null};
});
const evaluated=tracks.filter(row=>row[1]===1).map(row=>{
  const slot=row[0],source=row.slice(21,24),expected=plus(mv(opticalRotation,source),opticalTranslation);
  const expectedPixel=project(expected),forwardAccepted=row[7]===1;
  const optimized=forwardAccepted?row.slice(12,14):details[slot-1][1]===1?details[slot-1].slice(2,4):null;
  return {slot,referencePixel:row.slice(3,5),expectedPixel,optimizedPixel:optimized,forwardAccepted,
    reason:row[8],ssd:row[10],pixelError:optimized?norm(minus(optimized,expectedPixel)):null,
    depthValid:row[14]===1,pointErrorMetres:row[14]===1?norm(minus(row.slice(15,18),expected)):null,
    sourceWorld:plus(origin0,mv(mm(R0,C),source)),
    cycle:values.length===65907?rows(61706,350,12)[slot-1]:null};
});
const output=path.join(repo,'dev/artifacts/modelica-flight-patch-evaluation');fs.mkdirSync(output,{recursive:true});
const durable=fs.mkdtempSync(path.join(output,'evaluation-'));
const result={scope:'Offline first-pair oracle evaluation only. No estimator inputs, outputs, gates or source thresholds are changed.',
  receipt:path.relative(repo,receipt),capture:path.relative(repo,capture),oracleTransform:{rotation:opticalRotation,translation:opticalTranslation},
  fitEvaluation,tracks:evaluated,inputFiles,scriptSha256:sha(fs.readFileSync(fileURLToPath(import.meta.url))),
  limitations:['Oracle-reprojected points assume the retained depth corresponds to the RGB feature surface; depth/RGB occlusion or interpolation bias remains possible.',
    'Pixel residuals assess the last evaluated point even when the forward tracker refuses; they are not acceptance or uncertainty certificates.',
    'This evaluates only the first camera pair, not complete-flight or browser SLAM.']};
fs.writeFileSync(path.join(durable,'evaluation.json'),JSON.stringify(result,null,2)+'\n');
fs.copyFileSync(fileURLToPath(import.meta.url),path.join(durable,'evaluate-modelica-flight-patches.mjs'));
console.log(JSON.stringify({directory:path.relative(repo,durable),fitEvaluation,tracks:evaluated.map(({slot,pixelError,forwardAccepted,pointErrorMetres})=>({slot,pixelError,forwardAccepted,pointErrorMetres}))}));
