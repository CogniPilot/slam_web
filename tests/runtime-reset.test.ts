import {expect,it,vi} from 'vitest';
import {Runtime} from '../src/runtime';
import {runtimeProjectKey} from '../src/runtime-project-key';
import {defaultProject} from '../src/project';
import {NATIVE_SLAM_PARAMETERS} from '../src/model-parameters';
import {FrameClock} from '../src/frame-clock';
import {DataFlow} from '../src/data-flow';

function fixture(native=false){
  const project=defaultProject();if(native)project.slamBackend='native';
  const truth={time:0,x:0,y:0,z:1.5,quaternion:[1,0,0,0],accel:[0,0,9.81],gyro:[0,0,0]};
  const world={ready:Promise.resolve(),calibration:{baseline:.05,depthNoiseDisparityPx:.08,depthNoiseReferenceFx:300},
    build:vi.fn(),configureActors:vi.fn(),setDepthCloudEnabled:vi.fn(),setLighting:vi.fn(),update:vi.fn(),setMap:vi.fn(),
    setDepthNoise:vi.fn(),setActorMotion:vi.fn(),setEstimate:vi.fn(),setEnvironmentVisible:vi.fn(),cameraVehicle:1,updateOtherVehicle:vi.fn()};
  const r=Object.assign(Object.create(Runtime.prototype),{
    project:structuredClone(project),world,vehicleIndex:0,stepping:false,resetting:false,fleetStepping:false,playbackEpoch:0,
    running:true,time:9,sequence:42,cameraSequence:43,records:[{old:true}],replay:[{old:true}],reference:{old:true},
    lastFrame:{old:true},pendingFrame:{old:true},pendingRecord:{old:true},imuIntervals:[{old:true}],cameraLidar:true,
    command:{forward:1,left:1,up:1,yaw:1},selectedVehicle:1,frameClock:new FrameClock(),flow:new DataFlow(),
    physics:{call:vi.fn(async()=>structuredClone(truth)),stop:vi.fn()},
    modelicaMath:{call:vi.fn(async()=>({})),stop:vi.fn()},modelicaState:{call:vi.fn(async()=>({})),stop:vi.fn()},
    sampleSensors:vi.fn(async()=>({imu:{accel:[0,0,9.81],gyro:[0,0,0]}})),onStatus:vi.fn(),onInitialFrame:vi.fn(),
  });
  r.flow.record('old');r.compile=vi.fn(()=>{throw Error('Reset must not compile');});
  if(native){
    const estimate={x:0,y:0,z:0,quaternion:[1,0,0,0],points:[],confidence:1};
    r.slamProgram={sourceSha256:'retained',estimate};
    r.slam={reset:vi.fn(async()=>estimate),initialize:vi.fn(),close:vi.fn()};
    r.captureInitialFrame=vi.fn(async()=>{expect(r.time).toBe(0);expect(r.replay).toBeUndefined();return {time:0,sequence:0};});
  }
  return {r,project};
}

it.each([false,true])('reuses prepared programs on repeated reset (native=%s), clears old run and starts deterministic clocks',async native=>{
  const {r,project}=fixture(native);
  for(let i=0;i<2;i++){
    await r.reset(project);
    expect(r.time).toBe(0);expect(r.running).toBe(false);expect(r.busy).toBe(false);
    expect(r.records).toEqual([]);expect(r.replay).toBeUndefined();expect(r.reference).toBeUndefined();
    expect(r.lastFrame).toBeUndefined();expect(r.pendingRecord).toBeUndefined();expect(r.pendingFrame).toBeUndefined();
    expect(r.imuIntervals).toEqual([]);expect(r.cameraLidar).toBe(false);expect(r.flow.stats.size).toBe(0);
    expect(r.command).toEqual({forward:0,left:0,up:0,yaw:0});expect(r.world.cameraVehicle).toBe(0);
    expect(r.sequence).toBe(0);expect(r.cameraSequence).toBe(0);
    const draws=[r.random(),r.random(),r.gpsRandom()];
    if(i===0)r.firstDraws=draws;else expect(draws).toEqual(r.firstDraws);
  }
  expect(r.physics.call.mock.calls.map(([type]:[string])=>type)).toEqual(['reset','reset']);
  expect(r.modelicaMath.call.mock.calls.filter(([type]:[string])=>type==='reset')).toHaveLength(2);
  expect(r.modelicaState.call).toHaveBeenCalledTimes(2);expect(r.compile).not.toHaveBeenCalled();
  expect(r.physics.stop).not.toHaveBeenCalled();expect(r.modelicaState.stop).not.toHaveBeenCalled();
  if(native){expect(r.slam.reset).toHaveBeenCalledTimes(2);expect(r.slam.initialize).not.toHaveBeenCalled();expect(r.slam.close).not.toHaveBeenCalled();}
});

it('requires compilation for source/parameter/backend/profile/topology changes, but not labels, hot tuning or display settings',()=>{
  const {r,project}=fixture();
  for(const change of [
    (p:typeof project)=>{p.physics+='\n// edit';},(p:typeof project)=>{p.algorithm+='\n// edit';},
    (p:typeof project)=>{p.modelicaSources!['models/Libraries/CogniPilot/X.mo']='model X end X;';},
    (p:typeof project)=>{p.modelParameters={LabQuadrotor:{mass:2}};},(p:typeof project)=>{p.slamBackend='native';},
    (p:typeof project)=>{p.cameraResolution='848x480';},(p:typeof project)=>{p.vehicleCount=2;},
    (p:typeof project)=>{p.graph.edges.pop();},
  ]){const changed=structuredClone(project);change(changed);expect(r.canReset(changed)).toBe(false);}
  const options=structuredClone(project);options.name='Renamed';options.environment='office-loop';options.sceneDetail='high';
  options.seed=19;options.sensorRates={imuHz:180,cameraHz:30,gpsHz:5,lidarHz:10};
  options.modelParameters={[NATIVE_SLAM_PARAMETERS]:{loopEnabled:1}};
  options.graph.nodes[0].x+=3;options.graph.nodes[0].title='A label';
  expect(r.canReset(options)).toBe(true);
  const reordered=Object.fromEntries(Object.entries(project).reverse()) as typeof project;
  expect(runtimeProjectKey(reordered)).toBe(runtimeProjectKey(project));
});

it('refuses reset during a frame, and rejects steps/another reset while its worker reset is in flight',async()=>{
  const {r,project}=fixture();r.stepping=true;
  await expect(r.reset(project)).rejects.toThrow('lockstep');expect(r.physics.call).not.toHaveBeenCalled();
  r.stepping=false;let complete!:()=>void;
  r.modelicaState.call=vi.fn(()=>new Promise<void>(resolve=>{complete=resolve;}));
  const pending=r.reset(project);await vi.waitFor(()=>expect(complete).toBeTypeOf('function'));
  expect(r.busy).toBe(true);await expect(r.reset(project)).rejects.toThrow('lockstep');
  await expect(r.step()).rejects.toThrow('reset');expect(()=>r.play()).toThrow('reset');
  complete();await pending;expect(r.busy).toBe(false);
});

it('resets both vehicles without destroying them; a failed peer invalidates the entire fleet',async()=>{
  const {r,project}=fixture(),{r:peer}=fixture();project.vehicleCount=2;r.project=structuredClone(project);
  peer.vehicleIndex=1;peer.project={...structuredClone(project),vehicleCount:1,seed:project.seed^0x44524f4e};r.secondary=peer;
  await r.reset(project);expect(r.secondary).toBe(peer);expect(peer.time).toBe(0);expect(r.canReset(project)).toBe(true);
  peer.physics.call.mockRejectedValueOnce(new Error('Physics worker lost'));
  await expect(r.reset(project)).rejects.toThrow('Physics worker lost');
  expect(r.canReset(project)).toBe(false);expect(peer.project).toBeUndefined();expect(r.busy).toBe(false);
  await expect(r.step()).rejects.toThrow('Compile');
});

it('the UI preparation entry dispatches unchanged Reset to reset, edited Reset to compile, and explicit Apply to compile',async()=>{
  const {r,project}=fixture();r.compile=vi.fn(async()=>{});
  await r.prepare(project,true);expect(r.compile).not.toHaveBeenCalled();
  const changed=structuredClone(project);changed.physics+='\n// new source';
  await r.prepare(changed,true);expect(r.compile).toHaveBeenLastCalledWith(changed);
  await r.prepare(project);expect(r.compile).toHaveBeenLastCalledWith(project);expect(r.compile).toHaveBeenCalledTimes(2);
});
