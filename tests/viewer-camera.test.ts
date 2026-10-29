import * as THREE from 'three';
import {describe,it,expect} from 'vitest';
import {ViewerCamera,CAMERA_VIEWS,nextCameraView} from '../src/viewer-camera';

function fixture(){
  const rig=new ViewerCamera(),camera=new THREE.PerspectiveCamera(),drone=new THREE.Object3D();
  camera.position.set(-9,7,3);drone.position.set(4,2,-3);
  return {rig,camera,drone,target:new THREE.Vector3(1,2,3)};
}
describe('viewer follow camera',()=>{
  it('keeps world heading fixed while the drone yaws',()=>{
    const {rig,camera,drone,target}=fixture();
    rig.select('follow',camera,target);rig.update(camera,drone,target);
    const eye=camera.position.clone(),orientation=camera.quaternion.clone();
    drone.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),1.3);
    rig.update(camera,drone,target);
    expect(camera.position.toArray()).toEqual(eye.toArray());
    expect(camera.quaternion.toArray()).toEqual(orientation.toArray());
  });
  it('moves relative to the followed drone and retains that offset in motion',()=>{
    const {rig,camera,drone,target}=fixture();
    rig.select('follow',camera,target);rig.move(new Set(['w','d','r']),.1);
    rig.update(camera,drone,target);
    expect(camera.position.x).toBeCloseTo(-1.1);expect(camera.position.y).toBeCloseTo(4.4);expect(camera.position.z).toBeCloseTo(-2.6);
    const relative=camera.position.clone().sub(drone.position);
    drone.position.set(10,3,8);rig.update(camera,drone,target);
    expect(camera.position.clone().sub(drone.position).distanceTo(relative)).toBeLessThan(1e-12);
    rig.move(new Set(['q']),.1);rig.update(camera,drone,target);
    expect(camera.position.clone().sub(drone.position).distanceTo(relative)).toBeGreaterThan(.1);
  });
  it('tracks drone translation without changing its pose',()=>{
    const {rig,camera,drone,target}=fixture();
    rig.select('chase',camera,target);rig.update(camera,drone,target);
    expect(camera.position.toArray()).toEqual([-1.5,4,-3]);
    const before=camera.position.clone(),offset=new THREE.Vector3(3,-1,5);
    drone.position.add(offset);const pose=drone.matrix.clone();
    rig.update(camera,drone,target);
    expect(camera.position.clone().sub(before).toArray()).toEqual(offset.toArray());
    expect(drone.matrix).toEqual(pose);expect(drone.quaternion.toArray()).toEqual([0,0,0,1]);
  });
  it('follows heading without rolling with the airframe',()=>{
    const {rig,camera,drone,target}=fixture();
    drone.quaternion.setFromEuler(new THREE.Euler(.4,Math.PI/2,0,'YXZ'));
    rig.select('chase',camera,target);rig.update(camera,drone,target);
    expect(camera.position.x).toBeCloseTo(drone.position.x);
    expect(camera.position.z).toBeCloseTo(drone.position.z+5.5);
    expect(camera.up.toArray()).toEqual([0,1,0]);
  });
  it('places side and overhead views relative to the same rendered pose',()=>{
    const {rig,camera,drone,target}=fixture();
    rig.select('side',camera,target);rig.update(camera,drone,target);
    expect(camera.position.toArray()).toEqual([4,3.8,2]);
    rig.select('overhead',camera,target);rig.update(camera,drone,target);
    expect(camera.position.toArray()).toEqual([4,14,-3]);
    expect(camera.getWorldDirection(new THREE.Vector3()).y).toBeCloseTo(-1);
    expect(camera.quaternion.toArray().every(Number.isFinite)).toBe(true);
  });
  it('restores the free camera after switching among follow views',()=>{
    const {rig,camera,drone,target}=fixture(),eye=camera.position.clone(),aim=target.clone();
    for(const mode of ['chase','side','overhead'] as const){rig.select(mode,camera,target);rig.update(camera,drone,target);}
    rig.select('free',camera,target);
    expect(camera.position.toArray()).toEqual(eye.toArray());expect(target.toArray()).toEqual(aim.toArray());
    expect(camera.up.toArray()).toEqual([0,1,0]);
    drone.position.set(100,100,100);rig.update(camera,drone,target);
    expect(camera.position.toArray()).toEqual(eye.toArray());
  });
  it('cycles through every dropdown view and wraps',()=>{
    let view=CAMERA_VIEWS[0].id as typeof CAMERA_VIEWS[number]['id'];
    const seen=[];
    for(let i=0;i<CAMERA_VIEWS.length;i++){seen.push(view);view=nextCameraView(view);}
    expect(seen).toEqual(CAMERA_VIEWS.map(view=>view.id));expect(view).toBe('follow');
  });
});

it('keeps user orbit and zoom while tracking translation, ignoring airframe yaw and roll',()=>{
  const {rig,camera,drone,target}=fixture();
  rig.select('orbit-follow',camera,target);rig.update(camera,drone,target);
  expect(target.toArray()).toEqual(drone.position.toArray());
  // This is the eye/target transform produced by an orbit plus a wheel zoom.
  camera.position.copy(target).add(new THREE.Vector3(2,1,-3));
  rig.update(camera,drone,target);
  const offset=camera.position.clone().sub(target),orientation=camera.quaternion.clone();
  drone.position.add(new THREE.Vector3(7,3,-9));
  drone.quaternion.setFromEuler(new THREE.Euler(.5,2.1,.7));
  const pose=drone.position.clone(),attitude=drone.quaternion.clone();
  rig.update(camera,drone,target);
  expect(camera.position.clone().sub(target).distanceTo(offset)).toBeLessThan(1e-12);
  expect(camera.quaternion.angleTo(orientation)).toBeLessThan(1e-7);
  expect(target.toArray()).toEqual(pose.toArray());
  expect(drone.position.toArray()).toEqual(pose.toArray());expect(drone.quaternion.toArray()).toEqual(attitude.toArray());
  // A paused repeat must neither snap the eye nor consume another translation.
  const eye=camera.position.clone();rig.update(camera,drone,target);
  expect(camera.position.toArray()).toEqual(eye.toArray());
});
