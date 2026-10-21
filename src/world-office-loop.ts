import type * as THREE from 'three';
import type {WorldMaterials} from './world-materials';
import {hallwayLandmarkPattern} from './world-hallway';
export const OFFICE_LOOP=Object.freeze({length:24,width:16,corridor:3.6,height:3.2});
const half=OFFICE_LOOP.corridor/2;
export const OFFICE_LOOP_ROOF={minimum:[-half,-half,0],maximum:[24+half,16+half,3.2]};
export const OFFICE_LOOP_ROUTE:readonly (readonly [number,number,number])[]=[[0,0,1.5],[24,0,1.5],[24,16,1.5],[0,16,1.5],[0,0,1.5]];
type Box=(x:number,y:number,z:number,w:number,h:number,d:number,material:THREE.MeshStandardMaterial)=>THREE.Mesh;
/** Four connected corridors around a central office block, not an out-and-back. */
export function buildOfficeLoop(rawBox:Box,m:WorldMaterials){
 const height=OFFICE_LOOP.height;
 const box:Box=(...args)=>{const mesh=rawBox(...args);mesh.userData.viewerOccluder='wall';return mesh;};
 const floor=box(12,8,-.1,24+2*half,.2,16+2*half,m.hallwayTiles(false,24+2*half,16+2*half));floor.name='office-floor';delete floor.userData.viewerOccluder;
 const roof=box(12,8,height+.1,24+2*half,.2,16+2*half,m.hallwayTiles(true,24+2*half,16+2*half));roof.name='office-ceiling';roof.userData.viewerOccluder='roof';
 let id=0;
 function run(ax:number,ay:number,bx:number,by:number,inner:boolean){
  const length=Math.hypot(bx-ax,by-ay),dx=(bx-ax)/length,dy=(by-ay)/length,nx=(inner?1:-1)*dy,ny=(inner?-1:1)*dx;
  for(let t=0;t<length;t+=4){
   const span=Math.min(4,length-t),x=ax+dx*(t+span/2),y=ay+dy*(t+span/2),index=id++;
   box(x,y,height/2,Math.abs(dx)*span+Math.abs(dy)*.2,height,Math.abs(dy)*span+Math.abs(dx)*.2,m.wallMarkings(index,hallwayLandmarkPattern(index))).name='office-wall';
   if(span>2.2){
    box(x+nx*.13,y+ny*.13,1.05,Math.abs(dx)*.95+Math.abs(dy)*.05,2.1,Math.abs(dy)*.95+Math.abs(dx)*.05,m.surface('wood',[0x755c46,0x4d6464,0x625a6e][index%3])).name='office-door';
    box(x+dx*1.1+nx*.14,y+dy*1.1+ny*.14,1.7,Math.abs(dx)*.42+Math.abs(dy)*.03,.48,Math.abs(dy)*.42+Math.abs(dx)*.03,m.hallwayNotice(index)).name='office-print';
   }
  }
 }
 for(const [x0,y0,x1,y1,inner] of [[-half,-half,24+half,16+half,0],[half,half,24-half,16-half,1]]){
  run(x0,y0,x1,y0,!!inner);run(x1,y0,x1,y1,!!inner);run(x1,y1,x0,y1,!!inner);run(x0,y1,x0,y0,!!inner);
 }
 for(const [a,b] of OFFICE_LOOP_ROUTE.slice(0,-1).map((p,i)=>[p,OFFICE_LOOP_ROUTE[i+1]])){
  const count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/6);
  for(let k=0;k<count;k++){const s=(k+.5)/count,light=box(a[0]+(b[0]-a[0])*s,a[1]+(b[1]-a[1])*s,height-.035,.8,.04,.5,m.hallwayLamp());light.name='office-light';light.userData.viewerOccluder='roof';}
 }
}
