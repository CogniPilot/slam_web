import {expect,it} from 'vitest';
import {checkedLoopClosureSettings,DEFAULT_LOOP_CLOSURE_SETTINGS} from '../src/loop-closure-settings';
import {defaultProject,parseProject,withDefaultModels,estimatorExampleSources} from '../src/project';

it('retains validated tuning through project save and model recovery',()=>{
  const settings=checkedLoopClosureSettings({loopMinimumSimilarity:.6,loopMinimumAge:20,loopMinimumInliers:24,loopCalibratedResiduals:false});
  const project={...defaultProject(),loopClosureSettings:settings};
  expect(parseProject(JSON.stringify(project)).loopClosureSettings).toEqual(settings);
  expect(withDefaultModels(project).loopClosureSettings).toEqual(settings);
  expect(checkedLoopClosureSettings()).toEqual(DEFAULT_LOOP_CLOSURE_SETTINGS);
});

it.each([
  {loopMinimumAge:NaN},{loopMinimumSimilarity:1.1},{loopMinimumInliers:12.5},
  {loopMaximumRms:.1,loopInlierDistance:.08},{minimumInterval:3,maximumInterval:2},
  {loopCalibratedResiduals:1},{loopMaximumNormalizedSquared:0},{unrecognized:1},
])('rejects invalid or incompatible tuning before model inputs can change: %j',settings=>{
  expect(()=>checkedLoopClosureSettings(settings)).toThrow();
});

it('discovers estimator examples without vehicle and internal component sources',()=>{
  const project=defaultProject();
  const sources=estimatorExampleSources(project);
  expect(Object.keys(sources).map(path=>path.split('/').at(-1))).toEqual(expect.arrayContaining(['SmoothedInertial.mo','ResponsiveInertial.mo']));
  expect(Object.keys(sources).every(path=>/SLAM\/Examples\/(?:InertialOnly|SmoothedInertial|ResponsiveInertial)\.mo$/.test(path))).toBe(true);
  expect(Object.keys(sources).some(path=>/Quadrotor|RigidBody|ModelicaInertial/.test(path))).toBe(false);
  project.mainSourcePath='models/Libraries/CogniPilot/SLAM/Examples/SmoothedInertial.mo';
  project.algorithm=project.modelicaSources![project.mainSourcePath];
  expect(estimatorExampleSources(project)[project.mainSourcePath]).toBeUndefined();
});
