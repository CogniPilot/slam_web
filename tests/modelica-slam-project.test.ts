import {expect,it} from 'vitest';
import {defaultProject,parseProject} from '../src/project';
import {createRGBDSlamWorkspace,editRGBDSlamWorkspace} from '../src/modelica-slam-workspace';
import {assembleRGBDSlamSource} from '../src/modelica-slam-source';

it('downloads and reopens all SLAM dependency sources without changing the active estimator',async()=>{
  const project=defaultProject(),path='models/RGBDFastSLAMInterface.mo';
  const original=await createRGBDSlamWorkspace();
  const edited='// Student policy edit λ\r\n'+original.sources[path].replace(
    'parameter Integer minimumMeasuredDescriptors = 8;','parameter Integer minimumMeasuredDescriptors = 12;');
  project.slamWorkspace=editRGBDSlamWorkspace(original,path,edited);
  const reopened=parseProject(JSON.stringify(project));
  expect(reopened.slamWorkspace).toEqual(project.slamWorkspace);
  expect(reopened.algorithm).toBe(project.algorithm);
  expect(reopened.algorithmPreset).toBe('Modelica inertial propagation');
  const composition=await assembleRGBDSlamSource(reopened.slamWorkspace!.sources);
  expect(composition.sources).toHaveLength(56);
  expect(composition.sources.every(file=>file.overridden)).toBe(true);
  expect(composition.source).toContain(edited);
  expect(composition.source).not.toContain('parameter Integer minimumMeasuredDescriptors = 8;');
  expect(original.sources[path]).toContain('minimumMeasuredDescriptors = 8;');
});

it('refuses a saved workspace with missing or unknown dependencies instead of silently substituting current sources',async()=>{
  const project=defaultProject(),workspace=await createRGBDSlamWorkspace();
  const missing={...workspace,sources:{...workspace.sources}};delete missing.sources['models/RGBDFastSLAMStep.mo'];
  expect(()=>parseProject(JSON.stringify({...project,slamWorkspace:missing}))).toThrow();
  expect(()=>parseProject(JSON.stringify({...project,slamWorkspace:{...workspace,
    sources:{...workspace.sources,'models/Unknown.mo':'model Unknown end Unknown;'}}}))).toThrow();
});
