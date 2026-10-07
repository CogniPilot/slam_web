import {NativeProgram,type NativeProgramArtifact} from './modelica-native-program';
import {imuIntervals} from './imu-intervals';
import type {SensorFrame} from './types';

type Values=readonly number[]|Float64Array;
export const schmidtStateFields={position:3,velocity:3,rotation:9,accelBias:3,gyroBias:3,covariance:225,
  crossCovariance:90,referenceCovariance:36,referencePosition:3,referenceRotation:9,
  referenceAvailable:1,referenceEpoch:1,referenceUsed:1,lastUsedEpoch:1} as const;
const configFields={gravity:3,density:12,opticalToBody:9,cameraOriginBody:3} as const;
const flagNames=['predictionAccepted','observationAccepted','observationRejected','captureAccepted','captureRejected','imagePairEligible','imageReuseRejected'] as const;
type StateField=keyof typeof schmidtStateFields;
type ConfigField=keyof typeof configFields;
export type SchmidtState=Record<StateField,Values>;
export type SchmidtFlags=Record<typeof flagNames[number],number>;
export interface SchmidtInitialState extends SchmidtState {time:number;gravity:Values;density:Values;opticalToBody:Values;cameraOriginBody:Values}
export interface SchmidtSnapshot extends Record<StateField,number[]>,Record<ConfigField,number[]> {
  version:1;sourceSha256:string;time:number;steps:number;flags:SchmidtFlags;
}
export interface SchmidtObservation {rotation:Values;translation:Values;covariance:Values}
export type SchmidtFrame=Pick<SensorFrame,'time'|'dt'|'imu'|'imuIntervals'>&{
  currentEpoch:number;captureRequested?:boolean;observation?:SchmidtObservation;
};
const output=(name:string)=>`next${name[0].toUpperCase()}${name.slice(1)}`;
function finite(value:unknown,name:string):asserts value is number {
  if(typeof value!=='number'||!Number.isFinite(value))throw new Error(`Schmidt ${name} must be finite`);
}
function cells(value:unknown,count:number,name:string):number[]{
  if(!(Array.isArray(value)||value instanceof Float64Array)||value.length!==count)throw new Error(`Schmidt ${name} requires ${count} cells`);
  const result=Array.from(value as Values);for(const item of result)finite(item,name);return result;
}
function metadata(value:SchmidtSnapshot){
  finite(value.time,'time');if(!Number.isSafeInteger(value.steps)||value.steps<0)throw new Error('Invalid Schmidt steps');
  for(const name of ['referenceAvailable','referenceUsed'] as const)
    if(![0,1].includes(value[name][0]))throw new Error(`Invalid Schmidt ${name}`);
  for(const name of ['referenceEpoch','lastUsedEpoch'] as const)
    if(!Number.isSafeInteger(value[name][0])||value[name][0]<(name==='lastUsedEpoch'?-1:0))throw new Error(`Invalid Schmidt ${name}`);
  for(const name of flagNames)if(!value.flags||![0,1].includes(value.flags[name]))throw new Error(`Invalid Schmidt ${name}`);
}
function checked(value:SchmidtSnapshot,source:string):SchmidtSnapshot {
  if(!value||value.version!==1||value.sourceSha256!==source)throw new Error('Schmidt snapshot source/schema mismatch');
  const next=structuredClone(value);
  for(const [name,count]of Object.entries({...schmidtStateFields,...configFields}))
    next[name as StateField|ConfigField]=cells(value[name as StateField|ConfigField],count,name);
  metadata(next);return next;
}
function returnedCells(value:Float64Array,destination:number[],count:number,name:string){
  if(value.length!==count||destination.length!==count)throw new Error(`Schmidt ${name} requires ${count} cells`);
  for(let index=0;index<count;index++){const item=value[index];finite(item,name);destination[index]=item;}
}
/** Persistent review driver for the source-issued complete 15+6 transaction.
 * Modelica owns every numerical and image-reuse decision. Host retains/copies
 * state and validates measured interval transport; no production preset selects it. */
export class ModelicaSchmidtSession {
  private state:SchmidtSnapshot;
  private readonly initial:SchmidtSnapshot;
  private readonly checkpoint:Uint8Array;
  private readonly memoryBuffer:ArrayBuffer;
  private constructor(private readonly program:NativeProgram,state:SchmidtSnapshot){
    this.state=checked(state,state.sourceSha256);this.initial=structuredClone(this.state);
    this.memoryBuffer=program.memory.buffer;this.checkpoint=new Uint8Array(this.memoryBuffer.byteLength);
  }
  static async create(artifact:NativeProgramArtifact,source:string,initial:SchmidtInitialState|SchmidtSnapshot){
    if(artifact.model_name!=='ES15SchmidtReferenceStep')throw new Error('Schmidt session requires ES15SchmidtReferenceStep');
    const program=await NativeProgram.instantiate(artifact,source);
    for(const [name,count]of Object.entries(schmidtStateFields))
      if(program.input(name).length!==count||program.output(output(name)).length!==count)throw new Error(`Invalid Schmidt ${name} layout`);
    for(const [name,count]of Object.entries({...configFields,accel:3,gyro:3,measuredRotation:9,measuredTranslation:3,relativeCovariance:36,h:1,currentEpoch:1,measurementEnabled:1,captureRequested:1}))
      if(program.input(name).length!==count)throw new Error(`Invalid Schmidt ${name} layout`);
    for(const name of flagNames)if(program.output(name).length!==1)throw new Error(`Invalid Schmidt ${name} layout`);
    const state='version'in initial?checked(initial,artifact.source_sha256):checked({...initial,version:1,
      sourceSha256:artifact.source_sha256,steps:0,flags:Object.fromEntries(flagNames.map(name=>[name,0]))} as SchmidtSnapshot,artifact.source_sha256);
    return new ModelicaSchmidtSession(program,state);
  }
  snapshot():SchmidtSnapshot{return structuredClone(this.state);}
  reset(){this.program.reset();this.state=structuredClone(this.initial);return this.snapshot();}
  restore(snapshot:SchmidtSnapshot){
    const next=checked(snapshot,this.state.sourceSha256);
    for(const name of Object.keys(configFields) as ConfigField[])
      if(!next[name].every((value,index)=>Object.is(value,this.initial[name][index])))throw new Error('Schmidt snapshot calibration/config mismatch');
    this.program.reset();this.state=next;return this.snapshot();
  }
  advance(frame:SchmidtFrame):SchmidtSnapshot {
    finite(frame?.time,'frame time');finite(frame.dt,'frame dt');finite(frame.currentEpoch,'current epoch');
    if(frame.dt<=0||frame.time<=this.state.time||Math.abs(frame.time-frame.dt-this.state.time)>1e-6)throw new Error('Noncontiguous Schmidt frame');
    if(frame.captureRequested!==undefined&&typeof frame.captureRequested!=='boolean')throw new Error('Invalid Schmidt capture request');
    const intervals=imuIntervals(frame,.02).map(item=>({time:item.time,dt:item.dt,
      accel:cells(item.imu.accel,3,'accel'),gyro:cells(item.imu.gyro,3,'gyro')}));
    let previous=this.state.time;for(const item of intervals){if(item.time<=previous)throw new Error('Nonincreasing Schmidt interval');previous=item.time;}
    if(!Number.isSafeInteger(this.state.steps+intervals.length))throw new Error('Schmidt steps overflow');
    const observation=frame.observation===undefined?undefined:{rotation:cells(frame.observation?.rotation,9,'measurement rotation'),
      translation:cells(frame.observation?.translation,3,'measurement translation'),covariance:cells(frame.observation?.covariance,36,'measurement covariance')};
    const memory=new Uint8Array(this.program.memory.buffer);
    if(this.program.memory.buffer!==this.memoryBuffer)throw new Error('Modelica program memory buffer changed; instantiate the model again');
    this.checkpoint.set(memory);
    // Configuration is private and immutable. Only candidate state arrays change;
    // none are published until every measured interval succeeds.
    const next={...this.state,flags:{...this.state.flags}};
    for(const name of Object.keys(schmidtStateFields) as StateField[])next[name]=this.state[name].slice();
    const put=(name:string,value:Values)=>this.program.input(name).set(value);
    try{
      for(let index=0;index<intervals.length;index++){
        const interval=intervals[index],final=index===intervals.length-1;
        for(const name of Object.keys(schmidtStateFields) as StateField[])put(name,next[name]);
        for(const name of Object.keys(configFields) as ConfigField[])put(name,next[name]);
        put('accel',interval.accel);put('gyro',interval.gyro);put('h',[interval.dt]);
        put('currentEpoch',[frame.currentEpoch]);put('measurementEnabled',[final&&observation?1:0]);
        put('captureRequested',[final&&frame.captureRequested?1:0]);
        put('measuredRotation',final&&observation?observation.rotation:this.initial.rotation);
        put('measuredTranslation',final&&observation?observation.translation:new Float64Array(3));
        put('relativeCovariance',final&&observation?observation.covariance:new Float64Array(36));
        this.program.evaluate(interval.time);
        if(this.program.output('predictionAccepted')[0]!==1)throw new Error('Modelica Schmidt rejected prediction interval');
        for(const [name,count]of Object.entries(schmidtStateFields))returnedCells(this.program.output(output(name)),next[name as StateField],count,output(name));
        for(const name of flagNames)next.flags[name]=this.program.output(name)[0];
        next.time=interval.time;next.steps++;metadata(next);
      }
      next.time=frame.time;this.state=next;return this.snapshot();
    }catch(error){new Uint8Array(this.program.memory.buffer).set(this.checkpoint);throw error;}
  }
}
