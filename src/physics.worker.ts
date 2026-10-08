/// <reference lib="webworker" />
import type { WasmSimulationSession } from '@cognipilot/rumoca';
import {readPhysicsSnapshot} from './physics-snapshot';
let module: typeof import('@cognipilot/rumoca');
let session: WasmSimulationSession | undefined;
async function execute(message: any) {
  if (message.type === 'init') {
    module ??= await import(/* @vite-ignore */ `${message.base}vendor/rumoca/rumoca_bind_wasm.js`);
    await module.default({ module_or_path: `${message.base}vendor/rumoca/rumoca_bind_wasm_bg.wasm` });
    const loaded=JSON.parse(module.sync_workspace_sources(JSON.stringify(message.workspaceSources??{})));
    if(loaded.error_count)throw new Error('Rumoca could not load the flight library: '+loaded.skipped_files.join(', '));
    const candidate = module.WasmSimulationSession.withInteractiveOptions(message.source, 'LabQuadrotor', 0.005, 'rk-like', 1e-8, 1e-6, '[["forward",0],["left",0],["up",0],["yaw",0]]');
    // Validate the teaching model's interface before replacing the current session.
    let initial;
    try {initial=readPhysicsSnapshot(candidate,true);} catch(error){candidate.free();throw error;}
    session?.free(); session = candidate;
    return initial;
  } else if (message.type === 'step') {
    if (!session) throw new Error('Physics has not been compiled');
    session.set_inputs(JSON.stringify([...Object.entries(message.command),['autopilot',message.autopilot?1:0],['indoorTour',message.indoorTour?1:0],['commandTime',message.commandTime]]));
    session.advance_to(message.time);
  } else if (message.type === 'reset') { session?.reset(); }
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
