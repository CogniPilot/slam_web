import type {Calibration} from './types';

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
