import { describe,it,expect } from 'vitest';
import { packFrame,unpackFrame } from '../src/packet';
import { encodeImu,encodeOdometry,decodeOdometry } from '../src/synapse';
import { defaultGraph,validateGraph } from '../src/graph';
import type { SensorFrame } from '../src/types';
const frame:SensorFrame={sequence:0,time:.1,dt:.1,calibration:{width:2,height:1,fx:1,fy:1,cx:.5,cy:0,near:.28,far:10,forward:.18,up:-.04,baseline:.05,rgbFx:1,rgbFy:1},rgb:new Uint8Array([0,1,2,255,3,4,5,255]),depth:new Float32Array([2,0]),imu:{accel:[0,0,9.81],gyro:[0,0,0]}};
describe('portable wire contracts',()=>{
  it('round trips calibrated images and rejects malformed payload lengths',()=>{
    const bytes=packFrame(frame);expect(unpackFrame(bytes)).toEqual(frame);
    expect(()=>unpackFrame(bytes.subarray(0,bytes.length-1))).toThrow('Truncated');
    for(const calibration of [{baseline:NaN},{depthNoiseDisparityPx:-1},{depthNoiseReferenceFx:0}])
      expect(()=>unpackFrame(packFrame({...frame,calibration:{...frame.calibration,...calibration}}))).toThrow();
  });
  it('uses the canonical Synapse fixed structs and Hamilton ENU attitude',()=>{
    const imu=encodeImu(frame);expect(imu.length).toBe(40);
    expect(new DataView(imu.buffer).getBigUint64(0,true)).toBe(100_000_000n);
    const p={x:2,y:3,z:4,quaternion:[.5,.5,.5,.5]};
    const odom=encodeOdometry(p,.1,.8);expect(odom.length).toBe(72);expect(decodeOdometry(odom)).toEqual(p);
  });
});
describe('executable graph invariants',()=>{
  it('orders all publishers before their consumers and rejects incompatible ports',()=>{
    const graph=defaultGraph(),order=validateGraph(graph).map(n=>n.id);
    expect(order.indexOf('physics')).toBeLessThan(order.indexOf('sensor'));
    expect(order.indexOf('detector')).toBeLessThan(order.indexOf('slam'));
    graph.edges[0].to='slam';graph.edges[0].input='frame';expect(()=>validateGraph(graph)).toThrow('Incompatible');
  });
  it('rejects multiple producers and zero-delay loops',()=>{
    const graph=defaultGraph();graph.edges.push({...graph.edges[1]});expect(()=>validateGraph(graph)).toThrow('multiple publishers');
    graph.edges.pop();graph.edges=graph.edges.filter(e=>!(e.to==='map'));
    graph.edges.push({from:'map',output:'estimate',to:'map',input:'estimate'});expect(()=>validateGraph(graph)).toThrow('cycles');
  });
});
