import {test} from 'node:test';
import assert from 'node:assert/strict';
import {snapshotPriorCatalogReference,snapshotSparseImageOutputs} from './loop-catalog-snapshot.mjs';

test('catalog snapshot uses previous offsets after carry, checks binding, and owns copies',()=>{
  const memory=new WebAssembly.Memory({initial:20}),view=new DataView(memory.buffer),state_runs=[];
  let offset=0;
  const add=(name,count,lane='f64',values=[])=>{
    offset=Math.ceil(offset/8)*8;const width=lane==='u8'?1:8,previous=offset,next=offset+count*width+8;
    state_runs.push({name:'estimator.localization.catalog.'+name,lane,count,previous,next});offset=next+count*width;
    for(let i=0;i<count;i++){
      const v=values[i]??0,at=previous+i*width;
      if(lane==='f64')view.setFloat64(at,v,true);else if(lane==='i64')view.setBigInt64(at,BigInt(v),true);else view.setUint8(at,v);
    }
  };
  add('nextId',1,'i64',[3]);add('generation',1,'i64',[1]);add('occupied',2,'u8',[1,1]);
  add('ids',2,'i64',[1,2]);add('generations',2,'i64',[1,1]);add('epochs',2,'i64',[0,10]);add('imageTimes',2,'f64',[0,2]);add('counts',2,'i64',[350,350]);
  for(const [name,stride,lane] of [['featureEnabled',350,'u8'],['descriptors',350*49,'f64'],['opticalPoints',350*3,'f64'],['pixelCoordinates',350*2,'i64'],['rgbCalibrations',4,'f64'],['depthCalibrations',4,'f64'],['disparityNoises',1,'f64'],['noiseReferenceFocals',1,'f64'],['baselines',1,'f64']])add(name,2*stride,lane);
  const layout={state_runs},before=new Uint8Array(memory.buffer).slice();
  const snap=snapshotPriorCatalogReference(layout,memory);
  assert.equal(snap.slot,2);assert.equal(snap.frame.id,2);assert.equal(snap.frame.epoch,10);assert.equal(snap.frame.descriptor.length,350*49);
  assert.equal(snapshotPriorCatalogReference(layout,memory,{referenceId:1}).frame.epoch,0);
  snap.frame.descriptor[0]=99;assert.deepEqual(new Uint8Array(memory.buffer),before);
  assert.throws(()=>snapshotPriorCatalogReference(layout,memory,{referenceId:3}),/identity/);
  const idRun=state_runs.find(r=>r.name.endsWith('.ids'));view.setBigInt64(idRun.previous+8,9n,true);
  assert.throws(()=>snapshotPriorCatalogReference(layout,memory),/identity differs/);
});

test('image output snapshot preserves all slots and never returns live views',()=>{
  const memory=new WebAssembly.Memory({initial:1}),layout={y_count:1400,model_outputs:[{name:'features',index:0,count:1050},{name:'featureEnabled',index:1050,count:350}]};
  const data=new Float64Array(memory.buffer);data[1047]=17;data[1399]=1;
  const snapshot=snapshotSparseImageOutputs(layout,memory);
  assert.equal(snapshot.features[1047],17);assert.equal(snapshot.featureEnabled[349],1);
  data[1047]=99;assert.equal(snapshot.features[1047],17);
  assert.throws(()=>snapshotSparseImageOutputs({...layout,model_outputs:[]},memory),/full sparse/);
});
