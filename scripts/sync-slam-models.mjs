// Consume an upstream export; source transformations belong to modelica_models.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [checkout,revision,exportedSnapshot]=process.argv.slice(2);
assert.ok(checkout&&/^[a-f0-9]{40}$/.test(revision??''),'CHECKOUT FULL_COMMIT_SHA [EXPORTED_SNAPSHOT] required');
const git=(...args)=>execFileSync('git',['-C',checkout,...args],{maxBuffer:8*1024*1024});
assert.equal(git('rev-parse',revision+'^{commit}').toString().trim(),revision);
const tree=new Set(git('ls-tree','-r','--name-only',revision).toString().trim().split('\n'));
const manifestPath=['tools/slam/source-manifest.json','docs/slam-source-provenance.json'].find(file=>tree.has(file));
assert.ok(manifestPath,'Pinned library has no compatibility source manifest');
const manifest=JSON.parse(git('show',revision+':'+manifestPath));
let temporary;
try{
  let snapshot=exportedSnapshot;
  if(!snapshot){
    const exporterPath='tools/slam/export_legacy_sources.mjs';
    assert.ok(tree.has(exporterPath),'Pinned library has no Node exporter. Supply its revision-bound EXPORTED_SNAPSHOT directory.');
    const root=process.env.TMPDIR??path.join(os.homedir(),'scratch','slam_web','tmp');
    fs.mkdirSync(root,{recursive:true});temporary=fs.mkdtempSync(path.join(root,'canonical-models-'));
    const exporter=path.join(temporary,'export.mjs');
    fs.writeFileSync(exporter,git('show',revision+':'+exporterPath));
    snapshot=path.join(temporary,'snapshot');
    execFileSync(process.execPath,[exporter,'--repository',checkout,'--revision',revision,'--output',snapshot],{stdio:'inherit'});
  }
  const provenanceBytes=fs.readFileSync(path.join(snapshot,'slam-provenance.json'));
  const provenance=JSON.parse(provenanceBytes);
  assert.equal(provenance.repository,'https://github.com/CogniPilot/modelica_models');
  assert.equal(provenance.revision,revision,'Export revision differs from requested commit');
  assert.equal(provenance.generated,true);assert.equal(provenance.license,'Apache-2.0');
  assert.deepEqual(provenance.canonical_classes,manifest.classes,'Export class mapping differs from pinned manifest');
  const expected=[...new Set(manifest.classes.map(entry=>entry.source))].sort();
  assert.deepEqual(Object.keys(provenance.sources).sort(),expected,'Export source inventory differs from pinned manifest');
  const previous=fs.existsSync('models/slam-provenance.json')?JSON.parse(fs.readFileSync('models/slam-provenance.json','utf8')):undefined;
  const sources=new Map();
  for(const file of expected){
    assert.match(file,/^models\/(?:[A-Za-z0-9_]+\/)*[A-Za-z0-9_]+\.mo$/);
    const bytes=fs.readFileSync(path.join(snapshot,file));
    const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
    assert.equal(digest(bytes),provenance.sources[file],`Export hash mismatch: ${file}`);
    if(previous?.sources[file]&&fs.existsSync(file))assert.equal(digest(fs.readFileSync(file)),previous.sources[file],`Locally edited generated file: ${file}`);
    sources.set(file,bytes);
  }
  // Validate the entire receipt before replacing any consumer source.
  for(const [file,bytes] of sources){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}
  fs.writeFileSync('models/slam-provenance.json',provenanceBytes);
  console.log(JSON.stringify({revision,files:sources.size}));
}finally{
  if(temporary)fs.rmSync(temporary,{recursive:true,force:true});
}
