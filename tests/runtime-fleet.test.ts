import {expect,it,vi} from 'vitest';
import {Runtime} from '../src/runtime';
import type {LockstepBarrier} from '../src/lockstep-barrier';

// Exercise the fleet coordinator without creating renderers or workers.
const vehicle=(vehicleIndex=0)=>Object.assign(Object.create(Runtime.prototype),{
  fleetStepping:false,stepping:false,time:0,command:{forward:.7,left:0,up:0,yaw:0},
  selectedVehicle:0,autopilot:false,tourMode:'indoor',speed:2,
  world:{truth:{time:0},updateOtherVehicle:vi.fn()},records:[],onFrame:vi.fn(),onVehicleFrame:vi.fn(),vehicleIndex,
});

it('dispatches commands to the selected independent vehicle and publishes paired boundary poses',async()=>{
  const primary=vehicle(),secondary=vehicle();primary.secondary=secondary;primary.selectedVehicle=1;
  const commands:number[]=[],captures:number[][]=[];
  [primary,secondary].forEach((runtime,index)=>{
    runtime.stepVehicle=async(barrier:LockstepBarrier)=>{
      // Mirror the command selection performed by each vehicle pipeline.
      commands[index]=runtime.secondary&&runtime.selectedVehicle===1?0:runtime.command.forward;
      for(const time of [.01,.02]){
        runtime.world.truth={time};await barrier.arrive();
        captures.push([index,runtime.world.truth.time,index?primary.world.truth.time:secondary.world.truth.time]);
        await barrier.arrive();
      }
      runtime.time=.02;
    };
  });
  await primary.step();
  expect(commands).toEqual([0,.7]);
  expect(captures).toEqual([[0,.01,.01],[1,.01,.01],[0,.02,.02],[1,.02,.02]]);
  expect(primary.world.updateOtherVehicle).toHaveBeenCalledTimes(4);
  expect(secondary.world.updateOtherVehicle).toHaveBeenCalledTimes(4);
  expect(secondary.autopilot).toBe(false);expect(secondary.tourMode).toBe('indoor');
  expect(primary.fleetStepping).toBe(false);
});

it('rejects a failed fleet frame and releases its peer waiting at the boundary',async()=>{
  const primary=vehicle(),secondary=vehicle(),error=new Error('Camera failed');primary.secondary=secondary;
  let peerReleased=false;
  primary.stepVehicle=async()=>{await Promise.resolve();throw error;};
  secondary.stepVehicle=async(barrier:LockstepBarrier)=>{
    try{await barrier.arrive();}finally{peerReleased=true;}
  };
  await expect(primary.step()).rejects.toBe(error);
  expect(peerReleased).toBe(true);expect(primary.fleetStepping).toBe(false);
  primary.stepVehicle=vi.fn();secondary.stepVehicle=vi.fn();
  await expect(primary.step()).rejects.toThrow('Recompile after the failed fleet frame');
  expect(primary.stepVehicle).not.toHaveBeenCalled();expect(secondary.stepVehicle).not.toHaveBeenCalled();
});

it('does not commit or publish a completed primary frame when its peer fails',async()=>{
  const primary=vehicle(),secondary=vehicle(1);primary.secondary=secondary;
  const previous={frame:{sequence:2}},pending={frame:{sequence:3}};
  primary.lastFrame=previous;
  primary.stepVehicle=async()=>{primary.pendingFrame=pending;primary.pendingRecord={frame:pending.frame};};
  secondary.stepVehicle=async()=>{await Promise.resolve();throw new Error('Estimator failed');};
  await expect(primary.step()).rejects.toThrow('Estimator failed');
  expect(primary.lastFrame).toBe(previous);expect(secondary.lastFrame).toBeUndefined();
  expect(primary.records).toEqual([]);expect(primary.pendingRecord).toBeUndefined();
  for(const runtime of [primary,secondary]){
    expect(runtime.pendingFrame).toBeUndefined();
    expect(runtime.onFrame).not.toHaveBeenCalled();expect(runtime.onVehicleFrame).not.toHaveBeenCalled();
  }
});

it('commits both completed frames before publishing either and waits for the slower pipeline',async()=>{
  const primary=vehicle(),secondary=vehicle(1);primary.secondary=secondary;
  const first={frame:{sequence:3},estimate:{},truth:{},metrics:{}},second={...first,frame:{sequence:3}};
  let finishSecondary!:()=>void,primaryFinished!:()=>void;
  const completedPrimary=new Promise<void>(resolve=>{primaryFinished=resolve;});
  const delayedSecondary=new Promise<void>(resolve=>{finishSecondary=resolve;});
  primary.stepVehicle=async()=>{primary.pendingFrame=first;primary.time=.1;primaryFinished();};
  secondary.stepVehicle=async()=>{await delayedSecondary;secondary.pendingFrame=second;secondary.time=.1;};
  const publications:number[]=[];
  for(const runtime of [primary,secondary])runtime.onVehicleFrame=vi.fn((index:number)=>{
    expect(primary.lastFrame).toBe(first);expect(secondary.lastFrame).toBe(second);publications.push(index);
  });
  const stepping=primary.step();await completedPrimary;
  expect(primary.lastFrame).toBeUndefined();expect(secondary.lastFrame).toBeUndefined();
  expect(primary.onVehicleFrame).not.toHaveBeenCalled();expect(secondary.onVehicleFrame).not.toHaveBeenCalled();
  finishSecondary();await stepping;
  expect(publications).toEqual([0,1]);
  expect(primary.pendingFrame).toBeUndefined();expect(secondary.pendingFrame).toBeUndefined();
});

it('selection publishes the selected saved frame and clears the previous manual command',()=>{
  const primary=vehicle(),secondary=vehicle();primary.secondary=secondary;
  secondary.lastFrame={frame:{sequence:8},estimate:{confidence:.8},truth:{y:2},metrics:{frames:8}};
  primary.selectVehicle(1);
  expect(primary.activeVehicle).toBe(secondary);expect(primary.world.cameraVehicle).toBe(1);
  expect(primary.command).toEqual({forward:0,left:0,up:0,yaw:0});
  expect(primary.onFrame).toHaveBeenCalledWith(secondary.lastFrame.frame,secondary.lastFrame.estimate,secondary.lastFrame.truth,secondary.lastFrame.metrics);
  expect(primary.getVehicle(0)).toBe(primary);expect(primary.getVehicle(1)).toBe(secondary);
});

it('blocks sensor and graphics changes while only the secondary pipeline is still finishing',async()=>{
  const primary=vehicle(),secondary=vehicle();primary.secondary=secondary;primary.fleetStepping=true;
  expect(()=>primary.setSensorRates()).toThrow('lockstep frame');
  await expect(primary.setGraphicsQuality('low')).rejects.toThrow('lockstep frame');
});
