import {writeFileSync} from 'node:fs';
import * as THREE from 'three';
import {expect,it} from 'vitest';
import {BIG_CITY_INTERIORS,BigCityWorld} from '../src/world-big-city';
import type {WorldMaterials} from '../src/world-materials';

function materials(){
  const owned=new Map<string,THREE.MeshStandardMaterial>();
  const get=(key:string)=>{let material=owned.get(key);if(!material){material=new THREE.MeshStandardMaterial();owned.set(key,material);}return material;};
  return {owned,adapter:{ready:Promise.resolve(),surface:(kind:string,color:number)=>get(`${kind}:${color}`),
    solid:(...values:number[])=>get(`solid:${values}`),sign:(label:string,color:number)=>get(`sign:${label}:${color}`)} as unknown as WorldMaterials};
}
const vector=(p:readonly number[])=>new THREE.Vector3(p[0],p[2],-p[1]);
function assertClear(city:BigCityWorld,from:readonly number[],to:readonly number[],label:string){
  const start=vector(from),delta=vector(to).sub(start),length=delta.length();
  const rays=new THREE.Raycaster(start,delta.normalize(),.001,length-.001);
  const hits=rays.intersectObject(city.group,true);
  const description=hits.map(hit=>`${(hit.object.userData.parts as string[])[hit.instanceId!]} at ${hit.distance.toFixed(3)}m`);
  expect(description,label).toEqual([]);
}

it('keeps real drone-sized doors and furnished indoor/mezzanine routes in every detail profile',()=>{
  const stub=materials(),city=new BigCityWorld(stub.adapter);
  try{
    for(const detail of ['low','medium','high'] as const){
      city.build(detail);
      for(const interior of BIG_CITY_INTERIORS){
        expect(interior.entrance.clearWidth).toBeGreaterThanOrEqual(3);
        expect(interior.entrance.clearHeight).toBeGreaterThanOrEqual(2.8);
        const route=[interior.entrance.outside,...interior.circulation];
        // Centre and offset rays check a 0.8m-wide, 0.4m-high swept corridor.
        for(let index=1;index<route.length;index++)for(const offset of [[0,0,0],[.4,0,0],[-.4,0,0],[0,.4,0],[0,-.4,0],[0,0,.2],[0,0,-.2]]){
          assertClear(city,route[index-1].map((v,k)=>v+offset[k]),route[index].map((v,k)=>v+offset[k]),`${detail} ${interior.id} segment ${index} offset ${offset}`);
        }
      }
      const names=city.group.children.flatMap(mesh=>mesh.userData.parts as string[]);
      for(const part of ['store:shelf','store:product','store:checkout','apartment:sofa-base','apartment:kitchen-cabinet',
        'apartment:mezzanine','apartment:bed-frame','conference:white-table','conference:office-chair:seat','conference:whiteboard'])
        expect(names,`${detail} preserves ${part}`).toContain(part);
      expect(names.filter(name=>name==='conference:office-chair:seat')).toHaveLength(10);
      // The clear corridor is bounded by real walls; this also checks ray tests
      // are not accidentally inspecting an empty scene or disabled meshes.
      const wallRay=new THREE.Raycaster(vector([20,12,1.5]),new THREE.Vector3(-1,0,0),0,10);
      expect(wallRay.intersectObject(city.group,true).length).toBeGreaterThan(0);
    }
  }finally{city.dispose();for(const material of stub.owned.values())material.dispose();}
});

it('batches a deterministic static city with explicit quality budgets and owns only its resources',async()=>{
  const stub=materials(),city=new BigCityWorld(stub.adapter);await city.ready;
  const profiles:Record<string,typeof city.stats>={};let borrowedDisposals=0,retiredBatches=0;
  for(const detail of ['low','medium','high'] as const){
    city.build(detail);profiles[detail]={...city.stats};
    expect(city.stats.buildings).toBe(18);expect(city.stats.enterableBuildings).toBe(3);
    expect(city.stats.drawCallsPerPass).toBeLessThan(70);
    expect(city.stats.instances).toBeGreaterThan(800);
    expect(city.stats.drawCallsPerPass).toBeLessThan(city.stats.instances/15);
    const state=city.group.children.map(object=>({parts:object.userData.parts,matrices:Array.from((object as THREE.InstancedMesh).instanceMatrix.array)}));
    for(const object of city.group.children)(object as THREE.InstancedMesh).addEventListener('dispose',()=>retiredBatches++);
    city.build(detail);
    expect(city.group.children.map(object=>({parts:object.userData.parts,matrices:Array.from((object as THREE.InstancedMesh).instanceMatrix.array)}))).toEqual(state);
    expect(city.stats).toEqual(profiles[detail]);
  }
  expect(profiles.low.instances).toBeLessThan(profiles.medium.instances);
  expect(profiles.low.triangles).toBeLessThan(profiles.medium.triangles);
  expect(profiles.medium.instances).toBeLessThan(profiles.high.instances);
  expect(retiredBatches).toBeGreaterThan(0);
  for(const material of stub.owned.values())material.addEventListener('dispose',()=>borrowedDisposals++);
  const geometries=new Set(city.group.children.map(object=>(object as THREE.InstancedMesh).geometry));
  let geometryDisposals=0;for(const geometry of geometries)geometry.addEventListener('dispose',()=>geometryDisposals++);
  city.dispose();city.dispose();expect(city.group.children).toHaveLength(0);
  expect(geometryDisposals).toBe(geometries.size);expect(borrowedDisposals).toBe(0);
  expect(()=>city.build()).toThrow('disposed');
  if(process.env.BIG_CITY_PROFILE_REPORT)writeFileSync(process.env.BIG_CITY_PROFILE_REPORT,JSON.stringify({profiles,interiors:BIG_CITY_INTERIORS},null,2));
  for(const material of stub.owned.values())material.dispose();
});
