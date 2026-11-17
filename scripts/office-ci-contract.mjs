import {createHash} from 'node:crypto';
export const OFFICE_MISSION=Object.freeze({cameraHz:5,durationSeconds:250,frames:1251,width:424,height:240});
export const SOFTWARE_ARGS=Object.freeze(['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']);
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function requireSoftwareGraphics(graphics){
  if(!/swiftshader/i.test(graphics?.renderer??''))throw Error('Office CI diagnostic requires verified SwiftShader WebGL; renderer: '+(graphics?.renderer??'unavailable'));
  return graphics;
}
export function validateOfficeSample(sample,index){
  const {cameraHz,width,height}=OFFICE_MISSION;
  if(sample.index!==index||sample.sequence!==index||Math.abs(sample.time-index/cameraHz)>1e-7||!Number.isFinite(sample.time))throw Error('Office capture frame clock gap');
  const frame=sample.metadata,layout=frame?.imageLayout,k=frame?.calibration;
  if(frame.sequence!==index||frame.time!==sample.time||!k||k.width!==width||k.height!==height)throw Error('Office capture calibration/metadata mismatch');
  if(!layout||layout.color.format!=='RGB8'||layout.depth.format!=='Z16'||layout.depth.isBigEndian!==false||layout.depth.unitsMeters!==.001||layout.rowOrder!=='top-down'||layout.clockDomain!=='simulation')throw Error('Office capture requires raw RGB8/Z16 camera data');
  for(const [kind,channels]of [['rgb',3],['depth',2]]){
    const field=layout[kind==='rgb'?'color':'depth'];
    if(field.width!==width||field.height!==height||field.strideBytes!==width*channels||field.bytes!==width*height*channels||sample.image[kind].bytes!==field.bytes)throw Error('Office capture image byte/stride mismatch');
  }
  const intervals=frame.imuIntervals;
  if(!Array.isArray(intervals)||index===0&&(frame.dt!==0||intervals.length!==0))throw Error('Missing time-zero observation or IMU interval metadata');
  if(index){
    let previous=(index-1)/cameraHz;
    for(const interval of intervals){
      if(!Number.isFinite(interval.time)||!Number.isFinite(interval.dt)||interval.dt<=0||Math.abs(interval.time-previous-interval.dt)>1e-7||!interval.imu||![...interval.imu.accel,...interval.imu.gyro].every(Number.isFinite))throw Error('Non-contiguous IMU interval');
      previous=interval.time;
    }
    if(Math.abs(previous-sample.time)>1e-7||Math.abs(frame.dt-1/cameraHz)>1e-7)throw Error('Missing intervening IMU interval');
  }
  return sample;
}
export function assertCompleteOfficeCapture(receipt){
  if(receipt.failure||receipt.framesCompleted!==OFFICE_MISSION.frames||receipt.firstTime!==0||Math.abs(receipt.lastTime-OFFICE_MISSION.durationSeconds)>1e-7)throw Error('Office mission capture incomplete; partial evidence only');
  if(receipt.physicsSourceSha256!==receipt.loadedPhysicsSourceSha256||receipt.environment!=='office-loop')throw Error('Prepared office route was not loaded');
  requireSoftwareGraphics(receipt.graphics);
  return receipt;
}
