import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {afterEach,expect,it,vi} from 'vitest';
import {WorldActors} from '../src/world-actors';
import {World} from '../src/world';
import {ViewerCutaway} from '../src/viewer-cutaway';
import type {ActorMotionFrame,ActorMotionVector} from '../src/modelica-actor-motion';

afterEach(()=>vi.restoreAllMocks());
const vector=(value=0)=>Array(6).fill(value) as ActorMotionVector;
const frame=(time:number,east=0):ActorMotionFrame=>({
  time,east:vector(east),north:vector(),sceneYaw:vector(),distance:vector(2.2*time),walkTime:vector(time),
});

async function actors(){
  // Small authored rigs exercise the real constructor and animation path without GPU assets.
  vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async()=>{
    const scene=new THREE.Group();scene.add(new THREE.Mesh(new THREE.BoxGeometry(1,2,4),new THREE.MeshBasicMaterial()));
    return {scene,animations:[new THREE.AnimationClip('Walk',1,[])]} as unknown as GLTF;
  });
  const result=new WorldActors('https://slam.example/');await result.ready;return result;
}

it('interpolates actor arrivals even when drone physics has advanced beyond the latest actor sample',async()=>{
  let wall=900;vi.spyOn(performance,'now').mockImplementation(()=>wall);
  const model=await actors();
  const first=frame(0),next=frame(.2,.44);model.setMotion(first);wall=1000;model.setMotion(next);
  const committed=structuredClone(next);
  const world=Object.create(World.prototype);
  Object.assign(world,{
    actors:model,drone:{render:vi.fn()},robot:new THREE.Group(),
    previousPosition:new THREE.Vector3(),currentPosition:new THREE.Vector3(),
    previousQuaternion:new THREE.Quaternion(),currentQuaternion:new THREE.Quaternion(),
    previousTime:.38,simulationTime:.4,commitWall:1000,frameWall:16,
    lighting:{setMode:vi.fn(),invalidateShadows:vi.fn()},lastShadowTime:0,currentEnvironment:'city',
    controls:{update:vi.fn(),target:new THREE.Vector3()},viewerCamera:{update:vi.fn()},
    renderer:{setRenderTarget:vi.fn(),render:vi.fn()},scene:new THREE.Scene(),view:new THREE.PerspectiveCamera(),
    environment:new THREE.Group(),viewerCutaway:false,cutaway:new ViewerCutaway(),
  });
  wall=1025;world.render(true);
  const car=model.group.getObjectByName('traffic-car-1')!;
  expect(car.position.x).toBeCloseTo(.11,12);
  wall=1050;world.render(true);expect(car.position.x).toBeCloseTo(.22,12);
  wall=1100;world.render(true);expect(car.position.x).toBeCloseTo(.44,12);
  // Exact sensor endpoints and the committed payload remain untouched.
  model.setTime(.2);expect(car.position.x).toBe(.44);expect(next).toEqual(committed);
});

it('does not sweep recycled cars across the street while other actors keep interpolating',async()=>{
  const model=await actors(),first=frame(0),next=frame(1,2.2);
  first.east[3]=32;next.east[3]=-31.8;
  first.sceneYaw[3]=Math.PI/2;next.sceneYaw[3]=-Math.PI/2;
  model.setMotion(first);model.setMotion(next);
  const recycled=model.group.getObjectByName('traffic-car-1')!;
  const ordinary=model.group.getObjectByName('traffic-car-2')!;
  for(const time of [.1,.5,.9]){
    model.setTime(time);
    expect(recycled.position.x).toBe(32);
    expect(recycled.quaternion.angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2))).toBeCloseTo(0,12);
    expect(ordinary.position.x).toBeCloseTo(2.2*time,12);
  }
  model.setTime(1);expect(recycled.position.x).toBe(-31.8);
});

it('presents exact endpoints when paused and resets interpolation on rewind or duplicate timestamps',async()=>{
  let wall=900;vi.spyOn(performance,'now').mockImplementation(()=>wall);
  const model=await actors(),car=()=>model.group.getObjectByName('traffic-car-1')!;
  model.setMotion(frame(0));wall=1000;model.setMotion(frame(.2,.44));
  wall=1050;model.render(true);expect(car().position.x).toBeCloseTo(.22,12);
  model.render(false);expect(car().position.x).toBe(.44);
  model.setMotion(frame(0,8));model.render(true);expect(car().position.x).toBe(8);
  model.setMotion(frame(0,9));model.render(true);expect(car().position.x).toBe(9);
});
