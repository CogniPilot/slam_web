import type {World} from './world';
import type {BufferAttribute} from 'three';
import {packTrajectories,type TrajectoryPath} from './trajectory';
import type {Environment,SceneDetail,Truth,Estimate,Pose} from './types';
import type {PerformanceSnapshot} from './performance-monitor';
import type {ActorMotionFrame} from './modelica-actor-motion';
import type {DepthCloudDisplay} from './depth-cloud-raster';
import {ViewerCloudTransfer} from './viewer-cloud-transfer';

/** Dedicated rendering context: the camera renderer never blocks its JS loop.
 * Scene poses come exclusively from committed simulation states. Controls stay
 * on the UI thread; only camera transforms cross to the worker.
 */
export class WorkerViewer {
  readonly ready:Promise<void>;
  readonly canvas=document.createElement('canvas');
  readonly worker=new Worker(new URL('./viewer.worker.ts',import.meta.url),{type:'module'});
  graphics?:World['graphics'];
  latest?:PerformanceSnapshot;
  onPerformance:(snapshot:PerformanceSnapshot)=>void=()=>{};
  private requests=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>();
  private sequence=0;
  private previousCamera='';
  private previousRunning?:boolean;
  private previousMapAttribute?:unknown;
  private previousMapVersion=-1;
  readonly cloudTransfer=new ViewerCloudTransfer();
  private previousDepthCloudEnabled?:boolean;
  constructor(private readonly world:World,container:HTMLElement){
    this.canvas.style.width='100%';this.canvas.style.height='100%';
    const offscreen=this.canvas.transferControlToOffscreen();
    this.worker.onmessage=({data})=>{
      if(data.type==='performance'){this.latest=data.snapshot;this.onPerformance(data.snapshot);return;}
      const request=this.requests.get(data.id);if(request){this.requests.delete(data.id);data.error?request.reject(new Error(data.error)):request.resolve(data.result);}
    };
    this.worker.onerror=error=>{for(const pending of this.requests.values())pending.reject(new Error(error.message));this.requests.clear();};
    this.ready=this.call('init',{canvas:offscreen,width:container.clientWidth,height:container.clientHeight,pixelRatio:Math.min(devicePixelRatio,2),base:new URL(import.meta.env.BASE_URL,document.baseURI).href},[offscreen]).then(value=>{
      this.graphics=value.graphics;world.renderer.domElement.remove();container.appendChild(this.canvas);
      world.controls.disconnect();world.controls.connect(this.canvas);this.camera();
    });
    new ResizeObserver(()=>this.send('resize',{width:container.clientWidth,height:container.clientHeight})).observe(container);
    document.addEventListener('visibilitychange',()=>this.send('visibility',{visible:!document.hidden}));
    this.send('visibility',{visible:!document.hidden});
  }
  private call(type:string,args:Record<string,unknown>,transfer:Transferable[]=[]):Promise<any>{
    const id=++this.sequence;return new Promise((resolve,reject)=>{this.requests.set(id,{resolve,reject});this.worker.postMessage({id,type,...args},transfer);});
  }
  private send(type:string,args:Record<string,unknown>={}){this.worker.postMessage({type,...args});}
  async configure(environment:Environment,detail:SceneDetail,cars:boolean,people:boolean,preservePresentation=false){if(!preservePresentation)this.cloudTransfer.reset();await this.ready;await this.call('configure',{environment,detail,carsEnabled:cars,peopleEnabled:people,preservePresentation});this.camera(true);}
  camera(force=false){this.world.controls.update();const position=this.world.view.position.toArray(),quaternion=this.world.view.quaternion.toArray(),key=JSON.stringify([position,quaternion]);if(force||key!==this.previousCamera){this.previousCamera=key;this.send('camera',{position,quaternion});}}
  pose(truth:Truth){this.send('pose',{truth});}
  running(running:boolean){if(running!==this.previousRunning){this.previousRunning=running;this.send('running',{running});}}
  actors(cars:boolean,people:boolean){this.send('actors',{cars,people});}
  actorMotion(frame:ActorMotionFrame){this.send('actor-motion',{frame});}
  diagnostics(estimate:Estimate,origin:Pose|undefined,paths:TrajectoryPath[],flags:{uncertainty:boolean;graph:boolean;showMap:boolean;showPaths:boolean}){
    const attribute=this.world.points.geometry.getAttribute('position') as BufferAttribute|undefined;
    const changed=attribute!==this.previousMapAttribute||(attribute?.version??0)!==this.previousMapVersion;
    this.previousMapAttribute=attribute;this.previousMapVersion=attribute?.version??0;
    const map=changed?(attribute?.array as Float32Array|undefined)?.slice()??new Float32Array():undefined;
    const trajectories=packTrajectories(paths);
    this.worker.postMessage({type:'diagnostics',estimate:{...estimate,points:[],features:[]},origin,map,trajectories,...flags},[...(map?[map.buffer]:[]),...trajectories.map(path=>path.positions.buffer)]);
  }
  visibility(flags:{uncertainty:boolean;graph:boolean;showMap:boolean;showPaths:boolean}){this.send('flags',flags);}
  sceneVisible(visible:boolean){this.send('scene-visible',{visible});}
  lighting(mode:'day'|'night'|'cycle'){this.send('lighting',{mode});}
  lidar(scan:World['latestLidar']){
    if(scan)this.cloudTransfer.lidar(scan,()=>({position:this.world.lidarView.position.toArray(),quaternion:this.world.lidarView.quaternion.toArray()}));
  }
  depthCloud(cloud:DepthCloudDisplay){this.cloudTransfer.cloud(cloud);}
  depthCloudEnabled(enabled:boolean){if(enabled!==this.previousDepthCloudEnabled){this.previousDepthCloudEnabled=enabled;if(!enabled)this.cloudTransfer.clearCloud();this.send('depth-cloud-enabled',{enabled});}}
  /** Presentation publishes only the latest cloud at the 30 Hz UI deadline.
   * Every sensor frame is still processed by the lockstep simulation. */
  flushClouds(){
    const batch=this.cloudTransfer.take();
    if(batch)void this.call('sensor-clouds',{...batch},[batch.buffer]).then(
      result=>this.cloudTransfer.complete(result.released),
      error=>{this.cloudTransfer.complete();console.error('Viewer cloud handoff failed',error);}
    );
  }
}
