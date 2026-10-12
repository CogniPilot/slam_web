import * as THREE from 'three';
import {WorldDrone} from './world-drone';
import type {Truth} from './types';

/** A second visual airframe, driven exclusively by its committed Modelica pose. */
export class DronePresentation {
  readonly robot=new THREE.Group();
  readonly drone:WorldDrone;
  readonly ready:Promise<void>;
  private readonly previousPosition=new THREE.Vector3();
  private readonly position=new THREE.Vector3();
  private readonly previousQuaternion=new THREE.Quaternion();
  private readonly quaternion=new THREE.Quaternion();
  private time=-Infinity;
  private wall=0;
  private interval=100;
  constructor(base:string){
    this.drone=new WorldDrone(base);this.robot.add(this.drone.group);this.ready=this.drone.ready;
    this.robot.visible=false;
  }
  update(truth:Truth){
    const reset=truth.time<=this.time||this.time===-Infinity,now=performance.now();
    this.previousPosition.copy(this.position);this.previousQuaternion.copy(this.quaternion);
    this.position.set(truth.x,truth.z,-truth.y);
    const [w,x,y,z]=truth.quaternion;this.quaternion.set(x,z,-y,w).normalize();
    if(reset){this.previousPosition.copy(this.position);this.previousQuaternion.copy(this.quaternion);}
    this.interval=Math.max(16,Math.min(1000,now-this.wall||100));this.wall=now;this.time=truth.time;
    this.drone.commit(truth.propellerAngles,reset);this.robot.visible=true;this.render(false);
  }
  render(interpolate:boolean){
    const fraction=interpolate?Math.min(1,Math.max(0,(performance.now()-this.wall)/this.interval)):1;
    this.robot.position.lerpVectors(this.previousPosition,this.position,fraction);
    this.robot.quaternion.slerpQuaternions(this.previousQuaternion,this.quaternion,fraction);
    this.drone.render(fraction);this.robot.updateMatrixWorld(true);
  }
}
