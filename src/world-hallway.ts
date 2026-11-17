import type * as THREE from 'three';
import type {WorldMaterials} from './world-materials';

export const HALLWAY=Object.freeze({minimumX:-8,maximumX:154,width:3.6,height:3.2,baySpacing:4});
export const HALLWAY_ROOF={minimum:[HALLWAY.minimumX,-HALLWAY.width/2,0],
  maximum:[HALLWAY.maximumX,HALLWAY.width/2,HALLWAY.height]};
type Box=(x:number,y:number,z:number,width:number,height:number,depth:number,material:THREE.MeshStandardMaterial)=>THREE.Mesh;

/** Metric corridor shared by the viewer and raw camera worker. */
export function buildHallway(rawBox:Box,materials:WorldMaterials,marked=false){
  const box:Box=(...args)=>{const mesh=rawBox(...args);mesh.userData.viewerOccluder='wall';return mesh;};
  const {minimumX,maximumX,width,height,baySpacing}=HALLWAY,length=maximumX-minimumX,center=(minimumX+maximumX)/2;
  const wall=materials.surface('plaster',0xd4d0bd),floor=marked?materials.hallwayTiles(false,length,width):materials.surface('paving',0x797b75);
  const trim=materials.solid(0x343f48),ceiling=marked?materials.hallwayTiles(true,length,width):materials.surface('plaster',0xbfc0b6);
  const floorMesh=box(center,0,-.1,length,.2,width+.4,floor);floorMesh.name='hallway-floor';floorMesh.userData.viewerOccluder='floor';
  const ceilingMesh=box(center,0,height+.1,length,.2,width+.4,ceiling);ceilingMesh.name='hallway-ceiling';ceilingMesh.userData.viewerOccluder='roof';
  if(marked)for(let x=minimumX+4;x<maximumX;x+=8){const light=box(x,0,height-.035,1.2,.04,.5,materials.hallwayLamp());light.name='hallway-light-fixture';light.userData.viewerOccluder='roof';}
  for(const side of [-1,1]){
    if(!marked)box(center,side*(width/2+.1),height/2,length,height,.2,wall).name='hallway-wall';
    else for(let start=minimumX,bay=0;start<maximumX;start+=baySpacing,bay++){
      const span=Math.min(baySpacing,maximumX-start),id=bay*2+(side>0?1:0);
      box(start+span/2,side*(width/2+.1),height/2,span,height,.2,
        materials.wallMarkings(id,hallwayLandmarkPattern(id))).name='hallway-textured-wall';
    }
  }
  for(const x of [minimumX-.1,maximumX+.1])box(x,0,height/2,.2,height,width+.4,wall).name='hallway-end';
  for(let x=minimumX+2,index=0;x<maximumX;x+=baySpacing,index++)for(const side of [-1,1]){
    const y=side*(width/2-.035),tone=[0x755c46,0x4d6464,0x625a6e,0x746d4c][(index+(side>0?1:0))%4];
    const door=materials.surface('wood',tone);
    box(x,y,1.1,1.05,2.2,.06,door).name='hallway-door';
    for(const dx of [-.57,.57])box(x+dx,y-side*.035,1.13,.065,2.26,.05,trim);
    box(x,y-side*.035,2.27,1.2,.08,.05,trim);
    box(x+.36,y-side*.08,1,.06,.08,.07,trim);
    const id=index*2+(side>0?1:0);
    const notice=marked?materials.hallwayNotice(id):materials.sign(`BAY ${String(index+1).padStart(2,'0')}${side>0?'N':'S'}`,tone);
    const aspect=marked?[[.42,.55],[.7,.3],[.5,.42],[.38,.48]][id%4]:[.65,.45];
    box(x+1.35,y-side*.025,1.75,aspect[0],aspect[1],.035,notice).name='hallway-notice';
    if(index%3===0)box(x-.9,y-side*.025,.7,.32,.9,.04,materials.solid(0x7b868d));
  }
}

/** Stable asymmetric wall texture patterns. Scene pixels only; never estimator metadata. */
export function hallwayLandmarkPattern(id:number):readonly number[]{
 if(!Number.isInteger(id)||id<0||id>81)throw Error('Invalid hallway landmark id');
 let state=(Math.imul(id+1,0x9e3779b9)^0x51a7c3d9)>>>0;
 return Array.from({length:64},()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)&1;});
}
