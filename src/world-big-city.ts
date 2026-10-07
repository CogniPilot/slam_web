import * as THREE from 'three';
import type {SceneDetail} from './types';
import type {WorldMaterials} from './world-materials';
import {ROAD_PAINT_THICKNESS,roadPaintCenter} from './world-road';

type Point=[number,number,number];
export interface BigCityInterior {
  id:'store'|'apartment'|'conference';label:string;
  roofVolume:{minimum:Point;maximum:Point};
  entrance:{outside:Point;inside:Point;clearWidth:number;clearHeight:number};
  circulation:Point[];
}
export interface BigCityStats {buildings:number;enterableBuildings:number;instances:number;drawCallsPerPass:number;triangles:number}
export const BIG_CITY_INTERIORS:readonly BigCityInterior[]=[
  {id:'store',label:'Corner Market',roofVolume:{minimum:[13.9,6.9,0],maximum:[26.1,17.1,3.8]},
    entrance:{outside:[20,4,1.5],inside:[20,9,1.5],clearWidth:3,clearHeight:2.8},
    circulation:[[20,9,1.5],[20,15.8,1.5],[18.4,15.8,1.5]]},
  {id:'apartment',label:'Daylight Loft',roofVolume:{minimum:[27.9,-17.1,0],maximum:[40.1,-6.9,6.8]},
    entrance:{outside:[34,-4,1.5],inside:[34,-9,1.5],clearWidth:3,clearHeight:2.8},
    circulation:[[34,-9,1.5],[34,-11.3,1.5],[38.1,-11.3,1.5],[34,-11.3,1.5],[34,-11.3,4.2],[38.1,-11.3,4.2]]},
  {id:'conference',label:'Civic Workspace',roofVolume:{minimum:[40.9,7.9,0],maximum:[55.1,20.1,3.9]},
    entrance:{outside:[48,5,1.5],inside:[48,9.7,1.5],clearWidth:3,clearHeight:2.8},
    circulation:[[48,9.7,1.5],[43.7,9.7,1.5],[43.7,18.7,1.5],[48,18.7,1.5]]},
];

/** Original static Three.js scenery. All motion/physics stay in Modelica. */
export class BigCityWorld {
  readonly group=new THREE.Group();
  readonly interiors=BIG_CITY_INTERIORS;
  readonly ready:Promise<void>;
  stats:BigCityStats={buildings:0,enterableBuildings:3,instances:0,drawCallsPerPass:0,triangles:0};
  private readonly cube=new THREE.BoxGeometry(1,1,1);
  private readonly cylinder=new THREE.CylinderGeometry(.5,.5,1,12);
  private readonly crown=new THREE.IcosahedronGeometry(1,1);
  private readonly lowCylinder=new THREE.CylinderGeometry(.5,.5,1,6);
  private readonly lowCrown=new THREE.IcosahedronGeometry(1,0);
  private readonly clothTexture:THREE.DataTexture;
  private readonly cloth=new THREE.MeshStandardMaterial({color:0x687c89,roughness:.94});
  private readonly rug=new THREE.MeshStandardMaterial({color:0xa19987,roughness:1});
  private readonly warmLamp=new THREE.MeshStandardMaterial({color:0xffe6bd,emissive:0xffd49a,emissiveIntensity:.65,roughness:.7});
  private readonly windowMaterial=new THREE.MeshStandardMaterial({color:0x597a89,roughness:.38,metalness:0});
  private readonly clearGlass=new THREE.MeshStandardMaterial({color:0x95bbca,transparent:true,opacity:.2,roughness:.18,depthWrite:false});
  private batches=new Map<THREE.Material,Map<THREE.BufferGeometry,{matrices:THREE.Matrix4[];names:string[]}>>();
  private readonly transform=new THREE.Object3D();
  private disposed=false;
  constructor(private readonly materials:WorldMaterials){
    this.group.name='Big city';this.ready=materials.ready??Promise.resolve();
    // Original woven cloth/rug pattern: static rendering data, no fetched assets.
    const pixels=new Uint8Array(64*64*4);
    for(let y=0;y<64;y++)for(let x=0;x<64;x++){
      const stitch=(x%4===0||y%4===0)?205:241;
      const stripe=(x<5||y<5||x>58||y>58)? .64:1;
      pixels.set([stitch*stripe,stitch*stripe,stitch*stripe,255],4*(64*y+x));
    }
    this.clothTexture=new THREE.DataTexture(pixels,64,64);this.clothTexture.colorSpace=THREE.SRGBColorSpace;
    this.clothTexture.wrapS=this.clothTexture.wrapT=THREE.RepeatWrapping;this.clothTexture.needsUpdate=true;
    this.cloth.map=this.clothTexture;this.rug.map=this.clothTexture;
    // Other buildings use a cheap original room impostor, with no downloaded
    // proprietary interior assets. Real room doors never receive these panes.
    this.windowMaterial.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 roomUv;')
        .replace('#include <uv_vertex>','#include <uv_vertex>\nroomUv=uv;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 roomUv;')
        .replace('#include <color_fragment>',`#include <color_fragment>
          vec2 p=roomUv; float edge=step(.08,p.x)*step(p.x,.92)*step(.06,p.y)*step(p.y,.94);
          float floorBand=1.0-smoothstep(.0,.38,p.y);
          float cabinet=step(.18,p.x)*step(p.x,.42)*step(.18,p.y)*step(p.y,.72);
          float lamp=step(.62,p.x)*step(p.x,.75)*step(.68,p.y)*step(p.y,.84);
          vec3 room=mix(vec3(.60,.64,.63),vec3(.32,.22,.15),floorBand);
          room=mix(room,vec3(.25,.30,.34),cabinet);room=mix(room,vec3(.95,.86,.63),lamp);
          diffuseColor.rgb=mix(vec3(.09,.14,.18),room,edge);`);
    };
    this.windowMaterial.customProgramCacheKey=()=> 'big-city-original-room-impostor-v1';
  }
  private part(name:string,p:Point,size:Point,material:THREE.Material,geometry:THREE.BufferGeometry=this.cube,yaw=0){
    this.transform.position.set(p[0],p[2],-p[1]);this.transform.scale.set(size[0],size[2],size[1]);
    this.transform.rotation.set(0,yaw,0);this.transform.updateMatrix();
    let shapes=this.batches.get(material);if(!shapes){shapes=new Map();this.batches.set(material,shapes);}
    let batch=shapes.get(geometry);if(!batch){batch={matrices:[],names:[]};shapes.set(geometry,batch);}
    batch.matrices.push(this.transform.matrix.clone());batch.names.push(name);
  }
  private clear(){
    for(const child of [...this.group.children]){this.group.remove(child);if(child instanceof THREE.InstancedMesh)child.dispose();}
    this.batches.clear();
  }
  build(detail:SceneDetail='high'){
    if(this.disposed)throw new Error('Big city has been disposed');this.clear();
    const m=this.materials,medium=detail!=='low',high=detail==='high';
    const brick=[0xb78669,0x9e7560,0xc2a98b].map(c=>m.surface('brick',c));
    const plaster=[0xe0dfd2,0xb9c7c6,0xd0c0a6].map(c=>m.surface('plaster',c));
    const concrete=m.surface('paving',0xc8cac2),asphalt=m.surface('asphalt',0x5a6064),wood=m.surface('wood',0xb88b5c);
    const dark=m.solid(0x35434b),metal=m.solid(0x68737b,.45,.45),white=m.solid(0xecece5),paint=m.solid(0xf1e5c4);
    const leaf=m.solid(0x638855,.98),soil=m.solid(0x6b5341),fabric=this.cloth,carpet=this.rug;
    const products=[0xd27b58,0xe4be67,0x6a919d,0x839b64,0xb5a1b4,0xdfddd0].map(c=>m.solid(c,.8));
    const box=(id:string,x:number,y:number,z:number,w:number,d:number,h:number,mat:THREE.Material)=>this.part(id,[x,y,z],[w,d,h],mat);
    const round=(id:string,x:number,y:number,z:number,w:number,h:number,mat:THREE.Material)=>this.part(id,[x,y,z],[w,w,h],mat,medium?this.cylinder:this.lowCylinder);
    const avenueTop=.005+.01/2,crossStreetTop=.009+.012/2,crossStreetXs=[-20,6,60];
    const laneMarking=(x:number,y:number)=>{
      // Cross-street asphalt is 5 mm higher. Split only the vertical layer at
      // those existing boundaries, retaining the complete marking footprint.
      const left=x-.9,right=x+.9;
      const cuts=[left,...crossStreetXs.flatMap(cx=>[cx-4,cx+4]).filter(edge=>edge>left&&edge<right),right].sort((a,b)=>a-b);
      for(let i=1;i<cuts.length;i++){
        const center=(cuts[i-1]+cuts[i])/2,top=crossStreetXs.some(cx=>Math.abs(center-cx)<4)?crossStreetTop:avenueTop;
        box('lane-marking',center,y,roadPaintCenter(top),cuts[i]-cuts[i-1],.10,ROAD_PAINT_THICKNESS,paint);
      }
    };
    box('city-ground',16,0,-.12,110,82,.2,concrete);
    for(const y of [0,-24,27]){
      box('avenue',16,y,.005,108,10,.01,asphalt);
      for(const side of [-1,1])box('pavement',16,y+side*5.8,.08,108,1.6,.16,concrete);
      for(let x=-34;x<68;x+=4)laneMarking(x,y);
    }
    for(const x of crossStreetXs){
      box('cross-street',x,0,.009,8,78,.012,asphalt);
      for(const side of [-1,1])box('cross-pavement',x+side*4.7,0,.08,1.4,78,.16,concrete);
    }
    let buildings=3;
    const labels=['LOCAL BOOKS','WEST CAFE','CITY SERVICES','EVERYDAY GOODS','DESIGN OFFICE'];
    // Multiple street blocks and varied ordinary architecture. Enterable
    // buildings below have no solid building proxy or fake interior panes.
    for(const y of [-32,-12,14,35])for(const x of [-31,-10,16,30,45]){
      if((y===14&&[16,30,45].includes(x))||(y===-12&&[30,45].includes(x)))continue;
      const index=buildings++,w=8+(index%3),d=8,levels=3+index%6,height=3+levels*2.7;
      box('building-body',x,y,height/2,w,d,height,index%2?brick[index%3]:plaster[index%3]);
      box('building-plinth',x,y,.25,w+.16,d+.16,.5,concrete);
      box('building-cornice',x,y,height+.05,w+.32,d+.32,.2,white);
      for(const side of [-1,1])for(let floor=0;floor<levels;floor++)for(const dx of [-w*.3,0,w*.3]){
        if(!medium&&dx!==0)continue;
        const z=4.05+floor*2.7;
        box('impostor-window',x+dx,y+side*(d/2+.035),z,1.55,.06,1.65,this.windowMaterial);
        if(medium)box('window-sill',x+dx,y+side*(d/2+.075),z-.89,1.8,.16,.08,white);
      }
      for(const side of [-1,1])for(let floor=0;floor<levels;floor++)for(const dy of medium?[-2.4,0,2.4]:[0])
        box('side-impostor-window',x+side*(w/2+.035),y+dy,4.05+floor*2.7,.06,1.55,1.65,this.windowMaterial);
      box('shopfront',x,y-Math.sign(y)*4.05,1.3,w-.4,.08,2.3,dark);
      box('shop-sign',x,y-Math.sign(y)*4.12,2.7,w-.2,.08,.45,m.sign(labels[index%labels.length],0x3e646a));
      if(high){box('roof-plant',x+1,y+.8,height+.55,1.8,1.5,.9,metal);box('roof-parapet',x,y-d/2,height+.35,w,.16,.5,brick[index%3]);}
    }
    // Shells are wall segments, including independent door jambs/lintels.
    const shell=(id:string,cx:number,cy:number,w:number,d:number,h:number,front:1|-1,wall:THREE.Material)=>{
      box(`${id}:floor`,cx,cy,.05,w,d,.1,wood);box(`${id}:roof`,cx,cy,h+.1,w+.2,d+.2,.2,plaster[0]);
      box(`${id}:rear-wall`,cx,cy-front*d/2,h/2,w,.2,h,wall);
      box(`${id}:west-wall`,cx-w/2,cy,h/2,.2,d,h,wall);
      // East window bank is real glazing in a wall opening, rather than a
      // hidden solid shell behind a painted window.
      box(`${id}:east-sill-wall`,cx+w/2,cy,.45,.2,d,.9,wall);
      box(`${id}:east-top-wall`,cx+w/2,cy,h-.25,.2,d,.5,wall);
      for(const dy of [-d/2,-d/6,d/6,d/2])box(`${id}:window-mullion`,cx+w/2,cy+dy,h/2,.22,.12,h,metal);
      box(`${id}:real-window`,cx+w/2,cy,(h+.4)/2,.025,d-.2,h-1.4,this.clearGlass);
      for(const side of [-1,1])box(`${id}:door-jamb`,cx+side*(w/4+.75),cy+front*d/2,h/2,(w-3)/2,.2,h,wall);
      box(`${id}:door-lintel`,cx,cy+front*d/2,(h+2.9)/2,3,.2,h-2.9,wall);
      box(`${id}:approach`,cx,cy+front*(d/2+1.5),.04,3,3,.08,concrete);
    };
    const chair=(id:string,x:number,y:number,z:number,face:number)=>{
      box(`${id}:seat`,x,y,z+.5,.6,.6,.1,fabric);
      box(`${id}:back`,x+face*.28,y,z+.87,.08,.6,.66,fabric);
      round(`${id}:stem`,x,y,z+.27,.075,.46,metal);
      box(`${id}:base`,x,y,z+.065,.65,.5,.065,metal);
      if(high)for(const side of [-1,1])box(`${id}:arm`,x,y+side*.31,z+.67,.48,.045,.07,metal);
    };
    const plant=(id:string,x:number,y:number,z:number)=>{
      round(`${id}:pot`,x,y,z+.25,.42,.5,soil);round(`${id}:stem`,x,y,z+.75,.08,.9,wood);
      for(const offset of [-.2,.2])this.part(`${id}:leaves`,[x+offset,y,z+1.08],[.4,.5,.6],leaf,medium?this.crown:this.lowCrown);
    };
    shell('store',20,12,12,10,3.6,-1,brick[0]);
    box('store:sign',20,6.85,3.16,8,.07,.5,m.sign('CORNER MARKET',0x375d5d));
    for(const x of [16.4,23.6]){
      for(const edge of [-1,1])box('store:shelf-end',x,12.1+edge*2.35,1.1,1,.12,2.2,wood);
      for(const z of [.42,1.08,1.74]){
        box('store:shelf',x,12.1,z,1.1,4.8,.10,white);
        for(let n=0;n<8;n+=medium?1:2)for(const side of [-1,1])box('store:product',x+side*.27,10.05+n*.57,z+.21,.28,.32,.34,products[(n+Math.round(z*10))%products.length]);
      }
    }
    box('store:checkout',23,15.9,.6,3.6,1.1,1.1,wood);box('store:countertop',23,15.9,1.2,3.8,1.2,.12,white);
    box('store:register',22.6,15.9,1.48,.5,.4,.36,dark);plant('store:plant',14.8,15.8,0);

    shell('apartment',34,-12,12,10,6.6,1,brick[1]);
    box('apartment:sign',34,-6.85,3.1,7,.07,.45,m.sign('DAYLIGHT LOFTS',0x4e596a));
    box('apartment:rug',31,-11.3,.115,4.8,4.4,.03,carpet);
    // Cushioned L-sofa, ordinary books, kitchen/bar and a double-height atrium.
    box('apartment:sofa-base',29.4,-11.5,.34,1.1,3.6,.55,dark);
    box('apartment:sofa-back',28.94,-11.5,.88,.14,3.6,1.0,fabric);
    box('apartment:sofa-return',30.3,-13.0,.38,2.5,1,.65,fabric);
    for(let i=0;i<5;i++)box('apartment:cushion',29.48,-12.9+i*.64,.7,.84,.58,.22,products[2]);
    round('apartment:coffee-table',31.5,-11.4,.6,1.2,.12,wood);round('apartment:coffee-leg',31.5,-11.4,.3,.10,.6,metal);
    for(let shelf=0;shelf<4;shelf++){
      box('apartment:book-shelf',29,-8.55,.5+shelf*.5,.7,2.3,.07,wood);
      for(let book=0;book<7;book+=medium?1:2)box('apartment:book',29,-9.45+book*.29,.7+shelf*.5,.4,.18,.32,products[(book+shelf)%6]);
    }
    for(const x of [29.2,30.5]){box('apartment:kitchen-cabinet',x,-16.25,.55,1.2,1.1,1.0,plaster[0]);box('apartment:kitchen-top',x,-16.25,1.1,1.25,1.15,.1,white);}
    box('apartment:bar',31,-14.75,1,3.7,.8,.12,wood);
    for(const x of [30,31.4]){round('apartment:stool',x,-13.95,.74,.45,.1,dark);round('apartment:stool-leg',x,-13.95,.37,.10,.7,metal);}
    box('apartment:partition-back',36.6,-14.75,1.55,.16,4.5,3.1,plaster[0]);
    box('apartment:partition-front',36.6,-8.55,1.55,.16,3.1,3.1,plaster[0]);
    box('apartment:partition-lintel',36.6,-11.3,2.85,.16,2.4,.5,plaster[0]);
    box('apartment:mezzanine',38.4,-12,3.15,3.2,9.7,.18,wood);
    for(const [y,d] of [[-14.75,4.5],[-8.55,3.1]]){
      box('apartment:upper-rail',36.7,y,4.05,.07,d,.06,metal);
      for(let n=0;n<4;n++)box('apartment:rail-post',36.7,y-d/2+.15+n*(d-.3)/3,3.62,.045,.045,.9,metal);
    }
    for(let step=0;step<13;step++)box('apartment:stair',31.8+step*.4,-16.25,.13+step*.25,.42,1.2,.20,wood);
    box('apartment:bed-frame',38.2,-14.7,3.48,2.2,3,.45,wood);box('apartment:mattress',38.2,-14.7,3.77,2.1,2.9,.26,white);
    box('apartment:blanket',38.2,-15.15,3.94,2.15,1.95,.06,fabric);
    for(const x of [37.7,38.7])box('apartment:pillow',x,-13.6,3.98,.72,.48,.14,white);
    box('apartment:desk',38.3,-8.4,3.95,2.3,.8,.10,wood);chair('apartment:desk-chair',38.3,-9.3,3.25,-1);
    plant('apartment:plant',39.15,-8.1,0);plant('apartment:upper-plant',39.4,-12.4,3.25);

    shell('conference',48,14,14,12,3.7,-1,plaster[1]);
    box('conference:sign',48,7.85,3.15,8,.07,.48,m.sign('CIVIC WORKSPACE',0x4b6372));
    box('conference:carpet',48,14,.12,12.8,10.8,.035,carpet);
    box('conference:white-table',48,14,.82,2.3,6,.14,white);
    for(const y of [11.6,16.4])box('conference:table-pedestal',48,y,.42,.35,.75,.75,metal);
    for(let i=0;i<5;i++)for(const side of [-1,1]){
      const y=11.65+i*1.17;chair('conference:office-chair',48+side*2.1,y,0,side);
      box('conference:folder',48+side*.72,y,.925,.4,.55,.035,products[i%6]);
      round('conference:cup',48+side*.83,y+.28,.99,.085,.15,white);
    }
    box('conference:whiteboard-frame',48,19.84,1.9,3.1,.12,1.75,metal);box('conference:whiteboard',48,19.75,1.9,2.95,.04,1.6,white);
    for(let i=0;i<4;i++)box('conference:board-notes',47+i*.55,19.70,1.7+(i%2)*.35,.35,.02,.14,products[i]);
    box('conference:display',41.16,15.2,1.8,.08,2.2,1.35,dark);
    // Wall clock is a shallow box with twelve contrasting ticks, visible in RGB-D.
    box('conference:clock',46,19.72,3.02,.48,.06,.48,white);
    for(let tick=0;tick<12;tick++)box('conference:clock-tick',46+.18*Math.cos(tick*Math.PI/6),19.68,3.02+.18*Math.sin(tick*Math.PI/6),.025,.025,.025,dark);
    box('conference:clock-hand',46.06,19.66,3.02,.14,.02,.025,dark);
    box('conference:side-bench',54.4,14,.45,.7,7,.25,wood);box('conference:bench-cushion',54.4,14,.64,.68,6.9,.16,fabric);
    plant('conference:plant',42,18.8,0);
    if(medium)for(let x=42;x<55;x+=1.3)for(let y=9;y<20;y+=1.3){
      box('conference:ceiling-grid-x',x,y,3.68,1.3,.028,.025,metal);box('conference:ceiling-grid-y',x,y,3.68,.028,1.3,.025,metal);
    }

    // A small park and ordinary street furniture leave roads and entries free.
    box('park:lawn',29,34,.04,23,12,.08,m.surface('grass',0x83936c));
    for(const x of [20,28,36])for(const y of [31,37]){
      round('park:trunk',x,y,1.3,.23,2.6,wood);
      this.part('park:crown',[x,y,3.0],[1.5,1.4,1.7],leaf,medium?this.crown:this.lowCrown);
      box('park:bench',x+2,y,.55,2.4,.65,.13,wood);box('park:bench-back',x+2,y+.29,.88,2.4,.10,.55,wood);
    }
    if(medium)for(const x of [-12,2,14,30,44,58])for(const y of [-5.7,5.7]){
      round('street:lamp-post',x,y,2,.12,4,metal);box('street:lamp',x,y,4,.6,.35,.13,white);
      box('street:bin',x+.6,y,.45,.5,.5,.9,dark);
    }
    for(const [id,x,y,z] of [['store',20,12,3.5],['apartment',32,-11,6.5],['conference',48,14,3.6]] as const)
      box(`${id}:warm-ceiling-panel`,x,y,z,1.4,.7,.06,this.warmLamp);
    let instances=0,triangles=0;
    for(const [material,shapes] of this.batches)for(const [geometry,batch] of shapes){
      const mesh=new THREE.InstancedMesh(geometry,material,batch.matrices.length);mesh.name='big-city-static-batch';
      mesh.userData.parts=batch.names;batch.matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));
      mesh.castShadow=!material.transparent;mesh.receiveShadow=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();this.group.add(mesh);
      instances+=mesh.count;triangles+=(geometry.index?.count??geometry.getAttribute('position').count)/3*mesh.count;
    }
    this.group.updateMatrixWorld(true);this.stats={buildings,enterableBuildings:3,instances,drawCallsPerPass:this.group.children.length,triangles};
    this.group.userData.stats={...this.stats};
  }
  dispose(){if(this.disposed)return;this.clear();for(const geometry of [this.cube,this.cylinder,this.crown,this.lowCylinder,this.lowCrown])geometry.dispose();
    for(const material of [this.windowMaterial,this.clearGlass,this.cloth,this.rug,this.warmLamp])material.dispose();this.clothTexture.dispose();this.disposed=true;}
}
