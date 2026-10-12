export interface SimulationControl {
  pause():void;
  busy():boolean;
  revision():unknown;
  prepare():Promise<void>;
  step():Promise<void>;
  status():unknown;
}

/** Advance complete lockstep frames; cancellation never interrupts a physics step. */
export async function runAssistantSimulation(control:SimulationControl,frames:number,signal:AbortSignal,budgetMs=15_000){
  if(!Number.isInteger(frames)||frames<1||frames>30)throw new Error('Use 1 to 30 simulation frames.');
  const started=performance.now(),revision=control.revision();
  const check=()=>{
    signal.throwIfAborted();
    if(control.revision()!==revision)throw new Error('Project changed during simulation. Start a new request.');
  };
  control.pause();
  try{
    check();
    while(control.busy()){
      check();if(performance.now()-started>=budgetMs)throw new Error('Simulation is busy. Retry after the current operation finishes.');
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    await control.prepare();check();
    let completed=0;
    while(completed<frames&&performance.now()-started<budgetMs){
      check();await control.step();completed++;check();
    }
    return {requestedFrames:frames,completedFrames:completed,stoppedReason:completed===frames?'frame limit':'wall time budget',wallMs:performance.now()-started,simulation:control.status()};
  }finally{control.pause();}
}
