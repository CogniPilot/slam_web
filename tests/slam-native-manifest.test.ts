import {expect,it} from 'vitest';
import {gunzipSync} from 'node:zlib';
import {compactLayout,publishedAssets} from '../scripts/slam-native-manifest.mjs';
import {quaternionFromRotation} from '../src/modelica-slam-session';

const layout={
  pages:4,y_bytes:64,p_offset:64,scratch_offset:256,typed_offset:1024,typed_bytes:32,y_count:8,p_count:24,
  state:{count:2,previous_hash:'a',next_hash:'a'},carry:[1024,1032,8],
  settings:[['h',64,0.1],['accel[1]',80,0],['accel[2]',88,0],['accel[3]',96,9.81],['opticalToBody[1,1]',104,0],['opticalToBody[1,2]',112,0],['opticalToBody[1,3]',120,1],
    ['opticalToBody[2,1]',128,-1],['opticalToBody[2,2]',136,0],['opticalToBody[2,3]',144,0],['opticalToBody[3,1]',152,0],['opticalToBody[3,2]',160,-1],['opticalToBody[3,3]',168,0]],
  frames:{slots:{rgb:[200,6],depth:[248,2],interval_time:72,image_epoch:1040}},
  unsourced_inputs_zero_filled:[{name:'rgb[1,1,1]',p_index:17,count:6,kind:'Real'}],
  outputs:[{name:'accepted',lane:'u8',offset:0},{name:'next.a.b',lane:'i64',offset:8},{name:'reason[1]',lane:'i64',offset:16}],
  y_names:['next.estimator.localization.estimator.position[1]'],
  model_inputs:[{name:'gyro',p_index:3,count:3,kind:'Real'}],
};

it('reduces an export layout to host slots with absolute offsets',()=>{
  const compact=compactLayout('D435FastSLAMStep',layout);
  expect(compact.inputs.h).toEqual({offset:64,count:1,lane:'f64'});
  expect(compact.inputs.accel).toEqual({offset:80,count:3,lane:'f64'});
  expect(compact.inputs.opticalToBody).toEqual({offset:104,count:9,lane:'f64'});
  expect(compact.inputs.gyro).toEqual({offset:64+3*8,count:3,lane:'f64'});
  expect(compact.inputs.rgb).toEqual({offset:200,count:6,lane:'f64'});
  expect(compact.inputs.intervalTime).toEqual({offset:72,count:1,lane:'f64'});
  expect(compact.inputs.imageEpoch).toEqual({offset:1040,count:1,lane:'i64'});
  expect(compact.outputs).toEqual([{name:'accepted',lane:'u8',offset:1024}]);
  expect(compact.state).toEqual(layout.state);
  expect(()=>compactLayout('x',{...layout,settings:[...layout.settings.filter(([n])=>n!=='accel[2]'),['accel[2]',200,0]]})).toThrow('not contiguous');
});

it('publishes content-addressed gzip blobs shared between models',()=>{
  const files={'module.wasm':new Uint8Array([0,97,115,109]),'y.bin':new Uint8Array(16)};
  const {manifest,blobs}=publishedAssets({initialize:{layout:compactLayout('a',layout),files},step:{layout:compactLayout('b',layout),files}},{sourceSha256:'x'});
  expect(blobs.size).toBe(2);
  expect(manifest.models.initialize.files.module.file).toBe(manifest.models.step.files.module.file);
  const blob=blobs.get(manifest.models.step.files.y.file)!;
  expect(gunzipSync(blob.bytes)).toEqual(Buffer.from(files['y.bin']));
  expect(manifest.models.step.files.y).toMatchObject({bytes:16,encoding:'gzip'});
});

it('reads carried Real, Integer and Boolean state from the compiler-published input cells',()=>{
  const runs=[
    {name:'position',lane:'f64',previous:64,next:0,count:3},
    {name:'epoch',lane:'i64',previous:1040,next:1104,count:1},
    {name:'occupied',lane:'u8',previous:1060,next:1120,count:4},
    {name:'uncarried',lane:'f64',previous:160,next:48,count:1},
  ];
  const compact=compactLayout('in-place',{...layout,state_runs:runs,
    carried:[0,64,24],carried_lanes:[1104,1040,8,1120,1060,4]});
  expect(compact.state_runs.map(run=>run.next)).toEqual([64,1040,1060,48]);
  expect(compactLayout('copy',{...layout,state_runs:runs}).state_runs).toEqual(runs);
  expect(()=>compactLayout('split',{...layout,state_runs:runs,carried:[0,64,16]})).toThrow('splits a named state run');
});

it('converts rotation matrices to unit quaternions',()=>{
  expect(quaternionFromRotation([1,0,0,0,1,0,0,0,1])).toEqual([1,0,0,0]);
  const q=quaternionFromRotation([0,-1,0,1,0,0,0,0,1]);
  expect(q[0]).toBeCloseTo(Math.SQRT1_2,12);expect(q[3]).toBeCloseTo(Math.SQRT1_2,12);
});
