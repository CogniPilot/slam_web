import { Builder, ByteBuffer } from 'flatbuffers';
import { InertialSampleData } from './generated/synapse/topic/inertial-sample-data';
import { OdometryData } from './generated/synapse/topic/odometry-data';
import { OdometryEstimateData } from './generated/synapse/topic/odometry-estimate-data';
import { OdometryFlags } from './generated/synapse/topic/odometry-flags';
import { TimeStatus } from './generated/synapse/types/time-status';
import type { Pose, SensorFrame } from './types';
// Canonical Synapse fixed structs, not table-wrapped FlatBuffers. This is the
// same wire layout used by firmware and Electrode Web's topic catalog.
export function encodeImu(frame: SensorFrame) {
  const b = new Builder(64), a=frame.imu.accel, g=frame.imu.gyro;
  InertialSampleData.createInertialSampleData(b, BigInt(Math.round(frame.time*1e9)), a[0],a[1],a[2],g[0],g[1],g[2],25,3,TimeStatus.LocalFreerun,0);
  return b.dataBuffer().bytes().slice(b.dataBuffer().capacity()-b.offset());
}
export function encodeOdometry(pose: Pose, time: number, confidence=1) {
  const b=new Builder(96), [w,x,y,z]=pose.quaternion;
  OdometryData.createOdometryData(b,BigInt(Math.round(time*1e9)),pose.x,pose.y,pose.z,w,x,y,z,0,0,0,0,0,0,OdometryFlags.PositionValid|OdometryFlags.AttitudeValid,1,0,1,Math.round(Math.max(0,Math.min(1,confidence))*100),TimeStatus.LocalFreerun);
  return b.dataBuffer().bytes().slice(b.dataBuffer().capacity()-b.offset());
}
export function decodeOdometry(bytes: Uint8Array): Pose {
  if(bytes.length===OdometryEstimateData.sizeOf()) {
    const odom=new OdometryEstimateData().__init(0,new ByteBuffer(bytes)),pos=odom.positionEnuM()!,q=odom.attitude()!;
    return {x:pos.x(),y:pos.y(),z:pos.z(),quaternion:[q.w(),q.x(),q.y(),q.z()]};
  }
  if(bytes.length!==OdometryData.sizeOf()) throw new Error('Expected canonical 72-byte OdometryData');
  const odom=new OdometryData().__init(0,new ByteBuffer(bytes)), p=odom.pose()!, pos=p.positionEnuM()!, q=p.attitude()!;
  return { x:pos.x(),y:pos.y(),z:pos.z(),quaternion:[q.w(),q.x(),q.y(),q.z()] };
}
export function decodeTimedOdometry(bytes:Uint8Array):Pose&{time:number} {
  const pose=decodeOdometry(bytes),timestamp=bytes.length===OdometryEstimateData.sizeOf()
    ?new OdometryEstimateData().__init(0,new ByteBuffer(bytes)).timestampNs()
    :new OdometryData().__init(0,new ByteBuffer(bytes)).timestampNs();
  return {...pose,time:Number(timestamp)/1e9};
}
