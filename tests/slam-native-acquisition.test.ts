import {expect,it} from 'vitest';
import {ModelicaSlamSession} from '../src/modelica-slam-session';
import type {SlamIntervalFrame} from '../src/modelica-slam-frame';
import type {SlamNativeProgram} from '../src/slam-native-program';

it('consumes the camera at its capture boundary after predicting all preceding held intervals',()=>{
  const cells=new Map<string,Float64Array>();
  const real=(name:string)=>{
    if(!cells.has(name))cells.set(name,new Float64Array(name==='rgb'?6:name==='depth'?2:1));
    return cells.get(name)!;
  };
  const requested=new Uint8Array(1),epoch=new BigInt64Array(1),calls:{time:number;image:boolean}[]=[];
  const program={layout:{model:'acquisition'},hasInput:(name:string):boolean=>name==='imageRequested',real,
    integer:()=>epoch,boolean:()=>requested,
    step:(time:number)=>{calls.push({time,image:requested[0]===1});return 0;},
    derived:()=>({accepted:true,imageCompleted:requested[0]===1,mappingAccepted:requested[0]===1,loopCandidateCount:2}),
    stateRun:()=>undefined,y:()=>new Float64Array(3),
    output:(name:string)=>name==='nextQuaternion'?new Float64Array([1,0,0,0]):undefined};
  const session=Reflect.construct(ModelicaSlamSession,[{},program]) as ModelicaSlamSession;
  const frame={imageEpoch:1,frameTime:.2,rgb:new Uint8Array(6),depth:new Uint16Array(2),
    imageLayout:{color:{width:2,height:1,strideBytes:6},depth:{width:2,height:1,strideBytes:4}},
    intervals:[.1,.2].map(time=>({time,dt:.1,imu:{accel:[0,0,9.81],gyro:[0,0,0]}}))} as SlamIntervalFrame;
  // This adapter test records the actual native entry inputs, not a parallel
  // implementation of the estimator's image freshness policy.
  program.hasInput=(name:string)=>['imageRequested','accel','gyro'].includes(name);
  cells.set('accel',new Float64Array(3));cells.set('gyro',new Float64Array(3));
  const result=session.advance(frame);
  expect(calls).toEqual([{time:.1,image:false},{time:.2,image:true}]);
  expect(result.status.imageCompleted).toBe(true);
  expect(result.status.mappingAccepted).toBe(true);
  expect(result.stepMs).toHaveLength(2);
  expect(result.estimate.diagnostics?.loopCandidates).toBe(2);
  expect(()=>session.advance({...frame,imageEpoch:2,frameTime:.5,
    intervals:[{time:.3,dt:.1,imu:frame.intervals[0].imu}]})).toThrow('capture does not coincide');
});

it('draws retained measured loop edges by keyframe identity after the catalog ring wraps',()=>{
  const values:Record<string,Float64Array|BigInt64Array|Uint8Array>={
    'estimator.poses.enabled':new Uint8Array([1,0,1]),
    'estimator.poses.ids':new BigInt64Array([129n,0n,128n]),
    'estimator.poses.positions':new Float64Array([1,2,3,0,0,0,4,5,6]),
    'estimator.poses.rotations':new Float64Array([1,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,1]),
    'estimator.localization.catalog.occupied':new Uint8Array([1,0,1]),
    'estimator.localization.catalog.ids':new BigInt64Array([129n,0n,128n]),
    'estimator.localization.catalog.imageTimes':new Float64Array([43,0,42]),
    'estimator.localization.catalog.epochs':new BigInt64Array([215n,0n,210n]),
    'estimator.localization.graph.edges.enabled':new Uint8Array([1,1,1]),
    'estimator.localization.graph.edges.kind':new BigInt64Array([2n,1n,2n]),
    'estimator.localization.graph.edges.referenceId':new BigInt64Array([128n,128n,1n]),
    'estimator.localization.graph.edges.currentId':new BigInt64Array([129n,129n,129n]),
    'estimator.localization.graph.edges.id':new BigInt64Array([300n,299n,1n]),
  };
  const program={stateRun:(name:string)=>values[name]?{view:values[name]}:undefined,output:()=>undefined} as unknown as SlamNativeProgram;
  const session=Reflect.construct(ModelicaSlamSession,[{},program]) as ModelicaSlamSession;
  const graph=session['poseGraph'](program);
  expect(graph.keyframes.map(frame=>frame.position)).toEqual([[1,2,3],[4,5,6]]);
  expect(graph.keyframes[0]).toMatchObject({id:129,time:43,imageEpoch:215});
  expect(graph.keyframes[1]).toMatchObject({id:128,time:42,imageEpoch:210});
  expect(graph.edges).toEqual([{from:1,to:0,kind:'loop',id:300},{from:1,to:0,kind:'odometry',id:299}]);
  program.output=name=>name==='loopScore'?new Float64Array([.12,.91,0,0]):undefined;
  const scored=session['poseGraph'](program,{
    'loopReferenceId[1]':129,'loopCurrentId[1]':128,
    'loopReferenceId[2]':128,'loopCurrentId[2]':129,
  });
  expect(scored.edges).toEqual([{from:1,to:0,kind:'loop',id:300,similarity:.91},{from:1,to:0,kind:'odometry',id:299}]);
  program.output=()=>undefined;
  expect(session['poseGraph'](program,{
    'loopReferenceId[1]':128,'loopCurrentId[1]':129,'loopScore[1]':.87,
  }).edges).toEqual([{from:1,to:0,kind:'loop',id:300,similarity:.87},{from:1,to:0,kind:'odometry',id:299}]);
});

it('streams predictions without images and consumes their exact prefix only once',()=>{
  const cells=new Map<string,Float64Array>();
  const real=(name:string)=>{
    if(!cells.has(name))cells.set(name,new Float64Array(['accel','gyro'].includes(name)?3:name==='rgb'?6:name==='depth'?2:1));
    return cells.get(name)!;
  };
  const requested=new Uint8Array(1),epoch=new BigInt64Array(1),calls:unknown[]=[];
  const program={layout:{model:'streamed'},hasInput:(name:string)=>['imageRequested','accel','gyro'].includes(name),real,
    integer:()=>epoch,boolean:()=>requested,
    step:(time:number)=>{calls.push({time,image:requested[0]===1,accel:Array.from(real('accel')),rgb:Array.from(real('rgb'))});return 0;},
    derived:()=>({imageCompleted:requested[0]===1}),stateRun:()=>undefined,y:()=>new Float64Array(3),
    output:(name:string)=>name==='nextQuaternion'?new Float64Array([1,0,0,0]):undefined};
  const session=Reflect.construct(ModelicaSlamSession,[{},program]) as ModelicaSlamSession;
  const intervals=[.1,.2].map(time=>({time,dt:.1,imu:{accel:[time,0,9.81],gyro:[0,0,0]}}));
  session.predict(1,intervals[0]);
  // The prediction used the previous raster; the future camera is unavailable.
  expect(calls).toEqual([{time:.1,image:false,accel:[.1,0,9.81],rgb:[0,0,0,0,0,0]}]);
  const frame={imageEpoch:1,frameTime:.2,rgb:new Uint8Array([1,2,3,4,5,6]),depth:new Uint16Array(2),
    imageLayout:{color:{width:2,height:1,strideBytes:6},depth:{width:2,height:1,strideBytes:4}},intervals} as SlamIntervalFrame;
  expect(()=>session.advance({...frame,imageEpoch:2})).toThrow('pending predictions');
  const changed=structuredClone(frame);changed.intervals[0].imu.accel[0]=42;
  expect(()=>session.advance(changed)).toThrow('predicted IMU prefix');
  const result=session.advance(frame);
  expect(calls).toHaveLength(2);
  expect(calls[1]).toEqual({time:.2,image:true,accel:[.2,0,9.81],rgb:[1,2,3,4,5,6]});
  expect(result.stepMs).toHaveLength(2);
  // The next frame continues the clock and receives its own prediction prefix.
  session.predict(2,{...intervals[0],time:.3});
  expect(()=>session.predict(3,{...intervals[0],time:.4})).toThrow('pending frame');
});
