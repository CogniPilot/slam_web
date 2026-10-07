import {expect,it} from 'vitest';
import * as THREE from 'three';
import {buildCity,type CityBox} from '../src/world-city';
import type {WorldMaterials} from '../src/world-materials';

it('keeps human-scale facades and clear vehicle/sidewalk crossing corridors at every detail level',()=>{
  const material=new THREE.MeshStandardMaterial(),geometry=new THREE.BoxGeometry(1,1,1);
  const materials={surface:()=>material,solid:()=>material,sign:()=>material} as unknown as WorldMaterials;
  try{for(const detail of ['low','medium','high'] as const){
    const scene=new THREE.Group(),boxes:THREE.Mesh[]=[];
    const box:CityBox=(x,y,z,w,h,d)=>{
      const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,z,-y);mesh.scale.set(w,h,d);scene.add(mesh);boxes.push(mesh);return mesh;
    };
    buildCity(box,()=>{},materials,detail);scene.updateMatrixWorld(true);
    const facades=boxes.filter(mesh=>mesh.scale.y>8&&mesh.scale.x>6&&mesh.scale.z>=9);
    expect(facades).toHaveLength(14);
    facades.forEach(mesh=>{expect(mesh.scale.y/mesh.scale.x).toBeLessThan(2);expect(mesh.scale.x).toBeGreaterThan(7);});
    const windows=boxes.filter(mesh=>mesh.scale.x>1.2&&mesh.scale.x<1.3&&mesh.scale.y>.5&&mesh.scale.z<.1);
    expect(windows.length).toBeGreaterThan(60);windows.forEach(mesh=>expect(mesh.scale.y).toBeGreaterThan(2));
    const clear=(a:number[],b:number[])=>{
      const start=new THREE.Vector3(a[0],a[2],-a[1]),end=new THREE.Vector3(b[0],b[2],-b[1]),delta=end.sub(start);
      expect(new THREE.Raycaster(start,delta.clone().normalize(),.001,delta.length()-.001).intersectObject(scene,true)).toEqual([]);
    };
    // Swept width of a normal car and a pedestrian on each marked crossing.
    for(const lane of [-1.65,1.65])for(const offset of [-1.05,0,1.05])clear([-33,lane+offset,.8],[33,lane+offset,.8]);
    for(const x of [-29.8,32])for(const offset of [-.4,0,.4])clear([x+offset,-7.1,1.5],[x+offset,7.1,1.5]);
  }}finally{geometry.dispose();material.dispose();}
});
