import * as THREE from 'three';
import {expect,it,vi} from 'vitest';
import {World} from '../src/world';
import {ViewerCamera} from '../src/viewer-camera';
import {WorkerViewer} from '../src/worker-viewer';

function presentation(){
  // Use the real camera/mode/bridge code without constructing a GPU or plant.
  const world=Object.create(World.prototype) as World;
  Object.assign(world,{view:new THREE.PerspectiveCamera(),viewerCamera:new ViewerCamera(),
    controls:{target:new THREE.Vector3(1,2,3),update:vi.fn()},robot:new THREE.Object3D(),cameraVehicle:0});
  world.view.position.set(-9,7,3);
  world.robot.position.set(4,2,-3);
  const second=new THREE.Object3D();second.position.set(20,5,10);
  Object.assign(world,{otherVehicle:{robot:second}});
  return {world,second};
}
it('enables drag/zoom with a vehicle-centred target and restores existing mode constraints',()=>{
  const {world}=presentation(),eye=world.view.position.clone(),target=world.controls.target.clone();
  world.setCameraView('orbit-follow');
  expect(world.controls.enabled).toBe(true);expect(world.controls.enablePan).toBe(false);
  expect(world.controls.maxPolarAngle).toBe(Math.PI);
  expect(world.controls.target.toArray()).toEqual(world.robot.position.toArray());
  for(const mode of ['follow','chase','side','overhead'] as const){
    world.setCameraView(mode);expect(world.controls.enabled).toBe(false);
    expect(world.controls.enablePan).toBe(true);expect(world.controls.maxPolarAngle).toBe(Math.PI*.49);
  }
  world.setCameraView('free');expect(world.controls.enabled).toBe(true);
  expect(world.view.position.toArray()).toEqual(eye.toArray());expect(world.controls.target.toArray()).toEqual(target.toArray());
});
it('publishes the orbit offset for the selected vehicle, including a worker interpolated pose',()=>{
  const {world,second}=presentation();world.setCameraView('orbit-follow');
  world.view.position.copy(world.controls.target).add(new THREE.Vector3(-3,2,4));
  const viewer=Object.create(WorkerViewer.prototype) as WorkerViewer;
  const postMessage=vi.fn();Object.assign(viewer,{world,worker:{postMessage}});
  world.cameraVehicle=1;viewer.camera();
  const message=postMessage.mock.calls.at(-1)![0];
  expect(message.mode).toBe('orbit-follow');expect(message.vehicle).toBe(1);
  expect(message.target).toEqual(second.position.toArray());
  expect(new THREE.Vector3().fromArray(message.position).sub(second.position).toArray()).toEqual([-3,2,4]);
  // The worker applies the same mode to its independently interpolated pose.
  const rendered=new THREE.Object3D();rendered.position.copy(second.position).addScalar(-.25);
  const camera=new THREE.PerspectiveCamera(),target=new THREE.Vector3().fromArray(message.target),rig=new ViewerCamera();
  rig.select(message.mode,camera,target);camera.position.fromArray(message.position);
  rig.update(camera,rendered,target);
  expect(target.toArray()).toEqual(rendered.position.toArray());
  expect(camera.position.clone().sub(target).toArray()).toEqual([-3,2,4]);
  // On returning to the first vehicle, carry the same user-selected offset.
  world.cameraVehicle=0;viewer.camera();
  expect(postMessage.mock.calls.at(-1)![0].target).toEqual(world.robot.position.toArray());
  expect(world.view.position.clone().sub(world.controls.target).toArray()).toEqual([-3,2,4]);
});
