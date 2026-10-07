// Source-level lower bound, NOT a compiler/layout implementation. Deliberately
// counts only two existing Real catalog arrays and the native camera inputs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {rgbdSlamNativeSourceManifest as manifest} from '../src/modelica-slam-source-manifest.mjs';
const directory='dev/artifacts/native-slam-memory-budget-2026-10-07';
fs.mkdirSync(directory,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceFiles=manifest.paths.map(file=>({path:file,source:fs.readFileSync(file,'utf8')}));
const source=sourceFiles.map(file=>file.source).join(manifest.separator),sourceSha256=sha(source);
const text=file=>sourceFiles.find(entry=>entry.path===file).source;
const constants=file=>Object.fromEntries([...text(file).matchAll(/constant Integer (\w+)\s*=\s*(\d+)\s*;/g)]
  .map(match=>[match[1],Number(match[2])]));
const catalogConstants=constants('models/LoopClosure/RGBDKeyframes.mo'),camera=constants('models/Sensors/D435ImageProfile.mo');
// Require the exact owning record links; this is not field-name inference in
// the runtime. It documents the source assumptions behind this partial bound.
for(const [file,fragment] of [
  ['models/Optimization/RGBDGraphProcessing.mo','RGBDGraphEstimatorCommit.State estimator;'],
  ['models/Optimization/RGBDGraphEstimatorCommit.mo','RGBDLocalizationCatalog.State localization;'],
  ['models/Estimation/Localization/RGBDLocalizationCatalog.mo','RGBDKeyframes.Catalog catalog;'],
  ['models/SLAM/RGBDFastSLAMInterface.mo','input RGBDGraphProcessing.State previous;'],
  ['models/SLAM/RGBDFastSLAMInterface.mo','output RGBDGraphProcessing.State next;'],
  ['models/SLAM/D435FastSLAM.mo','channelCount=D435ImageProfile.colorChannels'],
])assert.ok(text(file).includes(fragment),`Source ownership changed: ${file}`);
const record=text('models/LoopClosure/RGBDKeyframes.mo').match(/record Catalog\b([\s\S]*?)end Catalog;/)[1];
const fields=['descriptors','opticalPoints'].map(name=>{
  const declaration=record.match(new RegExp(`Real ${name}\\[([^\\]]+)\\];`));
  assert.ok(declaration,`Missing Real catalog field: ${name}`);
  const shape=declaration[1].split(',').map(dimension=>catalogConstants[dimension.trim()]);
  assert.ok(shape.every(dimension=>Number.isSafeInteger(dimension)&&dimension>0));
  const cells=shape.reduce((count,dimension)=>count*dimension,1);
  return {path:`estimator.localization.catalog.${name}`,type:'Real',shape,cells,f64Bytes:cells*8};
});
assert.ok([camera.height,camera.width,camera.colorChannels].every(value=>Number.isSafeInteger(value)&&value>0));
const cameraCells=camera.height*camera.width*(camera.colorChannels+1),cameraBytes=cameraCells*8;
const oneCatalogBytes=fields.reduce((sum,field)=>sum+field.f64Bytes,0),copies=3;
const requiredBytes=copies*oneCatalogBytes+cameraBytes,budgetBytes=64*1024*1024;
const compilerFiles=['native_program_api.rs','call_program_layout.rs'].map(file=>{
  const bytes=fs.readFileSync(path.join(directory,'compiler',file));
  assert.match(String(bytes),/64 \* 1024 \* 1024/);
  return {path:`compiler/${file}`,sha256:sha(bytes),bytes:bytes.length};
});
const layout=fs.readFileSync(path.join(directory,'compiler/call_program_layout.rs'),'utf8');
assert.match(layout,/let work_bytes = y[\s\S]*?checked_mul\(8\)/);
const result={status:'CURRENT_NATIVE_RGB3_PARTIAL_F64_MEMORY_BOUND',recordedAt:new Date().toISOString(),
  sourceSha256,sourceFiles:sourceFiles.map(file=>({path:file.path,sha256:sha(file.source)})),
  compiler:{revision:'33467086deca',moduleSha256:'c5177288675db521d14cf4695b5d8a13d5bb5c3f3a304b945f6500bfff99fcec',files:compilerFiles},
  entrypoint:'D435FastSLAMStep',fields,camera:{...camera,depthChannels:1,cells:cameraCells,f64Bytes:cameraBytes},
  materializedCatalogCopies:copies,oneSelectedCatalogBytes:oneCatalogBytes,partialRequiredBytes:requiredBytes,
  budgetBytes,excessBytes:requiredBytes-budgetBytes,partialRequiredMiB:requiredBytes/1024/1024,
  currentNativeGraphArtifactIssued:false,observedMemoryRefusal:false,
  assumptions:['Selected catalog Real arrays remain materialized in previous P, published next Y, and transactional private work Y.',
    'Native RGB3 and depth remain materialized Real f64 P inputs under the reviewed profile.',
    'No compiler alias, retained-state view, dead-field elimination or alternate representation removes these spans.'],
  exclusions:'Every other State field, Integer/Boolean storage, reference features, graph, map, vision kernels, helper input/output buffers, lane alignment, module and compiler memory.',
  scope:'Conditional source-level lower bound only. The full producer has not issued this graph, so this is not an actual storage/liveness report or an observed memory refusal. Any new compiler ownership plan supersedes these materialization assumptions.'};
assert.ok(result.excessBytes>0);
for(const file of sourceFiles)assert.equal(fs.readFileSync(file.path,'utf8'),file.source,'Source changed during audit');
fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,sourceSha256,fields,camera:result.camera,partialRequiredBytes:requiredBytes,
  partialRequiredMiB:result.partialRequiredMiB,budgetBytes,excessBytes:result.excessBytes,observedMemoryRefusal:false}));
