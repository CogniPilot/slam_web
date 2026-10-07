import {afterEach,expect,it,vi} from 'vitest';
const harness=vi.hoisted(()=>({make:undefined as undefined|((options:any)=>any)}));
vi.mock('../src/world',()=>({D435:{width:160,height:90},World:class{constructor(options:any){return harness.make!(options);}}}));
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const truth={time:0,x:1,y:2,z:3,quaternion:[1,0,0,0],velocity:[0,0,0],accel:[0,0,0],gyro:[0,0,0]};

async function setup(){
  const replies:any[]=[],transferCounts:number[]=[],events:string[]=[],cameras:any[]=[],lidars:any[]=[],options:any[]=[];
  let committedTime=0;
  const captureAsync=vi.fn(()=>{events.push('camera');const read=deferred<any>();cameras.push(read);return read.promise;});
  const captureLidar=vi.fn((time:number)=>{events.push(`lidar:${time}`);const read=deferred<any>();lidars.push(read);return read.promise;});
  const world={ready:Promise.resolve(),graphics:{renderer:'test-protocol'},captureTimings:{total:5},lidar:{timings:{totalMs:6}},
    build:vi.fn((environment:string,detail:string)=>events.push(`build:${environment}:${detail}`)),setSensorGeometryBatching:vi.fn(),
    actors:{setEnabled:vi.fn(),setSkeletonSharing:vi.fn()},setDepthCloudEnabled:vi.fn(),setActorMotion:vi.fn((frame:any)=>events.push(`actors:${frame.time}`)),setEnvironmentVisible:vi.fn(),setLighting:vi.fn(),update:vi.fn((pose:any)=>{committedTime=pose.time;events.push(`pose:${pose.time}`);}),
    captureAsync,captureLidar,
    // The World contract holds both reads, including failure cleanup, before
    // releasing the worker's configuration queue. Actual GPU batching is
    // verified separately in the hardware browser suite.
    captureSensorPair:vi.fn(async(enabled:boolean)=>{
      const reads=[captureAsync(),enabled?captureLidar(committedTime):Promise.resolve(undefined)];
      const settled=await Promise.allSettled(reads);
      const failure=settled.find(result=>result.status==='rejected');
      if(failure?.status==='rejected')throw failure.reason;
      return Promise.all(reads);
    })};
  harness.make=value=>{options.push(value);return world;};
  const scope:any={location:{href:'https://slam.example/nested/assets/sensor.worker.js'},postMessage:(value:any,transfer:ArrayBuffer[]=[])=>{
    transferCounts.push(transfer.length);replies.push(structuredClone(value,{transfer}));
  }};
  vi.stubGlobal('self',scope);vi.stubGlobal('OffscreenCanvas',class{constructor(readonly width:number,readonly height:number){}});
  await import('../src/sensor-render.worker');
  const send=(data:any)=>scope.onmessage({data});
  return {world,replies,transferCounts,events,cameras,lidars,options,send};
}
const camera=()=>({rgb:new Uint8Array([1,2,3,255]),depth:new Float32Array([4])});
const lidar=(time=0)=>({time,beams:64,columns:1,near:.1,far:80,frame:'FLU',format:'FLU_XYZ_PACK24',samples:new Float32Array([5,0,0,1048576])});

it('routes the skeleton profile control to the sensor owner and refuses invalid controls',async()=>{
  const h=await setup();h.send({id:1,type:'init',base:'https://slam.example/'});
  await vi.waitFor(()=>expect(h.replies).toHaveLength(1),{interval:5});
  h.send({id:2,type:'configure',skeletonSharing:false});
  await vi.waitFor(()=>expect(h.replies).toHaveLength(2),{interval:5});
  expect(h.world.actors.setSkeletonSharing).toHaveBeenCalledWith(false);
  expect(h.replies[1].result.settings.skeletonSharing).toBe(false);
  h.send({id:3,type:'configure',skeletonSharing:'false'});
  await vi.waitFor(()=>expect(h.replies).toHaveLength(3),{interval:5});
  expect(h.replies[2].error).toContain('must be boolean');expect(h.world.actors.setSkeletonSharing).toHaveBeenCalledTimes(1);
});

it('applies the matched geometry control in the sensor owner and refuses nonboolean values',async()=>{
  const h=await setup();h.send({id:1,type:'init',base:'https://slam.example/'});
  await vi.waitFor(()=>expect(h.replies).toHaveLength(1),{interval:5});
  h.send({id:2,type:'configure',geometryBatching:false});
  await vi.waitFor(()=>expect(h.replies).toHaveLength(2),{interval:5});
  expect(h.world.setSensorGeometryBatching).toHaveBeenCalledWith(false);
  expect(h.replies[1].result.settings.geometryBatching).toBe(false);
  h.send({id:3,type:'configure',geometryBatching:'false'});
  await vi.waitFor(()=>expect(h.replies).toHaveLength(3),{interval:5});
  expect(h.replies[2].error).toContain('must be boolean');expect(h.world.setSensorGeometryBatching).toHaveBeenCalledTimes(1);
});

it('uses exact simulation time including zero, queues configuration behind both reads and transfers every sensor buffer',async()=>{
  const h=await setup();h.send({id:1,type:'init',base:'https://slam.example/nested/',environment:'warehouse',detail:'low',carsEnabled:false,peopleEnabled:true,environmentVisible:false,lightingMode:'night'});
  await vi.waitFor(()=>expect(h.replies).toHaveLength(1),{interval:5});
  expect(h.options[0]).toMatchObject({width:160,height:90,pixelRatio:1,base:'https://slam.example/nested/'});
  expect(h.world.build).toHaveBeenCalledWith('warehouse','low');expect(h.world.actors.setEnabled).toHaveBeenCalledWith(false,true);expect(h.world.setEnvironmentVisible).toHaveBeenCalledWith(false);
  expect(h.world.setLighting).toHaveBeenCalledWith('night');
  const actorMotion={time:0,east:[1,2,3,4,5,6],north:[-1,-2,-3,-4,-5,-6],sceneYaw:[0,0,0,0,0,0],distance:[0,0,0,0,0,0],walkTime:[0,.43,.86,0,0,0]};
  h.send({id:2,type:'capture',truth,actorMotion,lidarEnabled:true});h.send({id:3,type:'configure',environment:'city',carsEnabled:true});
  await vi.waitFor(()=>expect(h.events).toContain('lidar:0'),{interval:5});expect(h.world.update).toHaveBeenCalledWith(truth);
  expect(h.world.setActorMotion).toHaveBeenCalledWith(actorMotion);expect(h.events.indexOf('actors:0')).toBeLessThan(h.events.indexOf('camera'));
  expect(h.world.captureSensorPair).toHaveBeenCalledWith(true,'async',false,true,false);
  const pixels=camera(),scan=lidar();h.cameras[0].resolve(pixels);
  await Promise.resolve();expect(h.replies).toHaveLength(1);expect(h.world.build).not.toHaveBeenCalledWith('city','low');
  h.lidars[0].resolve(scan);await vi.waitFor(()=>expect(h.replies).toHaveLength(3),{interval:5});
  expect(h.replies.map(reply=>reply.id)).toEqual([1,2,3]);expect(h.transferCounts).toEqual([0,3,0]);
  expect(h.replies[1].result.rgb).toEqual(new Uint8Array([1,2,3,255]));expect(h.replies[1].result.scan.time).toBe(0);expect(h.replies[1].result.scan.samples).toEqual(new Float32Array([5,0,0,1048576]));
  expect(pixels.rgb.byteLength).toBe(0);expect(pixels.depth.byteLength).toBe(0);expect(scan.samples.byteLength).toBe(0);
  expect(h.replies[1].timings.queueMs).toBeGreaterThanOrEqual(0);expect(h.world.build).toHaveBeenCalledWith('city','low');
});

it('drains failed capture fences, bounds queued requests and remains usable after errors',async()=>{
  const h=await setup();h.send({id:1,type:'init',base:'https://slam.example/'});await vi.waitFor(()=>expect(h.replies).toHaveLength(1),{interval:5});
  h.send({id:2,type:'capture',truth,lidarEnabled:true});await vi.waitFor(()=>expect(h.cameras).toHaveLength(1),{interval:5});
  for(let id=3;id<=10;id++)h.send({id,type:'configure',carsEnabled:false});
  expect(h.replies.at(-1)).toMatchObject({id:10,error:expect.stringContaining('queue is full')});
  h.cameras[0].reject(new Error('GPU camera fence failed'));await Promise.resolve();await Promise.resolve();
  expect(h.replies.some(reply=>reply.id===2)).toBe(false);
  h.lidars[0].resolve(lidar());await vi.waitFor(()=>expect(h.replies).toHaveLength(10),{interval:5});
  expect(h.replies.find(reply=>reply.id===2).error).toContain('GPU camera fence failed');expect(h.replies.find(reply=>reply.id===9).result.settings.carsEnabled).toBe(false);
  h.send({id:11,type:'capture',truth:{...truth,time:-1}});h.send({id:12,type:'capture',truth:{...truth,time:1},lidarEnabled:false});
  await vi.waitFor(()=>expect(h.cameras).toHaveLength(2),{interval:5});h.cameras[1].resolve(camera());
  await vi.waitFor(()=>expect(h.replies).toHaveLength(12),{interval:5});
  expect(h.replies.find(reply=>reply.id===11).error).toContain('nonnegative simulation time');expect(h.replies.find(reply=>reply.id===12).result.scan).toBeUndefined();
  expect(h.transferCounts.at(-1)).toBe(2);expect(h.world.captureLidar).toHaveBeenCalledTimes(1);
  h.send({id:13,type:'capture',truth,actorMotion:{time:1}});
  await vi.waitFor(()=>expect(h.replies).toHaveLength(13),{interval:5});
  expect(h.replies.at(-1).error).toContain('share the committed simulation time');expect(h.cameras).toHaveLength(2);
});

it('captures a lidar-only tick without rendering or transferring either camera',async()=>{
  const h=await setup();h.send({id:1,type:'init',base:'https://slam.example/'});
  await vi.waitFor(()=>expect(h.replies).toHaveLength(1),{interval:5});
  h.send({id:2,type:'capture-lidar',truth:{...truth,time:.05}});
  await vi.waitFor(()=>expect(h.lidars).toHaveLength(1),{interval:5});
  expect(h.cameras).toHaveLength(0);expect(h.world.captureSensorPair).not.toHaveBeenCalled();
  h.send({id:3,type:'configure',detail:'low'});
  await Promise.resolve();expect(h.replies).toHaveLength(1);
  const scan=lidar(.05);h.lidars[0].resolve(scan);
  await vi.waitFor(()=>expect(h.replies).toHaveLength(3),{interval:5});
  expect(h.replies[1].result.scan.time).toBe(.05);expect(h.replies[1].result.rgb).toBeUndefined();
  expect(h.transferCounts).toEqual([0,1,0]);expect(scan.samples.byteLength).toBe(0);
});
