import * as THREE from 'three';
import type {OrbitControls} from 'three/addons/controls/OrbitControls.js';

/** Small presentation transforms only; never changes the plant or sensors. */
export class ViewerCameraControls {
  readonly keys=new Set<string>();
  private readonly forward=new THREE.Vector3();
  private readonly right=new THREE.Vector3();
  private readonly move=new THREE.Vector3();
  private readonly yaw=new THREE.Quaternion();
  private readonly up=new THREE.Vector3(0,1,0);
  update(camera:THREE.PerspectiveCamera,controls:OrbitControls,seconds:number){
    const dt=Math.min(.1,Math.max(0,seconds));
    if(!dt||!this.keys.size)return;
    const axis=(positive:string,negative:string)=>Number(this.keys.has(positive))-Number(this.keys.has(negative));
    // Horizontal movement follows view heading. R/F always changes world
    // altitude, including when orbiting an interior from above.
    camera.getWorldDirection(this.forward);this.forward.y=0;
    if(this.forward.lengthSq()<1e-10)this.forward.set(0,0,-1);else this.forward.normalize();
    this.right.crossVectors(this.forward,this.up).normalize();
    this.move.copy(this.forward).multiplyScalar(axis('w','s')).addScaledVector(this.right,axis('d','a'));
    this.move.y=axis('r','f');if(this.move.lengthSq()>1)this.move.normalize();
    this.move.multiplyScalar(dt*(this.keys.has('shift')?12:4));
    camera.position.add(this.move);controls.target.add(this.move);
    const angle=axis('q','e')*dt*1.1;
    if(angle){
      this.yaw.setFromAxisAngle(this.up,angle);
      this.forward.copy(controls.target).sub(camera.position).applyQuaternion(this.yaw);
      controls.target.copy(camera.position).add(this.forward);
    }
    // Consume orbit damping before the free-flight transform, then avoid a
    // residual orbit delta continually pulling the camera back to its target.
    camera.lookAt(controls.target);camera.updateMatrixWorld();
  }
  clear(){this.keys.clear();}
}

export const VIEWER_KEYS=new Set(['w','a','s','d','q','e','r','f','shift']);
export function isTextEntry(target:EventTarget|null){
  return target instanceof Element&&!!target.closest('input,textarea,select,[contenteditable="true"],.monaco-editor');
}
