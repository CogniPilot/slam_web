import {Object3D,SkinnedMesh,Skeleton,Matrix4} from 'three';

/** SkeletonUtils clones a skeleton for each mesh primitive, even when those
 * primitives belong to the same rig. On a fresh clone, reuse only skeletons
 * with the exact same inverse-array owner and ordered bone objects. Mesh bind
 * matrices remain untouched, and separately cloned characters stay separate.
 * Run before the first render; allocated bone textures retain their owners.
 */
export function shareClonedSkeletons(root:Object3D):void {
  const owners=new Map<Matrix4[],Skeleton[]>();
  root.traverse(object=>{
    if(!(object instanceof SkinnedMesh))return;
    const skeleton=object.skeleton;
    if(skeleton.boneTexture!==null)return;
    const candidates=owners.get(skeleton.boneInverses)??[];
    const shared=candidates.find(candidate=>candidate.bones.length===skeleton.bones.length
      &&candidate.bones.every((bone,index)=>bone===skeleton.bones[index]));
    if(shared)object.skeleton=shared;
    else {candidates.push(skeleton);owners.set(skeleton.boneInverses,candidates);}
  });
}
