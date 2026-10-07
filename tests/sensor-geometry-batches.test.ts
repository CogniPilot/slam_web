import {expect,it} from 'vitest';
import * as THREE from 'three';
import {SensorGeometryBatches,withSensorGeometry} from '../src/sensor-geometry-batches';

it('retains exact issued instance matrices across RGB materials and restores visibility after failure',()=>{
  const scene=new THREE.Scene(),root=new THREE.Group();scene.add(root);
  const owner=new SensorGeometryBatches(scene,root),matrices:Float32Array[]=[];
  for(let index=0;index<3;index++){
    const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial({color:index}),2);
    mesh.userData.sensorGeometryKey='box';
    for(let instance=0;instance<2;instance++)mesh.setMatrixAt(instance,new THREE.Matrix4().makeTranslation(index*4+instance,.125,-2.75));
    matrices.push(new Float32Array(mesh.instanceMatrix.array));root.add(mesh);
  }
  owner.rebuild();const batch=owner.group.children[0] as THREE.InstancedMesh;
  expect(batch.count).toBe(6);expect([...batch.instanceMatrix.array]).toEqual(matrices.flatMap(array=>[...array]));
  const sources=root.children.filter(mesh=>mesh!==owner.group);
  expect(()=>withSensorGeometry(scene,()=>{
    expect(owner.group.visible).toBe(true);expect(sources.every(mesh=>!mesh.visible)).toBe(true);throw new Error('submission');
  })).toThrow('submission');
  expect(owner.group.visible).toBe(false);expect(sources.every(mesh=>mesh.visible)).toBe(true);
  sources[0].visible=false;withSensorGeometry(scene,()=>expect(owner.group.visible).toBe(false));expect(sources[0].visible).toBe(false);
  owner.clear();expect(root.children).toHaveLength(3);
});
