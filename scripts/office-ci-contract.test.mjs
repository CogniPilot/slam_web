import test from 'node:test';
import assert from 'node:assert/strict';
import {OFFICE_MISSION,SOFTWARE_ARGS,requireSoftwareGraphics,validateOfficeSample,assertCompleteOfficeCapture} from './office-ci-contract.mjs';
function sample(index){
 const image={rgb:{bytes:424*240*3},depth:{bytes:424*240*2}};
 const layout={rowOrder:'top-down',clockDomain:'simulation',color:{format:'RGB8',width:424,height:240,strideBytes:1272,bytes:image.rgb.bytes},depth:{format:'Z16',width:424,height:240,strideBytes:848,bytes:image.depth.bytes,isBigEndian:false,unitsMeters:.001}};
 const time=index/5;
 return {index,time,sequence:index,image,metadata:{sequence:index,time,dt:index?.2:0,calibration:{width:424,height:240},imageLayout:layout,imuIntervals:index?[{time:time-.1,dt:.1,imu:{accel:[0,0,9.8],gyro:[0,0,0]}},{time,dt:.1,imu:{accel:[0,0,9.8],gyro:[0,0,0]}}]:[]}};
}
test('mission retains t0 through250s at5Hz and software policy keeps the sandbox',()=>{
 assert.equal(OFFICE_MISSION.frames,OFFICE_MISSION.durationSeconds*OFFICE_MISSION.cameraHz+1);
 assert.equal(OFFICE_MISSION.frames,1251);
 assert.ok(!SOFTWARE_ARGS.some(arg=>/no-sandbox|disable-gpu-sandbox/.test(arg)));
 assert.throws(()=>requireSoftwareGraphics({renderer:'ANGLE NVIDIA Vulkan',acceleration:'hardware-reported'}),/SwiftShader/);
 requireSoftwareGraphics({renderer:'ANGLE (Google, Vulkan SwiftShader Device)'});
});
test('accepts time zero, first interval and late return without losing IMU',()=>{
 for(const index of [0,1,1175,1225,1250])validateOfficeSample(sample(index),index);
});
test('rejects gaps, wrong initial images and fabricated or missing IMU intervals',()=>{
 for(const mutate of [s=>{s.sequence=4;},s=>{s.time=NaN;},s=>{s.metadata.imuIntervals=[];},s=>{s.metadata.imuIntervals[0].dt=.2;},s=>{s.metadata.imuIntervals[0].imu.accel[0]=NaN;},s=>{s.metadata.dt=.3;}]){
  const s=sample(1);mutate(s);assert.throws(()=>validateOfficeSample(s,1));
 }
 const zero=sample(0);zero.metadata.dt=.2;assert.throws(()=>validateOfficeSample(zero,0));
});
test('rejects normalized depth and truncated or mislabelled raw rasters',()=>{
 for(const mutate of [s=>{s.metadata.imageLayout.depth.format='F32';},s=>{s.metadata.imageLayout.depth.isBigEndian=true;},s=>{s.image.rgb.bytes--;},s=>{s.metadata.imageLayout.color.strideBytes++;},s=>{s.metadata.calibration.width=848;}]){
  const s=sample(0);mutate(s);assert.throws(()=>validateOfficeSample(s,0));
 }
});
test('cannot call a300-frame prefix or a different prepared route a complete capture',()=>{
 const good={framesCompleted:1251,firstTime:0,lastTime:250,physicsSourceSha256:'a',loadedPhysicsSourceSha256:'a',environment:'office-loop',graphics:{renderer:'SwiftShader'}};
 assertCompleteOfficeCapture(good);
 for(const partial of [{framesCompleted:300},{firstTime:.2},{lastTime:60},{environment:'city'},{loadedPhysicsSourceSha256:'b'},{failure:'deadline'}])assert.throws(()=>assertCompleteOfficeCapture({...good,...partial}));
});
