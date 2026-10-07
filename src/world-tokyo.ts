import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';

// Artist-authored geometry and clips, hosted locally with explicit attribution.
export class TokyoWorld {
  readonly group=new THREE.Group();
  readonly ready:Promise<void>;
  private mixer?:THREE.AnimationMixer;
  constructor(base=document.baseURI){
    const decoder=new DRACOLoader().setDecoderPath(new URL('models/draco/',base).href).setWorkerLimit(1);
    const loader=new GLTFLoader().setDRACOLoader(decoder);
    this.ready=loader.loadAsync(new URL('models/LittlestTokyo.glb',base).href).then(gltf=>{
      const model=gltf.scene,bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
      const scale=30/Math.max(size.x,size.z);model.scale.setScalar(scale);
      model.position.set(17-(bounds.min.x+bounds.max.x)*scale/2,-bounds.min.y*scale,-(bounds.min.z+bounds.max.z)*scale/2);
      this.group.add(model);this.mixer=new THREE.AnimationMixer(model);
      for(const clip of gltf.animations)this.mixer.clipAction(clip).play();
      this.setTime(0);decoder.dispose();
    }).catch(error=>{decoder.dispose();throw error;});
  }
  setTime(time:number){this.mixer?.setTime(time);this.group.updateMatrixWorld(true);}
}
