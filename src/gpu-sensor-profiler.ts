import * as THREE from 'three';
import type {World} from './world';

export interface GpuSensorEvent {
  kind:string;apiWallMs:number;gpuMs:number|null;bytes?:number;drawCalls?:number;triangles?:number;
  waitMs?:number;polls?:number;
}
export interface GpuSensorProfile {
  timerSupported:boolean;disjoint:boolean|null;elapsedMs:number;events:GpuSensorEvent[];
}

/** Opt-in diagnostics only. GPU queries cover rendering and PBO writes;
 * host-copy wall time is recorded separately and includes blocking waits. */
export class GpuSensorProfiler {
  private readonly gl:WebGL2RenderingContext;
  private readonly timer:any;
  private readonly records:(GpuSensorEvent&{query?:WebGLQuery})[]=[];
  private readonly restorers:(()=>void)[]=[];
  private readonly started=performance.now();
  constructor(world:World,options:{gpuTimers?:boolean}={}){
    const renderer=world.renderer,gl=renderer.getContext() as WebGL2RenderingContext;
    this.gl=gl;this.timer=options.gpuTimers===false?null:gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const render=renderer.render;
    renderer.render=(scene,camera)=>{
      const kind=scene===world.scene?(world.scene.overrideMaterial?(camera.parent instanceof THREE.CubeCamera?'lidar-face':'axial-depth'):'rgb'):'fullscreen';
      this.measure(kind,()=>render.call(renderer,scene,camera),()=>({drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles}));
    };
    this.restorers.push(()=>{renderer.render=render;});
    const readPixels=gl.readPixels;
    gl.readPixels=((...args:Parameters<typeof gl.readPixels>)=>{
      this.measure('pbo-write',()=>readPixels.apply(gl,args),()=>({bytes:args[2]*args[3]*4*(args[5]===gl.FLOAT?4:1)}));
    }) as typeof gl.readPixels;
    this.restorers.push(()=>{gl.readPixels=readPixels;});
    const copy=gl.getBufferSubData;
    gl.getBufferSubData=(...args)=>{
      const started=performance.now();
      try{return copy.apply(gl,args);}finally{
        this.records.push({kind:'host-copy',apiWallMs:performance.now()-started,gpuMs:null,bytes:args[2].byteLength});
      }
    };
    this.restorers.push(()=>{gl.getBufferSubData=copy;});
    const fences=new Map<WebGLSync,{started:number;polls:number;apiWallMs:number}>();
    const fenceSync=gl.fenceSync,clientWaitSync=gl.clientWaitSync,deleteSync=gl.deleteSync;
    gl.fenceSync=(...args)=>{
      const fence=fenceSync.apply(gl,args);
      if(fence)fences.set(fence,{started:performance.now(),polls:0,apiWallMs:0});
      return fence;
    };
    gl.clientWaitSync=(...args)=>{
      const started=performance.now(),status=clientWaitSync.apply(gl,args),fence=fences.get(args[0]);
      if(fence){
        fence.polls++;fence.apiWallMs+=performance.now()-started;
        if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED){
          this.records.push({kind:'fence-wait',apiWallMs:fence.apiWallMs,gpuMs:null,
            waitMs:performance.now()-fence.started,polls:fence.polls});
          fences.delete(args[0]);
        }
      }
      return status;
    };
    gl.deleteSync=fence=>{if(fence)fences.delete(fence);deleteSync.call(gl,fence);};
    this.restorers.push(()=>{gl.fenceSync=fenceSync;gl.clientWaitSync=clientWaitSync;gl.deleteSync=deleteSync;});
    const skeletons=new Set<THREE.Skeleton>();
    world.actors.group.traverse(object=>{if(object instanceof THREE.SkinnedMesh)skeletons.add(object.skeleton);});
    for(const skeleton of skeletons){
      const update=skeleton.update;
      skeleton.update=()=>{
        const started=performance.now();
        try{return update.call(skeleton);}finally{this.records.push({kind:'skeleton-update',apiWallMs:performance.now()-started,gpuMs:null});}
      };
      this.restorers.push(()=>{skeleton.update=update;});
    }
  }
  private measure<T>(kind:string,run:()=>T,detail:()=>Partial<GpuSensorEvent>):T{
    const query=this.timer?this.gl.createQuery():null,started=performance.now();
    if(query)this.gl.beginQuery(this.timer.TIME_ELAPSED_EXT,query);
    try{return run();}finally{
      if(query)this.gl.endQuery(this.timer.TIME_ELAPSED_EXT);
      this.records.push({kind,apiWallMs:performance.now()-started,gpuMs:null,...detail(),...(query?{query}:{})});
    }
  }
  async finish():Promise<GpuSensorProfile>{
    this.restore();const gl=this.gl,deadline=performance.now()+2000;
    while(this.records.some(record=>record.query&&!gl.getQueryParameter(record.query,gl.QUERY_RESULT_AVAILABLE))&&performance.now()<deadline)
      await new Promise(resolve=>setTimeout(resolve,1));
    const disjoint=this.timer?!!gl.getParameter(this.timer.GPU_DISJOINT_EXT):null;
    const events=this.records.map(({query,...event})=>{
      const available=query&&gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE);
      if(available&&!disjoint)event.gpuMs=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;
      if(query)gl.deleteQuery(query);return event;
    });
    this.records.length=0;
    return {timerSupported:!!this.timer,disjoint,elapsedMs:performance.now()-this.started,events};
  }
  restore(){for(const restore of this.restorers.splice(0))restore();}
  dispose(){this.restore();for(const record of this.records)if(record.query)this.gl.deleteQuery(record.query);this.records.length=0;}
}
