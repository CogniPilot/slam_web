import {SlamNativeProgram,type SlamNativeFetch,type SlamNativeManifest} from './slam-native-program';
import type {SlamInitialFrame,SlamIntervalFrame} from './modelica-slam-frame';
import type {Estimate} from './types';

export interface SlamNativeResult {
  estimate:Estimate;
  /** Wall time of each held interval; the final call processes the captured image. */
  stepMs:number[];
  status:Record<string,number|boolean>;
}
type CameraInputs=Pick<SlamIntervalFrame,'rgbCalibration'|'depthCalibration'|'depthUnits'|'opticalToBody'|'cameraOriginBody'|'disparityNoise'|'noiseReferenceFx'|'baseline'>;
interface ImageObservation {features:number[][];current:number[][];previous:number[][];matchCount:number|undefined}

/** Drives the compiler-exported D435FastSLAMInitialize and D435FastSLAMStep
 * programs: one Initialize evaluation on the time-zero image, then one Step
 * evaluation per held IMU interval with the camera image of that interval's
 * epoch. All estimation, mapping and loop closure run inside the programs. */
export class ModelicaSlamSession {
  private epoch=-1;
  private frames=0;
  private visualUpdates=0;
  /** End time of the last evaluated interval; the model checks continuity to 1e-12. */
  private clock=0;
  private initial!:Estimate;
  private constructor(readonly manifest:SlamNativeManifest,private readonly step:SlamNativeProgram){}

  static async create(manifest:SlamNativeManifest,fetchFile:SlamNativeFetch,initial:SlamInitialFrame,progress:(text:string)=>void=()=>{}){
    progress('Loading native SLAM initialization program');
    const initialize=await SlamNativeProgram.load(manifest.models.initialize,fetchFile);
    progress('Loading native SLAM step program');
    const step=await SlamNativeProgram.load(manifest.models.step,fetchFile);
    const session=new ModelicaSlamSession(manifest,step);
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
    session.epoch=initial.imageEpoch;session.clock=initial.frameTime;
    session.initial=session.estimateFrom(initialize,[]);
    progress(`Native SLAM initialized in ${(performance.now()-started).toFixed(0)} ms`);
    return session;
  }

  get initialEstimate():Estimate {return structuredClone(this.initial);}

  advance(frame:SlamIntervalFrame):SlamNativeResult {
    if(frame.imageEpoch<=this.epoch)throw new Error('Native SLAM requires a newer camera image epoch for each frame');
    this.writeCamera(this.step,frame);
    this.writeImage(this.step,frame);
    const stepMs:number[]=[];let imageStatus:Record<string,number|boolean>|undefined,image:ImageObservation|undefined;
    if(!this.step.hasInput('imageRequested'))throw new Error('Native SLAM must expose the imageRequested acquisition gate');
    for(const [index,interval] of frame.intervals.entries()){
      if(!(interval.dt>0&&interval.dt<=.2))throw new Error('Native SLAM accepts IMU intervals of at most 0.2 s');
      // Feed the model's own continuous clock: previous end plus h, exactly.
      const end=this.clock+interval.dt;
      if(Math.abs(end-interval.time)>1e-6)throw new Error(`IMU interval at ${interval.time} s does not continue the native SLAM clock at ${this.clock} s`);
      writeVector(this.step,'accel',interval.imu.accel);writeVector(this.step,'gyro',interval.imu.gyro);
      this.step.real('h')[0]=interval.dt;
      this.step.real('intervalTime')[0]=end;
      // This raster was captured at frameTime, after the final held IMU
      // interval. Earlier intervals predict only; they cannot consume a
      // camera measurement from their future.
      const imageOn=index===frame.intervals.length-1;
      if(imageOn&&Math.abs(end-frame.frameTime)>1e-6)throw new Error('Camera capture does not coincide with the final IMU interval');
      this.step.boolean('imageRequested')[0]=imageOn?1:0;
      const started=performance.now();
      const status=this.step.step(end);
      this.clock=end;
      stepMs.push(performance.now()-started);
      if(status!==0)throw new Error(`Native SLAM step returned status ${status} at t=${interval.time.toFixed(4)} s (image epoch ${frame.imageEpoch})`);
      if(imageOn){
        imageStatus=this.step.derived();image=this.imageFrom(this.step);
        for(const name of ['selectionValid','predictionAccepted','observationAccepted','captureAccepted']){
          const value=this.step.output(name)?.[0];if(value!==undefined)imageStatus[name]=value;
        }
      }
    }
    this.epoch=frame.imageEpoch;this.frames++;
    if(imageStatus?.observationAccepted===1)this.visualUpdates++;
    const status={...this.step.derived(),...imageStatus};
    return {estimate:this.estimateFrom(this.step,stepMs,status,image),stepMs,status};
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
    if(color.strideBytes===rowBytes)rgb.set(frame.rgb.subarray(0,rgb.length));
    else for(let row=0;row<color.height;row++)rgb.set(frame.rgb.subarray(row*color.strideBytes,row*color.strideBytes+rowBytes),row*rowBytes);
    const stride=depth.strideBytes/2;
    if(stride===depth.width)z.set(frame.depth.subarray(0,z.length));
    else for(let row=0;row<depth.height;row++)z.set(frame.depth.subarray(row*stride,row*stride+depth.width),row*depth.width);
    program.integer('imageEpoch')[0]=BigInt(frame.imageEpoch);
  }
  private imageFrom(program:SlamNativeProgram):ImageObservation {
    const mask=program.output('trackingEnabled');
    return {features:selectedRows(program.output('features'),program.output('featureEnabled'),3),
      current:selectedRows(program.output('trackingCurrentPixel'),mask,2),previous:selectedRows(program.output('trackingReferencePixel'),mask,2),
      matchCount:program.output('matchCount')?.[0]};
  }
  private estimateFrom(program:SlamNativeProgram,stepMs:number[],status?:Record<string,number|boolean>,image=this.imageFrom(program)):Estimate {
    const position=program.stateRun('estimator.localization.estimator.position')?.view??program.y(0,3);
    const rotation=program.stateRun('estimator.localization.estimator.rotation')?.view??program.y(6,9);
    const [x,y,z]=Array.from(position as Float64Array);
    for(const value of [x,y,z])if(!Number.isFinite(value))throw new Error('Native SLAM produced a non-finite position');
    const quaternion=program.output('nextQuaternion');
    const derived=status??program.derived();
    const {features,current,previous,matchCount}=image;
    const diagnostics:Record<string,number|string>={runtime:'Rumoca native SLAM program',model:program.layout.model,imageEpoch:this.epoch,frames:this.frames,
      stepCalls:stepMs.length,stepMsMax:stepMs.length?Math.max(...stepMs):0,stepMsTotal:stepMs.reduce((a,b)=>a+b,0)};
    for(const [name,value] of Object.entries(derived))diagnostics[name]=typeof value==='boolean'?(value?1:0):value;
    if(matchCount!==undefined)diagnostics.matchCount=matchCount;
    const accepted=derived.observationAccepted===true||derived.observationAccepted===1;
    const {points,confidence:mapConfidence}=this.mapPoints(program);
    const confidence=matchCount!==undefined&&features.length?Math.min(1,matchCount/features.length):mapConfidence;
    diagnostics.mapPoints=points.length;
    const poseGraph=this.poseGraph(program);
    diagnostics.keyframes=poseGraph.keyframes.length;
    diagnostics.loopEdges=poseGraph.edges.filter(edge=>edge.kind==='loop').length;
    diagnostics.loops=diagnostics.loopEdges;
    diagnostics.visualUpdates=this.visualUpdates;
    diagnostics.odometryEdges=poseGraph.edges.filter(edge=>edge.kind==='odometry').length;
    const covariance=program.stateRun('estimator.localization.estimator.covariance')?.view;
    const block=(start:number)=>Array.from({length:9},(_,index)=>Number(covariance![(start+Math.floor(index/3))*15+start+index%3]));
    const uncertainty=covariance?.length===225?{positionCovariance:block(0),attitudeCovariance:block(6)}:undefined;
    return {x,y,z,quaternion:quaternion?Array.from(quaternion):quaternionFromRotation(rotation as Float64Array),
      confidence,points,features,diagnostics,poseGraph,uncertainty,
      tracking:{matches:current.map((value,index)=>({current:value,previous:previous[index]})),accepted,
        reason:accepted?'visual observation accepted':derived.captureAccepted===1?'visual reference captured':`visual observation refused; publication reason ${diagnostics.publicationReason??'n/a'}`}};
  }
  private poseGraph(program:SlamNativeProgram):NonNullable<Estimate['poseGraph']> {
    const run=(name:string)=>program.stateRun(name)?.view;
    const enabled=run('estimator.poses.enabled'),ids=run('estimator.poses.ids');
    const positions=run('estimator.poses.positions'),rotations=run('estimator.poses.rotations');
    const keyframes:NonNullable<Estimate['poseGraph']>['keyframes']=[],edges:NonNullable<Estimate['poseGraph']>['edges']=[];
    const index=new Map<number,number>();
    if(!enabled||!ids||!positions||!rotations)return {keyframes,edges};
    for(let slot=0;slot<enabled.length;slot++)if(Number(enabled[slot])){
      index.set(Number(ids[slot]),keyframes.length);
      keyframes.push({position:Array.from(positions.slice(slot*3,slot*3+3),Number),
        quaternion:quaternionFromRotation(Array.from(rotations.slice(slot*9,slot*9+9),Number))});
    }
    const prefix='estimator.localization.graph.edges.';
    const active=run(prefix+'enabled'),kinds=run(prefix+'kind'),references=run(prefix+'referenceId'),currents=run(prefix+'currentId');
    if(active&&kinds&&references&&currents)for(let slot=0;slot<active.length;slot++)if(Number(active[slot])){
      const from=index.get(Number(references[slot])),to=index.get(Number(currents[slot])),kind=Number(kinds[slot]);
      if(from!==undefined&&to!==undefined&&(kind===1||kind===2))edges.push({from,to,kind:kind===2?'loop':'odometry'});
    }
    return {keyframes,edges};
  }
  /** Occupied landmark positions of the carried map (estimator.localization.map),
   * with the mean landmark confidence scaled by the model's maximum. */
  private mapPoints(program:SlamNativeProgram):{points:number[][];confidence:number} {
    const point=program.stateRun('estimator.localization.map.point'),occupied=program.stateRun('estimator.localization.map.occupied');
    const landmarkConfidence=program.stateRun('estimator.localization.map.confidence');
    if(!point||!occupied||point.lane!=='f64')return {points:[],confidence:0};
    const values=point.view as Float64Array,mask=occupied.view,count=mask.length;
    if(values.length!==count*3)throw new Error('Native SLAM map runs disagree on the landmark count');
    const points:number[][]=[];let total=0;
    for(let i=0;i<count;i++){
      if(!Number(mask[i]))continue;
      const row=[values[3*i],values[3*i+1],values[3*i+2]];
      if(!row.every(Number.isFinite))throw new Error('Native SLAM map holds a non-finite landmark');
      points.push(row);total+=landmarkConfidence?Number((landmarkConfidence.view as Float64Array)[i]):0;
    }
    return {points,confidence:points.length&&landmarkConfidence?Math.min(1,total/points.length/8):0};
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
