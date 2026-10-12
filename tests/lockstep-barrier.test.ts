import {expect,it,vi} from 'vitest';
import {LockstepBarrier} from '../src/lockstep-barrier';

it.each([0,-1,1.5,NaN,Infinity])('rejects an invalid participant count %s',count=>{
  expect(()=>new LockstepBarrier(count)).toThrow();
});

it('rendezvouses repeatedly and commits both poses before releasing either participant',async()=>{
  let committed=0;
  const poses=[0,0],observed:number[][]=[];
  const barrier=new LockstepBarrier(2,()=>{
    expect(poses[0]).toBe(poses[1]);committed=poses[0];
  });
  const run=async(index:number)=>{
    for(let boundary=1;boundary<=4;boundary++){
      // Alternate which vehicle reaches the boundary first.
      if(index===boundary%2)await Promise.resolve();
      poses[index]=boundary;
      await barrier.arrive();
      observed.push([index,boundary,committed]);
      expect(committed).toBe(boundary);
    }
  };
  await Promise.all([run(0),run(1)]);
  expect(observed).toHaveLength(8);
});

it('holds a participant until the other reaches the same boundary',async()=>{
  const commit=vi.fn(),released=vi.fn(),barrier=new LockstepBarrier(2,commit);
  const waiting=barrier.arrive().then(released);
  await Promise.resolve();expect(released).not.toHaveBeenCalled();expect(commit).not.toHaveBeenCalled();
  await barrier.arrive();await waiting;
  expect(commit).toHaveBeenCalledTimes(1);expect(released).toHaveBeenCalledTimes(1);
});

it('aborts waiting participants and rejects future arrivals with the same error',async()=>{
  const commit=vi.fn(),barrier=new LockstepBarrier(3,commit),error=new Error('Drone sensor failed');
  const first=expect(barrier.arrive()).rejects.toBe(error);
  const second=expect(barrier.arrive()).rejects.toBe(error);
  barrier.abort(error);
  await Promise.all([first,second]);
  await expect(barrier.arrive()).rejects.toBe(error);
  expect(commit).not.toHaveBeenCalled();
});

it('propagates a failed pose commit to all participants and future boundaries',async()=>{
  const error=new Error('Pose publication failed');
  const barrier=new LockstepBarrier(2,()=>{throw error;});
  const first=expect(barrier.arrive()).rejects.toBe(error);
  const second=expect(barrier.arrive()).rejects.toBe(error);
  await Promise.all([first,second]);
  await expect(barrier.arrive()).rejects.toBe(error);
});

it('normalizes a non-Error commit failure and rejects a lone participant immediately',async()=>{
  const barrier=new LockstepBarrier(1,()=>{throw 'Invalid world pose';});
  await expect(barrier.arrive()).rejects.toThrow('Invalid world pose');
  await expect(barrier.arrive()).rejects.toThrow('Invalid world pose');
});
