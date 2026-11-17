import * as THREE from 'three';

export const CAMERA_VIEWS = [
  {id:'follow',label:'Follow · world heading'},
  {id:'orbit-follow',label:'Follow · free orbit'},
  {id:'chase',label:'Chase · vehicle heading'},
  {id:'side',label:'Side follow'},
  {id:'overhead',label:'Overhead follow'},
  {id:'free',label:'Free camera'},
] as const;
export type CameraView = typeof CAMERA_VIEWS[number]['id'];
export function nextCameraView(view:CameraView):CameraView {
  return CAMERA_VIEWS[(CAMERA_VIEWS.findIndex(item=>item.id===view)+1)%CAMERA_VIEWS.length].id;
}

/** Uses the rendered drone pose; never modifies simulation or sensor cameras. */
export class ViewerCamera {
  mode:CameraView='free';
  readonly offset=new THREE.Vector3();
  yawOffset=0;
  private readonly heading=new THREE.Vector3(1,0,0);
  private readonly worldHeading=new THREE.Vector3(1,0,0);
  private readonly right=new THREE.Vector3();
  private readonly displacement=new THREE.Vector3();
  private readonly rotation=new THREE.Quaternion();
  private readonly target=new THREE.Vector3();
  private readonly freePosition=new THREE.Vector3();
  private readonly freeTarget=new THREE.Vector3();
  private readonly up=new THREE.Vector3(0,1,0);

  rememberFree(camera:THREE.Camera,target:THREE.Vector3) {
    this.freePosition.copy(camera.position);this.freeTarget.copy(target);
  }
  select(mode:CameraView,camera:THREE.Camera,target:THREE.Vector3) {
    if(this.mode===mode)return;
    if(this.mode==='free')this.rememberFree(camera,target);
    this.mode=mode;this.offset.set(0,0,0);this.yawOffset=0;
    if(mode==='free'){
      camera.position.copy(this.freePosition);target.copy(this.freeTarget);
      camera.up.copy(this.up);camera.lookAt(target);camera.updateMatrixWorld();
    }
  }
  move(keys:ReadonlySet<string>,seconds:number){
    const dt=Math.min(.1,Math.max(0,seconds));
    if(this.mode==='free'||this.mode==='orbit-follow'||!dt||!keys.size)return;
    const axis=(positive:string,negative:string)=>Number(keys.has(positive))-Number(keys.has(negative));
    const speed=dt*(keys.has('shift')?12:4);
    this.offset.x+=axis('w','s')*speed;this.offset.z+=axis('d','a')*speed;
    this.offset.y+=axis('r','f')*speed;this.yawOffset+=axis('q','e')*dt*1.1;
  }
  update(camera:THREE.Camera,drone:THREE.Object3D,target:THREE.Vector3) {
    if(this.mode==='free')return;
    if(this.mode==='orbit-follow'){
      // OrbitControls owns the eye-to-target vector (drag/zoom). Translate
      // both ends together to the rendered vehicle, ignoring its attitude.
      this.displacement.copy(drone.position).sub(target);
      camera.position.add(this.displacement);target.copy(drone.position);
      camera.up.copy(this.up);camera.lookAt(target);camera.updateMatrixWorld();
      return;
    }
    this.right.set(1,0,0).applyQuaternion(drone.quaternion);this.right.y=0;
    if(this.right.lengthSq()>1e-8)this.heading.copy(this.right).normalize();
    const heading=this.mode==='follow'?this.worldHeading:this.heading;
    this.right.crossVectors(heading,this.up);
    camera.position.copy(drone.position);this.target.copy(drone.position);
    camera.up.copy(this.up);
    if(this.mode==='follow'||this.mode==='chase'){
      this.displacement.copy(heading).multiplyScalar(-5.5);this.displacement.y=2;
      this.target.addScaledVector(heading,1);this.target.y+=.4;
    }else if(this.mode==='side'){
      this.displacement.copy(this.right).multiplyScalar(5);this.displacement.y=1.8;
      this.target.y+=.3;
    }else{
      this.displacement.set(0,12,0);camera.up.copy(heading);
    }
    this.displacement.addScaledVector(heading,this.offset.x).addScaledVector(this.right,this.offset.z);
    this.displacement.y+=this.offset.y;
    this.rotation.setFromAxisAngle(this.up,this.yawOffset);this.displacement.applyQuaternion(this.rotation);
    camera.position.add(this.displacement);
    if(camera.position.distanceToSquared(this.target)<1e-6)camera.position.y+=.1;
    target.copy(this.target);camera.lookAt(target);camera.updateMatrixWorld();
  }
}
