import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deflateRawSync} from 'node:zlib';
import {fetchPinned,extractVariant,readZip} from './rumoca-release-fetch.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

// Minimal zip writer for the tests: stored (0) or deflated (8) entries, no zip64.
function zip(entries){
  const locals=[],central=[];let offset=0;
  for(const {name,data,method=8} of entries){
    const body=method===8?deflateRawSync(data):data,nameBytes=Buffer.from(name);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(method,8);
    local.writeUInt32LE(body.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(nameBytes.length,26);
    const entry=Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50,0);entry.writeUInt16LE(method,10);entry.writeUInt32LE(body.length,20);
    entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(nameBytes.length,28);entry.writeUInt32LE(offset,42);
    locals.push(local,nameBytes,body);central.push(entry,nameBytes);
    offset+=30+nameBytes.length+body.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);
  end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,directory,end]);
}

const fakeFetch=(bytes,{status=200,length=bytes.length}={})=>async()=>({ok:status===200,status,
  headers:{get:name=>name==='content-length'?String(length):null},
  body:(async function*(){for(let i=0;i<bytes.length;i+=7)yield bytes.subarray(i,i+7);})()});

test('extracts only the pinned variant, stored and deflated', async()=>{
  const wasm=Buffer.from('wasm bytes'.repeat(50)),data=zip([
    {name:'release-full-web/rumoca_bind_wasm_bg.wasm',data:wasm},
    {name:'release-full-web/package.json',data:Buffer.from('{"name":"@cognipilot/rumoca"}'),method:0},
    {name:'release-core/other.js',data:Buffer.from('x')}]);
  const dest=await mkdtemp(join(tmpdir(),'rumoca-release-'));
  try{
    assert.equal(await extractVariant(data,'release-full-web',dest),2);
    assert.deepEqual(await readdir(dest),['release-full-web']);
    assert.equal(sha(await readFile(join(dest,'release-full-web/rumoca_bind_wasm_bg.wasm'))),sha(wasm));
  }finally{await rm(dest,{recursive:true,force:true});}
});

test('refuses unsafe zip paths and a missing variant', async()=>{
  for(const name of ['release-full-web/../../escape','/etc/passwd','release-full-web\\evil']){
    await assert.rejects(extractVariant(zip([{name,data:Buffer.from('x')}]),'release-full-web',tmpdir()),/unsafe zip path/);
  }
  await assert.rejects(extractVariant(zip([{name:'other/x',data:Buffer.from('x')}]),'release-full-web',tmpdir()),/no release-full-web/);
});

test('fetchPinned accepts only the exact pinned bytes', async()=>{
  const bytes=Buffer.from('the pinned asset'),pin={bytes:bytes.length,sha256:sha(bytes)},url='https://example.invalid/a.zip';
  assert.deepEqual(await fetchPinned(url,pin,fakeFetch(bytes)),bytes);
  await assert.rejects(fetchPinned(url,{...pin,sha256:'0'.repeat(64)},fakeFetch(bytes)),/sha256 differs/);
  await assert.rejects(fetchPinned(url,pin,fakeFetch(Buffer.concat([bytes,bytes]),{length:0})),/exceeds the pinned/);
  await assert.rejects(fetchPinned(url,pin,fakeFetch(bytes,{length:bytes.length+1})),/differs from the pinned/);
  await assert.rejects(fetchPinned(url,pin,fakeFetch(bytes,{status:404})),/HTTP 404/);
  await assert.rejects(fetchPinned('http://example.invalid/a.zip',pin,fakeFetch(bytes)),/must be https/);
  process.env.RUMOCA_RELEASE_TEST_ALLOW_HTTP='yes';   // only the exact value 1 enables the local-test http path
  await assert.rejects(fetchPinned('http://example.invalid/a.zip',pin,fakeFetch(bytes)),/must be https/);
  process.env.RUMOCA_RELEASE_TEST_ALLOW_HTTP='1';
  assert.deepEqual(await fetchPinned('http://127.0.0.1/a.zip',pin,fakeFetch(bytes)),bytes);
  delete process.env.RUMOCA_RELEASE_TEST_ALLOW_HTTP;
});

test('readZip reports entry metadata', ()=>{
  const entries=readZip(zip([{name:'a/b',data:Buffer.from('hello')}]));
  assert.equal(entries.length,1);assert.equal(entries[0].name,'a/b');assert.equal(entries[0].read().toString(),'hello');
});
