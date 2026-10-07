export type ActorMotionVector=[number,number,number,number,number,number];
export interface ActorMotionFrame {
  time:number;
  east:ActorMotionVector;
  north:ActorMotionVector;
  sceneYaw:ActorMotionVector;
  distance:ActorMotionVector;
  walkTime:ActorMotionVector;
}

/** Validate frames crossing renderer/worker boundaries without changing them. */
export function validateActorMotionFrame(frame:unknown):void {
  if(!frame||typeof frame!=='object'||Array.isArray(frame))throw new Error('Invalid Modelica ActorMotion frame');
  const value=frame as Record<string,unknown>;
  if(typeof value.time!=='number'||!Number.isFinite(value.time))throw new Error('Modelica ActorMotion requires a finite sampled time');
  for(const field of ['east','north','sceneYaw','distance','walkTime']){
    const vector=value[field];
    if(!Array.isArray(vector)||vector.length!==6||!vector.every(v=>typeof v==='number'&&Number.isFinite(v)))
      throw new Error(`Modelica ActorMotion requires six finite ${field} values`);
  }
}

/** Validate and copy the full Modelica batch; the host derives no trajectory. */
export function readActorMotionFrame(values:unknown,time:number):ActorMotionFrame {
  if(!Number.isFinite(time))throw new Error('Modelica ActorMotion requires a finite sampled time');
  if(!values||typeof values!=='object'||Array.isArray(values))throw new Error('Modelica ActorMotion must expose named output values');
  const record=values as Record<string,unknown>;
  const read=(field:string):ActorMotionVector=>{
    if(Object.hasOwn(record,`${field}[7]`))throw new Error('Modelica ActorMotion must expose exactly six actors');
    const scalar=(index:number)=>{
      const value=record[`${field}[${index}]`];
      if(typeof value!=='number'||!Number.isFinite(value))throw new Error(`Modelica ActorMotion must expose finite ${field}[${index}]`);
      return value;
    };
    return [scalar(1),scalar(2),scalar(3),scalar(4),scalar(5),scalar(6)];
  };
  return {time,east:read('east'),north:read('north'),sceneYaw:read('sceneYaw'),distance:read('distance'),walkTime:read('walkTime')};
}
