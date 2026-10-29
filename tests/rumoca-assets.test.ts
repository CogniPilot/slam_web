import {it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFile,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const names=['rumoca_bind_wasm.js','rumoca_bind_wasm_bg.wasm'];
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
// A synthetic compiler pair: glue that names its module, and the smallest valid WASM module.
const pair=(tag:string)=>[Buffer.from(`// ${tag}\nnew URL('rumoca_bind_wasm_bg.wasm', import.meta.url);\n`),Buffer.from([0,97,115,109,1,0,0,0])];

async function sandbox(version?:string){
  // scripts/assets.mjs reads ../rumoca-package.json beside itself, so run a copy under a synthetic pin.
  const root=await mkdtemp(join(tmpdir(),'slam-rumoca-assets-'));
  await mkdir(join(root,'scripts'));await copyFile('scripts/assets.mjs',join(root,'scripts/assets.mjs'));
  const pinned=pair('pinned'),other=pair('other build');
  await writeFile(join(root,'rumoca-package.json'),JSON.stringify({revision:'0'.repeat(40),runId:1,...(version?{version}:{}),files:Object.fromEntries(names.map((name,i)=>[name,sha(pinned[i])]))}));
  for(const [directory,bytes] of [['pinned',pinned],['other',other]] as const){
    await mkdir(join(root,directory));for(const [i,name] of names.entries())await writeFile(join(root,directory,name),bytes[i]);
  }
  const run=(args:string[],env:Record<string,string>={})=>spawnSync(process.execPath,[join(root,'scripts/assets.mjs'),'--destination',join(root,'out'),...args],
    {cwd:root,encoding:'utf8',env:{...process.env,RUMOCA_WASM_PACKAGE:'',...env}});
  const manifest=async()=>JSON.parse(await readFile(join(root,'out/compiler-manifest.json'),'utf8'));
  return {root,run,manifest};
}

for(const version of [undefined,'0.10.3']){
const kind=version?'release':'main';
it(`checks a ${kind} RUMOCA_WASM_PACKAGE copy against the pin and installs it as the pinned package`,async()=>{
  const {root,run,manifest}=await sandbox(version);
  try{
    const result=run([],{RUMOCA_WASM_PACKAGE:join(root,'pinned')});
    expect(result.status,result.stderr).toBe(0);
    const resultManifest=await manifest();
    expect(resultManifest.source).toBe(version?'pinned-release-package':'pinned-main-package');
    expect(resultManifest.revision).toBe('0'.repeat(40));
    expect(resultManifest.runId).toBe(1);
    expect(resultManifest.version).toBe(version);
  }finally{await rm(root,{recursive:true,force:true});}
});

it(`refuses a ${kind} RUMOCA_WASM_PACKAGE that differs from the pin and leaves prior assets in place`,async()=>{
  const {root,run}=await sandbox(version);
  try{
    await mkdir(join(root,'out'));await writeFile(join(root,'out',names[0]),'prior');
    const result=run([],{RUMOCA_WASM_PACKAGE:join(root,'other')});
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`RUMOCA_WASM_PACKAGE is not the pinned Rumoca ${kind} package`);
    expect(result.stderr).toContain('--rumoca-dir');
    expect(await readFile(join(root,'out',names[0]),'utf8')).toBe('prior');
  }finally{await rm(root,{recursive:true,force:true});}
});

it(`keeps --rumoca-dir (${kind} pin) as the only unpinned local package, even with RUMOCA_WASM_PACKAGE set`,async()=>{
  const {root,run,manifest}=await sandbox(version);
  try{
    const result=run(['--rumoca-dir',join(root,'other')],{RUMOCA_WASM_PACKAGE:join(root,'pinned')});
    expect(result.status,result.stderr).toBe(0);
    const {source,files}=await manifest();
    expect(source).toBe('explicit-local-package');
    expect(files.map((file:{sha256:string})=>file.sha256)).toEqual(pair('other build').map(sha));
  }finally{await rm(root,{recursive:true,force:true});}
});

}
