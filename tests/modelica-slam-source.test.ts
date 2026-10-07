import {expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {assembleRGBDSlamSource} from '../src/modelica-slam-source';
import {rgbdSlamSourceManifest as manifest} from '../src/modelica-slam-source-manifest.mjs';
import {migrateModelicaSourcePath} from '../src/modelica-source-locations.mjs';

const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const authored=()=>manifest.paths.map(name=>({path:name,source:readFileSync(name,'utf8')}));
const compose=(files:{source:string}[])=>files.map(file=>file.source).join('\n');

it('preserves the existing 56-file order and exact complete authored source in browser composition',async()=>{
  // Independently retained pre-refactor exporter inventory; its old source
  // hashes are not expected to match later edits to authored Modelica files.
  const previous=JSON.parse(readFileSync('dev/artifacts/modelica-owned-vocabulary-source/source-manifest.json','utf8'));
  expect(manifest.paths).toEqual(previous.sources.map((file:{path:string})=>migrateModelicaSourcePath(file.path)));
  expect(manifest.paths).toHaveLength(56);
  expect(new Set(manifest.paths).size).toBe(56);
  const files=authored(),expected=compose(files),result=await assembleRGBDSlamSource();
  expect(result.source).toBe(expected);
  expect(result.sourceSha256).toBe(sha(expected));
  expect(result.schemaVersion).toBe(1);
  expect(result.modelNames).toEqual(['RGBDFastSLAMReset','RGBDFastSLAMInitialize','RGBDFastSLAMStep']);
  expect(result.sources).toEqual(files.map(file=>({path:file.path,sha256:sha(file.source),
    bytes:Buffer.byteLength(file.source),overridden:false})));
  // Assert the existing full-domain source remains present, without compiling
  // it, shrinking arrays, or substituting a numerical fixture.
  for(const text of ['imageHeight = 90','imageWidth = 160','featureCapacity = 350',
    'keyframeCapacity = 128','edgeCapacity = 256','mapCapacity = imageHeight*imageWidth'])
    expect(result.source).toContain(text);
  for(const model of result.modelNames)expect(result.source).toContain(`model ${model}`);
});

it('Node exporter and browser composition share exact source, hashes and file identities',async()=>{
  const root=path.join(homedir(),'scratch/slam_web/tmp');mkdirSync(root,{recursive:true});
  const output=mkdtempSync(path.join(root,'slam-source-export-test-'));
  try{
    const exported=spawnSync(process.execPath,['dev/export-rgbd-slam-source.mjs',output],
      {encoding:'utf8',env:{...process.env,TMPDIR:output}});
    expect(exported.status,exported.stderr).toBe(0);
    const source=readFileSync(path.join(output,'source.mo'),'utf8');
    const receipt=JSON.parse(readFileSync(path.join(output,'source-manifest.json'),'utf8'));
    const browser=await assembleRGBDSlamSource();
    expect(source).toBe(browser.source);
    expect(receipt.sourceSha256).toBe(browser.sourceSha256);
    expect(receipt.sources).toEqual(browser.sources.map(({overridden:_,...file})=>file));
    expect(receipt.modelNames).toEqual(browser.modelNames);
    expect(receipt.composition).toBe('exact authored files joined with one newline, in this order');
    expect(receipt.compilerInvoked).toBe(false);
    expect(receipt.nativeArtifactIssued).toBe(false);
    expect(receipt.browserIntegrated).toBe(false);
  }finally{rmSync(output,{recursive:true,force:true});}
});

it('exports exact native D435 entrypoints with shared full-capacity state and held-IMU batching',()=>{
  const root=path.join(homedir(),'scratch/slam_web/tmp');mkdirSync(root,{recursive:true});
  const output=mkdtempSync(path.join(root,'slam-native-source-export-test-'));
  try{
    const exported=spawnSync(process.execPath,['dev/export-rgbd-slam-source.mjs',output,'--native-profile'],
      {encoding:'utf8',env:{...process.env,TMPDIR:output}});
    expect(exported.status,exported.stderr).toBe(0);
    const paths=[...manifest.paths,'models/SLAM/RGBDFastSLAMIntervals.mo','models/Sensors/D435ImageProfile.mo','models/SLAM/D435FastSLAM.mo'];
    const expected=paths.map(name=>readFileSync(name,'utf8')).join(manifest.separator);
    const source=readFileSync(path.join(output,'source.mo'),'utf8');
    const receipt=JSON.parse(readFileSync(path.join(output,'source-manifest.json'),'utf8'));
    expect(source).toBe(expected);expect(receipt.sourceSha256).toBe(sha(expected));
    expect(receipt.sources.map((file:{path:string})=>file.path)).toEqual(paths);
    expect(receipt.modelNames).toEqual(['RGBDFastSLAMReset','D435FastSLAMInitialize','D435FastSLAMStep','D435FastSLAMIntervals']);
    expect(receipt.compilerInvoked).toBe(false);expect(receipt.nativeArtifactIssued).toBe(false);
    expect(receipt.browserIntegrated).toBe(false);expect(receipt.fullSlamAccepted).toBe(false);
  }finally{rmSync(output,{recursive:true,force:true});}
});

it('applies student edits exactly, including Unicode, BOM, CRLF, trailing newlines and empty edits',async()=>{
  const files=authored(),step='models/SLAM/RGBDFastSLAMStep.mo',reset='models/SLAM/RGBDFastSLAMReset.mo';
  const edit='\uFEFF// élève λ student edit\r\n'+files.find(file=>file.path===step)!.source+'\r\n\r\n';
  const overrides=Object.assign(Object.create(null),{[step]:edit,[reset]:''});
  const result=await assembleRGBDSlamSource(overrides);
  const expected=compose(files.map(file=>({...file,source:file.path===step?edit:file.path===reset?'':file.source})));
  expect(result.source).toBe(expected);expect(result.sourceSha256).toBe(sha(expected));
  expect(result.sources.find(file=>file.path===step)).toEqual({path:step,sha256:sha(edit),bytes:Buffer.byteLength(edit),overridden:true});
  expect(result.sources.find(file=>file.path===reset)).toEqual({path:reset,sha256:sha(''),bytes:0,overridden:true});
  expect(result.sources.filter(file=>file.overridden).map(file=>file.path)).toEqual([reset,step]);
  // An edit is per invocation; a later call still uses the authored sources.
  expect((await assembleRGBDSlamSource()).source).toBe(compose(files));
});

it('captures submitted overrides before awaiting source loads',async()=>{
  const name='models/SLAM/RGBDFastSLAMStep.mo',overrides={[name]:'// first submitted edit\n'};
  const pending=assembleRGBDSlamSource(overrides);overrides[name]='// later edit\n';
  const result=await pending;
  expect(result.source.endsWith('// first submitted edit\n')).toBe(true);
  expect(result.sources.at(-1)?.sha256).toBe(sha('// first submitted edit\n'));
});

it.each(['RGBDFastSLAMStep.mo','../models/SLAM/RGBDFastSLAMStep.mo','models/Unknown.mo','models/../models/SLAM/RGBDFastSLAMStep.mo'])
('rejects unknown override path %s',async name=>{
  await expect(assembleRGBDSlamSource({[name]:'// edit'})).rejects.toThrow('Unknown Modelica source override');
});

it.each([null,42,'text',[],new Map(),new Date()])('rejects non-record override input %#',async value=>{
  await expect(assembleRGBDSlamSource(value as never)).rejects.toThrow('plain path-to-string object');
});

it.each([null,42,true,[],{},undefined])('rejects a non-string source override %#',async value=>{
  await expect(assembleRGBDSlamSource({'models/SLAM/RGBDFastSLAMStep.mo':value} as never)).rejects.toThrow('must be a string');
});

it('rejects symbol keys and accessors without evaluating an override getter',async()=>{
  await expect(assembleRGBDSlamSource({[Symbol('unknown')]:'edit'})).rejects.toThrow('Unknown Modelica source override');
  const overrides=Object.defineProperty({},'models/SLAM/RGBDFastSLAMStep.mo',{get(){throw Error('Getter must not run');}});
  await expect(assembleRGBDSlamSource(overrides)).rejects.toThrow('must be a string');
});
