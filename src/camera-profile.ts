import type {Calibration} from './types';
import {D435_PAIRED_RESOLUTIONS,type CameraResolution} from './camera-resolutions.mjs';
export {D435_PAIRED_RESOLUTIONS};
export type {CameraResolution};

/** Native D435 mode supported by both sensors, without image upscaling.
 * RGB supports up to60 Hz here; depth supports up to90 Hz. Our paired
 * acquisition uses the RGB limit. Maximum-resolution modes are different:
 * RGB1920×1080 and depth1280×720, both at30 Hz.
 * Source: Intel D400 Series datasheet, Depth Module Image Formats.
 */
export const D435_IMAGE=Object.freeze({width:848,height:480});
export const D435_PAIRED_MAX_HZ=60;
const {width,height}=D435_IMAGE;
export const D435:Calibration=Object.freeze({
  width,height,
  fx:width/(2*Math.tan(87*Math.PI/360)),
  fy:height/(2*Math.tan(58*Math.PI/360)),
  cx:(width-1)/2,cy:(height-1)/2,
  near:.28,far:10,forward:.18,up:-.04,baseline:.05,
  rgbFx:width/(2*Math.tan(69*Math.PI/360)),
  rgbFy:height/(2*Math.tan(42*Math.PI/360)),
  depthNoiseDisparityPx:.08,
  depthNoiseReferenceFx:width/(2*Math.tan(87*Math.PI/360)),
  depthEncoding:'axial-f32-le-rgba8',
});

export function d435Calibration(resolution:CameraResolution):Calibration {
  const mode=D435_PAIRED_RESOLUTIONS.find(mode=>mode.id===resolution);
  if(!mode)throw new Error('Unsupported D435 paired resolution');
  const {width,height}=mode;
  return {...D435,width,height,fx:D435.fx*width/D435.width,fy:D435.fy*height/D435.height,
    rgbFx:D435.rgbFx*width/D435.width,rgbFy:D435.rgbFy*height/D435.height,
    cx:(width-1)/2,cy:(height-1)/2,depthNoiseReferenceFx:D435.fx*width/D435.width};
}

/** CPU-backed WebGL sampling preserves physical optics and native disparity noise. */
export const SOFTWARE_CAMERA:Calibration=Object.freeze({
  ...D435,width:160,height:90,
  fx:D435.fx*160/D435.width,fy:D435.fy*90/D435.height,
  rgbFx:D435.rgbFx*160/D435.width,rgbFy:D435.rgbFy*90/D435.height,
  cx:(160-1)/2,cy:(90-1)/2,
});
export type SensorProfile='native'|'software';
export type SensorProfileSelection=SensorProfile|'auto';
export function resolveSensorProfile(acceleration:string,selection:SensorProfileSelection='auto'):SensorProfile {
  return selection==='auto'?(acceleration==='software'?'software':'native'):selection;
}
