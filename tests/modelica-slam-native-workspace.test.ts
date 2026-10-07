import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {rgbdSlamNativeSourceManifest as native,rgbdSlamSourceManifest as legacy} from '../src/modelica-slam-source-manifest.mjs';
import {assembleRGBDSlamSource} from '../src/modelica-slam-source';
import {assembleRGBDSlamWorkspace,checkedRGBDSlamWorkspace,createRGBDSlamWorkspace,editRGBDSlamWorkspace} from '../src/modelica-slam-workspace';
import {defaultProject,parseProject} from '../src/project';
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');

it('assembles current native sources and preserves a previously saved compiler delivery exactly',async()=>{
  const workspace=await createRGBDSlamWorkspace('d435-native');
  expect(workspace.schemaVersion).toBe(2);
  expect(Object.keys(workspace.sources)).toEqual(native.paths);
  expect(Object.keys(workspace.sources)).toHaveLength(59);
  const composition=await assembleRGBDSlamWorkspace(workspace);
  const delivered=JSON.parse(readFileSync('dev/artifacts/modelica-raw-image-inputs/native-source-2026-10-07/source-manifest.json','utf8'));
  expect(composition.modelNames).toEqual(['RGBDFastSLAMReset','D435FastSLAMInitialize','D435FastSLAMStep','D435FastSLAMIntervals']);
  const current=native.paths.map(file=>readFileSync(file,'utf8')).join(native.separator);
  expect(composition.source).toBe(current);
  expect(composition.sourceSha256).toBe(sha(current));
  expect(composition.sources.every(file=>file.overridden)).toBe(true);
  // A frozen delivery is saved source, not a golden for later algorithm edits.
  // Reopen every original byte and verify that bundled changes cannot replace it.
  const frozen=readFileSync('dev/artifacts/modelica-raw-image-inputs/native-source-2026-10-07/source.mo');
  let offset=0;const sources:Record<string,string>={};
  for(const file of delivered.sources){
    const bytes=frozen.subarray(offset,offset+file.bytes);
    expect(sha(bytes.toString())).toBe(file.sha256);
    sources[file.path]=bytes.toString();offset+=file.bytes+1;
  }
  expect(offset-1).toBe(frozen.length);
  const restored=await assembleRGBDSlamWorkspace({...workspace,sources});
  expect(restored.source).toBe(frozen.toString());
  expect(restored.sourceSha256).toBe(delivered.sourceSha256);
});

it('saves and reopens native entrypoint, camera-profile and core edits as exact owned dependencies',async()=>{
  const workspace=await createRGBDSlamWorkspace('d435-native');
  const path='models/SLAM/D435FastSLAM.mo',profile='models/Sensors/D435ImageProfile.mo';
  const edit='\uFEFF// élève λ 😀\r\n'+workspace.sources[path]+'\r\n';
  const changed=editRGBDSlamWorkspace(editRGBDSlamWorkspace(workspace,path,edit),profile,'');
  const project=defaultProject(),reopened=parseProject(JSON.stringify({...project,slamWorkspace:changed}));
  expect(reopened.slamWorkspace).toEqual(changed);
  expect(reopened.algorithm).toBe(project.algorithm);
  const composition=await assembleRGBDSlamWorkspace(reopened.slamWorkspace!);
  const expected=native.paths.map(file=>changed.sources[file]).join('\n');
  expect(composition.source).toBe(expected);expect(composition.sourceSha256).toBe(sha(expected));
  expect(workspace.sources[path]).toBe(readFileSync(path,'utf8'));
  expect(composition.sources.find(file=>file.path===profile)?.bytes).toBe(0);
});

it('keeps old workspaces exact rather than silently adding native dependencies',async()=>{
  const workspace=await createRGBDSlamWorkspace();
  expect(workspace.schemaVersion).toBe(1);expect(Object.keys(workspace.sources)).toEqual(legacy.paths);
  const loaded=checkedRGBDSlamWorkspace(JSON.parse(JSON.stringify(workspace)));
  const composition=await assembleRGBDSlamWorkspace(loaded);
  expect(composition.source).toBe(legacy.paths.map(file=>workspace.sources[file]).join('\n'));
  expect(composition.modelNames).toEqual(legacy.modelNames);
  expect(()=>editRGBDSlamWorkspace(loaded,'models/SLAM/D435FastSLAM.mo','edit')).toThrow('Unknown');
  await expect(assembleRGBDSlamSource({'models/SLAM/D435FastSLAM.mo':'edit'})).rejects.toThrow('Unknown');
});

it('refuses missing native files and wrong-inventory schema tags instead of substituting bundled sources',async()=>{
  const nativeWorkspace=await createRGBDSlamWorkspace('d435-native'),old=await createRGBDSlamWorkspace();
  const missing={...nativeWorkspace,sources:{...nativeWorkspace.sources}};
  delete missing.sources['models/SLAM/RGBDFastSLAMIntervals.mo'];
  expect(()=>checkedRGBDSlamWorkspace(missing)).toThrow('data property');
  expect(()=>checkedRGBDSlamWorkspace({...nativeWorkspace,schemaVersion:1})).toThrow('Unknown');
  expect(()=>checkedRGBDSlamWorkspace({...old,schemaVersion:2})).toThrow('data property');
  const getter={...nativeWorkspace,sources:{...nativeWorkspace.sources}};
  Object.defineProperty(getter.sources,'models/SLAM/D435FastSLAM.mo',{get(){throw Error('getter must not run');}});
  expect(()=>checkedRGBDSlamWorkspace(getter)).toThrow('data property');
});

it('captures every saved native edit before asynchronous assembly begins',async()=>{
  const workspace=await createRGBDSlamWorkspace('d435-native'),path='models/SLAM/D435FastSLAM.mo';
  const pending=assembleRGBDSlamWorkspace(workspace);
  (workspace.sources as Record<string,string>)[path]='// later caller edit';
  expect((await pending).sources.find(file=>file.path===path)?.sha256).toBe(sha(readFileSync(path,'utf8')));
});

it('refuses unknown profile names before loading source',async()=>{
  await expect(createRGBDSlamWorkspace('unknown' as never)).rejects.toThrow('profile');
  await expect(assembleRGBDSlamSource({},'unknown' as never)).rejects.toThrow('profile');
});
