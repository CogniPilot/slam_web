export interface Pose { x: number; y: number; z: number; quaternion: number[] }
export interface Truth extends Pose { time: number; velocity: number[]; accel: number[]; gyro: number[]; command?:Command; propellerAngles?:number[] }
export interface Command { forward: number; left: number; up: number; yaw: number }
export interface Calibration { width: number; height: number; fx: number; fy: number; cx: number; cy: number; near: number; far: number; forward: number; up: number; baseline: number; rgbFx: number; rgbFy: number; opticalToBody?:number[];originFlu?:number[];depthNoiseDisparityPx?:number;depthNoiseReferenceFx?:number;depthEncoding?:'axial-f32-le-rgba8'|'axial-z16-le' }
import type {CameraImageLayout} from './gpu-realsense-packing';
export interface SensorObservation {
  sequence: number; time: number; calibration: Calibration;
  rgb: Uint8Array; depth: Float32Array|Uint16Array;
  /** Present for native RGB8/Z16. Absent only for historical RGBA/F32 datasets. */
  imageLayout?:CameraImageLayout;
  imu: { accel: number[]; gyro: number[] };
}
export interface SensorFrame extends SensorObservation {
  dt:number;
  /** Held measurements over each interval; endpoint samples apply next. */
  imuIntervals?:{time:number;dt:number;imu:{accel:number[];gyro:number[]}}[];
  capture?:Record<string,unknown>;
}
export interface InitialSensorFrame extends SensorFrame {dt:0;imuIntervals:[]}
export interface Estimate extends Pose {
  points: number[][];confidence: number;features?: number[][];diagnostics?: Record<string,number|string>;
  uncertainty?:{positionCovariance:number[];attitudeCovariance:number[]};
  tracking?:{matches:{current:number[];previous:number[]}[];accepted:boolean;reason:string;referenceSequence?:number};
  poseGraph?:{keyframes:{position:number[];quaternion:number[]}[];edges:{from:number;to:number;kind:'loop'|'odometry'}[]};
}
export interface RunRecord { frame: SensorFrame; truth?: Truth; command: Command; estimate: Estimate }
export type Environment = 'city' | 'warehouse' | 'courtyard' | 'tokyo' | 'asset-city' | 'big-city';
export type SceneDetail='low'|'medium'|'high';
