import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import init,* as rumoca from '@cognipilot/rumoca';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {afterEach,expect,it,vi} from 'vitest';
import {WorldActors} from '../src/world-actors';
import {ModelicaRuntimeMath} from '../src/modelica-runtime-math';
import {defaultSensorModelica,defaultEvaluationModelica} from '../src/project';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

it('loads licensed ordinary traffic and preserves deterministic wheels/walks through independent toggles and rebuilds',async()=>{
  vi.stubGlobal('document',{baseURI:'https://slam.example/lab/'});
  vi.stubGlobal('self',{URL});
  // Node has no bitmap decoder; only texture upload is substituted. All actual
  // geometry, skin bindings and authored animation clips are parsed unchanged.
  vi.stubGlobal('createImageBitmap',async()=>({width:1,height:1,close(){}}));
  const parser=new GLTFLoader();
  vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async url=>{
    const file=String(url).split('/').at(-1)!;
    const data=await readFile(new URL(`../public/models/${file}`,import.meta.url));
    return parser.parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
  });
  const manifest=JSON.parse(await readFile(new URL('../public/models/actor-assets.json',import.meta.url),'utf8'));
  expect(manifest.assets.filter((asset:any)=>asset.file.startsWith('traffic-')).map((asset:any)=>asset.file)).toEqual(['traffic-hatchback.glb','traffic-sedan.glb','traffic-van.glb']);
  for(const asset of manifest.assets){
    const bytes=await readFile(new URL(`../public/models/${asset.file}`,import.meta.url));
    expect(bytes.byteLength).toBe(asset.bytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
  }
  const actors=new WorldActors();await actors.ready;
  await init({module_or_path:readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
  const motion=new ModelicaRuntimeMath((source,model)=>rumoca.WasmSimulationSession.withInteractiveOptions(source,model,1/90,'rk-like',1e-12,1e-12,'[]'),defaultSensorModelica,defaultEvaluationModelica,{x:0,y:0,z:0,quaternion:[1,0,0,0]},defaultSensorModelica);
  const setTime=(time:number)=>{actors.setMotion(motion.actors(time));actors.setTime(time);};
  setTime(0);
  try{
  const cars=()=>actors.group.children.filter(child=>child.name.startsWith('traffic-car-'));
  const people=()=>actors.group.children.filter(child=>child.name.startsWith('pedestrian-'));
  const axles=(root:THREE.Object3D)=>{const result:THREE.Object3D[]=[];root.traverse(child=>{if(child.name.startsWith('axle-'))result.push(child);});return result;};
  const bones=(root:THREE.Object3D)=>{const result:THREE.Bone[]=[];root.traverse(child=>{if(child instanceof THREE.Bone)result.push(child);});return result;};
  const pose=()=>actors.group.children.map(root=>({name:root.name,position:root.position.toArray(),rotation:root.quaternion.toArray(),wheels:axles(root).map(wheel=>wheel.quaternion.toArray()),bones:bones(root).map(bone=>bone.quaternion.toArray())}));
  expect(cars()).toHaveLength(3);expect(people()).toHaveLength(3);
  expect(cars().map(car=>axles(car).length)).toEqual([4,3,4]);
  for(const [i,car] of cars().entries()){
    const box=new THREE.Box3().setFromObject(car,true),size=box.getSize(new THREE.Vector3());
    // Account for route heading: x length on the eastbound straight lane.
    expect(Math.max(size.x,size.z)).toBeCloseTo([4,4.5,5][i],4);expect(box.min.y).toBeCloseTo(0,4);
  }
  const initial=pose(),initialCentres=cars().map(car=>axles(car).map(wheel=>car.worldToLocal(wheel.getWorldPosition(new THREE.Vector3())).toArray()));
  setTime(1);const moving=pose();expect(moving[0].bones).not.toEqual(initial[0].bones);expect(moving[3].wheels).not.toEqual(initial[3].wheels);
  actors.setTime(.5);
  expect(people()[0].position.x).toBeCloseTo((initial[0].position[0]+moving[0].position[0])/2,12);
  actors.setTime(1);expect(pose()).toEqual(moving);
  const beforeInvalid=pose();expect(()=>actors.setMotion({...motion.actors(1),east:[NaN,0,0,0,0,0]})).toThrow('finite');expect(pose()).toEqual(beforeInvalid);
  cars().forEach((car,i)=>axles(car).forEach((wheel,j)=>car.worldToLocal(wheel.getWorldPosition(new THREE.Vector3())).toArray().forEach((value,k)=>expect(value).toBeCloseTo(initialCentres[i][j][k],6))));
  const stoppedCars=cars().map(car=>car.position.toArray());actors.setEnabled(false,true);setTime(2);
  expect(cars().every(car=>!car.visible)).toBe(true);expect(people().every(person=>person.visible)).toBe(true);expect(cars().map(car=>car.position.toArray())).toEqual(stoppedCars);
  actors.setEnabled(true,false);expect(cars()[0].position.toArray()).not.toEqual(stoppedCars[0]);
  const stoppedPeople=people().map(person=>person.position.toArray());setTime(8);expect(people().map(person=>person.position.toArray())).toEqual(stoppedPeople);
  actors.setEnabled(true,true);const atEight=pose();
  const skinState=()=>{
    const meshes:THREE.SkinnedMesh[]=[],skeletons=new Set<THREE.Skeleton>();
    actors.group.traverse(object=>{if(object instanceof THREE.SkinnedMesh){meshes.push(object);skeletons.add(object.skeleton);}});
    for(const skeleton of skeletons)skeleton.update();
    return {count:skeletons.size,meshes:meshes.map(mesh=>({name:mesh.name,bind:mesh.bindMatrix.toArray(),inverseBind:mesh.bindMatrixInverse.toArray(),boneMatrices:Array.from(mesh.skeleton.boneMatrices)}))};
  };
  for(const time of [0,1,8]){
    setTime(time);actors.setSkeletonSharing(false);const original=skinState();
    actors.setSkeletonSharing(true);const shared=skinState();
    expect(original.count).toBe(30);expect(shared.count).toBe(12);expect(shared.meshes).toEqual(original.meshes);
    // Each pedestrian retains its own animation and bone objects.
    const rigs=people().map(person=>{const result=new Set<THREE.Skeleton>();person.traverse(object=>{if(object instanceof THREE.SkinnedMesh)result.add(object.skeleton);});return result;});
    expect(rigs.every(rig=>rig.size===4)).toBe(true);expect([...rigs[0]].every(rig=>!rigs[1].has(rig)&&!rigs[2].has(rig))).toBe(true);
  }
  expect(pose()).toEqual(atEight);
  const retired=new Set<THREE.Skeleton>();actors.group.traverse(object=>{if(object instanceof THREE.SkinnedMesh)retired.add(object.skeleton);});
  let disposedBones=0;for(const skeleton of retired){skeleton.computeBoneTexture();skeleton.boneTexture!.addEventListener('dispose',()=>disposedBones++);}
  expect(retired.size).toBeGreaterThan(0);actors.setEnabled(false,false);actors.build('city','high');expect(disposedBones).toBe(retired.size);
  expect(actors.group.children.every(root=>!root.visible)).toBe(true);actors.setEnabled(true,true);expect(pose()).toEqual(atEight);
  setTime(0);expect(pose()).toEqual(initial);
  actors.setEnabled(false,true);actors.build('asset-city','low');expect(cars()).toHaveLength(2);expect(people()).toHaveLength(2);
  expect(cars().every(car=>!car.visible)).toBe(true);expect(people().every(person=>person.visible)).toBe(true);
  // Low detail retains the car slots after the omitted third pedestrian.
  actors.setEnabled(true,true);const lowFrame=motion.actors(9);actors.setMotion(lowFrame);
  expect(cars()[0].position.x).toBe(lowFrame.east[3]);expect(cars()[1].position.z).toBe(-lowFrame.north[4]);
  actors.setEnabled(false,true);
  actors.build('warehouse');expect(actors.group.children).toHaveLength(0);actors.build('city');expect(cars().every(car=>!car.visible)).toBe(true);
  vi.stubGlobal('document',undefined);vi.stubGlobal('location',undefined);
  const workerActors=new WorldActors('https://slam.example/nested/');await workerActors.ready;
  const calls=vi.mocked(GLTFLoader.prototype.loadAsync).mock.calls.slice(-5);
  expect(calls.every(([url])=>String(url).startsWith('https://slam.example/nested/models/'))).toBe(true);
  expect(workerActors.group.children).toHaveLength(6);
  }finally{motion.free();}
},30000);
