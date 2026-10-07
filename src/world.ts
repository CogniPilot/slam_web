import * as THREE from 'three';
import {GpuDepthNoise,validateDepthNoise,type DepthNoiseSettings} from './gpu-depth-noise';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Calibration, Environment, Estimate, Pose, SceneDetail, Truth } from './types';
import {D435} from './camera-profile';
export {D435} from './camera-profile';
import {covarianceAxes} from './covariance';
import { seededRandom } from './packet';
import {WorldMaterials} from './world-materials';
import {buildCity} from './world-city';
import {graphicsInfo,type GraphicsInfo} from './graphics-info';
import {TokyoWorld} from './world-tokyo';
import {WorldActors} from './world-actors';
import {WorldDrone} from './world-drone';
import type {ActorMotionFrame} from './modelica-actor-motion';
import {CityAssets} from './world-city-assets';
import {BigCityWorld} from './world-big-city';
import {GpuLidar,type LidarScan} from './lidar';
import {WorldNavigation,type RoofVolume} from './world-navigation';
import {WorkerRpc} from './rpc';
import {WorldLighting,type DaylightMode} from './world-lighting';
import {GpuReadback,type GpuReadSubmission} from './gpu-readback';
import {GpuRasterRows} from './gpu-raster-rows';
import {GpuRealSensePacking,allocateRealSenseImages,cameraImageLayout} from './gpu-realsense-packing';
import {withCommittedScene} from './committed-scene';
import {SensorGeometryBatches,withSensorGeometry} from './sensor-geometry-batches';
import type {GpuSensorProfile} from './gpu-sensor-profiler';
import {GpuDepthCloud,depthCloudMaterial,type DepthCloud} from './depth-cloud';
import {GpuDepthCloudRaster,type DepthCloudRaster} from './depth-cloud-raster';
import {setDensePointBuffer} from './dense-point-buffer';
import {graphicsQuality} from './graphics-quality';
import {packTrajectories,type TrajectoryPath,type TrajectoryBuffer} from './trajectory';
export interface WorldCanvasOptions {canvas:OffscreenCanvas;width:number;height:number;pixelRatio:number;base:string}
type RawCaptureStorage=ReturnType<typeof allocateRealSenseImages>&{cloud?:Float32Array;lidar?:Float32Array};
export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly graphics:GraphicsInfo;
  readonly lighting:WorldLighting;
  lightingMode:DaylightMode='day';
  onLighting:(mode:DaylightMode)=>void=()=>{};
  captureTimings:{readback:number;renderSubmission:number;total:number;method:string}|undefined;
  sensorGpuProfile?:GpuSensorProfile;
  private asyncCapture=false;
  private committedCapture=false;
  private readonly readback:GpuReadback;
  private readonly rasterRows=new GpuRasterRows();
  private readonly realSensePacking=new GpuRealSensePacking();
  private tokyo?:TokyoWorld;
  private cityAssets?:CityAssets;
  private bigCity?:BigCityWorld;
  readonly actors:WorldActors;
  readonly drone:WorldDrone;
  readonly navigation:WorldNavigation;
  readonly lidar:GpuLidar;
  latestLidar?:LidarScan;
  latestDepthCloud?:DepthCloud;
  latestDepthRaster?:DepthCloudRaster;
  depthCloudEnabled=false;
  readonly depthCloudView=new THREE.Points(new THREE.BufferGeometry(),depthCloudMaterial());
  private denseCloudGeometry=this.depthCloudView.geometry;
  private readonly denseCloudMaterial=this.depthCloudView.material;
  private rasterCloud?:GpuDepthCloudRaster;
  private denseCloudReadback=false;
  private readonly lidarSensor=new THREE.Group();
  private readonly lidarFluToScene=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
  readonly lidarView=new THREE.Points(new THREE.BufferGeometry(),depthCloudMaterial(0xffb76f));
  readonly trajectories=new THREE.Group();
  private trajectoryLines=new Map<string,THREE.Line>();
  ready:Promise<void>=Promise.resolve();
  private simulationTime=0;
  private previousTime=0;
  private commitWall=0;
  private frameWall=100;
  private currentEnvironment:Environment='city';
  private currentDetail:SceneDetail='high';
  get navigationRoofs():readonly RoofVolume[]{return this.currentEnvironment==='big-city'?(this.bigCity?.interiors.map(interior=>interior.roofVolume)??[]):[this.navigation.roofVolume];}
  get navigationEnabled(){return this.environmentVisible&&['city','asset-city','big-city'].includes(this.currentEnvironment);}
  private carsEnabled=true;
  private peopleEnabled=true;
  private sensorConfigurationError?:Error;
  private lastShadowTime=-Infinity;
  private environmentVisible=true;
  private sensorRpc?:WorkerRpc;
  private readonly sensorGeometryBatches:SensorGeometryBatches;
  private sensorWorkerEnabled=true;
  private committedTruth?:Truth;
  private actorMotion?:ActorMotionFrame;
  onBuild:(environment:Environment,detail:SceneDetail,preservePresentation?:boolean)=>Promise<void>=async()=>{};
  onPose:(truth:Truth)=>void=()=>{};
  onActors:(cars:boolean,people:boolean)=>void=()=>{};
  onActorMotion:(frame:ActorMotionFrame)=>void=()=>{};
  onEnvironmentVisible:(visible:boolean)=>void=()=>{};
  private previousPosition=new THREE.Vector3();
  private currentPosition=new THREE.Vector3();
  private previousQuaternion=new THREE.Quaternion();
  private currentQuaternion=new THREE.Quaternion();
  readonly scene = new THREE.Scene();
  readonly view = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  readonly robot = new THREE.Group();
  readonly environment = new THREE.Group();
  readonly points = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0x50e6b2, size: 0.045 }));
  readonly estimatorView=new THREE.Group();
  readonly covariance=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),new THREE.MeshBasicMaterial({color:0x68c9eb,wireframe:true,transparent:true,opacity:.35}));
  readonly graphEdges=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x8b9cad,transparent:true,opacity:.55}));
  readonly loopEdges=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffbd73}));
  readonly keyframes=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({color:0xbd9afa,size:.12}));
  readonly controls: OrbitControls;
  private sensor = new THREE.PerspectiveCamera();
  // RGB bytes are display-encoded sRGB; axial depth bytes are an unencoded
  // integer payload. Sharing their attachment would corrupt one of these.
  private rgbTarget = new THREE.WebGLRenderTarget(D435.width, D435.height, { depthBuffer: true, type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace });
  private depthTarget = new THREE.WebGLRenderTarget(D435.width, D435.height, { depthBuffer: true, type: THREE.UnsignedByteType, colorSpace: THREE.NoColorSpace });
  private depthNoise=new GpuDepthNoise();
  private depthNoiseSettings?:DepthNoiseSettings;
  private readonly depthCloudGpu=new GpuDepthCloud(this.depthTarget.texture,D435);
  private readonly materials:WorldMaterials;
  private readonly assetBase:string;
  private readonly deviceRatio:number;
  private readonly boxGeometry=new THREE.BoxGeometry(1,1,1);
  private readonly crownGeometry=new THREE.IcosahedronGeometry(1,1);
  private depthMaterial = new THREE.ShaderMaterial({
    uniforms: { minDepth: { value: D435.near }, maxDepth: { value: D435.far } },
    vertexShader: '#include <common>\n#include <batching_pars_vertex>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\nvarying float z; void main(){\n#include <batching_vertex>\n#include <skinbase_vertex>\n#include <begin_vertex>\n#include <morphtarget_vertex>\n#include <skinning_vertex>\n#include <project_vertex>\nz=-mvPosition.z;}',
    fragmentShader: 'uniform float minDepth,maxDepth; varying float z; void main(){uint bits=(z>=minDepth&&z<maxDepth)?floatBitsToUint(z):0u;uvec4 bytes=uvec4(bits&255u,(bits>>8u)&255u,(bits>>16u)&255u,bits>>24u);gl_FragColor=vec4(bytes)/255.;}',
    side: THREE.DoubleSide, toneMapped: false, blending:THREE.NoBlending, precision:'highp'
  });
  private mapVisible = true;
  constructor(container: HTMLElement|WorldCanvasOptions) {
    // The RGBA transport carries little-endian IEEE754 words. Refuse an
    // incompatible host instead of silently introducing a pixel converter.
    if(new Uint8Array(new Uint32Array([1]).buffer)[0]!==1)throw new Error('Raw axial depth requires little-endian typed-array storage');
    const offscreen='canvas' in container?container:undefined;
    this.assetBase=offscreen?.base??new URL(import.meta.env.BASE_URL,document.baseURI).href;
    this.renderer = new THREE.WebGLRenderer({ antialias: true,powerPreference:'high-performance',...(offscreen?{canvas:offscreen.canvas}:{}) });
    this.graphics=graphicsInfo(this.renderer.getContext());
    this.readback=new GpuReadback(this.renderer.getContext() as WebGL2RenderingContext);
    this.deviceRatio=offscreen?.pixelRatio??devicePixelRatio;
    this.renderer.setPixelRatio(Math.min(this.deviceRatio,2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.materials=new WorldMaterials(Math.min(4,this.renderer.capabilities.getMaxAnisotropy()),this.assetBase);
    if(!offscreen)(container as HTMLElement).appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0xc5dce5);
    this.scene.fog=new THREE.Fog(0xc5dce5,28,90);
    // Broad daylight fill preserves wall detail on both sides of the canyon.
    // A single sun creates the PBR light hierarchy without software-heavy
    // shadow-map passes or one light for every piece of street furniture.
    this.lighting=new WorldLighting(this.renderer,this.scene,{base:this.assetBase});
    this.scene.add(this.environment, this.robot, this.points,this.estimatorView,this.depthCloudView);this.depthCloudView.visible=false;
    this.sensorGeometryBatches=new SensorGeometryBatches(this.scene,this.environment);
    this.actors=new WorldActors(this.assetBase);this.scene.add(this.actors.group);
    this.navigation=new WorldNavigation(this.materials);this.scene.add(this.navigation.group);
    this.lidar=new GpuLidar(this.renderer,this.scene);
    this.lidarSensor.position.set(0,.18,0);this.robot.add(this.lidarSensor);
    this.scene.add(this.lidarView);this.lidarView.visible=false;
    this.estimatorView.add(this.trajectories);
    this.estimatorView.add(this.covariance,this.graphEdges,this.loopEdges,this.keyframes);this.covariance.visible=false;
    this.view.position.set(-9, 7.8, 3.2);
    this.controls = offscreen?{target:new THREE.Vector3(),update:()=>{},enableDamping:false,minDistance:1,maxDistance:70,maxPolarAngle:Math.PI*.49} as unknown as OrbitControls:new OrbitControls(this.view,this.renderer.domElement);
    this.controls.target.set(4, 2.1, 0); this.controls.enableDamping = true;
    this.controls.minDistance=1;this.controls.maxDistance=70;this.controls.maxPolarAngle=Math.PI*.49;
    this.drone=new WorldDrone(this.assetBase);this.robot.add(this.drone.group);
    const cameraBody = new THREE.Mesh(new THREE.BoxGeometry(.04, .025, .09), new THREE.MeshStandardMaterial({ color: 0x151e29 }));
    cameraBody.position.set(D435.forward, D435.up, 0); this.robot.add(cameraBody);
    if(offscreen){this.renderer.setSize(offscreen.width,offscreen.height,false);this.view.aspect=offscreen.width/offscreen.height;this.view.updateProjectionMatrix();}
    else new ResizeObserver(() => {
      const element=container as HTMLElement;
      this.renderer.setSize(element.clientWidth, element.clientHeight);
      this.view.aspect = element.clientWidth / element.clientHeight; this.view.updateProjectionMatrix();
    }).observe(container as HTMLElement);
    this.build('city');
  }
  private box(x:number,y:number,z:number,w:number,h:number,d:number,material:number|THREE.MeshStandardMaterial) {
    const mesh=new THREE.Mesh(this.boxGeometry,typeof material==='number'?this.materials.surface('plaster',material):material);
    mesh.position.set(x,z,-y);mesh.scale.set(w,h,d);mesh.userData.shape='box';this.environment.add(mesh);return mesh;
  }
  private crown(x:number,y:number,z:number,size:number,material:THREE.MeshStandardMaterial) {
    const mesh=new THREE.Mesh(this.crownGeometry,material);
    mesh.position.set(x,z,-y);mesh.scale.set(size,size*1.06,size);mesh.userData.shape='crown';this.environment.add(mesh);
  }
  /** Change scene/render budgets at a completed capture boundary. */
  async setGraphicsQuality(detail:SceneDetail) {
    if(this.asyncCapture)throw new Error('Wait for the current sensor capture before changing graphics quality');
    this.build(this.currentEnvironment,detail,true);
    await this.ready;
  }
  build(kind:Environment,detail:SceneDetail='high',preservePresentation=false) {
    const camera=preservePresentation?{position:this.view.position.clone(),quaternion:this.view.quaternion.clone(),target:this.controls.target.clone()}:undefined;
    this.currentEnvironment=kind;this.currentDetail=detail;this.ready=Promise.resolve();
    const quality=graphicsQuality(detail,this.deviceRatio,this.renderer.capabilities.getMaxAnisotropy());
    // Sensor render targets retain their calibrated dimensions. Pixel ratio
    // scales the overview canvas only, including its dedicated viewer worker.
    this.renderer.setPixelRatio(quality.pixelRatio);this.lighting.setQuality(detail);this.materials.setQuality(quality);
    if(this.tokyo)this.tokyo.group.visible=kind==='tokyo';
    if(this.cityAssets)this.cityAssets.group.visible=kind==='asset-city';
    if(this.bigCity)this.bigCity.group.visible=kind==='big-city';
    this.actors.build(kind,detail);
    if(!preservePresentation){this.latestLidar=undefined;this.lidarView.visible=false;this.latestDepthCloud=undefined;this.latestDepthRaster=undefined;this.depthCloudView.visible=false;this.setTrajectories([]);}
    this.sensorGeometryBatches.clear();
    for(const object of [...this.environment.children]) {
      this.environment.remove(object);
      // Shared materials and their textures survive rebuilding the scene.
      object.traverse(child=>{if(child instanceof THREE.Mesh){child.geometry.dispose();if(child instanceof THREE.InstancedMesh)child.dispose();}});
    }
    if(kind!=='big-city'){
      const floor=this.box(0,0,-.1,80,.2,70,this.materials.surface('paving',0xb4baaf));floor.name='ground';
    }
    const random=seededRandom(42);
    if(kind==='tokyo') {
      if(!this.tokyo){this.tokyo=new TokyoWorld(this.assetBase);this.scene.add(this.tokyo.group);}
      this.tokyo.group.visible=true;this.ready=this.tokyo.ready;
      this.view.position.set(-10,20,29);this.controls.target.set(16,5,0);
    } else if(kind==='asset-city') {
      if(!this.cityAssets){this.cityAssets=new CityAssets(this.materials,this.assetBase);this.scene.add(this.cityAssets.group);}
      this.cityAssets.build(detail);this.cityAssets.group.visible=true;this.ready=this.cityAssets.ready;
      this.view.position.set(-10,9,2.7);this.controls.target.set(8,3,0);
    } else if(kind==='big-city') {
      if(!this.bigCity){this.bigCity=new BigCityWorld(this.materials);this.scene.add(this.bigCity.group);}
      this.bigCity.build(detail);this.bigCity.group.visible=true;this.ready=this.bigCity.ready;
      this.view.position.set(-28,32,37);this.controls.target.set(18,5,0);
    } else if(kind==='city') {
      buildCity(this.box.bind(this),this.crown.bind(this),this.materials,detail);
      this.view.position.set(-23,5.2,3.8);this.controls.target.set(5,4.1,0);
    } else if(kind==='warehouse') {
      const wall=this.materials.surface('plaster',0xd7d7c9),steel=this.materials.solid(0x536a7d,.6,.4),wood=this.materials.surface('wood',0xc39763);
      this.box(5,8,3,28,6,.2,wall);this.box(5,-8,3,28,6,.2,wall);
      this.box(-9,0,3,.2,6,16,wall);this.box(19,0,3,.2,6,16,wall);
      for(const x of [-5,1,7,13])for(const y of [-4,4]) {
        for(let level=.5;level<3.5;level+=1) {
          this.box(x,y,level,3,.08,1.5,wood);
          for(const dx of [-.8,.3])this.box(x+dx,y,level+.35,.65,.6,.7,this.materials.surface('plaster',random()>.5?0xb8a880:0x899f91));
        }
        for(const dx of [-1.5,1.5])this.box(x+dx,y,1.8,.08,3.6,1.6,steel);
      }
      if(detail!=='low')for(const x of [-6,2,10,18])for(const y of [-7.85,7.85]) {
        this.box(x,y,2.5,.12,5,.15,steel);this.box(x,y,3.8,1.2,.8,.05,this.materials.solid(0x86b5c3,.3));
      }
    } else {
      const wall=this.materials.surface('brick',0xd0b99a),stone=this.materials.surface('plaster',0xe1dcc6);
      for(const y of [-8,8])this.box(4,y,2.5,28,5,.3,wall);
      for(const x of [-10,18])this.box(x,0,2.5,.3,5,16,wall);
      for(const x of [-5,3,11])for(const y of [-4,4]) {
        this.box(x,y,1.5,.5,3,.5,stone);
        this.box(x+.9,y,.4,.8,.8,.8,this.materials.surface('wood',0x8c9c73));
        if(detail!=='low'){this.box(x,y,3.03,.75,.12,.75,stone);this.crown(x+1.8,y,1.4,.8,this.materials.solid(0x7f9c60,.98));}
      }
    }
    this.instanceEnvironment();
    if(camera){this.view.position.copy(camera.position);this.view.quaternion.copy(camera.quaternion);this.controls.target.copy(camera.target);}
    this.ready=Promise.all([this.ready,this.drone.ready,this.materials.ready,this.lighting.ready,...(['city','asset-city','big-city'].includes(kind)?[this.actors.ready]:[]),this.onBuild(kind,detail,preservePresentation),...(this.sensorRpc?[this.sensorRpc.call('configure',{environment:kind,detail})]:[])]).then(()=>{
      for(const group of [this.environment,this.cityAssets?.group,this.bigCity?.group,this.navigation.group])group?.traverse(object=>{if(object instanceof THREE.Mesh){object.castShadow=true;object.receiveShadow=true;}});
      this.lighting.invalidateShadows();
    });
    this.setEnvironmentVisible(this.environmentVisible);
  }
  private instanceEnvironment() {
    const groups=new Map<string,THREE.Mesh[]>();
    for(const object of this.environment.children)if(object instanceof THREE.Mesh) {
      const key=`${object.userData.shape}:${(object.material as THREE.Material).uuid}`;
      const list=groups.get(key)??[];list.push(object);groups.set(key,list);
    }
    for(const meshes of groups.values()) {
      const first=meshes[0],instances=new THREE.InstancedMesh(first.geometry.clone(),first.material,meshes.length);
      instances.name=first.name||first.userData.shape;
      instances.userData.sensorGeometryKey=first.userData.shape;
      meshes.forEach((mesh,i)=>{
        mesh.updateMatrix();instances.setMatrixAt(i,mesh.matrix);this.environment.remove(mesh);
      });
      instances.computeBoundingSphere();this.environment.add(instances);
    }
    this.sensorGeometryBatches.rebuild();
  }
  update(truth: Truth) {
    this.committedTruth={...truth,quaternion:[...truth.quaternion]};
    const now=performance.now(),time=Number.isFinite(truth.time)?truth.time:this.simulationTime;
    const reset=time<=this.simulationTime;
    this.drone.commit(truth.propellerAngles,reset);
    this.previousTime=reset?time:this.simulationTime;
    this.previousPosition.copy(this.currentPosition);this.previousQuaternion.copy(this.currentQuaternion);
    this.frameWall=Math.max(16,Math.min(1000,now-this.commitWall||100));this.commitWall=now;this.simulationTime=time;
    this.robot.position.set(truth.x,truth.z,-truth.y);
    const [w,x,y,z] = truth.quaternion;
    this.robot.quaternion.set(x,z,-y,w).normalize();
    this.currentPosition.copy(this.robot.position);this.currentQuaternion.copy(this.robot.quaternion);
    if(reset){this.previousPosition.copy(this.currentPosition);this.previousQuaternion.copy(this.currentQuaternion);}
    this.robot.updateMatrixWorld(true);
    this.onPose(this.committedTruth);
  }
  async enableSensorWorker(){
    const rpc=new WorkerRpc(new Worker(new URL('./sensor-render.worker.ts',import.meta.url),{type:'module'}));
    try{await rpc.call('init',{base:this.assetBase,environment:this.currentEnvironment,detail:this.currentDetail,carsEnabled:this.carsEnabled,peopleEnabled:this.peopleEnabled,lightingMode:this.lightingMode,environmentVisible:this.environmentVisible,depthCloudEnabled:this.depthCloudEnabled});this.sensorRpc=rpc;}
    catch(error){rpc.stop();throw error;}
  }
  setSensorWorkerEnabled(enabled:boolean){this.sensorWorkerEnabled=enabled;}
  /** Internal comparison control. Explicit captureSensorPair remains dense;
   * live capture normally lets the viewer unproject its native Z16 image. */
  setDepthCloudReadback(enabled:boolean){
    if(typeof enabled!=='boolean')throw Error('Dense cloud readback must be boolean');
    this.denseCloudReadback=enabled;
  }
  /** Internal matched-profile control; calibration and capture cadence stay fixed. */
  private packedReadback=true;
  async setSensorPackedReadback(enabled:boolean){
    if(typeof enabled!=='boolean')throw new Error('Packed sensor readback must be boolean');
    this.packedReadback=enabled;
    if(this.sensorRpc&&this.sensorWorkerEnabled)await this.sensorRpc.call('configure',{packedReadback:enabled});
  }
  async setSensorGeometryBatching(enabled:boolean){
    if(typeof enabled!=='boolean')throw new Error('Sensor geometry batching must be boolean');
    this.sensorGeometryBatches.enabled=enabled;
    if(this.sensorRpc&&this.sensorWorkerEnabled)await this.sensorRpc.call('configure',{geometryBatching:enabled});
  }
  async setSensorReadback(mode:'async'|'sync'){
    if(!this.sensorRpc||!this.sensorWorkerEnabled)throw new Error('Readback profiling requires the dedicated sensor worker');
    await this.sensorRpc.call('configure',{readbackMode:mode});
  }
  async setDepthNoise(settings:DepthNoiseSettings){
    validateDepthNoise(settings);this.depthNoiseSettings={...settings};
    if(this.sensorRpc)await this.sensorRpc.call('configure',{depthNoise:settings});
  }
  configureActors(cars:boolean,people:boolean){this.carsEnabled=cars;this.peopleEnabled=people;this.actors.setEnabled(cars,people);this.lighting.invalidateShadows();this.onActors(cars,people);this.configureSensor({carsEnabled:cars,peopleEnabled:people});}
  setActorMotion(frame:ActorMotionFrame){this.actorMotion=frame;this.actors.setMotion(frame);this.onActorMotion(frame);}
  private configureSensor(settings:Record<string,unknown>){
    if(this.sensorRpc)void this.sensorRpc.call('configure',settings).catch(error=>{this.sensorConfigurationError=error instanceof Error?error:new Error(String(error));});
  }
  async captureSensors(lidarEnabled:boolean){
    if(this.sensorConfigurationError)throw this.sensorConfigurationError;
    if(this.actorMotion&&this.actorMotion.time!==this.committedTruth?.time)throw new Error('Actor motion and camera must share the committed simulation time');
    if(this.sensorRpc&&this.sensorWorkerEnabled){
      if(!this.committedTruth)throw new Error('No committed simulation pose');
      const result=await this.sensorRpc.call<any>('capture',{truth:this.committedTruth,actorMotion:this.actorMotion,lidarEnabled,denseCloudReadback:this.denseCloudReadback});
      this.captureTimings=result.cameraTimings;this.lidar.timings=result.lidarTimings;this.sensorGpuProfile=result.gpuProfile;
      if(result.scan)this.setLidarScan(result.scan);
      if(result.depthCloud)this.setDepthCloud(result.depthCloud);
      if(result.depthRaster)this.setDepthRaster(result.depthRaster);
      return [{rgb:result.rgb as Uint8Array,depth:result.depth as Uint16Array,imageLayout:result.imageLayout},result.scan as LidarScan|undefined] as const;
    }
    const [camera,scan]=await this.captureSensorPair(lidarEnabled,'async',true,true,this.denseCloudReadback);
    if(!('imageLayout' in camera)||!camera.imageLayout||!(camera.depth instanceof Uint16Array))throw Error('Native camera capture requires RGB8/Z16');
    // Keep renderer-only cloud/world-pose metadata out of algorithm inputs.
    return [{rgb:camera.rgb,depth:camera.depth,imageLayout:camera.imageLayout},scan] as const;
  }
  /** A LiDAR tick between camera ticks captures only its GPU targets. */
  async captureLidarOnly(){
    if(this.sensorConfigurationError)throw this.sensorConfigurationError;
    if(!this.committedTruth)throw new Error('No committed simulation pose');
    if(this.actorMotion&&this.actorMotion.time!==this.committedTruth.time)throw new Error('Actor motion and LiDAR must share the committed simulation time');
    if(this.sensorRpc&&this.sensorWorkerEnabled){
      const result=await this.sensorRpc.call<any>('capture-lidar',{truth:this.committedTruth,actorMotion:this.actorMotion});
      this.lidar.timings=result.lidarTimings;this.sensorGpuProfile=result.gpuProfile;this.setLidarScan(result.scan);return result.scan as LidarScan;
    }
    return this.captureLidar(this.committedTruth.time);
  }
  /** Submit all enabled sensors before one GPU wait. The caller's current
   * committed pose remains held until every result has been decoded. */
  async captureSensorPair(lidarEnabled:boolean,mode:'async'|'sync'='async',updateView=true,raw=false,denseCloud=true){
    if(!denseCloud&&!raw)throw Error('Raster cloud presentation requires native Z16 capture');
    const storage=raw?this.rawCaptureStorage(lidarEnabled,denseCloud):undefined;
    if(!lidarEnabled)return [await this.captureImages(mode,undefined,storage),undefined] as const;
    let resolve!:()=>void,reject!:(error:unknown)=>void;
    const completed=new Promise<void>((ok,fail)=>{resolve=ok;reject=fail;});
    // A render can fail before either capture starts awaiting completion.
    void completed.catch(()=>{});
    let camera!:ReturnType<World['captureImages']>,scan!:Promise<LidarScan>;
    let settled:Promise<PromiseSettledResult<unknown>[]>|undefined;
    const submit=(read:GpuReadSubmission['read'])=>{
      const submission={read,completed};
      this.exactPose();this.animate(this.simulationTime);
      // All render submissions execute synchronously before either capture
      // awaits completion. Prepare animation and scene transforms once, then
      // restore automatic updates before yielding to the viewer.
      withCommittedScene(this.scene,()=>{
        this.committedCapture=true;
        try{
          camera=this.captureImages(mode,submission,storage);
          scan=this.captureLidar(this.simulationTime,false,mode,submission,storage?.lidar);
          // Handle immediate submission failures while the shared fence is pending.
          settled=Promise.allSettled([camera,scan]);
        }finally{this.committedCapture=false;}
      });
    };
    try{
      if(mode==='sync'){
        if(this.packedReadback)this.readback.readBatchPackedSync(storage?.destination.byteLength??D435.width*D435.height*(8+(this.depthCloudEnabled?16:0))+this.lidar.readbackByteLength,submit,storage?.destination);
        else this.readback.readBatchSync(submit);
      }
      else if(this.packedReadback)await this.readback.readBatchPacked(storage?.destination.byteLength??D435.width*D435.height*(8+(this.depthCloudEnabled?16:0))+this.lidar.readbackByteLength,submit,storage?.destination);
      else await this.readback.readBatch(submit);
      resolve();
      const result=await Promise.all([camera,scan]);
      if(updateView)this.setLidarScan(result[1]);return result;
    }catch(error){
      reject(error);await settled;throw error;
    }
  }
  private rawCaptureStorage(lidarEnabled:boolean,denseCloud=true):RawCaptureStorage {
    const cloudBytes=this.depthCloudEnabled&&denseCloud?D435.width*D435.height*16:0,lidarBytes=lidarEnabled?this.lidar.readbackByteLength:0;
    const result=allocateRealSenseImages(D435,D435,this.depthNoiseSettings?.unitsMeters??.001,cloudBytes+lidarBytes);
    const offset=result.images.color.bytes+result.images.depth.bytes;
    return {...result,...(cloudBytes?{cloud:new Float32Array(result.destination.buffer,offset,cloudBytes/4)}:{}),
      ...(lidarBytes?{lidar:new Float32Array(result.destination.buffer,offset+cloudBytes,lidarBytes/4)}:{})};
  }
  private exactPose(){this.robot.position.copy(this.currentPosition);this.robot.quaternion.copy(this.currentQuaternion);this.robot.updateMatrixWorld(true);}
  setDepthCloudEnabled(enabled:boolean){this.depthCloudEnabled=enabled;this.depthCloudView.visible=enabled&&!!(this.latestDepthCloud||this.latestDepthRaster);if(!enabled){this.latestDepthCloud=undefined;this.latestDepthRaster=undefined;}this.configureSensor({depthCloudEnabled:enabled});}
  setDepthCloud(cloud:DepthCloud){
    this.latestDepthCloud=cloud;this.latestDepthRaster=undefined;
    this.depthCloudView.geometry=this.denseCloudGeometry;this.depthCloudView.material=this.denseCloudMaterial;
    setDensePointBuffer(this.depthCloudView,cloud.samples,D435.far*2);
    this.denseCloudGeometry=this.depthCloudView.geometry;
    this.placeDepthCloud(cloud);
  }
  setDepthRaster(cloud:DepthCloudRaster){
    this.rasterCloud??=new GpuDepthCloudRaster();this.rasterCloud.set(cloud);
    this.latestDepthRaster=cloud;this.latestDepthCloud=undefined;
    this.depthCloudView.geometry=this.rasterCloud.geometry;this.depthCloudView.material=this.rasterCloud.material;
    this.placeDepthCloud(cloud);
  }
  private placeDepthCloud(cloud:Pick<DepthCloud,'pose'|'originFlu'>){
    const [w,x,y,z]=cloud.pose.quaternion;
    this.depthCloudView.quaternion.set(x,z,-y,w).normalize();
    this.depthCloudView.position.set(cloud.pose.x,cloud.pose.z,-cloud.pose.y);
    this.depthCloudView.position.add(new THREE.Vector3(cloud.originFlu[0],cloud.originFlu[2],-cloud.originFlu[1]).applyQuaternion(this.depthCloudView.quaternion));
    this.depthCloudView.quaternion.multiply(this.lidarFluToScene);this.depthCloudView.visible=this.depthCloudEnabled;
  }
  private animate(time:number){
    this.lighting.setMode(this.lightingMode,time);if(this.currentEnvironment==='tokyo')this.tokyo?.setTime(time);if(this.actors.group.visible)this.actors.setTime(time);
    if(time<this.lastShadowTime||time-this.lastShadowTime>=.05){this.lighting.invalidateShadows();this.lastShadowTime=time;}
  }
  inspectInterior(id:'overview'|'store'|'apartment'|'conference'){
    if(this.currentEnvironment!=='big-city'||!this.bigCity)throw new Error('Interior views are available in Big city');
    if(id==='overview'){this.view.position.set(-28,32,37);this.controls.target.set(18,5,0);}
    else {
      // Authored inspection cameras sit beside the sensor's entrance route,
      // so a drone parked on that route cannot obscure the room's furniture.
      const shots={
        store:{eye:[18.4,9.4,1.8],target:[21.5,14.2,1.4]},
        apartment:{eye:[34,-10.5,1.8],target:[30,-11.4,1.1]},
        conference:{eye:[43.7,9.9,1.8],target:[48,15,1.2]},
      };
      const {eye,target}=shots[id];
      this.view.position.set(eye[0],eye[2],-eye[1]);this.controls.target.set(target[0],target[2],-target[1]);
    }
    this.controls.update();
  }
  setLighting(mode:DaylightMode){this.lightingMode=mode;this.lighting.setMode(mode,this.simulationTime);this.onLighting(mode);this.configureSensor({lightingMode:mode});}
  setEnvironmentVisible(visible:boolean){
    this.environmentVisible=visible;this.environment.visible=visible;
    this.onEnvironmentVisible(visible);
    this.actors.group.visible=visible&&['city','asset-city','big-city'].includes(this.currentEnvironment);
    this.navigation.group.visible=visible&&['city','asset-city'].includes(this.currentEnvironment);
    if(this.tokyo)this.tokyo.group.visible=visible&&this.currentEnvironment==='tokyo';
    if(this.cityAssets)this.cityAssets.group.visible=visible&&this.currentEnvironment==='asset-city';
    if(this.bigCity)this.bigCity.group.visible=visible&&this.currentEnvironment==='big-city';
  }
  async captureLidar(time:number,updateView=true,readbackMode:'async'|'sync'='async',submission?:GpuReadSubmission,destination?:Float32Array){
    if(!this.committedCapture){this.exactPose();this.animate(time);}
    const scan=await this.lidar.capture(this.lidarSensor,time,[this.robot,this.points,this.estimatorView,this.lidarView,this.depthCloudView,this.lighting.celestialGroup],readbackMode,submission,destination);
    if(updateView)this.setLidarScan(scan);return scan;
  }
  setLidarScan(scan:LidarScan){
    this.latestLidar=scan;
    // Every captured radial return is bounded. Avoid rescanning all vertices
    // for Three's default bounding sphere after each buffer replacement.
    setDensePointBuffer(this.lidarView,scan.samples,scan.far+.001);
    this.lidarSensor.getWorldPosition(this.lidarView.position);this.lidarSensor.getWorldQuaternion(this.lidarView.quaternion);
    this.lidarView.quaternion.multiply(this.lidarFluToScene);
    this.lidarView.visible=true;
  }
  setTrajectories(paths:TrajectoryPath[]){this.setTrajectoryBuffers(packTrajectories(paths));}
  setTrajectoryBuffers(paths:TrajectoryBuffer[]){
    const ids=new Set(paths.map(p=>p.id));
    for(const [id,line] of this.trajectoryLines)if(!ids.has(id)){line.geometry.dispose();(line.material as THREE.Material).dispose();this.trajectories.remove(line);this.trajectoryLines.delete(id);}
    for(const path of paths){
      let line=this.trajectoryLines.get(path.id);
      if(!line){line=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:path.color,dashSize:.3,gapSize:.15}));this.trajectoryLines.set(path.id,line);this.trajectories.add(line);}
      const data=path.positions;
      line.geometry.dispose();line.geometry=new THREE.BufferGeometry();line.geometry.setAttribute('position',new THREE.BufferAttribute(data,3));line.computeLineDistances();
    }
  }
  render(interpolate=false) {
    const fraction=interpolate?Math.min(1,Math.max(0,(performance.now()-this.commitWall)/this.frameWall)):1;
    this.drone.render(fraction);
    this.robot.position.lerpVectors(this.previousPosition,this.currentPosition,fraction);this.robot.quaternion.slerpQuaternions(this.previousQuaternion,this.currentQuaternion,fraction);
    this.robot.updateMatrixWorld(true);this.animate(this.previousTime+(this.simulationTime-this.previousTime)*fraction);
    this.controls.update();this.renderer.setRenderTarget(null);this.renderer.render(this.scene,this.view);
  }
  private optics(fx: number, fy: number,far=D435.far) {
    this.sensor.near = D435.near; this.sensor.far = far;
    const n = D435.near;
    this.sensor.projectionMatrix.makePerspective(-n*D435.width/(2*fx),n*D435.width/(2*fx),n*D435.height/(2*fy),-n*D435.height/(2*fy),n,far);
    this.sensor.projectionMatrixInverse.copy(this.sensor.projectionMatrix).invert();
  }
  private renderDepth(){
    const background=this.scene.background,override=this.scene.overrideMaterial,celestial=this.lighting.celestialGroup.visible;
    const clearColor=this.renderer.getClearColor(new THREE.Color()),clearAlpha=this.renderer.getClearAlpha();
    const gl=this.renderer.getContext(),dither=gl.isEnabled(gl.DITHER);
    try{
      this.scene.background=null;this.scene.overrideMaterial=this.depthMaterial;this.lighting.celestialGroup.visible=false;
      this.renderer.setClearColor(0,0);gl.disable(gl.DITHER);this.renderer.setRenderTarget(this.depthTarget);
      withSensorGeometry(this.scene,()=>this.renderer.render(this.scene,this.sensor));
      const target=this.depthNoiseSettings?this.depthNoise.submit(this.renderer,this.depthTarget,this.depthNoiseSettings,this.simulationTime):this.depthTarget;
      this.depthCloudGpu.setDepthTexture(target.texture);
      return target;
    }finally{
      this.scene.background=background;this.scene.overrideMaterial=override;this.lighting.celestialGroup.visible=celestial;
      this.renderer.setClearColor(clearColor,clearAlpha);if(dither)gl.enable(gl.DITHER);
    }
  }
  capture() {
    // Direct debug/tests may position the robot explicitly before capture.
    this.animate(this.simulationTime);
    const position = new THREE.Vector3(D435.forward,D435.up,0).applyMatrix4(this.robot.matrixWorld);
    const direction = new THREE.Vector3(1,0,0).applyQuaternion(this.robot.quaternion);
    this.sensor.position.copy(position);
    this.sensor.up.copy(new THREE.Vector3(0,1,0).applyQuaternion(this.robot.quaternion));
    this.sensor.lookAt(position.clone().add(direction)); this.sensor.updateMatrixWorld();
    const background = this.scene.background;
    const diagnosticsVisible=this.estimatorView.visible,lidarVisible=this.lidarView.visible,celestialVisible=this.lighting.celestialGroup.visible;
    const cloudVisible=this.depthCloudView.visible;this.depthCloudView.visible=false;
    this.robot.visible = false; this.points.visible = false;this.estimatorView.visible=false;this.lidarView.visible=false;
    this.renderer.setRenderTarget(this.rgbTarget);
    this.optics(D435.rgbFx,D435.rgbFy,200);
    const rgb=new Uint8Array(D435.width*D435.height*4),bytes=new Uint8Array(rgb.length);
    withCommittedScene(this.scene,()=>{
      this.renderer.render(this.scene,this.sensor);
      const rgbRead=this.rasterRows.bindTopDown(this.renderer,this.rgbTarget);
      this.renderer.readRenderTargetPixels(rgbRead,0,0,D435.width,D435.height,rgb);
      this.optics(D435.fx,D435.fy);
    const measuredDepth=this.renderDepth();
    const depthRead=this.rasterRows.bindTopDown(this.renderer,measuredDepth);
      this.renderer.readRenderTargetPixels(depthRead,0,0,D435.width,D435.height,bytes);
    });
    const depth = new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
    this.scene.overrideMaterial = null; this.scene.background = background;
    this.robot.visible = true; this.points.visible = this.mapVisible;this.estimatorView.visible=diagnosticsVisible;this.lidarView.visible=lidarVisible;this.depthCloudView.visible=cloudVisible;this.lighting.celestialGroup.visible=celestialVisible;
    this.renderer.setRenderTarget(null);
    return { rgb, depth,depthEncoding:D435.depthEncoding };
  }
  async captureAsync(readbackMode:'async'|'sync'='async',submission?:GpuReadSubmission) {
    return this.captureImages(readbackMode,submission) as Promise<{rgb:Uint8Array;depth:Float32Array;depthEncoding:Calibration['depthEncoding'];depthCloud?:DepthCloud}>;
  }
  private async captureImages(readbackMode:'async'|'sync'='async',submission?:GpuReadSubmission,raw?:RawCaptureStorage) {
    if(!this.committedCapture){this.exactPose();this.animate(this.simulationTime);}
    if(this.asyncCapture)throw new Error('RGB-D capture is already in progress');
    this.asyncCapture=true;
    const started=performance.now(),background=this.scene.background,override=this.scene.overrideMaterial,target=this.renderer.getRenderTarget(),robotVisible=this.robot.visible,pointsVisible=this.points.visible,diagnosticsVisible=this.estimatorView.visible,lidarVisible=this.lidarView.visible,celestialVisible=this.lighting.celestialGroup.visible;
    const rgbBytes=raw?.images.color.data??new Uint8Array(D435.width*D435.height*4);
    const depthBytes=raw?new Uint8Array(raw.images.depth.data.buffer,raw.images.depth.data.byteOffset,raw.images.depth.data.byteLength):new Uint8Array(rgbBytes.length);
    const cloudTruth=this.committedTruth?{...this.committedTruth,quaternion:[...this.committedTruth.quaternion]}:undefined;
    const cloudSamples=raw?raw.cloud:this.depthCloudEnabled?new Float32Array(D435.width*D435.height*4):undefined;
    const cloudVisible=this.depthCloudView.visible;
    let blockingReadback=0;
    let captureRead:Promise<void>|undefined;
    try {
      const submit=(read:(target:THREE.WebGLRenderTarget,bytes:Uint8Array|Float32Array)=>void)=>{
        const position=new THREE.Vector3(D435.forward,D435.up,0).applyMatrix4(this.robot.matrixWorld);
        const direction=new THREE.Vector3(1,0,0).applyQuaternion(this.robot.quaternion);
        this.sensor.position.copy(position);this.sensor.up.copy(new THREE.Vector3(0,1,0).applyQuaternion(this.robot.quaternion));
        this.sensor.lookAt(position.clone().add(direction));this.sensor.updateMatrixWorld();
        this.robot.visible=false;this.points.visible=false;this.estimatorView.visible=false;this.lidarView.visible=false;this.depthCloudView.visible=false;
        this.renderer.setRenderTarget(this.rgbTarget);this.optics(D435.rgbFx,D435.rgbFy,200);this.renderer.render(this.scene,this.sensor);
        if(!raw)read(this.rasterRows.bindTopDown(this.renderer,this.rgbTarget),rgbBytes);
        this.optics(D435.fx,D435.fy);const measuredDepth=this.renderDepth();
        if(raw)this.realSensePacking.submit(this.renderer,this.rgbTarget,measuredDepth,raw.images,(width,height,bytes)=>read(this.renderer.getRenderTarget()!,bytes));
        else read(this.rasterRows.bindTopDown(this.renderer,measuredDepth),depthBytes);
        if(cloudSamples){
          this.depthCloudGpu.submit(this.renderer);read(this.depthCloudGpu.target,cloudSamples);
        }
      };
      withCommittedScene(this.scene,()=>{
        if(submission){submit((target,bytes)=>submission.read(target.width,target.height,bytes));captureRead=submission.completed;}
        else if(readbackMode==='async'){
          const submitRead=(read:GpuReadSubmission['read'])=>submit((target,bytes)=>read(target.width,target.height,bytes));
          captureRead=this.packedReadback?this.readback.readBatchPacked(raw?.destination.byteLength??D435.width*D435.height*(8+(this.depthCloudEnabled?16:0)),submitRead,raw?.destination):this.readback.readBatch(submitRead);
        }
        else {
          const submitRead=(read:GpuReadSubmission['read'])=>submit((target,bytes)=>read(target.width,target.height,bytes));
          blockingReadback=this.packedReadback?this.readback.readBatchPackedSync(raw?.destination.byteLength??D435.width*D435.height*(8+(this.depthCloudEnabled?16:0)),submitRead,raw?.destination):this.readback.readBatchSync(submitRead);
          captureRead=Promise.resolve();
        }
      });
    } finally {
      // Both GPU reads are submitted before yielding. Restore the overview now
      // so RAF cannot draw a depth shader or hide the vehicle while fences wait.
      this.scene.overrideMaterial=override;this.scene.background=background;this.robot.visible=robotVisible;
      this.points.visible=pointsVisible;this.estimatorView.visible=diagnosticsVisible;this.lidarView.visible=lidarVisible;this.depthCloudView.visible=cloudVisible;this.lighting.celestialGroup.visible=celestialVisible;this.renderer.setRenderTarget(target);
      if(!captureRead)this.asyncCapture=false;
    }
    const submitted=performance.now();
    try {
      await captureRead;
      const readback=performance.now()-submitted+blockingReadback,rgb=rgbBytes;
      this.captureTimings={readback,renderSubmission:submitted-started-blockingReadback,total:performance.now()-started,method:`${submission?'shared capture batch + ':''}${readbackMode==='sync'?'synchronous WebGL readback in sensor worker':'pooled asynchronous WebGL fences'}`};
      let depthCloud:DepthCloud|undefined,depthRaster:DepthCloudRaster|undefined;
      if(cloudSamples){
        if(!cloudTruth)throw new Error('Depth cloud requires a committed sensor pose');
        const truth=cloudTruth;
        depthCloud={time:truth.time,width:D435.width,height:D435.height,samples:cloudSamples,pose:{x:truth.x,y:truth.y,z:truth.z,quaternion:[...truth.quaternion]},originFlu:[D435.forward,0,D435.up]};
        this.setDepthCloud(depthCloud);
      }else if(raw&&this.depthCloudEnabled){
        if(!cloudTruth)throw Error('Depth cloud requires a committed sensor pose');
        const c=D435;
        depthRaster={encoding:'Z16',time:cloudTruth.time,width:c.width,height:c.height,samples:raw.images.depth.data,
          strideBytes:raw.images.depth.strideBytes,unitsMeters:raw.images.depth.unitsMeters,
          calibration:{fx:c.fx,fy:c.fy,cx:c.cx,cy:c.cy,near:c.near,far:c.far},
          pose:{x:cloudTruth.x,y:cloudTruth.y,z:cloudTruth.z,quaternion:[...cloudTruth.quaternion]},originFlu:[c.forward,0,c.up]};
        this.setDepthRaster(depthRaster);
      }
      return raw?{rgb,depth:raw.images.depth.data,imageLayout:cameraImageLayout(raw.images),...(depthCloud?{depthCloud}:{}),...(depthRaster?{depthRaster}:{})}:
        {rgb,depth:new Float32Array(depthBytes.buffer,depthBytes.byteOffset,depthBytes.byteLength/4),depthEncoding:D435.depthEncoding,...(depthCloud?{depthCloud}:{})};
    } finally {this.asyncCapture=false;}
  }
  setMap(points: number[][],origin?:Pose) {
    const data = new Float32Array(points.length*3);
    points.forEach((p,i) => { data[3*i]=p[0]; data[3*i+1]=p[2]; data[3*i+2]=-p[1]; });
    this.setMapBuffer(data,origin);
  }
  setMapOrigin(origin?:Pose){
    // Estimates live in a gravity-aligned map frame at the initial body pose.
    // Only simulation overlays need that frame placed into the scene world.
    // Physical/replayed measurements use their own map coordinates directly.
    this.points.position.set(origin?.x??0,origin?.z??0,-(origin?.y??0));
    const [w,x,y,z]=origin?.quaternion??[1,0,0,0];
    const yaw=Math.atan2(2*(w*z+x*y),w*w+x*x-y*y-z*z);
    this.points.quaternion.set(0,Math.sin(yaw/2),0,Math.cos(yaw/2));
  }
  setMapBuffer(data:Float32Array,origin?:Pose){
    this.setMapOrigin(origin);
    const attribute=this.points.geometry.getAttribute('position') as THREE.BufferAttribute|undefined;
    if(attribute&&attribute.array.length===data.length){
      const current=attribute.array as Float32Array;
      if(data.some((value,i)=>value!==current[i])){current.set(data);attribute.needsUpdate=true;}
    }else{
      this.points.geometry.dispose();this.points.geometry=new THREE.BufferGeometry();
      this.points.geometry.setAttribute('position',new THREE.BufferAttribute(data,3).setUsage(THREE.DynamicDrawUsage));
    }
    this.points.geometry.computeBoundingSphere();
  }
  setEstimate(estimate:Estimate) {
    this.estimatorView.position.copy(this.points.position);this.estimatorView.quaternion.copy(this.points.quaternion);
    this.covariance.visible=false;
    if(estimate.uncertainty) {
      const {variances,basis}=covarianceAxes(estimate.uncertainty.positionCovariance);
      const columns=[0,1,2].map(i=>new THREE.Vector3(basis[i],basis[6+i],-basis[3+i]));
      const rotation=new THREE.Matrix4().makeBasis(columns[0],columns[1],columns[2]);
      this.covariance.position.set(estimate.x,estimate.z,-estimate.y);
      this.covariance.quaternion.setFromRotationMatrix(rotation).normalize();
      this.covariance.scale.set(...variances.map(v=>2*Math.sqrt(v)) as [number,number,number]);this.covariance.visible=true;
    }
    const graph=estimate.poseGraph,vertices=graph?.keyframes.map(k=>k.position)??[];
    const display=(points:number[][])=>new THREE.Float32BufferAttribute(points.flatMap(p=>[p[0],p[2],-p[1]]),3);
    for(const [object,kind] of [[this.graphEdges,'odometry'],[this.loopEdges,'loop']] as const) {
      const points=graph?.edges.filter(e=>e.kind===kind&&vertices[e.from]&&vertices[e.to]).flatMap(e=>[vertices[e.from],vertices[e.to]])??[];
      object.geometry.dispose();object.geometry=new THREE.BufferGeometry();object.geometry.setAttribute('position',display(points));
    }
    this.keyframes.geometry.dispose();this.keyframes.geometry=new THREE.BufferGeometry();this.keyframes.geometry.setAttribute('position',display(vertices));
  }
  showMap(value: boolean) { this.mapVisible=value; this.points.visible=value; }
}
