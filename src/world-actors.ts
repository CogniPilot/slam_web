import * as THREE from 'three';
import {GLTFLoader, type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import type {Environment, SceneDetail} from './types';
import {validateActorMotionFrame,type ActorMotionFrame} from './modelica-actor-motion';
import {shareClonedSkeletons} from './shared-cloned-skeletons';

type Wheel = {pivot:THREE.Group; radius:number; axis:THREE.Vector3};
type Actor = {
  root:THREE.Group; mixer?:THREE.AnimationMixer; wheels:Wheel[];
  kind:'car'|'person';
  poseSlot:number;
};

/** Authored actors shared by the overview, RGB and depth cameras.
 * Every pose and animation is a function of simulation time, including replay.
 * These objects never supply poses or identities to the estimator.
 */
export class WorldActors {
  readonly group=new THREE.Group();
  readonly ready:Promise<void>;
  private models?:[GLTF,GLTF,GLTF,GLTF,GLTF];
  private actors:Actor[]=[];
  private environment:Environment='city';
  private detail:SceneDetail='high';
  private time=0;
  private currentMotion?:ActorMotionFrame;
  private previousMotion?:ActorMotionFrame;
  private readonly previousRotation=new THREE.Quaternion();
  private readonly currentRotation=new THREE.Quaternion();
  private readonly up=new THREE.Vector3(0,1,0);
  private carsEnabled=true;
  private peopleEnabled=true;
  private skeletonSharing=true;

  constructor(baseUrl?:string) {
    this.group.name='dynamic-actors';
    const loader=new GLTFLoader();
    const pageUrl=typeof document!=='undefined'?document.baseURI:typeof location!=='undefined'?location.href:undefined;
    if(!baseUrl&&!pageUrl)throw new Error('Actor asset loading requires an explicit site base URL');
    const base=new URL('models/',baseUrl??new URL(import.meta.env.BASE_URL,pageUrl).href);
    this.ready=Promise.all(['pedestrian-hoodie.glb','pedestrian-casual.glb','traffic-hatchback.glb','traffic-sedan.glb','traffic-van.glb'].map(name=>loader.loadAsync(new URL(name,base).href))).then(models=>{
      this.models=models as [GLTF,GLTF,GLTF,GLTF,GLTF];
      this.build(this.environment,this.detail);
    });
  }

  build(environment:Environment, detail:SceneDetail='high') {
    this.environment=environment;this.detail=detail;
    const retiredMaterials=new Set<THREE.Material>(),retiredSkeletons=new Set<THREE.Skeleton>();
    for(const actor of this.actors){
      actor.mixer?.stopAllAction();actor.mixer?.uncacheRoot(actor.mixer.getRoot());
      actor.root.traverse(object=>{if(object instanceof THREE.SkinnedMesh)retiredSkeletons.add(object.skeleton);if(object instanceof THREE.Mesh){const materials=Array.isArray(object.material)?object.material:[object.material];for(const material of materials)retiredMaterials.add(material);}});
    }
    for(const material of retiredMaterials)material.dispose();
    // SkeletonUtils creates independent bone textures for each clone. Retire
    // these GPU allocations while retaining the shared authored geometry/maps.
    for(const skeleton of retiredSkeletons)skeleton.dispose();
    this.actors=[];this.group.clear();
    if(!this.models || !['city','asset-city','big-city'].includes(environment))return;
    const [hoodie,casual,...cars]=this.models;
    const people=detail==='low'?2:3;
    for(let i=0;i<people;i++){
      const asset=i===1?casual:hoodie, model=cloneSkeleton(asset.scene);
      if(this.skeletonSharing)shareClonedSkeletons(model);
      const mixer=new THREE.AnimationMixer(model);
      const walk=asset.animations.find(clip=>clip.name==='Walk');
      if(!walk)throw new Error('Pedestrian asset is missing its authored Walk animation');
      mixer.clipAction(walk).play();mixer.setTime(0);model.updateMatrixWorld(true);
      const root=this.normalize(model,1.72,'height');
      this.materials(model,true,i);
      const actor:Actor={root,mixer,wheels:[],kind:'person',poseSlot:i};
      root.visible=this.peopleEnabled;
      root.name=`pedestrian-${i+1}`;this.actors.push(actor);this.group.add(root);
    }
    for(let i=0;i<(detail==='low'?2:3);i++){
      const model=cars[i].scene.clone(true);
      // The van's source forward axis is -X; the other cars face +Z.
      if(i===2)model.rotation.y=Math.PI/2;
      const root=this.normalize(model,[4,4.5,5][i],'length');
      this.materials(model,false,i);
      const wheels=this.wheels(root);
      const actor:Actor={root,wheels,kind:'car',poseSlot:3+i};
      root.visible=this.carsEnabled;
      root.name=`traffic-car-${i+1}`;this.actors.push(actor);this.group.add(root);
    }
    this.setTime(this.time);
  }

  /** Internal matched-profile control; rebuild before rendering the new rigs. */
  setSkeletonSharing(enabled:boolean) {
    if(typeof enabled!=='boolean')throw new Error('Actor skeleton sharing must be boolean');
    if(enabled===this.skeletonSharing)return;
    this.skeletonSharing=enabled;this.build(this.environment,this.detail);
  }

  /** Independent sensor-visible difficulty controls; state survives city rebuilds. */
  setEnabled(cars:boolean,people:boolean) {
    this.carsEnabled=cars;this.peopleEnabled=people;
    for(const actor of this.actors)actor.root.visible=actor.kind==='car'?cars:people;
    this.setTime(this.time);
  }

  private wheels(root:THREE.Group):Wheel[] {
    root.updateMatrixWorld(true);
    const authored:THREE.Object3D[]=[];
    root.traverse(object=>{
      if(!/wheel/i.test(object.name))return;
      for(let parent=object.parent;parent&&parent!==root;parent=parent.parent)if(/wheel/i.test(parent.name))return;
      authored.push(object);
    });
    return authored.map(object=>{
      const parent=object.parent!,box=new THREE.Box3().setFromObject(object,true);
      const pivot=new THREE.Group();pivot.name=`axle-${object.name}`;
      pivot.position.copy(parent.worldToLocal(box.getCenter(new THREE.Vector3())));
      parent.add(pivot);pivot.updateMatrixWorld(true);pivot.attach(object);
      // Axles are horizontal across the normalized vehicle, including source
      // parents with FBX rotations/scales and the sedan's shared rear axle.
      const axis=new THREE.Vector3(1,0,0).transformDirection(new THREE.Matrix4().copy(parent.matrixWorld).invert());
      const radius=(box.max.y-box.min.y)/2;
      if(!Number.isFinite(radius)||radius<=0)throw new Error('Vehicle wheel has invalid radius');
      return {pivot,radius,axis};
    });
  }

  private normalize(model:THREE.Object3D, size:number, dimension:'height'|'length') {
    model.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(model,true), extent=box.getSize(new THREE.Vector3());
    const scale=size/(dimension==='height'?extent.y:extent.z);
    if(!Number.isFinite(scale)||scale<=0)throw new Error('Actor asset has invalid dimensions');
    const center=box.getCenter(new THREE.Vector3());
    model.scale.multiplyScalar(scale);
    // Stable bind-pose placement; don't chase feet or alter bone motion per frame.
    model.position.add(new THREE.Vector3(-center.x*scale,-box.min.y*scale,-center.z*scale));
    const root=new THREE.Group();root.add(model);return root;
  }

  private materials(model:THREE.Object3D,human:boolean, variant:number) {
    const copies=new Map<THREE.Material,THREE.Material>();
    model.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      const source=Array.isArray(object.material)?object.material:[object.material];
      const materials=source.map(material=>{
        if(copies.has(material))return copies.get(material)!;
        const copy=material.clone();
        if(copy instanceof THREE.MeshStandardMaterial){
          copy.envMapIntensity=.85;
          if(human){copy.metalness=0;copy.roughness=/Skin|Eye/i.test(copy.name)?.55:.82;if(variant===2 && /Purple/i.test(copy.name))copy.color.set('#226963');}
          else {copy.roughness=/Window|glass/i.test(copy.name)?.18:/Black|plastic/i.test(copy.name)?.85:.48;}
        }
        copies.set(material,copy);return copy;
      });
      object.material=Array.isArray(object.material)?materials:materials[0];
      object.castShadow=true;object.receiveShadow=true;
      if(object instanceof THREE.SkinnedMesh){
        // Bind-pose bounds don't cover a moving stride. Only a few authored
        // humans exist, so disabling culling is cheaper than reskinning bounds.
        object.frustumCulled=false;
      }
    });
  }

  /** Receive committed Modelica outputs; no host trajectory calculation. */
  setMotion(frame:ActorMotionFrame) {
    validateActorMotionFrame(frame);
    this.previousMotion=this.currentMotion&&frame.time>this.currentMotion.time?this.currentMotion:frame;
    this.currentMotion=frame;
    this.setTime(frame.time);
  }

  setTime(time:number) {
    if(!Number.isFinite(time))return;
    this.time=time;
    const current=this.currentMotion,previous=this.previousMotion;
    if(!current||!previous)return;
    // Presentation only: sensors use the exact committed endpoint. The
    // independent viewer interpolates these outputs with Three.js.
    const fraction=current.time===previous.time?1:THREE.MathUtils.clamp(THREE.MathUtils.inverseLerp(previous.time,current.time,time),0,1);
    for(const actor of this.actors){
      if(!actor.root.visible)continue;
      const i=actor.poseSlot;
      actor.root.position.set(THREE.MathUtils.lerp(previous.east[i],current.east[i],fraction),0,-THREE.MathUtils.lerp(previous.north[i],current.north[i],fraction));
      this.previousRotation.setFromAxisAngle(this.up,previous.sceneYaw[i]);
      this.currentRotation.setFromAxisAngle(this.up,current.sceneYaw[i]);
      actor.root.quaternion.copy(this.previousRotation).slerp(this.currentRotation,fraction);
      // Walk is authored in place. Absolute time keeps pause/seek/replay exact.
      actor.mixer?.setTime(THREE.MathUtils.lerp(previous.walkTime[i],current.walkTime[i],fraction));
      const distance=THREE.MathUtils.lerp(previous.distance[i],current.distance[i],fraction);
      for(const wheel of actor.wheels)wheel.pivot.quaternion.setFromAxisAngle(wheel.axis,distance/wheel.radius);
    }
    this.group.updateMatrixWorld(true);
  }
}
