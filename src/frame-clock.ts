/**
 * Wall-clock pacing of completed lockstep frames. The cumulative sim/wall
 * rate since Run includes time with the page hidden; the trailing window here
 * shows the current pace instead. The interval since the previous frame
 * splits into the real-time pacing wait, the frame's node work and the rest.
 */
export class FrameClock {
  private samples:{wall:number;time:number}[]=[];
  stepMs=0;
  intervalMs=0;
  /** Time the play loop slept before this frame to hold the selected speed. */
  pacedMs=0;
  constructor(readonly windowMs=10000){}
  reset(){this.samples=[];this.stepMs=0;this.intervalMs=0;this.pacedMs=0;}
  /** Records one completed frame: its wall start and end, its sim time and the pacing wait before it. */
  record(started:number,finished:number,time:number,pacedMs=0){
    const last=this.samples.at(-1);
    this.stepMs=finished-started;
    this.intervalMs=last?finished-last.wall:this.stepMs;
    this.pacedMs=last?Math.min(pacedMs,this.intervalMs):0;
    this.samples.push({wall:finished,time});
    while(this.samples.length>2&&finished-this.samples[1].wall>=this.windowMs)this.samples.shift();
  }
  /** Frame wall time outside the pacing wait and the given node work, never negative. */
  otherMs(workMs:number):number{return Math.max(0,this.intervalMs-this.pacedMs-workMs);}
  /** Sim seconds per wall second over the trailing window, once two frames exist. */
  get recentRate():number|undefined{
    const first=this.samples[0],last=this.samples.at(-1);
    if(!first||!last||last.wall<=first.wall)return undefined;
    return (last.time-first.time)/((last.wall-first.wall)/1000);
  }
}
