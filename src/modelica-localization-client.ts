import type {LocalizationFrame,LocalizationInitial,LocalizationModel,LocalizationResult,LocalizationSnapshot} from './modelica-localization-session';
import type {NativeProgramArtifact} from './modelica-native-program';
import type {LocalizationRequest} from './modelica-localization.worker';
import {localizationFrameFromSensor} from './modelica-localization-frame';
import type {SensorFrame} from './types';

type Payload=LocalizationRequest extends infer T?T extends LocalizationRequest?Omit<T,'id'>:never:never;
type Waiting={message:LocalizationRequest;transfer:Transferable[];resolve:(value:unknown)=>void;reject:(error:Error)=>void};
export interface LocalizationInitialization {
  base:string;source:string;model:LocalizationModel;initial:LocalizationInitial|LocalizationSnapshot;artifact?:NativeProgramArtifact;
}
export interface LocalizationReady {snapshot:LocalizationSnapshot;artifact:NativeProgramArtifact;width:number;height:number;capacity:number}

/** Optional staged browser transport. One active request and one waiting request
 * bound retained frames; RGB/depth transfer directly into the worker. A sensor
 * worker may instead use ModelicaLocalizationSession locally, avoiding this hop. */
export class ModelicaLocalizationClient {
  private readonly worker=new Worker(new URL('./modelica-localization.worker.ts',import.meta.url),{type:'module'});
  private active?:Waiting;
  private pending?:Waiting;
  private nextId=0;
  private closed=false;
  constructor(){
    this.worker.onmessage=({data})=>{
      const active=this.active;
      if(!active||data?.id!==active.message.id){this.fail(new Error('Unexpected localization worker response'));return;}
      this.active=undefined;
      if(typeof data.error==='string')active.reject(new Error(data.error));else active.resolve(data.result);
      const next=this.pending;this.pending=undefined;if(next)this.send(next);
    };
    this.worker.onerror=event=>{event.preventDefault();this.fail(new Error(event.message||'Localization worker failed'));};
    this.worker.onmessageerror=()=>this.fail(new Error('Localization worker message could not be decoded'));
  }
  private send(request:Waiting){
    this.active=request;
    try{this.worker.postMessage(request.message,request.transfer);}
    catch(error){this.active=undefined;request.reject(error instanceof Error?error:new Error(String(error)));
      const next=this.pending;this.pending=undefined;if(next)this.send(next);}
  }
  private call<T>(message:Payload,transfer:Transferable[]=[]):Promise<T>{
    if(this.closed)return Promise.reject(new Error('Localization worker is closed'));
    if(this.active&&this.pending)return Promise.reject(new Error('Localization queue is full (one pending request)'));
    if(!Number.isSafeInteger(this.nextId))return Promise.reject(new Error('Localization request ID exhausted'));
    const id=this.nextId++;
    return new Promise<T>((resolve,reject)=>{
      const request:Waiting={message:{...message,id} as LocalizationRequest,transfer,resolve:value=>resolve(value as T),reject};
      if(this.active){
        // Take ownership when the frame is accepted into the one-slot queue,
        // rather than retain caller-owned mutable metadata or image buffers.
        request.message=structuredClone(request.message,{transfer});
        request.transfer=request.message.type==='step'&&transfer.length
          ?[...new Set([request.message.frame.rgb.buffer,request.message.frame.depth.buffer])] as ArrayBuffer[]:[];
        this.pending=request;
      }else this.send(request);
    });
  }
  initialize(value:LocalizationInitialization){return this.call<LocalizationReady>({type:'init',...value});}
  step(frame:LocalizationFrame,transferImages=true){
    // Explicit fields exclude truth and unrelated simulator/capture metadata.
    const payload:LocalizationFrame={sequence:frame.sequence,time:frame.time,dt:frame.dt,imu:frame.imu,imuIntervals:frame.imuIntervals,
      rgb:frame.rgb,depth:frame.depth,calibration:frame.calibration,pixels:frame.pixels,featureScore:frame.featureScore,
      activeCount:frame.activeCount,captureRequested:frame.captureRequested};
    const transfer=transferImages?[...new Set([frame.rgb.buffer,frame.depth.buffer])]:[];
    if(transfer.some(buffer=>!(buffer instanceof ArrayBuffer)))return Promise.reject(new Error('Localization transfer requires unshared image buffers'));
    return this.call<LocalizationResult>({type:'step',frame:payload},transfer as ArrayBuffer[]);
  }
  stepSensorFrame(frame:SensorFrame,captureRequested?:boolean,transferImages=true){
    return this.step(localizationFrameFromSensor(frame,captureRequested),transferImages);
  }
  snapshot(){return this.call<LocalizationSnapshot>({type:'snapshot'});}
  reset(){return this.call<LocalizationSnapshot>({type:'reset'});}
  restore(snapshot:LocalizationSnapshot){return this.call<LocalizationSnapshot>({type:'restore',snapshot});}
  private fail(error:Error){
    if(this.closed)return;this.closed=true;this.worker.terminate();
    this.active?.reject(error);this.pending?.reject(error);this.active=undefined;this.pending=undefined;
  }
  close(){this.fail(new Error('Localization worker closed'));}
}
