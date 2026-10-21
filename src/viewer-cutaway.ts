import {Mesh,type Group,type Material} from 'three';
/** Scope presentation changes to the synchronous 3D render; raw sensors never call this. */
export class ViewerCutaway {
 private ghosts=new WeakMap<Material,Material>();
 private ghost(original:Material){
  let material=this.ghosts.get(original);
  if(!material){material=original.clone();material.transparent=true;material.opacity=.12;material.depthWrite=false;this.ghosts.set(original,material);original.addEventListener('dispose',()=>material!.dispose());}
  return material;
 }
 render<T>(root:Group,enabled:boolean,draw:()=>T):T{
  if(!enabled)return draw();
  const restore:(()=>void)[]=[];
  try{root.traverse(object=>{
   if(!(object instanceof Mesh))return;
   if(object.userData.viewerOccluder==='roof'){const visible=object.visible;restore.push(()=>{object.visible=visible;});object.visible=false;}
   else if(object.userData.viewerOccluder==='wall'){const material=object.material;restore.push(()=>{object.material=material;});object.material=Array.isArray(material)?material.map(m=>this.ghost(m)):this.ghost(material);}
  });
  return draw();}finally{for(const undo of restore.reverse())undo();}
 }
}
