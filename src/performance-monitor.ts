export interface PerformanceSnapshot {
  timestamp:number;
  windowMs:number;
  targetFps:number;
  fps:number;
  captureHz:number;
  visionHz:number;
  lidarHz:number;
  renderedFrames:number;
  capturedFrames:number;
  visionFrames:number;
  lidarFrames:number;
  meanFrameIntervalMs:number|null;
  p95FrameIntervalMs:number|null;
  meanRenderSubmitMs:number|null;
  /** Main-thread long tasks, when the browser supports that API; not process CPU%. */
  longTasks:{count:number;blockedMs:number}|null;
}

/** Deadline gate for an existing RAF loop. Missed slots are skipped, never replayed. */
export class RenderDeadline {
  readonly intervalMs:number;
  private next:number|undefined;
  constructor(readonly targetFps=30){
    if(!Number.isFinite(targetFps)||targetFps<=0)throw new Error('Display target FPS must be positive');
    this.intervalMs=1000/targetFps;
  }
  reset(){this.next=undefined;}
  due(now:number){
    if(!Number.isFinite(now))return false;
    if(this.next===undefined){this.next=now+this.intervalMs;return true;}
    if(now+1e-6<this.next)return false;
    const missed=Math.max(0,Math.floor((now-this.next)/this.intervalMs+1e-9));
    this.next+=(missed+1)*this.intervalMs;return true;
  }
}

/** Event counters use elapsed wall time and retain at most 240 interval samples. */
export class PerformanceCounters {
  private since:number;
  private renders=0;
  private captures=0;
  private vision=0;
  private lidar=0;
  private renderSubmit=0;
  private lastRender:number|undefined;
  private intervals:number[]=[];
  private intervalSum=0;
  private intervalCount=0;
  private longCount=0;
  private longMs=0;
  constructor(readonly targetFps=30,now=0,private readonly longTasksSupported=false){this.since=now;}
  rendered(now:number,submitMs=0){
    this.renders++;this.renderSubmit+=Number.isFinite(submitMs)?Math.max(0,submitMs):0;
    if(this.lastRender!==undefined&&now>=this.lastRender){
      const gap=now-this.lastRender;this.intervalSum+=gap;this.intervalCount++;
      if(this.intervals.length===240)this.intervals.shift();this.intervals.push(gap);
    }
    this.lastRender=now;
  }
  captured(){this.captures++;}
  visionProcessed(){this.vision++;}
  lidarCaptured(){this.lidar++;}
  longTask(start:number,duration:number){
    if(!this.longTasksSupported||!Number.isFinite(start)||!Number.isFinite(duration)||duration<=0)return;
    const included=Math.max(0,start+duration-Math.max(start,this.since));
    if(included>0){this.longCount++;this.longMs+=included;}
  }
  reset(now:number){this.since=now;this.lastRender=undefined;this.clear();}
  private clear(){this.renders=this.captures=this.vision=this.lidar=0;this.renderSubmit=0;this.intervals=[];this.intervalSum=this.intervalCount=0;this.longCount=this.longMs=0;}
  take(now:number):PerformanceSnapshot {
    const elapsed=Math.max(0,now-this.since),seconds=elapsed/1000,sorted=this.intervals.slice().sort((a,b)=>a-b);
    const snapshot:PerformanceSnapshot={timestamp:now,windowMs:elapsed,targetFps:this.targetFps,
      fps:seconds>0?this.renders/seconds:0,captureHz:seconds>0?this.captures/seconds:0,visionHz:seconds>0?this.vision/seconds:0,lidarHz:seconds>0?this.lidar/seconds:0,
      renderedFrames:this.renders,capturedFrames:this.captures,visionFrames:this.vision,lidarFrames:this.lidar,
      meanFrameIntervalMs:this.intervalCount?this.intervalSum/this.intervalCount:null,
      p95FrameIntervalMs:sorted.length?sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)]:null,
      meanRenderSubmitMs:this.renders?this.renderSubmit/this.renders:null,
      longTasks:this.longTasksSupported?{count:this.longCount,blockedMs:Math.min(elapsed,this.longMs)}:null};
    this.since=now;this.clear();return snapshot;
  }
}

interface VisibilitySource {
  readonly visibilityState:string;
  addEventListener(type:string,callback:()=>void):void;
  removeEventListener(type:string,callback:()=>void):void;
}
export interface PerformanceMonitorOptions {
  targetFps?:number;
  /** UI callbacks are never scheduled more often than once per second. */
  intervalMs?:number;
  onUpdate:(snapshot:PerformanceSnapshot)=>void;
  document?:VisibilitySource;
  now?:()=>number;
  observeLongTasks?:boolean;
}

/** No RAF/polling loop: count real events, report once per second, suspend hidden. */
export class BrowserPerformanceMonitor {
  private readonly deadline:RenderDeadline;
  private readonly counters:PerformanceCounters;
  private readonly now:()=>number;
  private readonly visibility?:VisibilitySource;
  private readonly interval:number;
  private timer:ReturnType<typeof setTimeout>|undefined;
  private observer:PerformanceObserver|undefined;
  private visible=true;
  private disposed=false;
  private latestSnapshot:PerformanceSnapshot|undefined;
  constructor(private readonly options:PerformanceMonitorOptions){
    this.now=options.now??(()=>performance.now());this.deadline=new RenderDeadline(options.targetFps??30);
    this.interval=Math.max(1000,options.intervalMs??1000);
    if(!Number.isFinite(this.interval))throw new Error('Performance update interval must be finite');
    this.visibility=options.document??(typeof document==='undefined'?undefined:document);
    const supports=options.observeLongTasks!==false&&typeof PerformanceObserver!=='undefined'&&PerformanceObserver.supportedEntryTypes.includes('longtask');
    this.counters=new PerformanceCounters(this.deadline.targetFps,this.now(),supports);
    if(supports)this.observer=new PerformanceObserver(list=>{if(this.visible&&!this.disposed)for(const entry of list.getEntries())this.counters.longTask(entry.startTime,entry.duration);});
    this.visibility?.addEventListener('visibilitychange',this.visibilityChanged);
    this.visibilityChanged();
  }
  private visibilityChanged=()=>{
    this.visible=this.visibility?.visibilityState!=='hidden';this.deadline.reset();this.counters.reset(this.now());
    if(this.timer!==undefined)clearTimeout(this.timer);this.timer=undefined;this.observer?.disconnect();
    if(this.visible&&!this.disposed){this.observer?.observe({type:'longtask',buffered:false});this.schedule();}
  };
  private schedule(){
    this.timer=setTimeout(()=>{
      this.timer=undefined;if(this.disposed||!this.visible)return;
      const snapshot=this.counters.take(this.now());this.latestSnapshot=snapshot;
      try{this.options.onUpdate(snapshot);}finally{if(!this.disposed&&this.visible)this.schedule();}
    },this.interval);
  }
  shouldRender(now=this.now()){return !this.disposed&&this.visible&&this.deadline.due(now);}
  rendered(submitMs=0){if(!this.disposed&&this.visible)this.counters.rendered(this.now(),submitMs);}
  captured(){if(!this.disposed&&this.visible)this.counters.captured();}
  visionProcessed(){if(!this.disposed&&this.visible)this.counters.visionProcessed();}
  lidarCaptured(){if(!this.disposed&&this.visible)this.counters.lidarCaptured();}
  get latest(){return this.latestSnapshot;}
  get targetFps(){return this.deadline.targetFps;}
  dispose(){
    if(this.disposed)return;this.disposed=true;if(this.timer!==undefined)clearTimeout(this.timer);this.timer=undefined;
    this.observer?.disconnect();this.visibility?.removeEventListener('visibilitychange',this.visibilityChanged);
  }
}
