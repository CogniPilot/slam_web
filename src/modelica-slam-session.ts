import {SlamNativeProgram,type SlamNativeFetch,type SlamNativeManifest} from './slam-native-program';
import type {SlamInitialFrame,SlamIntervalFrame} from './modelica-slam-frame';
import type {Estimate} from './types';

export interface SlamNativeResult {
  estimate:Estimate;
  /** Wall time of every entry call in this frame; the first call of a new image epoch processes the image. */
  stepMs:number[];
  status:Record<string,number|boolean>;
}
type CameraInputs=Pick<SlamIntervalFrame,'rgbCalibration'|'depthCalibration'|'depthUnits'|'opticalToBody'|'cameraOriginBody'|'disparityNoise'|'noiseReferenceFx'|'baseline'>;

/** Drives the compiler-exported D435FastSLAMInitialize and D435FastSLAMStep
 * programs: one Initialize evaluation on the time-zero image, then one Step
 * evaluation per held IMU interval with the camera image of that interval's
 * epoch. All estimation, mapping and loop closure run inside the programs. */
export class ModelicaSlamSession {
  private epoch=-1;
  private frames=0;
  private constructor(readonly manifest:SlamNativeManifest,private readonly initialize:SlamNativeProgram,private readonly step:SlamNativeProgram){}

  static async create(manifest:SlamNativeManifest,fetchFile:SlamNativeFetch,initial:SlamInitialFrame,progress:(text:string)=>void=()=>{}){
    progress('Loading native SLAM initialization program');
    const initialize=await SlamNativeProgram.load(manifest.models.initialize,fetchFile);
    progress('Loading native SLAM step program');
    const step=await SlamNativeProgram.load(manifest.models.step,fetchFile);
    const session=new ModelicaSlamSession(manifest,initialize,step);
    progress('Initializing native SLAM on the first camera image');
    session.writeCamera(initialize,initial);
    session.writeImage(initialize,initial);
    writeVector(initialize,'accel',initial.imu.accel);writeVector(initialize,'gyro',initial.imu.gyro);
    if(initialize.hasInput('h'))initialize.real('h')[0]=0;
    if(initialize.hasInput('intervalTime'))initialize.real('intervalTime')[0]=initial.frameTime;
    const started=performance.now();
    const status=initialize.step(initial.frameTime);
    if(status!==0)throw new Error(`Native SLAM initialization returned status ${status}`);
    initialize.transferTo(step);
    session.epoch=initial.imageEpoch;
    progress(`Native SLAM initialized in ${(performance.now()-started).toFixed(0)} ms`);
    return session;
  }

  get initialEstimate():Estimate {return this.estimateFrom(this.initialize,[]);}

  advance(frame:SlamIntervalFrame):SlamNativeResult {
    if(frame.imageEpoch<=this.epoch)throw new Error('Native SLAM requires a newer camera image epoch for each frame');
    this.writeCamera(this.step,frame);
    this.writeImage(this.step,frame);
    const stepMs:number[]=[];
    for(const interval of frame.intervals){
      writeVector(this.step,'accel',interval.imu.accel);writeVector(this.step,'gyro',interval.imu.gyro);
      this.step.real('h')[0]=interval.dt;
      this.step.real('intervalTime')[0]=interval.time;
      const started=performance.now();
      const status=this.step.step(interval.time);
      stepMs.push(performance.now()-started);
      if(status!==0)throw new Error(`Native SLAM step returned status ${status} at t=${interval.time.toFixed(4)} s (image epoch ${frame.imageEpoch})`);
    }
    this.epoch=frame.imageEpoch;this.frames++;
    const status=this.step.derived();
    return {estimate:this.estimateFrom(this.step,stepMs),stepMs,status};
  }

  private writeCamera(program:SlamNativeProgram,frame:CameraInputs){
    const scalars:[string,number][]=[['depthUnits',frame.depthUnits],['disparityNoise',frame.disparityNoise],['noiseReferenceFx',frame.noiseReferenceFx],['baseline',frame.baseline]];
    for(const [name,value] of scalars)if(program.hasInput(name))program.real(name)[0]=value;
    for(const [name,values] of [['rgbCalibration',frame.rgbCalibration],['depthCalibration',frame.depthCalibration],['opticalToBody',frame.opticalToBody],['cameraOriginBody',frame.cameraOriginBody]] as const)
      if(program.hasInput(name))writeVector(program,name,values);
  }
  private writeImage(program:SlamNativeProgram,frame:SlamInitialFrame|SlamIntervalFrame){
    const {color,depth}=frame.imageLayout;
    const rgb=program.real('rgb'),z=program.real('depth');
    if(rgb.length!==color.width*color.height*3||z.length!==depth.width*depth.height)
      throw new Error(`Native SLAM program expects ${rgb.length/3} RGB and ${z.length} depth samples; the camera delivers ${color.width}×${color.height} and ${depth.width}×${depth.height}`);
    const rowBytes=color.width*3;
    for(let row=0;row<color.height;row++){
      const source=row*color.strideBytes,target=row*rowBytes;
      for(let i=0;i<rowBytes;i++)rgb[target+i]=frame.rgb[source+i];
    }
    const stride=depth.strideBytes/2;
    for(let row=0;row<depth.height;row++){
      const source=row*stride,target=row*depth.width;
      for(let i=0;i<depth.width;i++)z[target+i]=frame.depth[source+i];
    }
    program.integer('imageEpoch')[0]=BigInt(frame.imageEpoch);
  }
  private estimateFrom(program:SlamNativeProgram,stepMs:number[]):Estimate {
    const position=program.stateRun('estimator.localization.estimator.position')?.view??program.y(0,3);
    const rotation=program.stateRun('estimator.localization.estimator.rotation')?.view??program.y(6,9);
    const [x,y,z]=Array.from(position as Float64Array);
    for(const value of [x,y,z])if(!Number.isFinite(value))throw new Error('Native SLAM produced a non-finite position');
    const quaternion=program.output('nextQuaternion');
    const derived=program.derived();
    const features=selectedRows(program.output('features'),program.output('featureEnabled'),3);
    const mask=program.output('trackingEnabled');
    const current=selectedRows(program.output('trackingCurrentPixel'),mask,2),previous=selectedRows(program.output('trackingReferencePixel'),mask,2);
    const diagnostics:Record<string,number|string>={runtime:'Rumoca native SLAM program',model:program.layout.model,imageEpoch:this.epoch,frames:this.frames,
      stepCalls:stepMs.length,stepMsMax:stepMs.length?Math.max(...stepMs):0,stepMsTotal:stepMs.reduce((a,b)=>a+b,0)};
    for(const [name,value] of Object.entries(derived))diagnostics[name]=typeof value==='boolean'?(value?1:0):value;
    const matchCount=program.output('matchCount')?.[0];
    if(matchCount!==undefined)diagnostics.matchCount=matchCount;
    const accepted=derived.accepted===true||derived.accepted===1;
    return {x,y,z,quaternion:quaternion?Array.from(quaternion):quaternionFromRotation(rotation as Float64Array),
      confidence:accepted?1:0,points:this.mapPoints(program),features,diagnostics,
      tracking:{matches:current.map((value,index)=>({current:value,previous:previous[index]})),accepted,reason:`publication reason ${diagnostics.publicationReason??'n/a'}`}};
  }
  /** Confirmed landmark positions from the carried map, when the export names them. */
  private mapPoints(program:SlamNativeProgram):number[][] {
    const runs=program.layout.state_runs;
    const positions=runs.find(run=>run.lane==='f64'&&/\.map\.[A-Za-z]*(positions?|points?)$/i.test(run.name)&&run.count%3===0);
    if(!positions)return [];
    const prefix=positions.name.slice(0,positions.name.lastIndexOf('.')+1);
    const enabled=runs.find(run=>run.lane==='u8'&&run.name.startsWith(prefix)&&/(enabled|occupied|confirmed)$/i.test(run.name)&&run.count===positions.count/3);
    const values=program.stateRun(positions.name)!.view as Float64Array;
    const mask=enabled?program.stateRun(enabled.name)!.view as Uint8Array:undefined;
    const points:number[][]=[];
    for(let i=0;i<positions.count/3;i++){
      if(mask&&!mask[i])continue;
      const point=[values[3*i],values[3*i+1],values[3*i+2]];
      if(point.every(Number.isFinite))points.push(point);
    }
    return points;
  }
}

function writeVector(program:SlamNativeProgram,name:string,values:ArrayLike<number>){
  const view=program.real(name);
  if(view.length!==values.length)throw new Error(`Native SLAM input ${name} takes ${view.length} values`);
  for(let i=0;i<values.length;i++){if(!Number.isFinite(values[i]))throw new Error(`Native SLAM input ${name} must be finite`);view[i]=values[i];}
}
function selectedRows(data:Float64Array|undefined,mask:Float64Array|undefined,width:number):number[][] {
  if(!data||!mask)return [];
  const rows:number[][]=[];
  for(let row=0;row<mask.length&&(row+1)*width<=data.length;row++)if(mask[row]!==0)rows.push(Array.from(data.subarray(row*width,(row+1)*width)));
  return rows;
}
/** Unit quaternion [w,x,y,z] of a row-major rotation matrix. */
export function quaternionFromRotation(r:ArrayLike<number>):number[] {
  const [m00,m01,m02,m10,m11,m12,m20,m21,m22]=Array.from(r);
  const trace=m00+m11+m22;let w:number,x:number,y:number,z:number;
  if(trace>0){const s=Math.sqrt(trace+1)*2;w=s/4;x=(m21-m12)/s;y=(m02-m20)/s;z=(m10-m01)/s;}
  else if(m00>m11&&m00>m22){const s=Math.sqrt(1+m00-m11-m22)*2;w=(m21-m12)/s;x=s/4;y=(m01+m10)/s;z=(m02+m20)/s;}
  else if(m11>m22){const s=Math.sqrt(1+m11-m00-m22)*2;w=(m02-m20)/s;x=(m01+m10)/s;y=s/4;z=(m12+m21)/s;}
  else{const s=Math.sqrt(1+m22-m00-m11)*2;w=(m10-m01)/s;x=(m02+m20)/s;y=(m12+m21)/s;z=s/4;}
  const norm=Math.hypot(w,x,y,z)||1;
  return [w/norm,x/norm,y/norm,z/norm];
}
