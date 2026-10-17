/**
 * Wall-clock pacing of completed lockstep frames. The cumulative sim/wall
 * rate since Run includes time with the page hidden; the trailing window here
 * shows the current pace instead, and the interval since the previous frame
 * exposes time spent outside the measured graph nodes.
 */
export class FrameClock {
  private samples:{wall:number;time:number}[]=[];
  stepMs=0;
  intervalMs=0;
  constructor(readonly windowMs=10000){}
  reset(){this.samples=[];this.stepMs=0;this.intervalMs=0;}
  /** Records one completed frame: its wall start and end and its sim time. */
  record(started:number,finished:number,time:number){
    const last=this.samples.at(-1);
    this.stepMs=finished-started;
    this.intervalMs=last?finished-last.wall:this.stepMs;
    this.samples.push({wall:finished,time});
    while(this.samples.length>2&&finished-this.samples[1].wall>=this.windowMs)this.samples.shift();
  }
  /** Sim seconds per wall second over the trailing window, once two frames exist. */
  get recentRate():number|undefined{
    const first=this.samples[0],last=this.samples.at(-1);
    if(!first||!last||last.wall<=first.wall)return undefined;
    return (last.time-first.time)/((last.wall-first.wall)/1000);
  }
}
