import {it,expect} from 'vitest';
import {defaultProject,parseProject,detectors,algorithms,withActorMotion} from '../src/project';

it('retires app-generated INS binaries while retaining source and compiler-session metadata',()=>{
 const project={...defaultProject(),algorithmPreset:'custom',algorithm:defaultProject().algorithm+'\n// Student INS edit\n'};
 const old={format:'rumoca-state-node',version:1,wasmBase64:'retired app backend'};
 const migrated=parseProject(JSON.stringify({...project,algorithmArtifact:old}));
 expect(migrated.algorithm).toBe(project.algorithm);expect(migrated.algorithmPreset).toBe('custom');
 expect(migrated.algorithmArtifact).toBeUndefined();expect(migrated.physics).toBe(project.physics);
 const metadata={format:'rumoca-simulation-session',version:1,modelName:'ModelicaInertial',sourceSha256:'0'.repeat(64),compilerVersion:'test',compilerCommit:'test',executionPolicy:'auto'};
 expect(parseProject(JSON.stringify({...project,algorithmArtifact:metadata})).algorithmArtifact).toEqual(metadata);
});

it('keeps Modelica presets and custom source intact across project reload',()=>{
 const project=defaultProject();expect(project.runtime).toBe('modelica');expect(project.detectorLanguage).toBe('modelica');
 expect(Object.keys(detectors).every(n=>n.startsWith('Modelica '))).toBe(true);expect(Object.keys(algorithms).every(n=>n.startsWith('Modelica '))).toBe(true);
 const edited={...project,detectorPreset:'custom',detector:project.detector+'\n// Student edit\n'};expect(parseProject(JSON.stringify(edited))).toEqual(edited);
});
it('retires application-generated vision binaries without replacing student source',()=>{
 const source=defaultProject().detector+'\n// student detector edit\n';
 const restored=parseProject(JSON.stringify({...defaultProject(),detector:source,detectorPreset:'custom',detectorArtifact:{format:'rumoca-raster-node',wasmBase64:'retired cache'}}));
 expect(restored.detector).toBe(source);expect(restored.detectorPreset).toBe('custom');expect(restored.detectorArtifact).toBeUndefined();
});
it('refuses unsupported runtime tags without substituting the saved algorithm',()=>{
 const project=defaultProject();for(const runtime of ['retired','rust'])expect(()=>parseProject(JSON.stringify({...project,runtime}))).toThrow('retired runtime');
 expect(()=>parseProject(JSON.stringify({...project,detectorLanguage:'retired'}))).toThrow('retired runtime');
});
it('adds editable actor motion to old sensor sources and retains all saved custom equations',()=>{
 const project=defaultProject(),existing=project.sensorModelica!.split('model ActorMotion')[0]+'\n// student sensor edit\n';
 const restored=parseProject(JSON.stringify({...project,sensorModelica:existing}));
 expect(restored.sensorModelica!.startsWith(existing)).toBe(true);
 expect(restored.sensorModelica).toContain('model ActorMotion');
 const edited=restored.sensorModelica!.replace('animationRate = 0.85','animationRate = 0.52');
 expect(withActorMotion(edited)).toBe(edited);
 expect(parseProject(JSON.stringify({...restored,sensorModelica:edited})).sensorModelica).toBe(edited);
});
