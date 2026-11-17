import {accessSync,constants,statSync} from 'node:fs';
import {delimiter,join} from 'node:path';

function executable(path){
  try{accessSync(path,constants.X_OK);return statSync(path).isFile();}
  catch{return false;}
}

// The browser worker image exposes Chromium on PATH; nix develop supplies an
// explicit CHROMIUM_PATH. Never silently select Playwright's bundled browser.
export function resolveChromiumPath(env=process.env){
  if(env.CHROMIUM_PATH){
    if(!executable(env.CHROMIUM_PATH))throw Error('CHROMIUM_PATH is not an executable file: '+env.CHROMIUM_PATH);
    return env.CHROMIUM_PATH;
  }
  for(const directory of (env.PATH??'').split(delimiter).filter(Boolean)){
    for(const name of ['chromium','chromium-browser']){
      const path=join(directory,name);
      if(executable(path))return path;
    }
  }
  throw Error('Chromium unavailable: set CHROMIUM_PATH (nix develop) or use the browser worker image with Chromium on PATH.');
}

export function chromiumLaunchOptions(env=process.env){
  return {executablePath:resolveChromiumPath(env),chromiumSandbox:true};
}
