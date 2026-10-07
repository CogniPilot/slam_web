import type {Pose,Truth} from './types';
import type {GpsSample,RoofVolume} from './world-navigation';
import {readActorMotionFrame,type ActorMotionFrame} from './modelica-actor-motion';

export interface AlgebraicSession {
  set_inputs(inputs:string):void;
  advance_to(time:number):void;
  state_json():string;
  free():void;
}
export type AlgebraicFactory=(source:string,model:string)=>AlgebraicSession;
export interface ActorRouteConfiguration {pedestrianRadius:number;carRadius:number;pedestrianHalfLength?:number;streetCars?:boolean;carStreetHalfLength?:number;pedestrianCrossings?:boolean}
type Input=[string,number];
export interface SensorDraws {accel:number[][];gyro:number[][];gps?:number[][]}
export type SensorRoofs=RoofVolume|readonly RoofVolume[];
export interface EvaluationResult {
  reference:Pose;
  metrics:{ate:number;currentError:number;orientationError:number};
}
const vector=(name:string,v:number[]):Input[]=>v.map((value,i)=>[`${name}[${i+1}]`,value]);
const matrix=(name:string,v:number[][]):Input[]=>v.flatMap((row,i)=>row.map((value,j):Input=>[`${name}[${i+1},${j+1}]`,value]));
const checkVector=(v:number[],count:number)=>{if(!Array.isArray(v)||v.length!==count||!v.every(Number.isFinite))throw new Error('Invalid Modelica runtime input vector');};

/** Sessions own all sensor/evaluation equations. This adapter copies named
 * inputs and outputs, holds committed timestamps, and retains returned state. */
export class ModelicaRuntimeMath {
  private readonly sensor:AlgebraicSession;
  private readonly availability:AlgebraicSession;
  private readonly evaluation:AlgebraicSession;
  private readonly actor?:AlgebraicSession;
  private readonly sensorRoofs:boolean;
  private readonly availabilityRoofs:boolean;
  private actorTick=0;
  private actorSceneRoutes=false;
  private actorStreetRoutes=false;
  private actorCrossingRoutes=false;
  private sum=0;
  constructor(make:AlgebraicFactory,sensorSource:string,evaluationSource:string,private origin:Pose,actorSource?:string){
    this.origin=structuredClone(origin);
    const created:AlgebraicSession[]=[];
    try{
      this.sensor=make(sensorSource,'SensorObservations');created.push(this.sensor);
      this.availability=make(sensorSource,'SensorAvailability');created.push(this.availability);
      this.evaluation=make(evaluationSource,'RuntimeEvaluation');created.push(this.evaluation);
      this.sensorRoofs=this.hasRoofArrayProfile(this.observe(this.sensor,[],0,['accel[1]','accel[2]','accel[3]','gyro[1]','gyro[2]','gyro[3]','gpsPosition[1]','gpsPosition[2]','gpsPosition[3]','gpsCovariance[1,1]','gpsAvailable']));
      this.availabilityRoofs=this.hasRoofArrayProfile(this.observe(this.availability,[],0,['gpsAvailable']));
      this.observe(this.evaluation,this.originInputs(),0,['referencePosition[1]','referencePosition[2]','referencePosition[3]','referenceQuaternion[1]','referenceQuaternion[2]','referenceQuaternion[3]','referenceQuaternion[4]','ate','currentError','orientationError','nextSquaredError']);
      if(actorSource!==undefined){
        try{
          this.actor=make(actorSource,'ActorMotion');created.push(this.actor);
          const values=this.observe(this.actor,[['sampleTime',0]],0,[]);
          readActorMotionFrame(values,0);
          const routeInputs=['useSceneRoutes','pedestrianRouteRadius','carRouteRadius'];
          // Rumoca omits input variables from state_json. Inspect declared
          // inputs in the editable actor model to support saved legacy sources.
          const actorModel=actorSource.match(/\bmodel\s+ActorMotion\b([\s\S]*?)\bend\s+ActorMotion\s*;/)?.[1]??'';
          const declared=routeInputs.map(name=>new RegExp(`\\binput\\s+Real\\s+${name}\\b`).test(actorModel));
          this.actorSceneRoutes=declared.every(Boolean);
          this.actorStreetRoutes=['pedestrianRouteHalfLength','streetCarRoutes','carStreetHalfLength'].every(name=>new RegExp(`\\binput\\s+Real\\s+${name}\\b`).test(actorModel));
          this.actorCrossingRoutes=/\binput\s+Real\s+pedestrianCrossingRoutes\b/.test(actorModel);
          if(!this.actorSceneRoutes&&declared.some(Boolean))throw new Error('Modelica actor scene route interface is incomplete');
        }catch(error){throw new Error(`Modelica ActorMotion initialization failed: ${String(error)}`,{cause:error});}
      }
    }catch(error){for(const session of created)session.free();throw error;}
  }
  private originInputs(){return [...vector('originPosition',[this.origin.x,this.origin.y,this.origin.z]),...vector('originQuaternion',this.origin.quaternion)];}
  setOrigin(origin:Pose){this.origin=structuredClone(origin);this.sum=0;}
  actors(time:number,route?:ActorRouteConfiguration):ActorMotionFrame {
    if(!Number.isFinite(time))throw new Error('Modelica ActorMotion requires a finite sampled time');
    if(!this.actor)throw new Error('Modelica ActorMotion source has not been initialized');
    if(route&&(!Number.isFinite(route.pedestrianRadius)||route.pedestrianRadius<=0||!Number.isFinite(route.carRadius)||route.carRadius<=0))throw new Error('Modelica actor routes require positive finite radii');
    for(const value of [route?.pedestrianHalfLength,route?.carStreetHalfLength])if(value!==undefined&&(!Number.isFinite(value)||value<=0))throw new Error('Modelica actor routes require positive finite half lengths');
    // Actor sample time can rewind or repeat; only the private algebraic
    // dispatch clock advances. Its value never enters the trajectory equations.
    const nextTick=this.actorTick+1,clock=nextTick/90;
    if(!Number.isSafeInteger(nextTick)||clock<=this.actorTick/90)throw new Error('Modelica ActorMotion dispatch clock is exhausted');
    this.actorTick=nextTick;
    const inputs:Input[]=[['sampleTime',time]];
    // Saved sources without the scene interface retain their authored routes.
    if(this.actorSceneRoutes)inputs.push(['useSceneRoutes',route?1:0],['pedestrianRouteRadius',route?.pedestrianRadius??4.05],['carRouteRadius',route?.carRadius??1.4]);
    if(this.actorSceneRoutes&&this.actorStreetRoutes)inputs.push(['pedestrianRouteHalfLength',route?.pedestrianHalfLength??18],['streetCarRoutes',route?.streetCars?1:0],['carStreetHalfLength',route?.carStreetHalfLength??55]);
    if(this.actorSceneRoutes&&this.actorCrossingRoutes)inputs.push(['pedestrianCrossingRoutes',route?.pedestrianCrossings?1:0]);
    return readActorMotionFrame(this.observe(this.actor,inputs,clock,[]),time);
  }
  private observe(session:AlgebraicSession,inputs:Input[],time:number,required:string[]){
    if(!Number.isFinite(time)||time<0||inputs.some(([,value])=>!Number.isFinite(value)))throw new Error('Modelica runtime math requires finite inputs and a nonnegative timestamp');
    session.set_inputs(JSON.stringify(inputs));session.advance_to(time);
    const values=JSON.parse(session.state_json()).values as Record<string,number>;
    for(const name of required)if(!Number.isFinite(values[name]))throw new Error(`Modelica runtime math must expose finite ${name}`);
    return values;
  }
  private hasRoofArrayProfile(values:Record<string,number>){
    const names=['roofCount','roofConfigurationValid',...Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>[`roofMinima[${i+1},${j+1}]`,`roofMaxima[${i+1},${j+1}]`]).flat()).flat()];
    if(!names.some(name=>name in values))return false;
    if(!names.every(name=>Number.isFinite(values[name])))throw new Error('Modelica roof array interface is incomplete; update SensorAvailability and SensorObservations in the saved sensor source');
    return true;
  }
  private roofInputs(roof:SensorRoofs,enabled:boolean,arrayProfile:boolean):Input[]{
    const roofs:readonly RoofVolume[]=Array.isArray(roof)?roof:([roof] as RoofVolume[]);
    if(roofs.length>3)throw new Error('Modelica sensors support at most three roof volumes');
    for(const volume of roofs){if(!volume)throw new Error('Invalid Modelica roof volume');checkVector(volume.minimum,3);checkVector(volume.maximum,3);}
    if(!arrayProfile&&roofs.length>1)throw new Error('Saved sensor source supports one roof volume; update SensorAvailability and SensorObservations to the roof array interface for Big city');
    const first=roofs[0]??{minimum:[0,0,0],maximum:[0,0,0]};
    const inputs:Input[]=[...vector('roofMinimum',first.minimum),...vector('roofMaximum',first.maximum),['roofEnabled',enabled&&(arrayProfile||roofs.length>0)?1:0]];
    if(arrayProfile){
      inputs.push(['roofCount',roofs.length]);
      // Send every slot on every observation, so shrinking the list cannot
      // retain stale geometry. Modelica alone evaluates containment and union.
      for(let index=0;index<3;index++){
        const volume=roofs[index]??{minimum:[0,0,0],maximum:[0,0,0]};
        for(let axis=0;axis<3;axis++)inputs.push([`roofMinima[${index+1},${axis+1}]`,volume.minimum[axis]],[`roofMaxima[${index+1},${axis+1}]`,volume.maximum[axis]]);
      }
    }
    return inputs;
  }
  private checkRoofConfiguration(values:Record<string,number>,arrayProfile:boolean){
    if(arrayProfile&&values.roofConfigurationValid!==1)throw new Error('Modelica rejected roof configuration: use an integral count from zero to three and ordered finite minimum/maximum bounds');
  }
  gpsAvailable(truth:Truth,roof:SensorRoofs,enabled:boolean){
    const values=this.observe(this.availability,[...vector('positionTruth',[truth.x,truth.y,truth.z]),...this.roofInputs(roof,enabled,this.availabilityRoofs)],truth.time,['gpsAvailable']);
    this.checkRoofConfiguration(values,this.availabilityRoofs);
    if(values.gpsAvailable!==0&&values.gpsAvailable!==1)throw new Error('Modelica GPS availability must be zero or one');
    return values.gpsAvailable===1;
  }
  observeSensors(truth:Truth,draws:SensorDraws,roof:SensorRoofs,enabled:boolean,sampleGps=true){
    checkVector(truth.accel,3);checkVector(truth.gyro,3);
    for(const name of ['accel','gyro','gps'] as const){
      const value=draws[name];if(name==='gps'&&!value)continue;
      if(!value||value.length!==3||value.some(row=>row.length!==2||row.some(v=>!Number.isFinite(v)||v<0||v>=1)))throw new Error('Modelica sensors require three pairs of finite uniform draws in [0,1)');
    }
    const inputs=[...vector('accelTruth',truth.accel),...vector('gyroTruth',truth.gyro),...vector('positionTruth',[truth.x,truth.y,truth.z]),...matrix('accelDraws',draws.accel),...matrix('gyroDraws',draws.gyro),...matrix('gpsDraws',draws.gps??[[.5,.5],[.5,.5],[.5,.5]]),...this.roofInputs(roof,enabled,this.sensorRoofs)];
    const required=[...Array.from({length:3},(_,i)=>`accel[${i+1}]`),...Array.from({length:3},(_,i)=>`gyro[${i+1}]`),...Array.from({length:3},(_,i)=>`gpsPosition[${i+1}]`),...Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>`gpsCovariance[${i+1},${j+1}]`)).flat(),'gpsAvailable'];
    const values=this.observe(this.sensor,inputs,truth.time,required);
    this.checkRoofConfiguration(values,this.sensorRoofs);
    if(values.gpsAvailable!==0&&values.gpsAvailable!==1)throw new Error('Modelica GPS availability must be zero or one');
    if(sampleGps&&(values.gpsAvailable===1)!==Boolean(draws.gps))throw new Error('GPS draw schedule disagrees with Modelica availability');
    const read=(name:string)=>Array.from({length:3},(_,i)=>values[`${name}[${i+1}]`]);
    const gps:GpsSample|null=draws.gps?{time:truth.time,position:read('gpsPosition'),positionCovariance:Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>values[`gpsCovariance[${i+1},${j+1}]`])).flat()}:null;
    return {imu:{accel:read('accel'),gyro:read('gyro')},gps};
  }
  evaluate(truth:Truth,estimate:Pose,sampleCount:number,accumulate=true):EvaluationResult {
    checkVector(truth.quaternion,4);checkVector(estimate.quaternion,4);checkVector(this.origin.quaternion,4);
    if(!Number.isSafeInteger(sampleCount)||sampleCount<1)throw new Error('Modelica evaluation requires a positive sample count');
    const inputs=[...this.originInputs(),...vector('worldPosition',[truth.x,truth.y,truth.z]),...vector('worldQuaternion',truth.quaternion),...vector('estimatePosition',[estimate.x,estimate.y,estimate.z]),...vector('estimateQuaternion',estimate.quaternion),['previousSquaredError',this.sum],['sampleCount',sampleCount]] as Input[];
    const required=[...Array.from({length:3},(_,i)=>`referencePosition[${i+1}]`),...Array.from({length:4},(_,i)=>`referenceQuaternion[${i+1}]`),'ate','currentError','orientationError','nextSquaredError'];
    const values=this.observe(this.evaluation,inputs,truth.time,required);
    if(accumulate)this.sum=values.nextSquaredError;
    return {reference:{x:values['referencePosition[1]'],y:values['referencePosition[2]'],z:values['referencePosition[3]'],quaternion:Array.from({length:4},(_,i)=>values[`referenceQuaternion[${i+1}]`])},metrics:{ate:values.ate,currentError:values.currentError,orientationError:values.orientationError}};
  }
  free(){this.sensor.free();this.availability.free();this.evaluation.free();this.actor?.free();}
}
