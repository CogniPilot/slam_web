import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {modelicaModelsSources} from '../src/modelica-models-library';
import {defaultProject,parseProject} from '../src/project';

it('ships the exact pinned Modelica library with its package layout and persistent editable sources',()=>{
  const directory='models/Libraries/CogniPilot';
  const git=(...args:string[])=>execFileSync('git',args,{encoding:'utf8'}).trim();
  const pin=git('ls-files','--stage','--',directory).split(/\s+/)[1];
  expect(git('-C',directory,'rev-parse','HEAD')).toBe(pin);
  const tree=git('-C',directory,'ls-tree','-r',pin).split('\n');
  const files=tree.filter(entry=>entry.endsWith('.mo'));
  expect(Object.keys(modelicaModelsSources)).toHaveLength(files.length);
  for(const entry of files){
    const [metadata,file]=entry.split('\t'),digest=metadata.split(' ')[2];
    const bytes=readFileSync(`${directory}/${file}`);
    expect(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),file).toBe(digest);
    expect(modelicaModelsSources[`${directory}/${file}`]).toBe(bytes.toString());
  }
  const project=defaultProject(),path=`${directory}/Control/Multirotor/LogLinear/package.mo`;
  expect(project.physics).toContain('Control.Multirotor.LogLinear.Controller controller');
  expect(project.modelicaSources![path]).toBe(modelicaModelsSources[path]);
  project.modelicaSources![path]+='\n// Student controller edit\n';
  expect(parseProject(JSON.stringify(project)).modelicaSources![path]).toBe(project.modelicaSources![path]);
  expect(defaultProject().modelicaSources![path]).toBe(modelicaModelsSources[path]);
});
