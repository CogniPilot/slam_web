import * as THREE from 'three';

const owners=new WeakMap<THREE.Scene,SensorGeometryBatches>();

/** Static unit-geometry instances may share an unlit sensor draw even when
 * RGB needs separate materials. Dynamic/skinned objects retain their draws. */
export class SensorGeometryBatches {
  enabled=true;
  readonly group=new THREE.Group();
  private sources:THREE.InstancedMesh[]=[];
  constructor(scene:THREE.Scene,private readonly root:THREE.Group){
    owners.set(scene,this);this.group.name='sensor-static-geometry';this.group.visible=false;
  }
  clear(){
    for(const mesh of this.group.children as THREE.InstancedMesh[]){mesh.geometry.dispose();mesh.dispose();}
    this.group.removeFromParent();this.group.clear();this.sources=[];
  }
  rebuild(){
    this.clear();
    const batches=new Map<string,THREE.InstancedMesh[]>();
    for(const object of this.root.children){
      // Only World-issued unit primitive batches qualify. Arbitrary imported
      // geometry, object transforms and instance colors are never guessed.
      if(!(object instanceof THREE.InstancedMesh)||!object.userData.sensorGeometryKey||!object.matrix.equals(new THREE.Matrix4()))continue;
      const key=object.userData.sensorGeometryKey as string;
      const list=batches.get(key)??[];list.push(object);batches.set(key,list);
    }
    const matrix=new THREE.Matrix4();
    for(const meshes of batches.values()){
      if(meshes.length<2)continue;
      const first=meshes[0],count=meshes.reduce((sum,mesh)=>sum+mesh.count,0);
      const batch=new THREE.InstancedMesh(first.geometry.clone(),first.material,count);
      let destination=0;
      for(const mesh of meshes)for(let index=0;index<mesh.count;index++){
        mesh.getMatrixAt(index,matrix);batch.setMatrixAt(destination++,matrix);
      }
      batch.computeBoundingSphere();this.group.add(batch);this.sources.push(...meshes);
    }
    this.root.add(this.group);this.group.updateMatrixWorld(true);
  }
  render<T>(render:()=>T):T{
    // Individually hidden sources cannot be represented by this static batch.
    if(!this.enabled||!this.sources.length||this.sources.some(mesh=>!mesh.visible))return render();
    for(const mesh of this.sources)mesh.visible=false;
    this.group.visible=true;
    try{return render();}finally{this.group.visible=false;for(const mesh of this.sources)mesh.visible=true;}
  }
}

export function withSensorGeometry<T>(scene:THREE.Scene,render:()=>T):T{
  const owner=owners.get(scene);return owner?owner.render(render):render();
}
