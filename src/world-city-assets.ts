import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import type {SceneDetail} from './types';
import {WorldMaterials} from './world-materials';

export const CITY_ASSET_COLLECTION='https://poly.pizza/bundle/City-Pack-kJqRAIGsw0';
export const CITY_ASSET_CREDITS=[
  {title:'Building Green',file:'building-green.glb',source:'https://poly.pizza/m/FmjsfA1eHY'},
  {title:'Pizza Corner',file:'pizza-corner.glb',source:'https://poly.pizza/m/78W2Ab2Uvt'},
  {title:'Brown Building',file:'brown-building.glb',source:'https://poly.pizza/m/fGKIlWGDNH'},
  {title:'Building Red',file:'building-red.glb',source:'https://poly.pizza/m/lbNz2dClar'},
  {title:'Building Red Corner',file:'building-red-corner.glb',source:'https://poly.pizza/m/9JuFwnivP0'}
].map(asset=>({...asset,creator:'J-Toastie',creatorUrl:'https://poly.pizza/u/J-Toastie',license:'CC BY 3.0',licenseUrl:'https://creativecommons.org/licenses/by/3.0/'}));

type Primitive={geometry:THREE.BufferGeometry;material:THREE.MeshStandardMaterial};
type Prototype={primitives:Primitive[];size:THREE.Vector3;title:string};

// Bake loader node transforms before instancing. The FBX-derived Pizza Corner
// contains a negative scale: InstancedMesh explicitly cannot render negative
// instance transforms correctly. Baking it and reversing triangle winding
// retains its proper exterior faces and transformed outward normals.
export function bakeCityGeometry(mesh:THREE.Mesh,offset:THREE.Vector3,scale:number) {
  const source=mesh.geometry;
  const geometry=source.index?source.toNonIndexed():source.clone();
  geometry.applyMatrix4(mesh.matrixWorld);geometry.translate(-offset.x,-offset.y,-offset.z);geometry.scale(scale,scale,scale);
  if(mesh.matrixWorld.determinant()<0) {
    for(const attribute of Object.values(geometry.attributes))for(let i=0;i<attribute.count;i+=3)for(let component=0;component<attribute.itemSize;component++) {
      const a=attribute.getComponent(i+1,component),b=attribute.getComponent(i+2,component);
      attribute.setComponent(i+1,component,b);attribute.setComponent(i+2,component,a);
    }
  }
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

export class CityAssets {
  readonly group=new THREE.Group();
  readonly ready:Promise<void>;
  readonly credits=CITY_ASSET_CREDITS;
  private prototypes:Prototype[]=[];
  private requestedDetail:SceneDetail='high';
  private readonly boxGeometry=new THREE.BoxGeometry(1,1,1);
  private loaded=false;
  constructor(private readonly materials:WorldMaterials,base:string=document.baseURI) {
    this.group.name='Poly Pizza city';
    const directory=new URL('models/city/',base);
    const loader=new GLTFLoader();
    this.ready=Promise.all(CITY_ASSET_CREDITS.map(async asset=>{
      const {scene}=await loader.loadAsync(new URL(asset.file,directory).href);scene.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(scene),size=bounds.getSize(new THREE.Vector3());
      if(!Number.isFinite(size.x)||Math.min(size.x,size.y,size.z)<=0)throw new Error(`Invalid city model bounds: ${asset.title}`);
      // A single uniform scale preserves the artist's architectural ratios.
      // The supplied assets intentionally vary in height and building depth.
      const scale=4.6/size.x,centre=bounds.getCenter(new THREE.Vector3());centre.y=bounds.min.y;
      const primitives:Primitive[]=[];
      scene.traverse(object=>{
        if(!(object instanceof THREE.Mesh))return;
        if(object instanceof THREE.SkinnedMesh||Array.isArray(object.material))throw new Error(`City model requires unsupported animated/material-group baking: ${asset.title}`);
        const original=object.material as THREE.MeshStandardMaterial,name=original.name.toLowerCase(),color=original.color.getHex();
        // These GLBs contain no image textures. FBX export assigns metalness.4
        // to all materials, including brick/concrete/wood. Restore dielectric
        // masonry while retaining the creator's colored architectural details.
        const material=name.includes('brick')?materials.surface('brick',color):
          name.includes('wood')?materials.surface('wood',color):
          name.includes('concrete')||name.includes('sandstone')?materials.surface('plaster',color):
          name.includes('glass')?materials.solid(color,.16,0):materials.solid(color,.72,0);
        primitives.push({geometry:bakeCityGeometry(object,centre,scale),material});
      });
      if(!primitives.length)throw new Error(`Empty city model: ${asset.title}`);
      // Prepared prototypes own their baked geometry. Loader geometry is not
      // referenced by any instance, and the imported files have no textures.
      scene.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();if(!Array.isArray(object.material))object.material.dispose();}});
      return {primitives,size:size.multiplyScalar(scale),title:asset.title};
    })).then(prototypes=>{this.prototypes=prototypes;this.loaded=true;this.build(this.requestedDetail);});
  }
  build(detail:SceneDetail='high') {
    this.requestedDetail=detail;
    for(const object of [...this.group.children]){this.group.remove(object);if(object instanceof THREE.InstancedMesh)object.dispose();}
    if(!this.loaded)return;
    const cells=detail==='low'?[-6,0,6,12]:[-12,-6,0,6,12,18,24];
    const placements=this.prototypes.map(()=>[] as THREE.Matrix4[]);
    for(const [index,x] of cells.entries())for(const side of [-1,1]) {
      const model=(index+Number(side>0)*2)%this.prototypes.length;
      const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),side>0?0:Math.PI);
      placements[model].push(new THREE.Matrix4().compose(new THREE.Vector3(x,0,-side*6.6),rotation,new THREE.Vector3(1,1,1)));
    }
    for(const [index,prototype] of this.prototypes.entries())if(placements[index].length)for(const primitive of prototype.primitives) {
      const instances=new THREE.InstancedMesh(primitive.geometry,primitive.material,placements[index].length);
      instances.name=prototype.title;placements[index].forEach((matrix,i)=>instances.setMatrixAt(i,matrix));instances.computeBoundingSphere();this.group.add(instances);
    }
    this.road(detail);
  }
  private road(detail:SceneDetail) {
    const groups=new Map<THREE.MeshStandardMaterial,THREE.Matrix4[]>();
    const box=(x:number,y:number,z:number,w:number,h:number,d:number,material:THREE.MeshStandardMaterial)=>{
      const matrices=groups.get(material)??[];
      matrices.push(new THREE.Matrix4().makeScale(w,h,d).setPosition(x,z,-y));groups.set(material,matrices);
    };
    const paving=this.materials.surface('paving',0xd5cbb8),trim=this.materials.solid(0xc8bdab),paint=this.materials.solid(0xeee0b2);
    box(0,0,-.1,80,.2,70,paving);box(5,0,.006,66,.012,7.4,this.materials.surface('asphalt',0x68737a));
    for(const side of [-1,1]) {
      box(5,side*4.05,.1,66,.2,.75,paving);box(5,side*3.66,.11,66,.22,.12,trim);
      if(detail!=='low')for(let x=-19;x<31;x+=3)box(x,side*3.47,.02,.65,.016,.045,paint);
    }
    for(let x=-22;x<32;x+=3)box(x,0,.022,1.25,.025,.07,paint);
    if(detail==='high')for(let i=-3;i<=3;i++)box(27,i*.46,.025,2.2,.03,.23,paint);
    for(const [material,matrices] of groups) {
      const instances=new THREE.InstancedMesh(this.boxGeometry,material,matrices.length);
      instances.name='City street';matrices.forEach((matrix,i)=>instances.setMatrixAt(i,matrix));instances.computeBoundingSphere();this.group.add(instances);
    }
  }
  dispose() {
    for(const object of this.group.children)if(object instanceof THREE.InstancedMesh)object.dispose();this.group.clear();
    for(const prototype of this.prototypes)for(const primitive of prototype.primitives)primitive.geometry.dispose();
    this.boxGeometry.dispose();
  }
}
