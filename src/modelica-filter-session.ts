import {NativeProgram,type NativeProgramArtifact} from './modelica-native-program';
import {imuIntervals} from './imu-intervals';
import type {SensorFrame} from './types';

type Values=readonly number[]|Float64Array;
export interface FilterObservation {rotation:Values;position:Values;covariance:Values}
export type FilterFrame=Pick<SensorFrame,'time'|'dt'|'imu'|'imuIntervals'>&{observation?:FilterObservation};
export interface FilterSnapshot {
  version:1;sourceSha256:string;time:number;steps:number;
  rotation:number[];position:number[];velocity:number[];accelBias:number[];gyroBias:number[];covariance:number[];
  gravity:number[];density:number[];acceptedCount:number;rejectedCount:number;lastNis:number;
}
export interface FilterInitialState {time:number;covariance:Values;gravity?:Values;density?:Values}
const stateFields=[['rotation','next_rotation',9],['position','next_position',3],['velocity','next_velocity',3],
  ['accelBias','next_accel_bias',3],['gyroBias','next_gyro_bias',3],['covariance','next_covariance',225]] as const;
const timeTolerance=1e-6; // Same transport tolerance as imuIntervals.
function finite(value:unknown,name:string):asserts value is number {
  if(typeof value!=='number'||!Number.isFinite(value))throw new Error(`Filter ${name} must be finite`);
}
function cells(value:unknown,count:number,name:string):number[]{
  if(!(Array.isArray(value)||value instanceof Float64Array)||value.length!==count)
    throw new Error(`Filter ${name} requires ${count} finite cells`);
  const copy=Array.from(value as Values);for(const v of copy)finite(v,name);return copy;
}
function counter(value:unknown,name:string):asserts value is number {
  if(!Number.isSafeInteger(value)||Number(value)<0)throw new Error(`Filter ${name} must be a nonnegative safe integer`);
}
function checkedSnapshot(value:FilterSnapshot,sourceSha256:string):FilterSnapshot {
  if(!value||value.version!==1||value.sourceSha256!==sourceSha256)throw new Error('Filter snapshot source/schema mismatch');
  finite(value.time,'time');counter(value.steps,'steps');counter(value.acceptedCount,'acceptedCount');counter(value.rejectedCount,'rejectedCount');finite(value.lastNis,'lastNis');
  const copy=structuredClone(value);
  for(const [field,,count] of stateFields)copy[field]=cells(value[field],count,field);
  copy.gravity=cells(value.gravity,3,'gravity');copy.density=cells(value.density,12,'density');return copy;
}

/** Review-only persistent driver. Modelica owns propagation, correction and all
 * matrix mathematics. Host checks cover transport shape/finite values, not the
 * model's SO(3)/SPD prior preconditions. No production estimator selects this. */
export class ModelicaFilterSession {
  private state:FilterSnapshot;
  private readonly initial:FilterSnapshot;
  private constructor(private readonly program:NativeProgram,state:FilterSnapshot){
    this.state=checkedSnapshot(state,state.sourceSha256);this.initial=structuredClone(this.state);
  }
  static async create(artifact:NativeProgramArtifact,source:string,initial:FilterInitialState|FilterSnapshot){
    if(artifact.model_name!=='ES15FilterStep')throw new Error('Filter session requires the ES15FilterStep interface');
    const program=await NativeProgram.instantiate(artifact,source);
    let state:FilterSnapshot;
    if('version' in initial)state=checkedSnapshot(initial,artifact.source_sha256);
    else{
      finite(initial.time,'time');
      state={version:1,sourceSha256:artifact.source_sha256,time:initial.time,steps:0,
        rotation:cells(program.input('rotation'),9,'rotation'),position:cells(program.input('position'),3,'position'),
        velocity:cells(program.input('velocity'),3,'velocity'),accelBias:cells(program.input('accel_bias'),3,'accelBias'),
        gyroBias:cells(program.input('gyro_bias'),3,'gyroBias'),covariance:cells(initial.covariance,225,'covariance'),
        gravity:cells(initial.gravity??program.input('gravity'),3,'gravity'),density:cells(initial.density??program.input('density'),12,'density'),
        acceptedCount:program.input('accepted_count')[0],rejectedCount:program.input('rejected_count')[0],lastNis:program.input('last_nis')[0]};
    }
    // Validate the complete required interface before accepting this session.
    for(const [field,output,count] of stateFields){
      const input=field==='accelBias'?'accel_bias':field==='gyroBias'?'gyro_bias':field;
      if(program.input(input).length!==count||program.output(output).length!==count)throw new Error(`Invalid filter ${field} layout`);
    }
    for(const [name,count] of [['accel',3],['gyro',3],['gravity',3],['density',12],['observed_rotation',9],['observed_position',3],['observation_covariance',36]] as const)
      if(program.input(name).length!==count)throw new Error(`Invalid filter ${name} layout`);
    for(const name of ['h','observation_enabled','accepted_count','rejected_count','last_nis'])if(program.input(name).length!==1)throw new Error(`Invalid filter ${name} layout`);
    for(const name of ['prediction_valid','observation_accepted','observation_rejected','next_accepted_count','next_rejected_count','next_last_nis'])if(program.output(name).length!==1)throw new Error(`Invalid filter ${name} layout`);
    return new ModelicaFilterSession(program,state);
  }
  snapshot():FilterSnapshot{return structuredClone(this.state);}
  reset(){this.program.reset();this.state=structuredClone(this.initial);return this.snapshot();}
  restore(snapshot:FilterSnapshot){
    const next=checkedSnapshot(snapshot,this.state.sourceSha256);this.program.reset();this.state=next;return this.snapshot();
  }
  advance(frame:FilterFrame):FilterSnapshot{
    finite(frame?.time,'frame time');finite(frame.dt,'frame dt');
    if(frame.dt<=0||frame.time<=this.state.time||Math.abs(frame.time-frame.dt-this.state.time)>timeTolerance)
      throw new Error('Noncontiguous filter frame');
    const intervals=imuIntervals(frame,.02).map(item=>({time:item.time,dt:item.dt,
      accel:cells(item.imu.accel,3,'accel'),gyro:cells(item.imu.gyro,3,'gyro')}));
    let previous=this.state.time;
    for(const interval of intervals){if(interval.time<=previous)throw new Error('Nonincreasing filter interval');previous=interval.time;}
    counter(this.state.steps+intervals.length,'steps');
    if(frame.observation!==undefined&&(!frame.observation||typeof frame.observation!=='object'))throw new Error('Invalid filter observation');
    const observation=frame.observation!==undefined?{rotation:cells(frame.observation.rotation,9,'observed rotation'),
      position:cells(frame.observation.position,3,'observed position'),covariance:cells(frame.observation.covariance,36,'observation covariance')}:undefined;
    const before=new Uint8Array(this.program.memory.buffer).slice();let next=structuredClone(this.state);
    const put=(name:string,value:Values)=>this.program.input(name).set(value);
    try{
      for(let i=0;i<intervals.length;i++){
        const interval=intervals[i];
        for(const [field] of stateFields)put(field==='accelBias'?'accel_bias':field==='gyroBias'?'gyro_bias':field,next[field]);
        put('gravity',next.gravity);put('density',next.density);put('accel',interval.accel);put('gyro',interval.gyro);
        put('h',[interval.dt]);put('accepted_count',[next.acceptedCount]);put('rejected_count',[next.rejectedCount]);put('last_nis',[next.lastNis]);
        const observed=i===intervals.length-1?observation:undefined;
        put('observation_enabled',[observed?1:0]);
        // Clear held observation fields every interval; only the last receives it.
        put('observed_rotation',observed?.rotation??this.initial.rotation);put('observed_position',observed?.position??this.initial.position);
        put('observation_covariance',observed?.covariance??new Float64Array(36));
        this.program.evaluate(interval.time);
        if(this.program.output('prediction_valid')[0]!==1)throw new Error('Modelica filter rejected prediction interval');
        for(const name of ['observation_accepted','observation_rejected']){
          const flag=this.program.output(name)[0];if(flag!==0&&flag!==1)throw new Error(`Invalid Modelica filter ${name}`);
        }
        for(const [field,output,count] of stateFields)next[field]=cells(this.program.output(output),count,output);
        next.acceptedCount=this.program.output('next_accepted_count')[0];next.rejectedCount=this.program.output('next_rejected_count')[0];
        next.lastNis=this.program.output('next_last_nis')[0];next.steps++;next.time=interval.time;
        next=checkedSnapshot(next,this.state.sourceSha256);
      }
      next.time=frame.time;this.state=next;return this.snapshot();
    }catch(error){new Uint8Array(this.program.memory.buffer).set(before);throw error;}
  }
}
