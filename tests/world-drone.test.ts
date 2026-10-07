import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {afterEach,expect,it,vi} from 'vitest';
import {WorldDrone} from '../src/world-drone';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

it('loads the credited Rumoca drone, preserves motor pivots and renders committed phases through pause and rewind',async()=>{
  const bytes=await readFile('public/models/drone.glb');
  expect(createHash('sha256').update(bytes).digest('hex')).toBe('6eb0d2b6ed92a83b89101f2acc33cd3328b3e166555c82bf757e4c358ae731f4');
  const parser=new GLTFLoader();
  vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async()=>parser.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),''));
  const drone=new WorldDrone('https://slam.example/lab/');await drone.ready;
  expect(drone.propellers.map(p=>p.name)).toEqual(['Object_34_motor','Object_36_motor','Object_32_motor','Object_38_motor']);
  const centers=drone.propellers.map(p=>p.position.clone());
  expect(centers.map(p=>[Math.sign(p.x),Math.sign(p.z)])).toEqual([[1,1],[-1,-1],[1,-1],[-1,1]]);
  drone.commit([1,2,-3,-4],true);drone.render(1);
  expect(drone.propellers.map(p=>p.rotation.y)).toEqual([1,2,-3,-4]);
  drone.commit([5,6,-7,-8],false);drone.render(.25);
  expect(drone.propellers.map(p=>p.rotation.y)).toEqual([2,3,-4,-5]);
  drone.render(.25);expect(drone.propellers.map(p=>p.rotation.y)).toEqual([2,3,-4,-5]);
  drone.commit([0,0,0,0],true);drone.render(.5);
  expect(drone.propellers.map(p=>p.rotation.y)).toEqual([0,0,0,0]);
  centers.forEach((center,i)=>expect(drone.propellers[i].position.equals(center)).toBe(true));
  drone.group.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(drone.group),size=bounds.getSize(new THREE.Vector3());
  expect(Math.max(size.x,size.z)).toBeCloseTo(.9,6);
  expect(()=>drone.commit([1,2,3,NaN],false)).toThrow('finite Modelica');
  // Saved models without the new output remain drawable, with stationary props.
  drone.commit(undefined,true);drone.render(1);expect(drone.propellers.map(p=>p.rotation.y)).toEqual([0,0,0,0]);
});
