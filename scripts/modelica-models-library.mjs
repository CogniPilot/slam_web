import fs from 'node:fs';
import path from 'node:path';

/** The same exact source map used by the static app, for native test harnesses. */
export function readModelicaModelsLibrary(){
  const directory='models/Libraries/CogniPilot';
  const provenance=JSON.parse(fs.readFileSync(path.join(directory,'provenance.json'),'utf8'));
  return Object.fromEntries(Object.keys(provenance.sources).filter(file=>file.endsWith('.mo'))
    .map(file=>[`${directory}/${file}`,fs.readFileSync(path.join(directory,file),'utf8')]));
}
