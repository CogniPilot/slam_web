import {afterEach,expect,it,vi} from 'vitest';
import {readFile,mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {installPublishedNativeAssets} from '../scripts/install-slam-native-package.mjs';

afterEach(()=>vi.unstubAllEnvs());
it('refuses stale source or an unverified archive before replacing existing assets',async()=>{
  const parent=join(homedir(),'scratch/slam_web/tmp');await mkdir(parent,{recursive:true});
  const directory=await mkdtemp(join(parent,'native-package-test-'));
  try{
    const destination=join(directory,'assets');await mkdir(destination);
    await writeFile(join(destination,'manifest.json'),'preserved');
    await expect(installPublishedNativeAssets(destination,'edited-source')).rejects.toThrow('source differs');
    const pin=JSON.parse(await readFile('slam-native-package.json','utf8'));
    const invalid=join(directory,'invalid.tar');await writeFile(invalid,'unverified');vi.stubEnv('SLAM_NATIVE_PACKAGE',invalid);
    await expect(installPublishedNativeAssets(destination,pin.sourceSha256)).rejects.toThrow('size mismatch');
    expect(await readFile(join(destination,'manifest.json'),'utf8')).toBe('preserved');
  }finally{await rm(directory,{recursive:true,force:true});}
});
