import * as THREE from 'three';
import type {SceneDetail} from './types';
import {WorldMaterials} from './world-materials';
import {ROAD_PAINT_THICKNESS,roadPaintCenter} from './world-road';
export type CityBox=(x:number,y:number,z:number,w:number,h:number,d:number,material:THREE.MeshStandardMaterial)=>THREE.Mesh;
export type CityCrown=(x:number,y:number,z:number,size:number,material:THREE.MeshStandardMaterial)=>void;

// Authored metres, shared by overview and sensor renderers. Change geometry,
// never a nonuniform scale on the whole city or the calibrated cameras.
export const MAIN_STREET={laneWidth:3.3,parkingWidth:2.4,sidewalkWidth:3,
  roadWidth:11.4,facadeNorth:8.7,buildingWidth:7.4,buildingDepth:10,
  shopHeight:3.65,floorPitch:3.35,windowWidth:1.25,windowHeight:2.05} as const;

export function buildCity(box:CityBox,crown:CityCrown,materials:WorldMaterials,detail:SceneDetail) {
  const medium=detail!=='low',high=detail==='high',g=MAIN_STREET;
  const brick=[0x983f36,0xb67f67,0x626f77,0xc2ad91].map(color=>materials.surface('brick',color));
  const plaster=[0xe2ded0,0xa6b8b6].map(color=>materials.surface('plaster',color));
  const trim=materials.solid(0xd8d2c2),dark=materials.solid(0x26383c),metal=materials.solid(0x3c4548,.55,.45);
  const glass=materials.solid(0x304e5b,.21,.05),lightGlass=materials.solid(0x637e88,.24,.05);
  const paving=materials.surface('paving',0xc7beb1),white=materials.solid(0xe8e6dc),yellow=materials.solid(0xe7b947);
  const wood=materials.surface('wood',0x8c6747);
  const labels=['MAIN STREET BOOKS','CORNER COFFEE','NORTH MARKET','ANTIQUES','FIELD & FORM','LOCAL HARDWARE','CITY STUDIO'];
  const colors=[0x294f58,0x653d35,0x354953,0x653a48,0x365450,0x464c5c,0x555046];
  const signs=labels.map((label,i)=>materials.sign(label,colors[i]));
  const asphaltCenter=.006,asphaltThickness=.012,paintCenter=roadPaintCenter(asphaltCenter+asphaltThickness/2);
  box(0,0,asphaltCenter,120,asphaltThickness,g.roadWidth,materials.surface('asphalt',0x646e72));
  for(const side of [-1,1]) {
    const curb=side*g.roadWidth/2,walk=side*(g.roadWidth/2+g.sidewalkWidth/2);
    box(0,walk,.09,120,.18,g.sidewalkWidth,paving);box(0,curb,.10,120,.2,.15,trim);
    // Two moving lanes and distinct parallel-parking bays. The previous
    // narrow road omitted this entire band between traffic and pedestrians.
    box(0,side*g.laneWidth,paintCenter,116,ROAD_PAINT_THICKNESS,.10,white);
    if(medium)for(let x=-30;x<30;x+=6.2)box(x,side*(g.laneWidth+g.parkingWidth/2),paintCenter,.10,ROAD_PAINT_THICKNESS,g.parkingWidth,white);
    box(0,side*.09,paintCenter,116,ROAD_PAINT_THICKNESS,.065,yellow);
  }
  const xs=[-19.5,-11.9,-4.3,3.3,10.9,18.5,26.1];
  for(let index=0;index<xs.length;index++)for(const side of [-1,1]) {
    const x=xs[index],y=side*(g.facadeNorth+g.buildingDepth/2),w=g.buildingWidth,d=g.buildingDepth;
    const levels=2+(index%3===1?1:0),height=g.shopHeight+levels*g.floorPitch,front=side*g.facadeNorth;
    const wall=index%4===0?plaster[(index+Number(side>0))%2]:brick[(index+Number(side>0))%4];
    box(x,y,height/2,w,height,d,wall);box(x,y,.23,w+.08,.46,d+.08,paving);
    box(x,y,height+.08,w+.18,.2,d+.18,trim);
    for(let floor=0;floor<levels;floor++) {
      const z=g.shopHeight+g.floorPitch*(floor+.5);
      for(const dx of [-2.15,0,2.15]) {
        for(const face of [-1,1]) {
          const wallY=y+face*d/2;
          box(x+dx,wallY+face*.028,z,g.windowWidth,g.windowHeight,.065,glass);
          if(medium) {
            box(x+dx,wallY+face*.072,z-g.windowHeight/2-.06,1.48,.12,.18,trim);
            box(x+dx,wallY+face*.057,z+g.windowHeight/2+.06,1.48,.12,.13,trim);
            for(const offset of [-.68,.68])box(x+dx+offset,wallY+face*.045,z,.09,g.windowHeight,.10,trim);
          }
          if(high){box(x+dx,wallY+face*.06,z,.045,g.windowHeight,.08,trim);box(x+dx,wallY+face*.06,z+.15,g.windowWidth,.045,.08,trim);}
        }
      }
      // Party-wall end faces stay plain; windows only on the exposed ends.
      if(index===0||index===xs.length-1)for(const dy of [-3,0,3])
        box(x+(index===0?-1:1)*(w/2+.028),y+dy,z,.065,g.windowHeight,g.windowWidth,glass);
    }
    // Human-sized door, tall display glazing, restrained shop fascia. Broad
    // continuous storefronts replace detached pencil-width building towers.
    box(x,front-side*.03,1.5,w-.3,2.8,.075,dark);
    for(const dx of [-2.3,1.9])box(x+dx,front-side*.075,1.48,2.45,2.48,.06,lightGlass);
    box(x-.15,front-side*.08,1.28,1.05,2.4,.07,glass);
    for(const dx of [-3.5,-.73,.43,3.5])box(x+dx,front-side*.105,1.45,.13,2.85,.11,trim);
    box(x,front-side*.07,.34,w-.32,.5,.11,wall);
    box(x,front-side*.14,3.12,w-.24,.52,.16,signs[index]);
    if(medium) {
      box(x,front-side*.36,2.78,w-.08,.12,.76,index%2?dark:trim);
      box(x,front-side*.09,3.57,w+.08,.14,.2,trim);
      box(x,y,height+.22,w-.16,.12,d-.16,dark);
      for(const edge of [-1,1])box(x,y+edge*(d/2-.08),height+.35,w,.4,.16,wall);
    }
    if(high) {
      box(x+.7,y+.8,height+.64,1.4,.9,1.1,metal);
      box(x-1.5,y-1.5,height+.48,.25,.65,.25,dark);
      box(x+w/2-.15,front-side*.1,height/2,.08,height-.3,.12,metal);
      // Fine cornice courses, no wide blank bands between every floor.
      box(x,front-side*.1,height-.26,w+.2,.12,.22,trim);
      box(x,front-side*.13,height-.07,w+.32,.12,.3,trim);
    }
  }
  if(!medium)return;
  const leaves=[materials.solid(0x466c43,.98),materials.solid(0x62824f,.98),materials.solid(0x759258,.98)];
  for(const [i,x] of [-15.7,-.5,14.7].entries())for(const side of [-1,1]) {
    const y=side*6.65;
    box(x,y,.12,1.25,.20,1.05,dark);box(x,y,2,.16,3.9,.16,wood);
    // A higher, open canopy lets the facade/doors remain visible from the
    // street. Small clustered crowns replace low blobs covering shop signs.
    crown(x,y,4.65,1.25,leaves[i%3]);
    if(high)for(const [dx,dy,dz] of [[-.85,-.2,-.3],[.8,.1,-.15],[0,.7,.25],[.1,-.65,.35]])
      crown(x+dx,y+dy,4.65+dz,.88,leaves[(i+1)%3]);
  }
  for(const x of [-23.3,-8.1,7.1,22.3])for(const side of [-1,1]) {
    const y=side*6.4;
    box(x,y,2.15,.09,4.3,.09,metal);box(x,y,.23,.22,.46,.22,metal);
    box(x,y-side*.3,4.3,.09,.09,.65,metal);box(x,y-side*.57,4.22,.25,.12,.25,trim);
    if(high){box(x+1,y,.52,1.6,.12,.55,wood);box(x+1,y+side*.25,.88,1.6,.54,.08,wood);for(const dx of [.4,1.6])box(x+dx,y,.29,.07,.46,.48,metal);}
  }
  if(high) {
    for(const x of [-8.1,7.1,22.3])for(const side of [-1,1]) {
      box(x-1.1,side*6.5,.46,.4,.8,.4,metal);box(x-1.1,side*6.5,.88,.45,.05,.45,dark);
      box(x+2,side*6.65,.24,1.05,.42,.72,paving);crown(x+2,side*6.65,.6,.4,leaves[0]);
    }
  }
  // Mark the open intersection before the existing indoor training entrance.
  for(const x of [-29.8,32])for(let y=-5.2;y<=5.2;y+=.7)box(x,y,paintCenter,2.4,ROAD_PAINT_THICKNESS,.35,white);
}
