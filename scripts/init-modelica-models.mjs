import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const library='models/Libraries/CogniPilot';
const initialized=existsSync(resolve(root,library,'.git'));

// Fetch only on first use; preserve an existing checkout and local library edits.
if(!initialized){
  execFileSync('git',['submodule','update','--init','--depth','1','--',library],{
    cwd:root,stdio:'inherit',
  });
}
if(!existsSync(resolve(root,library,'SLAM/package.mo'))){
  throw Error('Modelica library missing. Run git submodule update --init -- models/Libraries/CogniPilot.');
}
