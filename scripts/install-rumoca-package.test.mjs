import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

// Exercise the actual installer with inert package fixtures, without network or a compiler.
const revision='bc93cff7f7a4cccb5da5c84f8d72965885ff70c6';
const digest=data=>createHash('sha256').update(data).digest('hex');
async function fixture(fn,{override=false,embedded=revision.slice(0,12)}={}){
 const root=await mkdtemp(join(tmpdir(),'slam-rumoca-install-'));
 try{
  await mkdir(join(root,'scripts'));
  for(const name of ['install-rumoca-package.mjs','rumoca-release-fetch.mjs'])
   await copyFile(new URL(name,import.meta.url),join(root,'scripts',name));
  const source=override?join(root,'package with spaces'):join(root,'node_modules/@cognipilot/rumoca');
  await mkdir(source,{recursive:true});
  const js=`export default async()=>{};export const get_git_commit=()=>${JSON.stringify(embedded)};`;
  const wasm=Buffer.from('inert-fixture');
  await writeFile(join(source,'package.json'),JSON.stringify({name:'@cognipilot/rumoca',version:'0.10.3',type:'module'}));
  await writeFile(join(source,'rumoca_bind_wasm.js'),js);
  await writeFile(join(source,'rumoca_bind_wasm_bg.wasm'),wasm);
  await writeFile(join(root,'rumoca-package.json'),JSON.stringify({distribution:'npm',version:'0.10.3',revision,files:{'rumoca_bind_wasm.js':digest(js),'rumoca_bind_wasm_bg.wasm':digest(wasm)}}));
  const run=()=>{
   const env={...process.env};delete env.RUMOCA_WASM_PACKAGE;
   if(override)env.RUMOCA_WASM_PACKAGE=source;
   return spawnSync(process.execPath,[join(root,'scripts/install-rumoca-package.mjs')],{env,encoding:'utf8',timeout:5000});
  };
  await fn({root,source,run});
 }finally{await rm(root,{recursive:true,force:true});}
}
test('verifies npm package in place without copying onto itself',()=>fixture(async({run})=>{const r=run();assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/0.10.3 package verified: bc93cff7f7a4/);}));
test('refuses changed compiler bytes',()=>fixture(async({source,run})=>{await writeFile(join(source,'rumoca_bind_wasm_bg.wasm'),'changed');assert.match(run().stderr,/hash mismatch/);}));
test('refuses wrong package version',()=>fixture(async({source,run})=>{await writeFile(join(source,'package.json'),JSON.stringify({name:'@cognipilot/rumoca',version:'0.10.2',type:'module'}));assert.match(run().stderr,/version mismatch/);}));
test('refuses wrong embedded compiler revision',()=>fixture(async({run})=>assert.match(run().stderr,/revision mismatch/),{embedded:'000000000000'}));
test('missing npm package refuses without a download fallback',()=>fixture(async({source,run})=>{await rm(join(source,'package.json'));const r=run();assert.notEqual(r.status,0);assert.match(r.stderr,/ENOENT/);assert.doesNotMatch(r.stderr,/Rumoca package unavailable/);}));
test('copies a verified explicit package override',()=>fixture(async({root,run})=>{const r=run();assert.equal(r.status,0,r.stderr);const d=JSON.parse(await readFile(join(root,'node_modules/@cognipilot/rumoca/package.json')));assert.equal(d.version,'0.10.3');},{override:true}));
