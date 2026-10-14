export type CameraResolution='424x240'|'640x360'|'640x480'|'848x480'|'1280x720';
export interface CameraMode {readonly id:CameraResolution;readonly width:number;readonly height:number;readonly maxHz:30|60}
export const D435_PAIRED_RESOLUTIONS:readonly CameraMode[];
export const D435_RESOLUTION_SOURCE:string;
