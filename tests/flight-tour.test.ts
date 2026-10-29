import {expect,it} from 'vitest';
import {defaultFlightTour,selectedFlightTour,selectMapFlightTour,FLIGHT_TOURS} from '../src/flight-tour';
import {defaultProject,parseProject,withDefaultModels} from '../src/project';
import {Runtime} from '../src/runtime';

it('chooses a route for every map, using the office loop and both hallway variants explicitly',()=>{
  const expected={city:'circuit',warehouse:'indoor',courtyard:'circuit',tokyo:'circuit','asset-city':'circuit','big-city':'indoor',hallway:'hallway','hallway-marked':'hallway','office-loop':'office-loop'} as const;
  for(const [map,route] of Object.entries(expected))expect(defaultFlightTour(map as keyof typeof expected)).toBe(route);
  expect(FLIGHT_TOURS.map(route=>route.id)).toEqual(['circuit','indoor','office-loop','hallway']);
});

it('a map change selects its default; a saved manual override survives load and Reset/default-model recovery until another map change',()=>{
  const p=defaultProject();selectMapFlightTour(p,'office-loop');expect(selectedFlightTour(p)).toBe('office-loop');
  p.flightTour='indoor';const loaded=parseProject(JSON.stringify(p));
  expect(selectedFlightTour(loaded)).toBe('indoor');expect(selectedFlightTour(withDefaultModels(loaded))).toBe('indoor');
  selectMapFlightTour(loaded,'hallway-marked');expect(selectedFlightTour(loaded)).toBe('hallway');
  expect(selectedFlightTour({...defaultProject(),environment:'office-loop'})).toBe('office-loop');
  expect(()=>parseProject(JSON.stringify({...p,flightTour:'typo'}))).toThrow('flight tour');
});

it('hot route selection updates both runtime snapshots so replay/reset does not restore an old override',()=>{
  const peer=Object.assign(Object.create(Runtime.prototype),{project:defaultProject()});
  const r=Object.assign(Object.create(Runtime.prototype),{project:defaultProject(),secondary:peer});
  r.setFlightTour('office-loop');expect(r.tourMode).toBe('office-loop');expect(peer.tourMode).toBe('office-loop');
  expect(r.project.flightTour).toBe('office-loop');expect(peer.project.flightTour).toBe('office-loop');
});
