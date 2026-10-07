import {it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

function run(options:string[],command:string[]){
  return new Promise<{code:number|null;output:string;error:string}>((resolve,reject)=>{
    const child=spawn(process.execPath,['dev/rumoca-bounded-run.mjs','--available-mib','64',...options,'--',...command],{stdio:['ignore','pipe','pipe']});
    let output='',error='';child.stdout.on('data',value=>output+=value);child.stderr.on('data',value=>error+=value);
    child.once('error',reject);child.once('close',code=>resolve({code,output,error}));
  });
}

it('monitors a not-yet-created cache until the command completes',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'slam-bounds-'));
  try{
    const cache=join(directory,'new-target'),marker=join(directory,'completed');
    const result=await run(['--seconds','5','--cache-dir',cache],[process.execPath,'--input-type=module','-e',
      `import fs from 'node:fs';setTimeout(()=>{fs.mkdirSync(process.argv[1]);fs.writeFileSync(process.argv[2],'complete');},650);`,cache,marker]);
    expect(result.code).toBe(0);expect(await readFile(marker,'utf8')).toBe('complete');
    expect(JSON.parse(result.output).stopped).toBeUndefined();expect(result.error).toBe('');
  }finally{await rm(directory,{recursive:true,force:true});}
});

it('kills its command when cache monitoring encounters an actual error',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'slam-bounds-'));
  try{
    const cache=join(directory,'not-a-directory'),pidFile=join(directory,'pid'),marker=join(directory,'forbidden-publication');
    await writeFile(cache,'file');
    const result=await run(['--seconds','5','--cache-dir',cache],[process.execPath,'--input-type=module','-e',
      `import fs from 'node:fs';fs.writeFileSync(process.argv[1],String(process.pid));setTimeout(()=>fs.writeFileSync(process.argv[2],'should not publish'),2500);`,pidFile,marker]);
    expect(result.code).toBe(137);expect(JSON.parse(result.output).stopped).toBe('monitor-error');
    expect(result.error).toContain('Resource monitor failed:');
    await expect(stat(marker)).rejects.toMatchObject({code:'ENOENT'});
    await expect(stat(`/proc/${await readFile(pidFile,'utf8')}`)).rejects.toMatchObject({code:'ENOENT'});
  }finally{await rm(directory,{recursive:true,force:true});}
});

it('keeps the timeout active when a cache has not appeared',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'slam-bounds-'));
  try{
    const result=await run(['--seconds','.75','--cache-dir',join(directory,'never-created')],
      [process.execPath,'-e','setTimeout(()=>{},30000)']);
    expect(result.code).toBe(124);expect(JSON.parse(result.output).stopped).toBe('timeout');expect(result.error).toBe('');
  }finally{await rm(directory,{recursive:true,force:true});}
});

it('reports a missing executable once and closes its log safely',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'slam-bounds-'));
  try{
    const result=await run(['--seconds','5','--log',join(directory,'log')],[resolve(directory,'absent-command')]);
    expect(result.code).toBe(127);expect(result.error).toContain('ENOENT');expect(result.error).not.toContain('EBADF');
  }finally{await rm(directory,{recursive:true,force:true});}
});
