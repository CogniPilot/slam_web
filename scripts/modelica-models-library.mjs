import fs from 'node:fs';
import path from 'node:path';

/** The same exact source map used by the static app, for native test harnesses. */
export function readModelicaModelsLibrary(){
  const directory='models/Libraries/CogniPilot';
  const sources={};
  function visit(folder){
    for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
      if(entry.name.startsWith('.'))continue;
      const file=path.posix.join(folder,entry.name);
      if(entry.isDirectory())visit(file);
      else if(entry.name.endsWith('.mo'))sources[file]=fs.readFileSync(file,'utf8');
    }
  }
  visit(directory);
  return sources;
}
