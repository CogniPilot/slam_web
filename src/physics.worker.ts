/// <reference lib="webworker" />
import {isFlightTour} from './flight-tour';
import {MAP_FLIGHT_TOUR_PATH,MAP_TOUR_INPUTS,ModelicaFlightTour,mapFlightTourSources} from './modelica-flight-tour';
import {compilerAsset} from './compiler-assets';
import type { WasmSimulationSession } from '@cognipilot/rumoca';
import {readPhysicsSnapshot} from './physics-snapshot';
import {configuredModelicaSession} from './modelica-session-parameters';
let module: typeof import('@cognipilot/rumoca');
let session: WasmSimulationSession | undefined;
let tour:ModelicaFlightTour|undefined;
let tourSource='';
let tourOrigin={x:0,y:0,z:1.5};
let supportsMapTour=false;
let mapWasActive=false;
let mapBaseline:[string,number][]=[];
async function execute(message: any) {
  if (message.type === 'init') {
    module ??= await import(/* @vite-ignore */ compilerAsset(message.base,'js'));
    await module.default({ module_or_path: compilerAsset(message.base,'wasm') });
    const workspace={...mapFlightTourSources,...message.workspaceSources};
    const nextTourSource=workspace[MAP_FLIGHT_TOUR_PATH];delete workspace[MAP_FLIGHT_TOUR_PATH];
    if(typeof nextTourSource!=='string')throw Error('Map flight tour source is missing');
    const loaded=JSON.parse(module.sync_workspace_sources(JSON.stringify(workspace)));
    if(loaded.error_count)throw new Error('Rumoca could not load the flight library: '+loaded.skipped_files.join(', '));
    // This is the adaptive solver's initial step hint, not the sensor clock or
    // a fixed integration step. Keep its error tolerances unchanged.
    const candidate = configuredModelicaSession(module,message.source, message.modelName??'LabQuadrotor', 0.01, 'rk-like', 1e-8, 1e-6, '[["forward",0],["left",0],["up",0],["yaw",0]]',message.parameters,message.workspaceSources);
    // Validate the teaching model's interface before replacing the current session.
    let initial,hasMapInputs=false;
    try {
      initial=readPhysicsSnapshot(candidate,true);
      const inputs:unknown=JSON.parse(candidate.input_names());
      if(!Array.isArray(inputs)||!inputs.every(name=>typeof name==='string'))throw Error('Invalid physics input names');
      hasMapInputs=MAP_TOUR_INPUTS.every(name=>inputs.includes(name));
    }catch(error){candidate.free();throw error;}
    supportsMapTour=hasMapInputs;
    tour?.free();tour=undefined;mapWasActive=false;mapBaseline=[];tourSource=nextTourSource;tourOrigin={x:initial.x,y:initial.y,z:initial.z};
    session?.free(); session = candidate;
    return initial;
  } else if (message.type === 'step') {
    if (!session) throw new Error('Physics has not been compiled');
    const route=message.tourMode??(message.indoorTour?'indoor':'circuit');
    if(!isFlightTour(route))throw Error('Unknown flight tour route');
    const mapped=message.autopilot&&(route==='office-loop'||route==='hallway');
    if(mapped&&!supportsMapTour)throw Error('This physics model has no map trajectory inputs. Load the current default physics model or choose a legacy tour.');
    if(mapped&&!mapWasActive){
      mapBaseline=MAP_TOUR_INPUTS.map(name=>{const value=session!.get(name);if(typeof value!=='number'||!Number.isFinite(value))throw Error('Map trajectory input is unavailable: '+name);return [name,value];});
    }
    if(mapped&&!tour)tour=new ModelicaFlightTour(configuredModelicaSession(module,tourSource,'MapFlightTour',.01,'rk-like',1e-12,1e-12,'[]'),tourOrigin);
    const reference=mapped?tour!.inputs(route as 'office-loop'|'hallway',message.commandTime,message.time):mapWasActive?mapBaseline:[];
    session.set_inputs(JSON.stringify([...Object.entries(message.command),['autopilot',message.autopilot?1:0],['indoorTour',route==='indoor'?1:0],['commandTime',message.commandTime],...reference]));
    session.advance_to(message.time);mapWasActive=!!mapped;
  } else if (message.type === 'reset') { session?.reset();tour?.reset();mapWasActive=false;mapBaseline=[]; }
  if (!session) throw new Error('No physics session');
  if (message.type === 'executionReceipt') {
    const diagnostic=session as WasmSimulationSession&{execution_receipt_json?:()=>string};
    if(typeof diagnostic.execution_receipt_json!=='function')
      throw new Error('Installed Rumoca does not expose execution receipts');
    return {compiler:{version:module.get_version(),revision:module.get_git_commit()},
      execution:JSON.parse(diagnostic.execution_receipt_json())};
  }
  return readPhysicsSnapshot(session,true);
}
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try { self.postMessage({ id: data.id, result: await execute(data) }); }
    catch (error) { self.postMessage({ id: data.id, error: String(error) }); }
  });
};
