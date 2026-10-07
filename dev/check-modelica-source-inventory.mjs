// Conservative file-level dependency audit. This is not a Modelica compiler
// or a proof of declaration-level liveness; Rumoca owns those analyses.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {rgbdSlamNativeSourceManifest} from '../src/modelica-slam-source-manifest.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=fs.readdirSync('models',{recursive:true}).filter(file=>file.endsWith('.mo')).map(file=>'models/'+file);
const bytes=new Map(files.map(file=>[file,fs.readFileSync(file)]));
const text=new Map([...bytes].map(([file,source])=>[file,source.toString().replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\]|\\.)*"/g,' ')]));
const symbols=new Map();
for(const [file,source]of text)for(const match of source.matchAll(/\b(?:model|function|package|record|block|class)\s+([A-Za-z_]\w*)/g)){
  const owners=symbols.get(match[1])??new Set();owners.add(file);symbols.set(match[1],owners);
}
const roots=new Set(rgbdSlamNativeSourceManifest.paths);
for(const file of fs.readdirSync('src'))if(/\.(ts|mjs)$/.test(file)){
  for(const match of fs.readFileSync('src/'+file,'utf8').matchAll(/models\/([\w/.-]+\.mo)\?raw/g))roots.add('models/'+match[1]);
}
for(const file of roots)if(!bytes.has(file))throw Error('Missing application Modelica source: '+file);
const reached=new Set(roots),queue=[...roots];
while(queue.length){
  const file=queue.shift();
  for(const token of text.get(file).match(/[A-Za-z_]\w*/g)??[])for(const dependency of symbols.get(token)??[]){
    if(!reached.has(dependency)){reached.add(dependency);queue.push(dependency);}
  }
}
const unreachable=files.filter(file=>!reached.has(file));
const report={status:unreachable.length?'UNREFERENCED_MODELICA_FILES':'APPLICATION_MODELICA_FILE_CLOSURE_PASS',
  roots:[...roots],sources:[...bytes].map(([file,source])=>({path:file,sha256:sha(source),bytes:source.length})),
  unreachable,scope:'Current application raw imports and full native SLAM manifest, conservative symbol-based transitive file reachability. Same-name declarations may overapproximate dependencies. Not declaration-level liveness, compilation or runtime qualification.'};
if(process.argv[2]){fs.mkdirSync(path.dirname(process.argv[2]),{recursive:true});fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({status:report.status,files:files.length,roots:roots.size,unreachable}));
if(unreachable.length)process.exitCode=1;
