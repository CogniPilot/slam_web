import {expect,it} from 'vitest';
import {Group,Mesh,MeshStandardMaterial,PerspectiveCamera} from 'three';
import {buildOfficeLoop,OFFICE_LOOP_ROUTE,OFFICE_LOOP_ROOF} from '../src/world-office-loop';
import {ViewerCutaway} from '../src/viewer-cutaway';
import type {WorldMaterials} from '../src/world-materials';
import {defaultProject,parseProject} from '../src/project';
import {sceneLandmarks} from '../src/scene-landmarks';
it('has a closed80m four-sided route inside connected clear corridors',()=>{
 const material=new MeshStandardMaterial(),boxes:number[][]=[];
 const materials={hallwayTiles:()=>material,hallwayLamp:()=>material,wallMarkings:()=>material,surface:()=>material,hallwayNotice:()=>material} as unknown as WorldMaterials;
 buildOfficeLoop((...args)=>{boxes.push(args.slice(0,6) as number[]);return new Mesh();},materials);
 expect(OFFICE_LOOP_ROUTE.at(-1)).toEqual(OFFICE_LOOP_ROUTE[0]);
 let length=0;
 for(let i=0;i<4;i++){
  const a=OFFICE_LOOP_ROUTE[i],b=OFFICE_LOOP_ROUTE[i+1];length+=Math.hypot(b[0]-a[0],b[1]-a[1]);
  for(let k=0;k<=100;k++){
   const x=a[0]+(b[0]-a[0])*k/100,y=a[1]+(b[1]-a[1])*k/100;
   for(const [cx,cy,cz,w,h,d] of boxes)expect(Math.abs(x-cx)<w/2+.5&&Math.abs(y-cy)<d/2+.5&&cz+h/2>1&&cz-h/2<2).toBe(false);
  }
 }
 expect(length).toBe(80);expect(OFFICE_LOOP_ROOF.maximum[0]).toBeGreaterThan(24);
 const p={...defaultProject(),environment:'office-loop' as const};expect(parseProject(JSON.stringify(p))).toEqual(p);expect(sceneLandmarks('office-loop').landmarks[0].circulation).toEqual(OFFICE_LOOP_ROUTE);
});
it('restores opaque sensor materials and roof visibility after each viewer render',()=>{
 const root=new Group(),original=new MeshStandardMaterial(),wall=new Mesh(undefined,original),roof=new Mesh(),floor=new Mesh(undefined,original),camera=new PerspectiveCamera(),drone=new Group();root.add(wall,roof,floor);
 wall.userData.viewerOccluder='wall';roof.userData.viewerOccluder='roof';floor.userData.viewerOccluder='floor';const cutaway=new ViewerCutaway();camera.position.set(0,2,6);
 const originalColor=original.color.clone();
 cutaway.render(root,true,camera,drone,()=>{
  expect(wall.material).not.toBe(original);expect((wall.material as MeshStandardMaterial).opacity).toBe(1);expect((wall.material as MeshStandardMaterial).transparent).toBe(false);
  expect((floor.material as MeshStandardMaterial).color.getHex()).toBe(0x687483);expect(roof.visible).toBe(false);expect(original.color).toEqual(originalColor);
 });
 expect(wall.material).toBe(original);expect(floor.material).toBe(original);expect(roof.visible).toBe(true);
 expect(()=>cutaway.render(root,true,camera,drone,()=>{throw Error('Render failed');})).toThrow('Render failed');expect(wall.material).toBe(original);expect(floor.material).toBe(original);expect(roof.visible).toBe(true);
 cutaway.render(root,false,camera,drone,()=>{expect(wall.material).toBe(original);expect(floor.material).toBe(original);expect(roof.visible).toBe(true);});
});
