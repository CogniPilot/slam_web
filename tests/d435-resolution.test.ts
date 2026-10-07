import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {D435,D435_IMAGE,D435_PAIRED_MAX_HZ} from '../src/camera-profile';

it('uses a native common D435 mode and keeps color and depth optics distinct',()=>{
  expect(D435_IMAGE).toEqual({width:848,height:480});
  expect(D435_PAIRED_MAX_HZ).toBe(60);
  expect(D435.cx).toBe(423.5);expect(D435.cy).toBe(239.5);
  expect(D435.rgbFx).toBeGreaterThan(D435.fx);
  expect(D435.rgbFy).toBeGreaterThan(D435.fy);
  expect(D435.depthNoiseReferenceFx).toBe(D435.fx);
  const source=readFileSync('models/D435ImageProfile.mo','utf8');
  expect(source).toContain(`constant Integer width = ${D435.width};`);
  expect(source).toContain(`constant Integer height = ${D435.height};`);
});

