import type {Pose} from './types';

export function validatePose(p:Pose) {
  if(!p||![p.x,p.y,p.z].every(Number.isFinite)||!Array.isArray(p.quaternion)||p.quaternion.length!==4||!p.quaternion.every(Number.isFinite))throw new Error('Expected a finite Hamilton wxyz pose');
  const norm=Math.hypot(...p.quaternion);
  if(Math.abs(norm-1)>1e-3)throw new Error('Pose quaternion must have unit length');
}
export function multiplyQuaternion(a:number[],b:number[]) {
  const [w,x,y,z]=a,[v,i,j,k]=b;
  return [w*v-x*i-y*j-z*k,w*i+x*v+y*k-z*j,w*j-x*k+y*v+z*i,w*k+x*j-y*i+z*v];
}
export function rotate(q:number[],v:number[]) {
  const n=Math.hypot(...q),unit=q.map(x=>x/n);
  return multiplyQuaternion(multiplyQuaternion(unit,[0,...v]),[unit[0],-unit[1],-unit[2],-unit[3]]).slice(1);
}
/** Evaluation-only map: initial position/heading, with world vertical retained. */
export function relativeTruth(world:Pose,origin:Pose):Pose {
  validatePose(world);validatePose(origin);
  const [w,x,y,z]=origin.quaternion;
  const yaw=Math.atan2(2*(w*z+x*y),w*w+x*x-y*y-z*z),c=Math.cos(yaw),s=Math.sin(yaw);
  const dx=world.x-origin.x,dy=world.y-origin.y;
  return {x:c*dx+s*dy,y:-s*dx+c*dy,z:world.z-origin.z,
    quaternion:multiplyQuaternion([Math.cos(yaw/2),0,0,-Math.sin(yaw/2)],world.quaternion)};
}
/** Align map coordinates on one common-time body pose, never on simulator truth. */
export function alignPose(p:Pose,sourceAnchor:Pose,targetAnchor:Pose):Pose {
  const q=sourceAnchor.quaternion,transform=multiplyQuaternion(targetAnchor.quaternion,[q[0],-q[1],-q[2],-q[3]]);
  const delta=rotate(transform,[p.x-sourceAnchor.x,p.y-sourceAnchor.y,p.z-sourceAnchor.z]);
  return {x:targetAnchor.x+delta[0],y:targetAnchor.y+delta[1],z:targetAnchor.z+delta[2],quaternion:multiplyQuaternion(transform,p.quaternion)};
}
