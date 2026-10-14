import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {D435,D435_IMAGE,D435_PAIRED_MAX_HZ,D435_PAIRED_RESOLUTIONS,d435Calibration} from '../src/camera-profile';
import {defaultProject,parseProject} from '../src/project';
import {sensorRates} from '../src/sensor-clock';

it('uses a native common D435 mode and keeps color and depth optics distinct',()=>{
  expect(D435_IMAGE).toEqual({width:848,height:480});
  expect(D435_PAIRED_MAX_HZ).toBe(60);
  expect(D435.cx).toBe(423.5);expect(D435.cy).toBe(239.5);
  expect(D435.rgbFx).toBeGreaterThan(D435.fx);
  expect(D435.rgbFy).toBeGreaterThan(D435.fy);
  expect(D435.depthNoiseReferenceFx).toBe(D435.fx);
  const source=readFileSync('models/Sensors/D435ImageProfile.mo','utf8');
  expect(source).toContain(`constant Integer width = ${D435.width};`);
  expect(source).toContain(`constant Integer height = ${D435.height};`);
});

it('saves each ordinary paired mode, scales projection and caps 720p acquisition',()=>{
  expect(defaultProject().cameraResolution).toBe('424x240');
  for(const mode of D435_PAIRED_RESOLUTIONS){
    const project=parseProject(JSON.stringify({...defaultProject(),cameraResolution:mode.id,sceneDetail:'high'}));
    expect(project.cameraResolution).toBe(mode.id);expect(sensorRates(project).cameraHz).toBe(mode.maxHz);
    const k=d435Calibration(mode.id);
    expect([k.width,k.height]).toEqual([mode.width,mode.height]);
    expect(k.cx).toBe((mode.width-1)/2);expect(k.cy).toBe((mode.height-1)/2);
    expect(k.fx/k.width).toBeCloseTo(D435.fx/D435.width,14);
    expect(k.fy/k.height).toBeCloseTo(D435.fy/D435.height,14);
    expect(k.rgbFx/k.width).toBeCloseTo(D435.rgbFx/D435.width,14);
    expect(k.rgbFy/k.height).toBeCloseTo(D435.rgbFy/D435.height,14);
    expect(k.rgbFx).toBeGreaterThan(k.fx);
  }
  expect(()=>parseProject(JSON.stringify({...defaultProject(),cameraResolution:'320x180'}))).toThrow('camera resolution');
  const legacy=defaultProject();delete legacy.cameraResolution;
  expect(parseProject(JSON.stringify(legacy)).cameraResolution).toBeUndefined();
  expect(D435.width).toBe(848); // Resolution changes do not mutate the shared legacy profile.
});

