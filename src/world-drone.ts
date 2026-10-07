import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// ArduPilot Quad-X: front-right, rear-left, front-left, rear-right.
const PROPELLERS=['Object_34','Object_36','Object_32','Object_38'] as const;

/** Authored Rumoca example asset. Modelica owns motor phase; Three owns drawing. */
export class WorldDrone {
  readonly group=new THREE.Group();
  readonly ready:Promise<void>;
  readonly propellers:THREE.Group[]=[];
  private previous=[0,0,0,0];
  private current=[0,0,0,0];

  constructor(base:string){
    this.group.name='quadrotor-visual';
    this.ready=new GLTFLoader().loadAsync(new URL('models/drone.glb',base).href).then(({scene})=>{
      const bounds=new THREE.Box3().setFromObject(scene),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
      const scale=.9/Math.max(size.x,size.z);
      scene.scale.setScalar(scale);scene.position.copy(center).multiplyScalar(-scale);
      this.group.add(scene);this.group.updateMatrixWorld(true);
      scene.traverse(object=>{if(object instanceof THREE.Mesh){object.castShadow=true;object.receiveShadow=true;}});
      for(const name of PROPELLERS){
        const mesh=scene.getObjectByName(name);
        if(!mesh)throw new Error(`Drone asset is missing propeller ${name}`);
        const center=new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
        const pivot=new THREE.Group();pivot.name=`${name}_motor`;
        pivot.position.copy(this.group.worldToLocal(center));this.group.add(pivot);
        this.group.updateMatrixWorld(true);pivot.attach(mesh);this.propellers.push(pivot);
      }
      this.render(1);
    });
  }

  commit(angles:readonly number[]|undefined,reset:boolean){
    if(angles&&(angles.length!==4||!angles.every(Number.isFinite)))throw new Error('Drone requires four finite Modelica propeller angles');
    this.previous=this.current;
    this.current=angles?[...angles]:[0,0,0,0];
    if(reset)this.previous=this.current;
  }

  render(fraction:number){
    for(let i=0;i<this.propellers.length;i++)this.propellers[i].rotation.y=this.previous[i]+(this.current[i]-this.previous[i])*fraction;
  }
}
