import {expect,it,vi} from 'vitest';
import {BufferAttribute} from 'three';
import {packTrajectories,poseSnapshot} from '../src/trajectory';
import {WorkerViewer} from '../src/worker-viewer';
it('viewer trajectories transfer only xyz buffers even when passed full estimates',()=>{
  const estimate:any={x:1,y:2,z:3,quaternion:[1,0,0,0],confidence:1,points:Array.from({length:20000},()=>[1,2,3]),features:[[1,2,3]]};
  const snapshot=poseSnapshot(estimate);expect(Object.keys(snapshot).sort()).toEqual(['quaternion','x','y','z']);
  estimate.quaternion[0]=0;expect(snapshot.quaternion[0]).toBe(1);
  const paths=[{id:'slam',color:0x50e6b2,points:[estimate,estimate]}];
  expect(Array.from(packTrajectories(paths)[0].positions)).toEqual([1,3,-2,1,3,-2]);
  const postMessage=vi.fn(),viewer=Object.create(WorkerViewer.prototype);
  viewer.worker={postMessage};viewer.world={points:{geometry:{getAttribute:()=>new BufferAttribute(new Float32Array(),3)}}};
  viewer.diagnostics(estimate,undefined,paths,{uncertainty:true,graph:true,showMap:true,showPaths:true});
  const [message,transfers]=postMessage.mock.calls[0];
  expect(message.paths).toBeUndefined();expect(message.estimate.points).toEqual([]);expect(message.estimate.features).toEqual([]);
  expect(Object.keys(message.trajectories[0]).sort()).toEqual(['color','id','positions']);
  expect(message.trajectories[0].positions.byteLength).toBe(24);expect(transfers).toContain(message.trajectories[0].positions.buffer);
});
