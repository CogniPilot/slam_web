import type {SensorFrame} from './types';

/** One phone IMU sample in the device frame: x right, y toward the top of the
 * screen, z out of the screen. Specific force in m/s², rate in rad/s. */
export interface MotionSample {accel:[number,number,number];gyro:[number,number,number]}
interface MotionEventLike {
  accelerationIncludingGravity:{x:number|null;y:number|null;z:number|null}|null;
  rotationRate:{alpha:number|null;beta:number|null;gamma:number|null}|null;
}
const DEG=Math.PI/180;

/** DeviceMotion reports rotationRate in deg/s as alpha about z, beta about x
 * and gamma about y; reorder to the x, y, z body axes. */
export function motionSample(event:MotionEventLike,accelSign=1):MotionSample|undefined{
  const a=event.accelerationIncludingGravity,r=event.rotationRate;
  if(!a||!r)return undefined;
  const values=[a.x,a.y,a.z,r.beta,r.gamma,r.alpha];
  if(!values.every(value=>typeof value==='number'&&Number.isFinite(value)))return undefined;
  const [ax,ay,az,rx,ry,rz]=values as number[];
  return {accel:[accelSign*ax,accelSign*ay,accelSign*az],gyro:[rx*DEG,ry*DEG,rz*DEG]};
}

/** Upward gravity reaction in the device frame from DeviceOrientation beta and
 * gamma (degrees, intrinsic Z-X'-Y''), per unit g. Flat and face up is {0,0,1}. */
export function expectedGravity(beta:number,gamma:number):[number,number,number]{
  const b=beta*DEG,c=gamma*DEG;
  return [-Math.cos(b)*Math.sin(c),Math.sin(b),Math.cos(b)*Math.cos(c)];
}

/** The specification reports +g on z for a phone lying face up, but some
 * browsers have shipped the opposite sign. Orientation angles settle it. */
export class AccelSignDetector {
  private agreement=0;private samples=0;
  constructor(private readonly needed=20){}
  add(accelIncludingGravity:[number,number,number],beta:number,gamma:number){
    if(this.done)return;
    const norm=Math.hypot(...accelIncludingGravity);
    if(!(norm>4&&norm<16))return;
    const expected=expectedGravity(beta,gamma);
    this.agreement+=accelIncludingGravity.reduce((sum,value,i)=>sum+value*expected[i],0)/norm;
    this.samples++;
  }
  get done(){return this.samples>=this.needed;}
  /** 1 follows the specification; -1 inverts every axis. */
  get sign(){return this.agreement<0?-1:1;}
}

/** Roll and pitch that make the filter's initial gravity match this sample. */
export function initialTilt(accel:readonly number[]){
  const [x,y,z]=accel;
  return {initialRoll:Math.atan2(y,z),initialPitch:Math.atan2(-x,Math.hypot(y,z))};
}

/** ZYX roll, pitch and yaw in degrees from a body-to-world {w,x,y,z} quaternion. */
export function eulerDegrees(q:readonly number[]){
  const [w,x,y,z]=q;
  return {
    roll:Math.atan2(2*(w*x+y*z),1-2*(x*x+y*y))/DEG,
    pitch:Math.asin(Math.max(-1,Math.min(1,2*(w*y-z*x))))/DEG,
    yaw:Math.atan2(2*(w*z+x*y),1-2*(y*y+z*z))/DEG,
  };
}

type Interval={time:number;dt:number;imu:{accel:number[];gyro:number[]}};
export type MotionFrame=Pick<SensorFrame,'time'|'dt'|'imu'|'imuIntervals'>;

/** Turns event timestamps into contiguous held-IMU intervals for the Modelica
 * session: each sample holds over the time since the previous one. A gap
 * longer than maxDt (a backgrounded tab, a stalled sensor) asks for a restart
 * rather than integrating one long interval. */
export class MotionBatcher {
  private origin:number|undefined;private last=0;private pending:Interval[]=[];private start=0;
  constructor(private readonly flushSeconds=.1,private readonly maxDt=.2,private readonly maxIntervals=36){}
  /** Returns 'restart' after a gap; the caller re-initializes and adds again. */
  add(sample:MotionSample,timestampMs:number):'ok'|'restart'|'skip'{
    if(!Number.isFinite(timestampMs))return 'skip';
    if(this.origin===undefined){this.origin=timestampMs;this.last=0;this.start=0;return 'ok';}
    const time=(timestampMs-this.origin)/1000,dt=time-this.last;
    if(dt<=1e-4)return 'skip';
    // A long gap, or a batch the estimator has not taken in time, cannot form
    // one valid frame; both restart from the next sample.
    if(dt>this.maxDt||time-this.start>this.maxDt){this.reset();return 'restart';}
    this.pending.push({time,dt,imu:{accel:[...sample.accel],gyro:[...sample.gyro]}});
    this.last=time;return 'ok';
  }
  /** A frame once enough time or intervals have accumulated, else undefined. */
  take(force=false):MotionFrame|undefined{
    const intervals=this.pending;
    if(!intervals.length)return undefined;
    if(!force&&this.last-this.start<this.flushSeconds&&intervals.length<this.maxIntervals)return undefined;
    const frame={time:this.last,dt:this.last-this.start,imu:intervals.at(-1)!.imu,imuIntervals:intervals};
    this.pending=[];this.start=this.last;return frame;
  }
  reset(){this.origin=undefined;this.pending=[];this.last=0;this.start=0;}
}
