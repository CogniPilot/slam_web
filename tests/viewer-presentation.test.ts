import {expect,it,vi} from 'vitest';
import {WorkerViewer} from '../src/worker-viewer';

it('keeps only the newest display poses between render deadlines',()=>{
  // No renderer: exercise the real bridge methods and observe worker traffic.
  const viewer=Object.create(WorkerViewer.prototype);
  viewer.worker={postMessage:vi.fn()};
  for(let time=0;time<100;time++){
    viewer.pose({time,x:time});viewer.otherPose({time,x:-time});
    viewer.actorMotion({time,pedestrian:time});
  }
  expect(viewer.worker.postMessage).not.toHaveBeenCalled();
  viewer.flushPoses();
  expect(viewer.worker.postMessage.mock.calls.map(([message]:[unknown])=>message)).toEqual([
    {type:'pose',truth:{time:99,x:99}},
    {type:'other-pose',truth:{time:99,x:-99}},
    {type:'actor-motion',frame:{time:99,pedestrian:99}},
  ]);
  viewer.flushPoses();
  expect(viewer.worker.postMessage).toHaveBeenCalledTimes(3);
  viewer.pose({time:100,x:100});viewer.flushPoses();
  expect(viewer.worker.postMessage).toHaveBeenLastCalledWith({type:'pose',truth:{time:100,x:100}});
});
