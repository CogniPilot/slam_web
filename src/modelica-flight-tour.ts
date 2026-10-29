import modelSource from '../models/Planning/MapFlightTour.mo?raw';
import officeSource from '../models/Benchmarks/OfficeLoopProfile.mo?raw';
import hallwaySource from '../models/Benchmarks/HallwayProfile.mo?raw';
import type {FlightTour} from './flight-tour';
import type {Pose} from './types';

export const MAP_FLIGHT_TOUR_PATH='models/Planning/MapFlightTour.mo';
export const mapFlightTourSources:Readonly<Record<string,string>>=Object.freeze({
  [MAP_FLIGHT_TOUR_PATH]:modelSource,
  'models/Benchmarks/OfficeLoopProfile.mo':officeSource,
  'models/Benchmarks/HallwayProfile.mo':hallwaySource,
});
interface Session {set_inputs(inputs:string):void;advance_to(time:number):void;state_json():string;reset():void;free():void}
export const MAP_TOUR_INPUTS=['positionMode',...['targetPosition','targetVelocity','targetAcceleration'].flatMap(name=>[1,2,3].map(i=>`${name}[${i}]`)),'targetHeading'];

/** Modelica computes reference position, derivatives and heading. The host
 * only holds that reference through the next physics acquisition interval. */
export class ModelicaFlightTour {
  constructor(private readonly session:Session,private readonly origin:Pick<Pose,'x'|'y'|'z'>){}
  inputs(route:Extract<FlightTour,'office-loop'|'hallway'>,sampleTime:number,solverTime:number):[string,number][] {
    if(!Number.isFinite(sampleTime)||sampleTime<0||!Number.isFinite(solverTime)||solverTime<0)
      throw Error('Flight tour requires finite nonnegative times');
    if(route!=='office-loop'&&route!=='hallway')throw Error('Unknown map flight tour');
    this.session.set_inputs(JSON.stringify([['sampleTime',sampleTime],['route',route==='office-loop'?1:2],
      ['origin[1]',this.origin.x],['origin[2]',this.origin.y],['origin[3]',this.origin.z]]));
    this.session.advance_to(solverTime);
    const values=JSON.parse(this.session.state_json()).values;
    const read=(name:string):number=>{
      const value=values?.[name];if(typeof value!=='number'||!Number.isFinite(value))throw Error(`Modelica flight tour must expose finite ${name}`);return value;
    };
    return [['positionMode',1],...(['Position','Velocity','Acceleration'] as const).flatMap((name)=>
      [1,2,3].map((i):[string,number]=>[`target${name}[${i}]`,read(`${name.toLowerCase()}[${i}]`)])),['targetHeading',read('heading')]];
  }
  reset(){this.session.reset();}
  free(){this.session.free();}
}
