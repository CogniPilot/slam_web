import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {modelicaModelsSources} from '../src/modelica-models-library';
import {defaultProject,parseProject} from '../src/project';

it('ships the exact pinned Modelica library with its package layout and persistent editable sources',()=>{
  const directory='models/Libraries/CogniPilot';
  const manifest=JSON.parse(readFileSync(`${directory}/provenance.json`,'utf8'));
  const files=Object.keys(manifest.sources).filter(file=>file.endsWith('.mo'));
  expect(Object.keys(modelicaModelsSources)).toHaveLength(files.length);
  for(const [file,digest]of Object.entries(manifest.sources)){
    const bytes=readFileSync(`${directory}/${file}`);
    expect(createHash('sha256').update(bytes).digest('hex'),file).toBe(digest);
    if(file.endsWith('.mo'))expect(modelicaModelsSources[`${directory}/${file}`]).toBe(bytes.toString());
  }
  const project=defaultProject(),path=`${directory}/Control/Multirotor/LogLinear/package.mo`;
  expect(project.physics).toContain('Control.Multirotor.LogLinear.Controller controller');
  expect(project.modelicaSources![path]).toBe(modelicaModelsSources[path]);
  project.modelicaSources![path]+='\n// Student controller edit\n';
  expect(parseProject(JSON.stringify(project)).modelicaSources![path]).toBe(project.modelicaSources![path]);
  expect(defaultProject().modelicaSources![path]).toBe(modelicaModelsSources[path]);
});
