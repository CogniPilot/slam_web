import type {Pose} from './types';
export interface TrajectoryPath {id:string;color:number;points:readonly Pick<Pose,'x'|'y'|'z'>[]}
export interface TrajectoryBuffer {id:string;color:number;positions:Float32Array}
/** Histories must own only poses, never the estimate's landmarks or images. */
export function poseSnapshot(pose:Pose):Pose {
  return {x:pose.x,y:pose.y,z:pose.z,quaternion:[...pose.quaternion]};
}
/** Compact viewer coordinates, with no estimator payload in any path vertex. */
export function packTrajectories(paths:readonly TrajectoryPath[]):TrajectoryBuffer[]{
  return paths.map(path=>{
    const positions=new Float32Array(path.points.length*3);
    path.points.forEach((pose,i)=>{positions[3*i]=pose.x;positions[3*i+1]=pose.z;positions[3*i+2]=-pose.y;});
    return {id:path.id,color:path.color,positions};
  });
}
