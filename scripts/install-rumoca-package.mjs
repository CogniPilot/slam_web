import {cp,readFile,mkdir,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const pin=JSON.parse(await readFile(new URL('../rumoca-package.json',import.meta.url),'utf8'));
const cache=join(homedir(),'scratch/slam_web/downloads',`rumoca-main-${pin.revision.slice(0,8)}`);
const source=resolve(process.env.RUMOCA_WASM_PACKAGE??join(cache,'package',pin.variant));
try{await access(join(source,'package.json'));}
catch(error){
  if(error.code!=='ENOENT'||process.env.RUMOCA_WASM_PACKAGE)throw error;
  await mkdir(join(cache,'package'),{recursive:true});
  execFileSync('gh',['run','download',String(pin.runId),'--repo',pin.repository,'--name',pin.artifact,'--dir',join(cache,'package')],{stdio:'inherit'});
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
