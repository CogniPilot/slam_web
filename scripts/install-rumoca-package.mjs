import {cp,readFile,mkdir,access,rename,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {fetchPinned,extractVariant} from './rumoca-release-fetch.mjs';

const pin=JSON.parse(await readFile(new URL('../rumoca-package.json',import.meta.url),'utf8'));
// Download cache: RUMOCA_DOWNLOAD_DIR, else $XDG_CACHE_HOME/slam_web/downloads (disposable storage on laptops that set
// it), else ~/scratch/slam_web/downloads. CI sets RUMOCA_DOWNLOAD_DIR so its actions/cache path never moves.
const downloads=process.env.RUMOCA_DOWNLOAD_DIR??(process.env.XDG_CACHE_HOME?join(process.env.XDG_CACHE_HOME,'slam_web/downloads'):join(homedir(),'scratch/slam_web/downloads'));
const cache=join(downloads,`rumoca-main-${pin.revision.slice(0,8)}`);
const source=resolve(process.env.RUMOCA_WASM_PACKAGE??join(cache,'package',pin.variant));
try{await access(join(source,'package.json'));}
catch(error){
  if(error.code!=='ENOENT'||process.env.RUMOCA_WASM_PACKAGE)throw error;
  await mkdir(cache,{recursive:true});
  // Extract into a private dir and rename it into place, so an interrupted fetch never leaves a partial cache.
  const staging=join(cache,`package.tmp-${process.pid}`);
  await rm(staging,{recursive:true,force:true});
  try{
    // Public, hash-pinned release asset first: a new hire needs no gh login or token.
    if(!pin.release)throw new Error('no public release pinned');
    await extractVariant(await fetchPinned(pin.release.url,pin.release),pin.variant,staging);
  }catch(releaseError){
    try{execFileSync('gh',['run','download',String(pin.runId),'--repo',pin.repository,'--name',pin.artifact,'--dir',staging],{stdio:'inherit'});}
    catch(ghError){
      await rm(staging,{recursive:true,force:true});
      throw new Error(`Rumoca package unavailable. Release: ${releaseError.message}. gh: ${ghError.message}. `+
        'Or set RUMOCA_WASM_PACKAGE to a verified package directory.');
    }
  }
  await rm(join(cache,'package'),{recursive:true,force:true});   // a stale or partial older cache
  await rename(staging,join(cache,'package'));
}
for(const [name,expected] of Object.entries(pin.files)){
  const bytes=await readFile(join(source,name));
  if(createHash('sha256').update(bytes).digest('hex')!==expected)throw new Error(`Pinned Rumoca package hash mismatch: ${name}`);
}
const compiler=await import(pathToFileURL(join(source,'rumoca_bind_wasm.js')));
await compiler.default({module_or_path:await readFile(join(source,'rumoca_bind_wasm_bg.wasm'))});
if(compiler.get_git_commit()!==pin.revision.slice(0,12))throw new Error('Pinned Rumoca package revision mismatch');
const metadata=JSON.parse(await readFile(join(source,'package.json'),'utf8'));
if(metadata.name!=='@cognipilot/rumoca')throw new Error('Unexpected compiler package');
await cp(source,new URL('../node_modules/@cognipilot/rumoca',import.meta.url),{recursive:true});
console.log(`Rumoca main package installed: ${pin.revision.slice(0,12)}`);
