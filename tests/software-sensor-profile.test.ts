import {expect,it} from 'vitest';
import {D435,SOFTWARE_CAMERA,resolveSensorProfile} from '../src/camera-profile';
import {GRAPHICS_QUALITY,graphicsQuality} from '../src/graphics-quality';

it('downgrades only detected software and honors explicit profiles',()=>{
  expect(resolveSensorProfile('software')).toBe('software');
  expect(resolveSensorProfile('unknown')).toBe('native');
  expect(resolveSensorProfile('hardware-reported')).toBe('native');
  expect(resolveSensorProfile('software','native')).toBe('native');
  expect(resolveSensorProfile('hardware-reported','software')).toBe('software');
});
it('preserves optical angles, sensor mount and physical noise in the tiny camera',()=>{
  const c=SOFTWARE_CAMERA;
  expect([D435.width,D435.height]).toEqual([848,480]);
  expect([c.width,c.height]).toEqual([160,90]);
  for(const [f,dimension] of [['fx','width'],['fy','height'],['rgbFx','width'],['rgbFy','height']] as const)
    expect(c[f]/c[dimension]).toBeCloseTo(D435[f]/D435[dimension],14);
  expect(c.cx).toBe((c.width-1)/2);expect(c.cy).toBe((c.height-1)/2);
  for(const field of ['near','far','forward','up','baseline','depthNoiseDisparityPx','depthNoiseReferenceFx','depthEncoding'] as const)
    expect(c[field]).toBe(D435[field]);
});
it('uses a software budget below Low without changing native quality choices',()=>{
  const software=graphicsQuality('high',2,16,true);
  expect(software.pixelRatio).toBeLessThan(GRAPHICS_QUALITY.low.pixelRatio);
  expect(software.textureSize).toBeLessThan(GRAPHICS_QUALITY.low.textureSize);
  expect(software.shadows).toBe(false);expect(software.normalMaps).toBe(false);
  expect(graphicsQuality('high',2,16)).toEqual(GRAPHICS_QUALITY.high);
});
