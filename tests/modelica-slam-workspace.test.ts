import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {rgbdSlamSourceManifest as manifest} from '../src/modelica-slam-source-manifest.mjs';
import {assembleRGBDSlamSource,loadRGBDSlamSourceFile} from '../src/modelica-slam-source';
import {checkedRGBDSlamWorkspace,createRGBDSlamWorkspace,editRGBDSlamWorkspace} from '../src/modelica-slam-workspace';

const path=manifest.paths[0];
const authored=()=>Object.fromEntries(manifest.paths.map(path=>[path,readFileSync(path,'utf8')]));
const snapshot=()=>({schemaVersion:1,sources:authored()});
const sha=(source:string)=>createHash('sha256').update(source).digest('hex');

it('creates a full independent snapshot of the actual 56 authored dependencies',async()=>{
  const workspace=await createRGBDSlamWorkspace(),other=await createRGBDSlamWorkspace();
  expect(workspace.schemaVersion).toBe(1);
  expect(Object.keys(workspace.sources)).toEqual(manifest.paths);
  expect(Object.keys(workspace.sources)).toHaveLength(56);
  expect(workspace.sources).toEqual(authored());
  expect(other).toEqual(workspace);
  expect(other).not.toBe(workspace);expect(other.sources).not.toBe(workspace.sources);
  (workspace.sources as Record<string,string>)[path]='// owned edit';
  expect(other.sources[path]).toBe(readFileSync(path,'utf8'));
});

it('validates saved sources without retaining caller-owned maps',()=>{
  const input=snapshot(),checked=checkedRGBDSlamWorkspace(input);
  expect(checked).toEqual(input);expect(checked).not.toBe(input);expect(checked.sources).not.toBe(input.sources);
  input.sources[path]='// later external mutation';
  expect(checked.sources[path]).toBe(readFileSync(path,'utf8'));
  (checked.sources as Record<string,string>)[path]='// local mutation';
  expect(input.sources[path]).toBe('// later external mutation');
});

it('migrates flat saved paths while preserving every edited source byte',()=>{
  const sources=Object.fromEntries(Object.entries(authored()).map(([path,source])=>[
    `models/${path.split('/').at(-1)}`,source
  ]));
  const edit='\uFEFF// élève λ\r\n\r\n';
  sources['models/FastNativeFrame.mo']=edit;
  sources['models/RGBDFastSLAMReset.mo']='';
  const reopened=checkedRGBDSlamWorkspace({schemaVersion:1,sources});
  expect(Object.keys(reopened.sources)).toEqual(manifest.paths);
  expect(reopened.sources['models/Vision/Features/FastNativeFrame.mo']).toBe(edit);
  expect(reopened.sources['models/SLAM/RGBDFastSLAMReset.mo']).toBe('');
});

it('refuses conflicting old and new path identities without reading a getter',()=>{
  const sources=authored();
  Object.defineProperty(sources,'models/FastNativeFrame.mo',{
    get(){throw Error('Getter must not run');}
  });
  expect(()=>checkedRGBDSlamWorkspace({schemaVersion:1,sources})).toThrow('Duplicate');
});

it('retains saved dependency versions, Unicode, empty text and CRLF across JSON save/load and byte-exact assembly',async()=>{
  const original=await createRGBDSlamWorkspace();
  // A non-entrypoint dependency is saved too, rather than filled from today's bundle.
  const edit='\uFEFF// ancienne dépendance λ 😀\r\nmodel SavedDependency\r\nend SavedDependency;\r\n\r\n';
  const edited=editRGBDSlamWorkspace(editRGBDSlamWorkspace(original,path,edit),'models/SLAM/RGBDFastSLAMReset.mo','');
  expect(original.sources[path]).toBe(readFileSync(path,'utf8'));
  expect(edited.sources).not.toBe(original.sources);
  const loaded=checkedRGBDSlamWorkspace(JSON.parse(JSON.stringify(edited)));
  expect(loaded).toEqual(edited);expect(loaded.sources).not.toBe(edited.sources);
  const expected=manifest.paths.map(path=>loaded.sources[path]).join('\n');
  const assembled=await assembleRGBDSlamSource(loaded.sources);
  expect(assembled.source).toBe(expected);expect(assembled.sourceSha256).toBe(sha(expected));
  expect(Buffer.from(assembled.source,'utf8')).toEqual(Buffer.from(expected,'utf8'));
  expect(assembled.sources).toEqual(manifest.paths.map(path=>({path,sha256:sha(loaded.sources[path]),
    bytes:Buffer.byteLength(loaded.sources[path]),overridden:true})));
  expect(loaded.sources[path]).toBe(edit);
  expect(loaded.sources['models/SLAM/RGBDFastSLAMReset.mo']).toBe('');
});

it('accepts plain null-prototype snapshots and copies non-enumerable data entries',()=>{
  const sources=Object.assign(Object.create(null),authored());
  Object.defineProperty(sources,path,{value:'',enumerable:false});
  const input=Object.assign(Object.create(null),{schemaVersion:1,sources});
  const checked=checkedRGBDSlamWorkspace(input);
  expect(Object.getPrototypeOf(checked.sources)).toBe(Object.prototype);
  expect(Object.keys(checked.sources)).toEqual(manifest.paths);
  expect(checked.sources[path]).toBe('');
});

it.each([null,undefined,42,'text',[],new Map(),new Date(),Object.create({schemaVersion:1})])
('rejects non-plain workspace envelopes %#',value=>{
  expect(()=>checkedRGBDSlamWorkspace(value)).toThrow('plain object');
});

it.each([0,3,'1',true,null])('rejects unsupported schema version %#',schemaVersion=>{
  expect(()=>checkedRGBDSlamWorkspace({...snapshot(),schemaVersion})).toThrow('schemaVersion');
});

it('rejects missing, extra and symbol envelope fields without invoking getters',()=>{
  expect(()=>checkedRGBDSlamWorkspace({sources:authored()})).toThrow('data property: schemaVersion');
  expect(()=>checkedRGBDSlamWorkspace({schemaVersion:1})).toThrow('data property: sources');
  expect(()=>checkedRGBDSlamWorkspace({...snapshot(),extra:true})).toThrow('Unknown');
  expect(()=>checkedRGBDSlamWorkspace({...snapshot(),[Symbol('extra')]:true})).toThrow('Unknown');
  for(const key of ['schemaVersion','sources']){
    const input=Object.defineProperty(snapshot(),key,{get(){throw Error('Getter must not run');}});
    expect(()=>checkedRGBDSlamWorkspace(input)).toThrow('data property');
  }
});

it.each([null,undefined,42,'text',[],new Map(),new Date(),Object.create({})])
('rejects non-plain source maps %#',sources=>{
  expect(()=>checkedRGBDSlamWorkspace({schemaVersion:1,sources})).toThrow('plain object');
});

it('refuses incomplete snapshots instead of replacing a missing dependency with a bundled source',()=>{
  const input=snapshot();delete input.sources[path];
  expect(()=>checkedRGBDSlamWorkspace(input)).toThrow(`data property: ${path}`);
  expect(()=>editRGBDSlamWorkspace(input as never,path,'repair')).toThrow('data property');
});

it.each(['Unknown.mo','models/Unknown.mo','../models/Vision/Features/FastNativeFrame.mo','models/../models/Vision/Features/FastNativeFrame.mo','__proto__'])
('rejects unknown saved and edited path %s',unknown=>{
  const input=snapshot();Object.defineProperty(input.sources,unknown,{value:'edit',enumerable:true});
  expect(()=>checkedRGBDSlamWorkspace(input)).toThrow('Unknown Modelica workspace source path');
  expect(()=>editRGBDSlamWorkspace(snapshot() as never,unknown,'edit')).toThrow('Unknown');
});

it.each([null,undefined,42,true,[],{}])('rejects non-string saved and edited source %#',value=>{
  const input=snapshot();Object.defineProperty(input.sources,path,{value});
  expect(()=>checkedRGBDSlamWorkspace(input)).toThrow('must be a string');
  expect(()=>editRGBDSlamWorkspace(snapshot() as never,path,value as never)).toThrow('must be a string');
});

it('rejects source symbols and accessors without invoking getters',()=>{
  const input=snapshot();Object.defineProperty(input.sources,Symbol('path'),{value:'edit'});
  expect(()=>checkedRGBDSlamWorkspace(input)).toThrow('Unknown Modelica workspace source path');
  const accessor=snapshot();Object.defineProperty(accessor.sources,path,{get(){throw Error('Getter must not run');}});
  expect(()=>checkedRGBDSlamWorkspace(accessor)).toThrow('data property');
});

it('loads individual authored text only for an exact checked manifest path',async()=>{
  expect(await loadRGBDSlamSourceFile(path)).toBe(readFileSync(path,'utf8'));
  await expect(loadRGBDSlamSourceFile('models/Unknown.mo')).rejects.toThrow('Unknown Modelica source path');
  await expect(loadRGBDSlamSourceFile(42 as never)).rejects.toThrow('Unknown Modelica source path');
});
