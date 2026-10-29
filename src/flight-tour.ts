import type {Environment} from './types';

export const FLIGHT_TOURS=[
  {id:'circuit',label:'Street circuit'},
  {id:'indoor',label:'Outdoor → indoor → outdoor'},
  {id:'office-loop',label:'Office loop'},
  {id:'hallway',label:'Hallway out and back'},
] as const;
export type FlightTour=typeof FLIGHT_TOURS[number]['id'];
export function isFlightTour(value:unknown):value is FlightTour{return FLIGHT_TOURS.some(route=>route.id===value);}
const DEFAULT_TOURS:Record<Environment,FlightTour>={
  city:'circuit',warehouse:'indoor',courtyard:'circuit',tokyo:'circuit','asset-city':'circuit','big-city':'indoor',
  hallway:'hallway','hallway-marked':'hallway','office-loop':'office-loop',
};
export function defaultFlightTour(environment:Environment):FlightTour{return DEFAULT_TOURS[environment];}
export function selectedFlightTour(project:{environment:Environment;flightTour?:FlightTour}):FlightTour{return project.flightTour??defaultFlightTour(project.environment);}
/** A deliberate map change chooses that map's route; manual selection then
 * persists until the next map change. Loading a project retains its override. */
export function selectMapFlightTour(project:{environment:Environment;flightTour?:FlightTour},environment:Environment){
  project.environment=environment;project.flightTour=defaultFlightTour(environment);
}
