import type {Truth} from './types';

/** Read one coherent Rumoca observation, rather than observing all outputs
 * again for each name. The session owns refresh and the simulation clock. */
export function readPhysicsSnapshot(session:{state_json():string},includeCommand=false):Truth {
  const {time,values}=JSON.parse(session.state_json());
  if(!Number.isFinite(time))throw new Error('Physics returned a nonfinite simulation time');
  const value=(name:string):number=>{
    if(typeof values?.[name]!=='number'||!Number.isFinite(values[name]))throw new Error(`Model must expose finite ${name}`);
    return values[name];
  };
  const propellerNames=Array.from({length:4},(_,i)=>`propellerAngles[${i+1}]`);
  const hasPropellers=propellerNames.some(name=>Object.hasOwn(values??{},name));
  return {time,x:value('x'),y:value('y'),z:value('z'),
    quaternion:[value('qw'),value('qx'),value('qy'),value('qz')],
    velocity:['vx','vy','vz'].map(value),accel:['imu_ax','imu_ay','imu_az'].map(value),gyro:['p','q','r'].map(value),
    ...(includeCommand?{command:{forward:value('forwardSetpoint'),left:value('leftSetpoint'),up:value('upSetpoint'),yaw:value('yawSetpoint')}}:{}),
    ...(hasPropellers?{propellerAngles:propellerNames.map(value)}:{})};
}
