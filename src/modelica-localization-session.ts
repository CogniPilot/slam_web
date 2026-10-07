import {NativeProgram,type NativeProgramArtifact} from './modelica-native-program';
import {imuIntervals} from './imu-intervals';
import type {Estimate,SensorFrame} from './types';

type Cells=readonly number[]|Float64Array;
export type LocalizationModel='RGBDInertialLocalizationStep'|'RGBDFastInertialLocalizationStep';
const models:readonly LocalizationModel[]=['RGBDInertialLocalizationStep','RGBDFastInertialLocalizationStep'];
const fixedState={position:3,velocity:3,rotation:9,accelBias:3,gyroBias:3,covariance:225,
  crossCovariance:90,referenceCovariance:36,referencePosition:3,referenceRotation:9,
  referenceAvailable:1,referenceEpoch:1,referenceUsed:1,lastUsedEpoch:1,referenceCount:1,
  referenceRgbCalibration:4,referenceDepthCalibration:4,referenceNoiseReferenceFx:1,
  referenceDisparityNoise:1,referenceBaseline:1,referenceOpticalToBody:9,referenceCameraOriginBody:3} as const;
const configFields={gravity:3,density:12} as const;
const flags=['predictionAccepted','observationAccepted','observationRejected','captureAccepted','captureRejected',
  'imageReuseRejected','imagePairEligible','frameValid','referenceGeometryCompatible','visualValid'] as const;
const nextName=(name:string)=>`next${name[0].toUpperCase()}${name.slice(1)}`;
export interface LocalizationCalibration {
  /** fx,fy,cx,cy in each image's calibrated pixel coordinates. No host alignment. */
  rgbCalibration:Cells;depthCalibration:Cells;opticalToBody:Cells;cameraOriginBody:Cells;
  disparityNoise:number;noiseReferenceFx:number;baseline:number;
}
export interface LocalizationFrame extends Pick<SensorFrame,'sequence'|'time'|'dt'|'imu'|'imuIntervals'> {
  rgb:Uint8Array;depth:Float32Array;
  calibration:LocalizationCalibration;
  /** Only the model with externally selected features accepts these inputs. */
  pixels?:Cells;featureScore?:Cells;activeCount?:number;captureRequested?:boolean;
}
export interface LocalizationSnapshot {
  version:1;model:LocalizationModel;sourceSha256:string;time:number;sequence:number|null;steps:number;
  state:Record<string,number[]>;configuration:Record<string,number[]>;
}
export interface LocalizationInitial {
  time:number;
  /** Explicit estimated initialization/configuration, never a ground-truth pose.
   * Omitted fields retain their compiler-issued Modelica input defaults. */
  inputs?:Record<string,Cells>;
}
export interface LocalizationResult {estimate:Estimate;snapshot:LocalizationSnapshot;flags:Record<string,number>}
function finite(value:unknown,name:string):asserts value is number {
  if(typeof value!=='number'||!Number.isFinite(value))throw new Error(`Localization ${name} must be finite`);
}
function integer(value:unknown,name:string):asserts value is number {
  if(!Number.isSafeInteger(value)||Number(value)<0)throw new Error(`Localization ${name} must be a nonnegative safe integer`);
}
function cells(value:unknown,count:number,name:string):number[]{
  if(!(Array.isArray(value)||value instanceof Float64Array)||value.length!==count)
    throw new Error(`Localization ${name} requires ${count} cells`);
  const result=Array.from(value as Cells);for(const item of result)finite(item,name);return result;
}
function selectedRows(data:Float64Array,mask:Float64Array,width:number):number[][] {
  const result:number[][]=[];
  for(let row=0;row<mask.length;row++){
    if(mask[row]!==0&&mask[row]!==1)throw new Error('Invalid Modelica localization output mask');
    if(mask[row]===1)result.push(cells(data.subarray(row*width,(row+1)*width),width,'selected output'));
  }
  return result;
}

/** Staged host transport/persistence only. The compiler-issued executable owns
 * selection, projection, registration, inertial integration and image commits.
 * Every measured interval is evaluated verbatim; numerical subdivision belongs
 * to Modelica. Nothing is committed until the complete frame succeeds. */
export class ModelicaLocalizationSession {
  private state:LocalizationSnapshot;
  private readonly initial:LocalizationSnapshot;
  private readonly checkpoint:Uint8Array;
  private readonly memoryBuffer:ArrayBuffer;
  private readonly defaultFeatureScore?:Float64Array;
  private constructor(private readonly program:NativeProgram,private readonly stateSizes:Record<string,number>,
    readonly width:number,readonly height:number,readonly capacity:number,state:LocalizationSnapshot){
    this.state=this.checked(state);this.initial=structuredClone(this.state);
    this.memoryBuffer=program.memory.buffer;this.checkpoint=new Uint8Array(this.memoryBuffer.byteLength);
    if(state.model==='RGBDInertialLocalizationStep')this.defaultFeatureScore=program.input('featureScore').slice();
  }
  static async create(value:NativeProgramArtifact,source:string,initial:LocalizationInitial|LocalizationSnapshot){
    const artifact=structuredClone(value);
    initial=structuredClone(initial);
    if(!models.includes(artifact.model_name as LocalizationModel))throw new Error('Unsupported Modelica localization model');
    // The complete frame transaction requires the compiler's checked typed ABI.
    if(artifact.profile!=='native-direct-program-f64-v3')throw new Error('Localization requires transactional native program v3');
    const program=await NativeProgram.instantiate(artifact,source);
    const shape=(name:string,rank:number)=>{
      const dims=artifact.var_layout.shapes[name];
      if(!dims||dims.length!==rank)throw new Error(`Invalid localization ${name} shape`);return dims;
    };
    const rgbShape=shape('rgb',3),depthShape=shape('depth',2),descriptorShape=shape('referenceDescriptor',2);
    const [height,width,channels]=rgbShape,[capacity,descriptorSize]=descriptorShape;
    if(channels!==4||depthShape[0]!==height||depthShape[1]!==width||descriptorSize!==49)
      throw new Error('Invalid localization raster/descriptor layout');
    const stateSizes={...fixedState,referenceDescriptor:capacity*descriptorSize,referencePoint:capacity*3,referenceEnabled:capacity,referencePixels:capacity*2};
    const layouts:Record<string,number[]>={rgb:[height,width,4],depth:[height,width],rotation:[3,3],covariance:[15,15],
      crossCovariance:[15,6],referenceCovariance:[6,6],referenceRotation:[3,3],referenceOpticalToBody:[3,3],opticalToBody:[3,3],
      referenceDescriptor:[capacity,descriptorSize],referencePoint:[capacity,3],referenceEnabled:[capacity],referencePixels:[capacity,2],
      pixels:[capacity,2],featureScore:[capacity],positionCovariance:[3,3],attitudeCovariance:[3,3],
      mapCandidatePoint:[capacity,3],mapCandidateEnabled:[capacity],features:[capacity,3],featureEnabled:[capacity],
      trackingCurrentPixel:[capacity,2],trackingReferencePixel:[capacity,2],trackingEnabled:[capacity]};
    const check=(name:string,count:number,kind:'input'|'output')=>{
      if(program[kind](name).length!==count)throw new Error(`Invalid localization ${name} layout`);
      const base=name.startsWith('next')?name[4].toLowerCase()+name.slice(5):name;
      const expected=layouts[base]??(count===1?[]:[count]),actual=artifact.var_layout.shapes[name]??[];
      if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(`Invalid localization ${name} orientation`);
    };
    for(const [name,count]of Object.entries(stateSizes)){check(name,count,'input');check(nextName(name),count,'output');}
    for(const [name,count]of Object.entries({...configFields,rgb:height*width*4,depth:height*width,
      rgbCalibration:4,depthCalibration:4,opticalToBody:9,cameraOriginBody:3,disparityNoise:1,noiseReferenceFx:1,baseline:1,
      frameEnabled:1,imageCaptureRequested:1,accel:3,gyro:3,h:1,currentEpoch:1}))check(name,count,'input');
    if(artifact.model_name==='RGBDInertialLocalizationStep'){check('pixels',capacity*2,'input');check('featureScore',capacity,'input');check('activeCount',1,'input');}
    for(const name of flags)check(name,1,'output');
    for(const [name,count]of Object.entries({nextQuaternion:4,positionCovariance:9,attitudeCovariance:9,confidence:1,
      mapCandidatePoint:capacity*3,mapCandidateEnabled:capacity,mapCandidateCount:1,matchCount:1,uncertaintyRejectionReason:1,
      features:capacity*3,featureEnabled:capacity,trackingCurrentPixel:capacity*2,trackingReferencePixel:capacity*2,trackingEnabled:capacity}))check(name,count,'output');
    if(artifact.model_name==='RGBDFastInertialLocalizationStep')check('selectionValid',1,'output');
    let state:LocalizationSnapshot;
    if('version'in initial)state=structuredClone(initial);
    else{
      finite(initial.time,'initial time');
      const inputs=initial.inputs??{};
      for(const name of Object.keys(inputs))if(!Object.hasOwn(stateSizes,name)&&!Object.hasOwn(configFields,name))
        throw new Error(`Unsupported localization initialization field: ${name}`);
      state={version:1,model:artifact.model_name as LocalizationModel,sourceSha256:artifact.source_sha256,
        time:initial.time,sequence:null,steps:0,state:{},configuration:{}};
      for(const [name,count]of Object.entries(stateSizes))state.state[name]=cells(inputs[name]??program.input(name),count,name);
      for(const [name,count]of Object.entries(configFields))state.configuration[name]=cells(inputs[name]??program.input(name),count,name);
    }
    if(state.sourceSha256!==artifact.source_sha256||state.model!==artifact.model_name)throw new Error('Localization snapshot source/model mismatch');
    return new ModelicaLocalizationSession(program,stateSizes,width,height,capacity,state);
  }
  private checked(value:LocalizationSnapshot):LocalizationSnapshot {
    if(!value||value.version!==1)throw new Error('Invalid localization snapshot version');
    finite(value.time,'snapshot time');integer(value.steps,'snapshot steps');if(value.sequence!==null)integer(value.sequence,'snapshot sequence');
    const result=structuredClone(value);
    if(Object.keys(value.state).length!==Object.keys(this.stateSizes).length||Object.keys(value.configuration).length!==Object.keys(configFields).length)
      throw new Error('Invalid localization snapshot fields');
    for(const [name,count]of Object.entries(this.stateSizes))result.state[name]=cells(value.state[name],count,name);
    for(const [name,count]of Object.entries(configFields))result.configuration[name]=cells(value.configuration[name],count,name);
    return result;
  }
  snapshot():LocalizationSnapshot{return structuredClone(this.state);}
  reset(){this.program.reset();this.state=structuredClone(this.initial);return this.snapshot();}
  restore(value:LocalizationSnapshot){
    if(value?.sourceSha256!==this.state.sourceSha256||value?.model!==this.state.model)throw new Error('Localization snapshot source/model mismatch');
    const next=this.checked(value);
    for(const name of Object.keys(configFields))if(!next.configuration[name].every((v,i)=>Object.is(v,this.initial.configuration[name][i])))
      throw new Error('Localization snapshot configuration mismatch');
    this.program.reset();this.state=next;return this.snapshot();
  }
  advance(frame:LocalizationFrame):LocalizationResult {
    finite(frame?.time,'frame time');finite(frame.dt,'frame dt');integer(frame.sequence,'frame sequence');
    if(frame.dt<=0||frame.time<=this.state.time||Math.abs(frame.time-frame.dt-this.state.time)>1e-6
      ||this.state.sequence!==null&&frame.sequence<=this.state.sequence)throw new Error('Noncontiguous localization frame');
    if(!(frame.rgb instanceof Uint8Array)||frame.rgb.length!==this.width*this.height*4
      ||!(frame.depth instanceof Float32Array)||frame.depth.length!==this.width*this.height)throw new Error('Invalid localization image layout');
    if(frame.captureRequested!==undefined&&typeof frame.captureRequested!=='boolean')throw new Error('Invalid localization capture request');
    // Preserve measured intervals; the Modelica predictor owns its <=20ms
    // numerical substeps and angular limits, including a 30Hz held sample.
    const intervals=imuIntervals(frame,.2);
    integer(this.state.steps+intervals.length,'next steps');
    const calibration=frame.calibration,calibrated:Record<string,number[]>={};
    for(const [name,count]of Object.entries({rgbCalibration:4,depthCalibration:4,opticalToBody:9,cameraOriginBody:3}))
      calibrated[name]=cells(calibration?.[name as keyof LocalizationCalibration],count,name);
    for(const name of ['disparityNoise','noiseReferenceFx','baseline'] as const){finite(calibration?.[name],name);calibrated[name]=[calibration[name]];}
    let pixels:number[]|undefined,featureScore:number[]|undefined;
    if(this.state.model==='RGBDInertialLocalizationStep'){
      pixels=cells(frame.pixels,this.capacity*2,'pixels');integer(frame.activeCount,'active count');
      featureScore=frame.featureScore===undefined?undefined:cells(frame.featureScore,this.capacity,'feature score');
      if(frame.activeCount>this.capacity)throw new Error('Localization feature count exceeds capacity');
    }else if(frame.pixels!==undefined||frame.activeCount!==undefined||frame.featureScore!==undefined)throw new Error('FAST localization owns feature selection');
    if(this.program.memory.buffer!==this.memoryBuffer)throw new Error('Modelica localization memory changed; instantiate again');
    this.checkpoint.set(new Uint8Array(this.memoryBuffer));
    const candidate=structuredClone(this.state),put=(name:string,value:ArrayLike<number>)=>this.program.input(name).set(value);
    try{
      // Raw measured arrays are copied once. Invalid depths are model inputs;
      // their rejection/masking is numerical policy owned by Modelica.
      put('rgb',frame.rgb);put('depth',frame.depth);
      for(const [name,value]of Object.entries(calibrated))put(name,value);
      if(pixels){put('pixels',pixels);put('activeCount',[frame.activeCount!]);
        // Restore source-declared optional score defaults, never held prior frame values.
        put('featureScore',featureScore??this.defaultFeatureScore!);}
      for(let index=0;index<intervals.length;index++){
        const interval=intervals[index],final=index===intervals.length-1;
        for(const [name,value]of Object.entries(candidate.state))put(name,value);
        for(const [name,value]of Object.entries(candidate.configuration))put(name,value);
        put('accel',interval.imu.accel);put('gyro',interval.imu.gyro);put('h',[interval.dt]);
        put('currentEpoch',[frame.sequence]);put('frameEnabled',[final?1:0]);put('imageCaptureRequested',[final&&frame.captureRequested?1:0]);
        this.program.evaluate(interval.time);
        if(this.program.output('predictionAccepted')[0]!==1)throw new Error('Modelica localization rejected prediction interval');
        for(const name of flags){const flag=this.program.output(name)[0];if(flag!==0&&flag!==1)throw new Error(`Invalid localization ${name}`);}
        for(const [name,count]of Object.entries(this.stateSizes))candidate.state[name]=cells(this.program.output(nextName(name)),count,nextName(name));
        candidate.time=interval.time;candidate.steps++;
      }
      candidate.time=frame.time;candidate.sequence=frame.sequence;
      const result=this.result(candidate);
      this.state=candidate;return result;
    }catch(error){new Uint8Array(this.memoryBuffer).set(this.checkpoint);throw error;}
  }
  private result(snapshot:LocalizationSnapshot):LocalizationResult {
    const output=(name:string,count:number)=>cells(this.program.output(name),count,name);
    const confidence=output('confidence',1)[0];if(confidence<0||confidence>1)throw new Error('Invalid localization confidence');
    const resultFlags=Object.fromEntries(flags.map(name=>[name,this.program.output(name)[0]]));
    if(this.state.model==='RGBDFastInertialLocalizationStep'){
      const value=this.program.output('selectionValid')[0];if(value!==0&&value!==1)throw new Error('Invalid localization selection flag');resultFlags.selectionValid=value;
    }
    const points=selectedRows(this.program.output('mapCandidatePoint'),this.program.output('mapCandidateEnabled'),3);
    const features=selectedRows(this.program.output('features'),this.program.output('featureEnabled'),3);
    const mask=this.program.output('trackingEnabled');
    const current=selectedRows(this.program.output('trackingCurrentPixel'),mask,2);
    const previous=selectedRows(this.program.output('trackingReferencePixel'),mask,2);
    const [x,y,z]=snapshot.state.position;
    const diagnostics:Record<string,number|string>={runtime:'Modelica native program',...resultFlags,
      matchCount:output('matchCount',1)[0],mapCandidateCount:output('mapCandidateCount',1)[0],
      uncertaintyRejectionReason:output('uncertaintyRejectionReason',1)[0],referenceEpoch:snapshot.state.referenceEpoch[0]};
    return {snapshot:structuredClone(snapshot),flags:resultFlags,estimate:{x,y,z,quaternion:output('nextQuaternion',4),confidence,points,features,
      uncertainty:{positionCovariance:output('positionCovariance',9),attitudeCovariance:output('attitudeCovariance',9)},diagnostics,
      tracking:{matches:current.map((value,index)=>({current:value,previous:previous[index]})),accepted:resultFlags.observationAccepted===1,
        reason:`Modelica uncertainty reason ${diagnostics.uncertaintyRejectionReason}`,referenceSequence:this.state.state.referenceEpoch[0]}}};
  }
}
