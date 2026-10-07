// Application source refactor only: no compiler/backend or numerical emission.
// Keep the complete qualified functions and forward the public interface once.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.join(app,'dev/artifacts/modelica-full-raw-composition/adapters');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const wiring=JSON.parse(fs.readFileSync(path.join(app,'dev/artifacts/rgbd-fast-slam-functions/source-wiring.json')));
const names=['Initialize','Step'];
const receipts=['initialize-kqHmtL','step-tIUA0X','graph-AQc6u6'];
for(const receipt of receipts){
  const record=JSON.parse(fs.readFileSync(path.join(app,'dev/artifacts/modelica-full-raw-composition',`full-raw-composition-${receipt}`,'report.json')));
  assert.equal(record.status,'OMC_FULL_RAW_COMPOSITION_PASS');
  assert.equal(record.bookendsEqual,true);
}
assert(!fs.existsSync(path.join(directory,'source-wiring.json')),'Do not overwrite an adapter receipt');
fs.mkdirSync(directory,{recursive:true});
const records=[];
for(const name of names){
  const file=`models/RGBDFastSLAM${name}.mo`,model=`RGBDFastSLAM${name}`;
  const before=fs.readFileSync(path.join(app,file),'utf8');
  const record=wiring.records.find(item=>item.path===file);
  assert.equal(sha(before),record.sha256);
  assert.equal(record.inputs.length,39);assert.equal(record.outputs.length,27);
  const marker=`function ${record.functionName}\n`,start=before.indexOf(marker);
  assert(start>0&&start===before.lastIndexOf(marker));
  const body=before.slice(start);
  assert(body.trimEnd().endsWith(`end ${record.functionName};`));
  const modelPrefix='// Public lifecycle adapter; Rumoca compiles the complete Modelica implementation.\n'
    +`model ${model}\n  extends RGBDFastSLAMInterface${name==='Initialize'?'(h=0.0,intervalTime=0.0)':''};\nequation\n`
    +'  ('+record.outputs.map((value,index)=>(index&&index%4===0?'\n    ':'')+value).join(',')+') =\n'
    +`    ${record.functionName}(\n`
    +record.inputs.map((value,index)=>`      ${value}=${value}${index===record.inputs.length-1?');':','}`).join('\n')
    +`\nend ${model};\n\n`
    +'// Ordered raw-camera lifecycle. Reference qualification is separate from\n'
    +'// compiler issuance and complete browser/runtime admission.\n';
  const after=modelPrefix+body;
  const dest=path.join(directory,'source-preimages',file);
  fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,before);
  fs.writeFileSync(path.join(app,file),after);
  assert.equal(after.slice(after.indexOf(marker)),body);
  records.push({path:file,model,functionName:record.functionName,
    beforeSha256:sha(before),afterSha256:sha(after),beforeBytes:Buffer.byteLength(before),afterBytes:Buffer.byteLength(after),
    qualifiedFunctionSha256:sha(body),qualifiedFunctionBytes:Buffer.byteLength(body),functionUnchanged:true,
    inputs:record.inputs,outputs:record.outputs,identityBindings:record.inputs.map(name=>({name,value:name})),
    initializationDefaults:name==='Initialize'?{h:0,intervalTime:0}:null});
}
const report={status:'PUBLIC_ADAPTER_SOURCE_FORWARDING_PASS',records,receipts,
  scope:'Exact public interface/default/ordered identity forwarding to independently qualified full raw Modelica functions; complete function bodies unchanged.',
  originalEquationModelParity:false,publicAdapterNumericalExecution:false,rumocaArtifactIssued:false,
  browserFullSlamAccepted:false,throughputQualified:false};
fs.writeFileSync(path.join(directory,'source-wiring.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
