import {DataFlow} from './data-flow';
import { WorkerRpc } from './rpc';
import { ports,portTopic,validateGraph,type PortType } from './graph';
import {seededRandom,recordedCameraFrame} from './packet';
import { World } from './world';
import {defaultSensorModelica,defaultEvaluationModelica,withActorMotion,type Project} from './project';
import type {ActorMotionFrame} from './modelica-actor-motion';
import type { Command,Estimate,Pose,RunRecord,SensorFrame,Truth,SceneDetail } from './types';
import {validatePose} from './evaluation';
import type {EvaluationResult} from './modelica-runtime-math';
import type {InertialSessionMetadata} from './modelica-inertial-session';
import type {GpsSample} from './world-navigation';
import {SensorClock,sensorRates,validateSensorRates,type SensorRates} from './sensor-clock';
export interface Metrics { time:number; ate:number|null; currentError:number|null; orientationError:number|null; confidence:number; points:number; features:number; rtf:number; frames:number; loops:number; dropped:number }
export interface FlowTiming {totalMs:number;bufferBytes:number|null}
export class Runtime {
  readonly flow=new DataFlow();
  private physics=new WorkerRpc(new Worker(new URL('./physics.worker.ts',import.meta.url),{type:'module'}));
  readonly pendingNodes=new Map<string,string>();
  private modelicaState?:WorkerRpc;
  private modelicaMath?:WorkerRpc;
  private project?:Project;
  private order:ReturnType<typeof validateGraph>=[];
  private random=seededRandom(7);
  private gpsRandom=seededRandom(9);
  gps:GpsSample|null=null;
  tourMode:'circuit'|'indoor'='circuit';
  private sequence=0;
  private stepping=false;
  private reference?:{truth:Truth;pose:Pose};
  private origin:Pose={x:0,y:0,z:1.5,quaternion:[1,0,0,0]};
  private startWall=0;
  private startTime=0;
  private sensorClock=new SensorClock(sensorRates({}));
  private heldImu:SensorFrame['imu']={accel:[0,0,9.80665],gyro:[0,0,0]};
  private cameraLidar=false;
  private imuIntervals:NonNullable<SensorFrame['imuIntervals']>=[];
  private replay?:RunRecord[];
  private externalStep=false;
  records:RunRecord[]=[];
  recording=false;
  running=false;
  speed=1;
  dt=1/90;
  time=0;
  lastTimings:Record<string,number>={};
  lastWorkerTimings:Record<string,Record<string,number>>={};
  lastTransportTimings:Record<string,FlowTiming>={};
  command:Command={forward:0,left:0,up:0,yaw:0};
  autopilot=true;
  onFrame:(frame:SensorFrame,estimate:Estimate,truth:Truth|undefined,metrics:Metrics)=>void=()=>{};
  onError:(error:Error)=>void=()=>{};
  onStatus:(status:string)=>void=()=>{};
  onSensor:()=>void=()=>{};
  onLidar:()=>void=()=>{};
  constructor(readonly world:World) {}
  async setGraphicsQuality(detail:SceneDetail) {
    if(this.running||this.stepping)throw new Error('Pause and finish the current lockstep frame before changing graphics quality');
    await this.world.setGraphicsQuality(detail);
    if(this.project)this.project.sceneDetail=detail;
    this.resetSensorClock();
  }
  setSensorRates(rates?:SensorRates){
    if(this.running||this.stepping)throw new Error('Pause and finish the current lockstep frame before changing sensor rates');
    if(rates)validateSensorRates(rates);
    if(this.project){if(rates)this.project.sensorRates=structuredClone(rates);else delete this.project.sensorRates;}
    this.resetSensorClock(rates);
  }
  private resetSensorClock(rates?:SensorRates){
    const configuration=rates??sensorRates(this.project??{});
    this.sensorClock=new SensorClock(configuration,this.time);this.dt=1/configuration.cameraHz;
  }
  async compile(project:Project) {
    this.pause();
    if(this.stepping) throw new Error('Wait for the current lockstep frame to finish');
    const order=validateGraph(project.graph);
    if(!/\bmodel\s+ModelicaInertial\b/.test(project.algorithm))throw new Error('Full Modelica RGB-D / inertial SLAM integration is pending. The separately labeled Modelica inertial propagation preset can run physics and camera experiments; it has no visual localization, map or loop closure.');
    if(order.some(node=>node.kind==='modelica'))throw new Error('Custom Modelica graph-node execution is pending. Source editing, Rumoca diagnostics and project persistence are available.');
    this.onStatus('Compiling Modelica in Rumoca WASM…');
    const base=new URL(import.meta.env.BASE_URL,location.href).href;
    this.physics.stop();
    this.pendingNodes.clear();delete project.detectorArtifact;
    this.modelicaState?.stop();this.modelicaState=undefined;
    this.modelicaMath?.stop();this.modelicaMath=undefined;
    this.physics=new WorkerRpc(new Worker(new URL('./physics.worker.ts',import.meta.url),{type:'module'}));
    const truth=await this.physics.call<Truth>('init',{base,source:project.physics});
    validatePose(truth);this.origin={x:truth.x,y:truth.y,z:truth.z,quaternion:[...truth.quaternion]};
    this.modelicaMath=new WorkerRpc(new Worker(new URL('./modelica-runtime-math.worker.ts',import.meta.url),{type:'module'}));
    project.sensorModelica=withActorMotion(project.sensorModelica??defaultSensorModelica);
    // Recycle beyond the storefront block and before the training enclosure.
    const actorRoute=project.environment==='city'?{pedestrianRadius:7.1,carRadius:1.65,pedestrianCrossings:true,streetCars:true,carStreetHalfLength:33}:project.environment==='big-city'?{pedestrianRadius:5.8,carRadius:1.65}:undefined;
    await this.modelicaMath.call('init',{base,sensorSource:project.sensorModelica??defaultSensorModelica,evaluationSource:project.evaluationModelica??defaultEvaluationModelica,origin:this.origin,actorRoute},180_000);
    this.onStatus('Compiling algorithm nodes to WASM…');
    for(const node of order) if(['detector','slam'].includes(node.kind)) {
      if(node.kind==='detector'&&project.detectorLanguage==='modelica') {
        this.pendingNodes.set(node.id,'Rumoca native full-frame feature detection pending');
      } else if(node.kind==='slam'&&project.runtime==='modelica') {
        this.modelicaState=new WorkerRpc(new Worker(new URL('./modelica-state.worker.ts',import.meta.url),{type:'module'}));
        const result=await this.modelicaState.call<{artifact:InertialSessionMetadata}>('init',{base,source:project.algorithm},180_000);
        project.algorithmArtifact=result.artifact;
      }
    }
    this.project=structuredClone(project);this.order=order;
    this.world.build(project.environment,project.sceneDetail??'high');await this.world.ready;this.world.configureActors(project.carsEnabled??true,project.peopleEnabled??true);this.world.setDepthCloudEnabled(project.depthCloudEnabled??false);this.world.update(truth);this.world.setLighting(project.lightingMode??'day');this.world.setMap([]);
    const calibration=this.world.calibration;
    await this.world.setDepthNoise({seed:project.seed,disparityNoisePx:calibration.depthNoiseDisparityPx!,referenceFx:calibration.depthNoiseReferenceFx!,baselineMeters:calibration.baseline,dropoutProbability:.005,unitsMeters:.001});
    this.world.setActorMotion(await this.modelicaMath.call<ActorMotionFrame>('actors',{time:truth.time}));
    this.world.setEstimate({x:0,y:0,z:0,quaternion:[1,0,0,0],confidence:0,points:[]});
    this.world.setEnvironmentVisible(true);
    this.random=seededRandom(project.seed);this.gpsRandom=seededRandom(project.seed^0x475053);this.gps=null;this.sequence=0;this.time=truth.time;
    this.resetSensorClock();
    this.heldImu=(await this.sampleSensors(truth,true,false)).imu;
    this.reference=undefined;this.records=[];this.replay=undefined;
    this.onStatus('Ready · camera + Modelica inertial baseline · native feature detection and SLAM pending');
  }
  private async sampleSensors(truth:Truth,imu:boolean,gps:boolean){
    const pairs=(random:()=>number)=>Array.from({length:3},()=>[random(),random()]);
    const neutral=[[.5,.5],[.5,.5],[.5,.5]];
    const draws:{accel:number[][];gyro:number[][];gps?:number[][]}={accel:imu?pairs(this.random):neutral,gyro:imu?pairs(this.random):neutral};
    const roof=this.world.navigationRoofs,enabled=this.world.navigationEnabled;
    if(gps&&await this.modelicaMath!.call<boolean>('availability',{truth,roof,enabled}))draws.gps=pairs(this.gpsRandom);
    return this.modelicaMath!.call<{imu:SensorFrame['imu'];gps:GpsSample|null}>('sensors',{truth,roof,enabled,draws,sampleGps:gps});
  }
  private deliveredLidar(scan:{samples:Float32Array}){this.onLidar();this.flow.record('lab/sensors/lidar/0',scan.samples.byteLength);}
  private deliver(type:PortType,port:string,value:any) {
    const started=performance.now();
    const bufferBytes=type==='frame'?value.rgb.byteLength+value.depth.byteLength:null;
    this.flow.record(port,bufferBytes);
    this.lastTransportTimings[port]={totalMs:performance.now()-started,bufferBytes};
    return value;
  }
  async step() {
    if(this.stepping) throw new Error('A lockstep frame is already executing');
    if(!this.project) throw new Error('Compile the project first');
    if(this.replay && this.sequence>=this.replay.length) {this.running=false;this.onStatus('Replay finished');return;}
    this.stepping=true;
    this.lastWorkerTimings={};this.lastTransportTimings={};
    this.externalStep=!!this.replay&&!this.replay[this.sequence]?.truth;
    this.world.setEnvironmentVisible(!this.externalStep);
    try {
      const values=new Map<string,any>();
      let truth:Truth|undefined,frame!:SensorFrame,estimate!:Estimate;
      let sensorGps:GpsSample|null=null;
      let command={...this.command};
      for(const node of this.order) {
        const nodeStart=performance.now();
        const inputs:Record<string,any>={};
        for(const edge of this.project.graph.edges.filter(e=>e.to===node.id)) inputs[edge.input]=values.get(`${edge.from}/${edge.output}`);
        let outputs:Record<string,any>={};
        switch(node.kind) {
          case 'physics':
            if(!this.externalStep){
              this.imuIntervals=[];this.cameraLidar=false;
              if(this.replay)truth=this.replay[this.sequence].truth;
              else {
                let intervalStart=this.time;const commandTime=this.time;
                for(const event of this.sensorClock.nextFrame(this.project.lidarEnabled??false)){
                  truth=await this.physics.call<Truth>('step',{time:event.time,command,autopilot:this.autopilot,indoorTour:this.tourMode==='indoor',commandTime});
                  this.world.update(truth);
                  // Zero-order hold: an endpoint IMU measurement applies to
                  // the next interval. Numerical integration stays in WASM.
                  if(event.imu||event.camera){
                    this.imuIntervals.push({time:event.time,dt:event.time-intervalStart,imu:this.heldImu});intervalStart=event.time;
                  }
                  if(event.imu||event.gps){
                    const observed=await this.sampleSensors(truth,event.imu,event.gps);
                    if(event.imu){this.heldImu=observed.imu;this.flow.record('lab/sensors/imu/0');}
                    if(event.gps){this.gps=observed.gps;this.flow.record('lab/navigation/gps');}
                  }
                  if(event.lidar&&!event.camera){
                    this.world.setActorMotion(await this.modelicaMath!.call<ActorMotionFrame>('actors',{time:truth.time}));
                    this.deliveredLidar(await this.world.captureLidarOnly());
                  }
                  if(event.camera)this.cameraLidar=event.lidar;
                }
              }
              if(!truth)throw new Error('Missing committed camera pose');
              command=truth.command??command;
              if(!this.replay)this.lastWorkerTimings[node.id]={...this.physics.lastTimings};
              this.time=truth.time;this.world.update(truth);outputs={truth};
            }
            break;
          case 'sensor': {
            const t=inputs.truth as Truth;
            if(t&&!this.externalStep)this.world.setActorMotion(await this.modelicaMath!.call<ActorMotionFrame>('actors',{time:t.time}));
            if(this.replay) frame=this.replay[this.sequence].frame;
            else {
              const [images,scan]=await this.world.captureSensors(this.cameraLidar);
              if(scan)this.deliveredLidar(scan);
              frame={...images,sequence:this.sequence,time:t.time,dt:this.dt,calibration:{...this.world.calibration,depthEncoding:'axial-z16-le'},imu:this.heldImu,imuIntervals:this.imuIntervals};
              frame.capture={sensorProfile:this.world.sensorProfile,depthNoise:{model:'independent-pixel-hash-v1',seed:this.project.seed,tick:Math.round(t.time*180),unitsMeters:.001}};
              sensorGps=this.gps;
            }
            this.time=frame.time;
            this.onSensor();
            this.gps=sensorGps;
            if(this.replay&&t&&!this.externalStep){
              const roof=this.world.navigationRoofs,enabled=this.world.navigationEnabled;
              const available=await this.modelicaMath!.call<boolean>('availability',{truth:t,roof,enabled});
              const draws={accel:[[.5,.5],[.5,.5],[.5,.5]],gyro:[[.5,.5],[.5,.5],[.5,.5]],...(available?{gps:Array.from({length:3},()=>[this.gpsRandom(),this.gpsRandom()])}:{})};
              const observed=await this.modelicaMath!.call<{gps:GpsSample|null}>('sensors',{truth:t,roof,enabled,draws});
              this.gps=observed.gps;
            }
            // Physical envelopes retain their measured clock metadata; don't
            // relabel an interpolated measurement as a local-freerun raw IMU.
            this.flow.record('lab/camera/info');
            outputs={frame};break;
          }
          case 'detector': {
            // The nominal INS baseline does not consume feature observations.
            // Emit no feature result or activity count for an unavailable node.
            continue;
          }
          case 'slam': {
            const worker=this.modelicaState!,sample=inputs.frame as SensorFrame;
            // The admitted state backend is nominal INS. Its issued interface
            // consumes IMU/time only; avoid cloning RGB/depth into that worker.
            // A future visual estimator must declare its own image inputs.
            const frame={time:sample.time,dt:sample.dt,imu:sample.imu,imuIntervals:sample.imuIntervals};
            estimate=await worker.call<Estimate>('step',{nodeId:node.id,kind:node.kind,frame,features:inputs.features});
            this.lastWorkerTimings[node.id]={...worker.lastTimings};outputs={estimate};break;
          }
          case 'modelica': throw new Error('Custom Modelica graph-node execution is pending');
          case 'map': estimate=inputs.estimate;this.world.setMap(estimate.points,this.externalStep?undefined:this.origin);this.world.setEstimate(estimate);if(this.externalStep)this.world.update({...estimate,time:frame.time,velocity:[0,0,0],accel:frame.imu.accel,gyro:frame.imu.gyro});outputs={estimate};break;
          case 'evaluation': {
            const e=inputs.estimate as Estimate,t=inputs.truth as Truth;
            if(!t){outputs={metrics:{ate:null,currentError:null,orientationError:null}};break;}
            const evaluated=await this.modelicaMath!.call<EvaluationResult>('evaluation',{truth:t,estimate:e,sampleCount:this.sequence+1});
            this.reference={truth:t,pose:evaluated.reference};
            this.lastWorkerTimings[node.id]={...this.modelicaMath!.lastTimings};
            outputs={metrics:evaluated.metrics};break;
          }
        }
        for(const [port,value] of Object.entries(outputs)) {
          const output=this.deliver(ports(node).outputs[port],portTopic(node.id,port),value);
          values.set(`${node.id}/${port}`,output);
        }
        this.lastTimings[node.id]=performance.now()-nodeStart;
      }
      if(!estimate) throw new Error('Graph must produce a SLAM estimate');
      const metricNode=this.order.find(n=>n.kind==='evaluation');
      if(truth&&!metricNode){const evaluated=await this.modelicaMath!.call<EvaluationResult>('evaluation',{truth,estimate,sampleCount:this.sequence+1,accumulate:false});this.reference={truth,pose:evaluated.reference};}
      const metrics=metricNode?values.get(`${metricNode.id}/metrics`):{ate:null,currentError:null,orientationError:null};
      this.flow.record('lab/slam/odometry');
      if(this.recording) {
        if(this.records.length<300) this.records.push({frame:recordedCameraFrame(frame),truth,estimate,command});
        else { this.recording=false;this.onStatus('Recording stopped at 300 frames; export the dataset'); }
      }
      this.sequence++;
      const wall=(performance.now()-this.startWall)/1000;
      this.onFrame(frame,estimate,truth,{...metrics,time:frame.time,confidence:estimate.confidence,points:estimate.points.length,features:estimate.features?.length??0,rtf:wall>0?(frame.time-this.startTime)/wall:0,frames:this.sequence,loops:Number(estimate.diagnostics?.loops??0),dropped:0});
    } finally {this.stepping=false;this.externalStep=false;}
  }
  play() {
    if(this.running) return;
    this.running=true;this.startWall=performance.now();this.startTime=this.time;
    const loop=async()=>{
      if(!this.running)return;
      const before=performance.now();
      try {await this.step();}
      catch(error){this.running=false;this.onError(error instanceof Error?error:new Error(String(error)));return;}
      if(this.running)setTimeout(loop,this.speed===Infinity?0:Math.max(0,this.dt*1000/this.speed-(performance.now()-before)));
    };
    void loop();
  }
  pause() {this.running=false;}
  get busy(){return this.stepping;}
  get evaluationOrigin(){return structuredClone(this.origin);}
  referenceTruth(truth:Pose){
    if(!this.reference||truth.x!==this.reference.truth.x||truth.y!==this.reference.truth.y||truth.z!==this.reference.truth.z||truth.quaternion.some((v,i)=>v!==this.reference!.truth.quaternion[i]))throw new Error('Modelica reference observation is unavailable for this pose');
    return structuredClone(this.reference.pose);
  }
  async loadReplay(records:RunRecord[],origin?:Pose) {
    if(!this.project)throw new Error('Compile before replay');
    if(origin)validatePose(origin);
    await this.compile(this.project);if(origin){this.origin=structuredClone(origin);await this.modelicaMath!.call('origin',{origin:this.origin});}
    this.replay=records;this.onStatus(`Replay ready · ${records.length} frames · sensor time preserved`);
  }
}
