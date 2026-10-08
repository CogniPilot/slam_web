// Compare array source forms at the same descriptor cell count, without app edits.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const [compilerDirectory, directory, ...selectedForms] = process.argv.slice(2);
if (!directory) throw Error('COMPILER_DIRECTORY NEW_OUTPUT_DIRECTORY required');
assert.ok(!fs.existsSync(directory),'Choose a fresh output directory');
const root=path.resolve(directory),compiler=path.resolve(compilerDirectory);
const fixturePath='tests/compiler-probes/fixtures/DescriptorZeroFill.mo';
const ownerPath='models/LoopClosure/RGBDKeyframes.mo';
const fixture=fs.readFileSync(fixturePath,'utf8'),owner=fs.readFileSync(ownerPath,'utf8');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const capacity=name=>{
  const pattern=new RegExp('constant Integer '+name+' = (\\d+);');
  const value=fixture.match(pattern)?.[1];
  assert.ok(value);assert.equal(value,owner.match(pattern)?.[1]);return Number(value);
};
const features=capacity('featureCapacity'),components=capacity('descriptorSize');
const compilerFiles=['rumoca_bind_wasm.js','rumoca_bind_wasm_bg.wasm'].map(name=>
  ({path:name,sha256:sha(fs.readFileSync(path.join(compiler,name)))}));
const forms=[
  {name:'DescriptorZeroVector',shape:[features*components],change:source=>source
    .replace('[featureCapacity,descriptorSize]','[featureCapacity*descriptorSize]')
    .replace('zeros(featureCapacity,descriptorSize)','zeros(featureCapacity*descriptorSize)')},
  {name:'DescriptorFillMatrix',shape:[features,components],change:source=>source
    .replace('zeros(featureCapacity,descriptorSize)','fill(0.0,featureCapacity,descriptorSize)')},
  {name:'DescriptorCopyMatrix',shape:[features,components],change:source=>source
    .replace('  output Real descriptor','  input Real pixels[featureCapacity,descriptorSize];\n  output Real descriptor')
    .replace('zeros(featureCapacity,descriptorSize)','pixels')},
  {name:'DescriptorRuntimeFill',shape:[features,components],change:()=>
    fs.readFileSync('tests/compiler-probes/fixtures/DescriptorRuntimeFill.mo','utf8')},
];
for(const name of selectedForms)assert.ok(forms.some(form=>form.name===name),'Unknown array form: '+name);
assert.equal(new Set(selectedForms).size,selectedForms.length,'Duplicate array form');
fs.mkdirSync(root,{recursive:true});
const rows=[];
for(const form of forms.filter(form=>selectedForms.length===0||selectedForms.includes(form.name))){
  const source=form.change(fixture.replaceAll('DescriptorZeroFill',form.name));
  assert.notEqual(source,fixture);assert.ok(!source.includes('DescriptorZeroFill'));
  for(const [name,value]of [['featureCapacity',features],['descriptorSize',components]])
    assert.ok(source.includes(`constant Integer ${name} = ${value};`));
  assert.equal(form.shape.reduce((count,dimension)=>count*dimension,1),features*components);
  const sourceFile=path.join(root,form.name+'.mo');fs.writeFileSync(sourceFile,source);
  const reportFile=path.join(root,form.name+'.json');
  const result=spawnSync(process.execPath,['dev/rumoca-bounded-run.mjs',
    '--seconds','30','--rss-mib','8192','--available-mib','16384',
    '--log',path.join(root,form.name+'.log'),'--','nice','-n','15','taskset','-c','8,9',
    'env','RUMOCA_BROWSER_TIMEOUT_MS=20000',process.execPath,'dev/issue-native-program-browser.mjs',
    compiler,sourceFile,form.name,path.join(root,form.name+'.artifact.json'),reportFile],
    {encoding:'utf8',timeout:40000,maxBuffer:1024*1024});
  assert.ifError(result.error);assert.equal(result.signal,null);
  fs.writeFileSync(path.join(root,form.name+'-resource.json'),result.stdout);
  fs.writeFileSync(path.join(root,form.name+'-runner.log'),result.stderr);
  const report=fs.existsSync(reportFile)?JSON.parse(fs.readFileSync(reportFile)):null;
  if(report){assert.equal(report.sourceSha256,sha(source));assert.equal(report.compilerModuleSha256,compilerFiles[1].sha256);}
  rows.push({model:form.name,shape:form.shape,cells:features*components,sourceSha256:sha(source),
    exitCode:result.status,report,resources:result.stdout?JSON.parse(result.stdout):null});
  console.log(JSON.stringify({model:form.name,exitCode:result.status,status:report?.status,
    compileMs:report?.compileMs??report?.compilerElapsedMs}));
}
assert.equal(sha(fs.readFileSync(fixturePath)),sha(fixture));
assert.equal(sha(fs.readFileSync(ownerPath)),sha(owner));
for(const file of compilerFiles)assert.equal(sha(fs.readFileSync(path.join(compiler,file.path))),file.sha256);
fs.writeFileSync(path.join(root,'report.json'),JSON.stringify({status:'DESCRIPTOR_ARRAY_FORMS_OBSERVED',
  fixture:{path:fixturePath,sha256:sha(fixture)},owner:{path:ownerPath,sha256:sha(owner)},
  compilerFiles,bookendsEqual:true,rows,probeSha256:sha(fs.readFileSync(import.meta.filename)),
  scope:'Actual browser issuance and consumer admission only. Same descriptor cell count; '
    +'rank, initializer and input-copy forms differ. No numerical execution, application edits or full SLAM qualification.'
},null,2)+'\n');
