import {expect,it} from 'vitest';
import * as THREE from 'three';
import {buildHallway,hallwayLandmarkPattern,HALLWAY,HALLWAY_ROOF} from '../src/world-hallway';
import type {WorldMaterials} from '../src/world-materials';
import {defaultProject,parseProject} from '../src/project';
import {sceneLandmarks} from '../src/scene-landmarks';

it('keeps the complete 140 m survey centerline inside a clear, roofed corridor',()=>{
 const material=new THREE.MeshStandardMaterial(),boxes:{x:number;y:number;z:number;w:number;h:number;d:number}[]=[];
 const materials={surface:()=>material,solid:()=>material,sign:()=>material} as unknown as WorldMaterials;
 buildHallway((x,y,z,w,h,d)=>{boxes.push({x,y,z,w,h,d});return new THREE.Mesh();},materials);
 for(const box of boxes){
  // The flight corridor is a 1 m wide, 1 m tall swept volume around z=1.5.
  const intersectsX=box.x+box.w/2>0&&box.x-box.w/2<140;
  const intersectsY=box.y+box.d/2>-.5&&box.y-box.d/2<.5;
  const intersectsZ=box.z+box.h/2>1&&box.z-box.h/2<2;
  expect(intersectsX&&intersectsY&&intersectsZ).toBe(false);
 }
 expect(HALLWAY.minimumX).toBeLessThan(0);expect(HALLWAY.maximumX).toBeGreaterThan(140);
 expect(HALLWAY_ROOF.minimum[0]).toBeLessThan(0);expect(HALLWAY_ROOF.maximum[0]).toBeGreaterThan(140);
 expect(boxes.length).toBeGreaterThan(100);
});

it('retains the hallway environment and sensor configuration in saved projects',()=>{
 const project={...defaultProject(),environment:'hallway' as const};
 expect(parseProject(JSON.stringify(project))).toEqual(project);
 const map=sceneLandmarks('hallway');
 expect(map.availableEnvironments).toContain('hallway');
 expect(map.landmarks[0].roofVolume).toEqual(HALLWAY_ROOF);
 expect(map.landmarks[0].circulation.at(-1)).toEqual([0,0,1.5]);
});

it('gives all82 wall regions stable distinct grayscale patterns',()=>{
 const patterns=Array.from({length:82},(_,i)=>hallwayLandmarkPattern(i));
 expect(new Set(patterns.map(p=>p.join(''))).size).toBe(82);
 for(let i=0;i<patterns.length;i++){
  expect(hallwayLandmarkPattern(i)).toEqual(patterns[i]);
  for(let j=0;j<i;j++)expect(patterns[i].filter((b,k)=>b!==patterns[j][k]).length).toBeGreaterThanOrEqual(16);
 }
 expect(()=>hallwayLandmarkPattern(-1)).toThrow();
});
it('puts markings on actual walls only in the marked variant and leaves the flight volume clear',()=>{
 const material=new THREE.MeshStandardMaterial();let panels=0;
 const materials={surface:()=>material,solid:()=>material,sign:()=>material,hallwayNotice:()=>material,hallwayTiles:()=>material,hallwayLamp:()=>material,wallMarkings:()=>{panels++;return material;}} as unknown as WorldMaterials;
 const build=(marked:boolean)=>{const boxes:number[][]=[];buildHallway((...args)=>{boxes.push(args.slice(0,6) as number[]);return new THREE.Mesh();},materials,marked);return boxes;};
 const baseline=build(false);expect(panels).toBe(0);const marked=build(true);expect(panels).toBe(82);
 expect(marked.length-baseline.length).toBe(100);
 for(const [x,y,z,w,h,d] of marked)expect(x+w/2>0&&x-w/2<140&&y+d/2>-.5&&y-d/2<.5&&z+h/2>1&&z-h/2<2).toBe(false);
 for(const environment of ['hallway','hallway-marked'] as const){const project={...defaultProject(),environment};expect(parseProject(JSON.stringify(project))).toEqual(project);expect(sceneLandmarks(environment).landmarks[0].roofVolume).toEqual(HALLWAY_ROOF);}
});
