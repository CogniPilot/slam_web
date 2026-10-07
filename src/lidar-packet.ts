import type {LidarScan} from './lidar';
// Prototype SLR2 little-endian packet, not a Synapse message. Header(32 bytes)
// followed by unmodified beam-major RGBA32F FLU XYZ/packed24 radial samples.
export function packLidar(scan:LidarScan):Uint8Array {
  if(scan.beams!==64||!Number.isInteger(scan.columns)||scan.columns<64||scan.columns>4096||scan.samples.length!==64*scan.columns*4||scan.format!=='FLU_XYZ_PACK24')throw new Error('Invalid LiDAR scan dimensions');
  const bytes=new Uint8Array(32+scan.samples.byteLength),view=new DataView(bytes.buffer);
  bytes.set([83,76,82,50]);view.setUint16(4,64,true);view.setUint16(6,scan.columns,true);
  view.setFloat64(8,scan.time,true);view.setFloat32(16,scan.near,true);view.setFloat32(20,scan.far,true);
  // FLU mount relative to body, metres (x=0,y=0,z=.18). Header has z only.
  view.setFloat32(24,.18,true);view.setUint32(28,0,true);
  // Browser/WASM typed arrays use the platform byte order. Refuse an exotic
  // big-endian host instead of silently publishing mislabeled sample bytes.
  if(new Uint8Array(new Uint32Array([1]).buffer)[0]!==1)throw new Error('SLR2 requires little-endian float32 buffers');
  bytes.set(new Uint8Array(scan.samples.buffer,scan.samples.byteOffset,scan.samples.byteLength),32);
  return bytes;
}
