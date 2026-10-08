// Copy a committed library snapshot; never copy a checkout's uncommitted work.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const [checkout,revision]=process.argv.slice(2);
if(!checkout||!/^[a-f0-9]{40}$/.test(revision??''))throw Error('CHECKOUT FULL_COMMIT_SHA required');
const git=(...args)=>execFileSync('git',['-C',checkout,...args],{maxBuffer:8*1024*1024});
assert.equal(git('rev-parse',revision+'^{commit}').toString().trim(),revision);
const directory='models/Libraries/CogniPilot';
const tree=git('ls-tree','-r','--name-only',revision).toString().trim().split('\n');
const packages=new Set(tree.filter(file=>/^[A-Za-z_]\w*\/package\.mo$/.test(file))
  .map(file=>file.split('/')[0]));
const files=tree.filter(file=>packages.has(file.split('/')[0])
  &&(file.endsWith('.mo')||file.endsWith('/package.order'))
  ||['LICENSE','NOTICE','README.md','CONTRIBUTING.md'].includes(file));
const previous=fs.existsSync(path.join(directory,'provenance.json'))
  ?JSON.parse(fs.readFileSync(path.join(directory,'provenance.json'),'utf8')):undefined;
const sources={};
for(const file of files){
  assert.ok(!file.split('/').includes('..'),'Unsafe upstream path');
  const bytes=git('show',revision+':'+file),destination=path.join(directory,file);
  fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,bytes);
  sources[file]=createHash('sha256').update(bytes).digest('hex');
}
for(const file of Object.keys(previous?.sources??{})){
  if(!Object.hasOwn(sources,file))fs.unlinkSync(path.join(directory,file));
}
fs.writeFileSync(path.join(directory,'provenance.json'),JSON.stringify({schemaVersion:1,
  repository:'https://github.com/CogniPilot/modelica_models',revision,license:'Apache-2.0',
  packaging:'Unmodified Modelica sources and package.order files, with upstream license, notice and library guides.',sources},null,2)+'\n');
console.log(JSON.stringify({revision,files:files.length,directory}));
