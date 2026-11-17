import {Mesh,MeshStandardMaterial,Vector3,type Camera,type Group,type Material,type Object3D} from 'three';

/** Scope presentation changes to the synchronous 3D render; raw sensors never call this. */
export class ViewerCutaway {
 private readonly walls=new WeakMap<Material,Material>();
 private readonly floors=new WeakMap<Material,Material>();
 private readonly axis={value:new Vector3(0,0,-1)};
 private readonly depth={value:0};
 private readonly slope={value:0};
 private readonly target=new Vector3();

 private wall(original:Material){
  let material=this.walls.get(original);
  if(!material){
   material=original.clone();
   // The projected vertex includes instance transforms. The aperture follows
   // the selected drone and stops just behind it, leaving far walls intact.
   material.onBeforeCompile=(shader,renderer)=>{
    original.onBeforeCompile(shader,renderer);
    shader.uniforms.viewerCutawayAxis=this.axis;
    shader.uniforms.viewerCutawayDepth=this.depth;
    shader.uniforms.viewerCutawaySlope=this.slope;
    shader.vertexShader='varying vec3 vViewerCutawayPosition;\n'+shader.vertexShader.replace(
     '#include <project_vertex>','#include <project_vertex>\nvViewerCutawayPosition=mvPosition.xyz;');
    shader.fragmentShader=`
uniform vec3 viewerCutawayAxis;
uniform float viewerCutawayDepth,viewerCutawaySlope;
varying vec3 vViewerCutawayPosition;
`+shader.fragmentShader.replace('#include <clipping_planes_fragment>',`
#include <clipping_planes_fragment>
float cutawayAlong=dot(vViewerCutawayPosition,viewerCutawayAxis);
float cutawayRadius=length(vViewerCutawayPosition-viewerCutawayAxis*cutawayAlong);
if(cutawayAlong>0.0 && cutawayAlong<viewerCutawayDepth && cutawayRadius<viewerCutawaySlope*cutawayAlong) discard;
`);
   };
   material.customProgramCacheKey=()=>`viewer-cutaway-aperture-v1:${original.customProgramCacheKey()}`;
   this.walls.set(original,material);
   original.addEventListener('dispose',()=>material!.dispose());
  }
  return material;
 }

 private floor(original:Material){
  let material=this.floors.get(original);
  if(!material){
   material=original.clone();
   if(material instanceof MeshStandardMaterial)material.color.setHex(0x687483);
   this.floors.set(original,material);
   original.addEventListener('dispose',()=>material!.dispose());
  }
  return material;
 }

 render<T>(root:Group,enabled:boolean,camera:Camera,drone:Object3D,draw:()=>T):T{
  if(!enabled)return draw();
  camera.updateMatrixWorld();drone.getWorldPosition(this.target);
  this.target.applyMatrix4(camera.matrixWorldInverse);
  const distance=this.target.length();
  this.axis.value.copy(this.target).normalize();
  this.depth.value=distance+.6;
  this.slope.value=distance>1e-4?1.8/distance:0;
  const restore:(()=>void)[]=[];
  try{
   root.traverse(object=>{
    if(!(object instanceof Mesh))return;
    const kind=object.userData.viewerOccluder;
    if(kind==='roof'){
     const visible=object.visible;restore.push(()=>{object.visible=visible;});object.visible=false;
    }else if(kind==='wall'||kind==='floor'){
     const material=object.material;restore.push(()=>{object.material=material;});
     const convert=(m:Material)=>kind==='wall'?this.wall(m):this.floor(m);
     object.material=Array.isArray(material)?material.map(convert):convert(material);
    }
   });
   return draw();
  }finally{for(const undo of restore.reverse())undo();}
 }
}
