// Scene table for capture-environment-scale.mjs. Each entry changes only the
// Modelica mission references and the rendered environment; controller,
// rigid-body, motor and sensor models stay those of the template capture.
import {hallwayPhysics} from './hallway-benchmark-physics.mjs';
import {officeLoopPhysics} from './office-loop-physics.mjs';

export const CAPTURE_CAMERA_HZ=5;
const scene=entry=>Object.freeze({...entry,frames:entry.durationSeconds*CAPTURE_CAMERA_HZ+1});
export const CAPTURE_SCENES=Object.freeze({
  hallway:scene({environment:'hallway',name:'Ten-minute hallway return',durationSeconds:600,
    physics:hallwayPhysics,physicsModule:'hallway-benchmark-physics.mjs',profile:'models/Benchmarks/HallwayProfile.mo',
    defaultUrl:'http://127.0.0.1:4198/',
    scope:'Hallway out-and-back reference (600s); capture may request a shorter diagnostic prefix.'}),
  'office-loop':scene({environment:'office-loop',name:'Office loop · four connected corridors',durationSeconds:250,
    physics:officeLoopPhysics,physicsModule:'office-loop-physics.mjs',profile:'models/Benchmarks/OfficeLoopProfile.mo',
    // No default server: the capture must name the preview built with the office environment.
    defaultUrl:undefined,
    scope:'Office closed-loop reference (250s, 24 m x 16 m rectangle, four 90-degree corners, returns to start); capture may request a shorter diagnostic prefix.'}),
});

export function captureScene(name){
  if(!Object.hasOwn(CAPTURE_SCENES,name))throw Error('Unknown capture scene: '+name);
  return CAPTURE_SCENES[name];
}
