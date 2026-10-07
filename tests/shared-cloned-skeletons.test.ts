import {expect,it} from 'vitest';
import {Bone,Group,Matrix4,Skeleton,SkinnedMesh} from 'three';
import {shareClonedSkeletons} from '../src/shared-cloned-skeletons';

it('shares exact rig owners while preserving inverse, bone-order and allocated-texture boundaries',()=>{
  const root=new Group(),bones=[new Bone(),new Bone()],inverses=[new Matrix4(),new Matrix4()];
  const attach=(rigBones:Bone[],rigInverses:Matrix4[])=>{
    const mesh=new SkinnedMesh();mesh.bind(new Skeleton(rigBones,rigInverses),new Matrix4().makeTranslation(2,3,4));root.add(mesh);return mesh;
  };
  const first=attach(bones,inverses),same=attach(bones,inverses);
  const distinctInverses=attach(bones,inverses.map(matrix=>matrix.clone()));
  const reordered=attach([...bones].reverse(),inverses);
  const distinctBones=attach([new Bone(),new Bone()],inverses);
  const allocated=attach(bones,inverses);allocated.skeleton.computeBoneTexture();
  const texture=allocated.skeleton.boneTexture,oldSkeleton=allocated.skeleton;
  const boundaries=[distinctInverses,reordered,distinctBones].map(mesh=>mesh.skeleton);
  const bind=same.bindMatrix.clone(),inverseBind=same.bindMatrixInverse.clone();
  shareClonedSkeletons(root);
  expect(same.skeleton).toBe(first.skeleton);
  expect([distinctInverses,reordered,distinctBones].map(mesh=>mesh.skeleton)).toEqual(boundaries);
  expect(allocated.skeleton).toBe(oldSkeleton);expect(allocated.skeleton.boneTexture).toBe(texture);
  expect(same.bindMatrix.equals(bind)).toBe(true);expect(same.bindMatrixInverse.equals(inverseBind)).toBe(true);
  allocated.skeleton.dispose();
});
