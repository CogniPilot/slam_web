import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {WorldNavigation,NavigationHandoff,gpsAvailable,type GpsSample} from '../src/world-navigation';
import type {Estimate} from '../src/types';
import {WorldMaterials} from '../src/world-materials';
import {covarianceAxes} from '../src/covariance';

const covariance=[.0025,0,0,0,.0025,0,0,0,.0025];
function estimate(x:number,y=0,z=1.5):Estimate {return {x,y,z,quaternion:[1,0,0,0],points:[],confidence:.9,uncertainty:{positionCovariance:covariance.slice(),attitudeCovariance:covariance.slice()},diagnostics:{loops:0}};}
function fix(time:number,p:Estimate):GpsSample {const c=Math.cos(.7),s=Math.sin(.7);return {time,position:[c*p.x-s*p.y+20+.025*Math.sin(time*4),s*p.x+c*p.y-8+.02*Math.cos(time*3),p.z+.4+.015*Math.sin(time)],positionCovariance:covariance.slice()};}
function aligned() {const helper=new NavigationHandoff();let output;for(let i=0;i<35;i++){const time=i*.2,p=estimate(i*.24,Math.sin(i*.09));output=helper.update(time,p,fix(time,p));}return {helper,output:output!};}

describe('training enclosure and GNSS/SLAM handoff',()=>{
  it('models explicit roof loss and an actually open, enterable west doorway',()=>{
    const material=new THREE.MeshStandardMaterial(),materials={surface:()=>material,sign:()=>material} as unknown as WorldMaterials;
    const building=new WorldNavigation(materials);
    const part=(hit:THREE.Intersection)=>hit.object.userData.parts[hit.instanceId!];
    expect(gpsAvailable([34,0,1.5])).toBe(true);expect(building.gpsAvailable([42,0,1.5])).toBe(false);expect(gpsAvailable([42,0,4])).toBe(true);expect(gpsAvailable([42,6,1.5])).toBe(true);expect(gpsAvailable([NaN,0,0])).toBe(false);
    const ray=new THREE.Raycaster(new THREE.Vector3(34,1.5,0),new THREE.Vector3(1,0,0));
    const hits=ray.intersectObject(building.group,true);expect(part(hits[0])).toBe('back-panel');expect(hits[0].distance).toBeCloseTo(13.72);
    ray.set(new THREE.Vector3(34,1.5,3),new THREE.Vector3(1,0,0));expect(part(ray.intersectObject(building.group,true)[0])).toBe('entrance-jamb');
    ray.set(new THREE.Vector3(42,1.5,0),new THREE.Vector3(0,1,0));expect(part(ray.intersectObject(building.group,true)[0])).toBe('roof');
  });
  it('gets heading only from observed motion, aligns noisy paired positions and propagates PSD uncertainty',()=>{
    const {helper,output}=aligned();expect(output.status).toBe('gps');expect(output.alignment!.yaw).toBeCloseTo(.7,2);expect(output.alignment!.translation[0]).toBeCloseTo(20,1);expect(output.alignment!.pairs).toBeGreaterThanOrEqual(6);
    const p=estimate(9,1),result=helper.update(7.1,p,null),expected=fix(7.1,p).position;
    expect(result.source).toBe('slam');expect(new THREE.Vector3(...result.position as [number,number,number]).distanceTo(new THREE.Vector3(...expected as [number,number,number]))).toBeLessThan(.08);
    expect(result.quaternion![0]).toBeCloseTo(Math.cos(.35),2);expect(result.quaternion![3]).toBeCloseTo(Math.sin(.35),2);
    expect(covarianceAxes(result.positionCovariance!).variances.every(v=>v>0)).toBe(true);
    const stationary=new NavigationHandoff();let stopped;for(let i=0;i<30;i++){const p=estimate(0);stopped=stationary.update(i*.2,p,fix(i*.2,p));}
    expect(stopped!.source).toBe('gps');expect(stopped!.status).toBe('aligning');expect(stopped!.quaternion).toBeNull();expect(stationary.update(6.5,estimate(0),null).status).toBe('unaligned');
  });
  it('rejects impossible GPS innovations and unavailable or overconfident-invalid SLAM',()=>{
    const {helper}=aligned(),p=estimate(8.3,.1),bad=fix(7,p);bad.position[0]+=100;
    const rejected=helper.update(7,p,bad);expect(rejected.source).toBe('slam');expect(rejected.reason).toContain('innovation rejected');
    const lost=estimate(8.4);lost.confidence=0;expect(helper.update(7.2,lost,null).position).toBeNull();
    const invalid=estimate(8.4);invalid.uncertainty!.positionCovariance[0]=-1;expect(helper.update(7.2,invalid,null).source).toBe('none');
    const high=estimate(8.4);high.uncertainty!.positionCovariance=[5,0,0,0,5,0,0,0,5];expect(helper.update(7.2,high,null).source).toBe('none');
    expect(helper.update(NaN,p,null).source).toBe('none');
  });
  it('retains a motion baseline at90Hz while outputting every GPS sample and refusing stationary heading',()=>{
    const moving=new NavigationHandoff(),stationary=new NavigationHandoff();let alignedAt:number|null=null,output;
    for(let i=0;i<=720;i++){
      const time=i/90,physical=estimate(1.1*time),jitter=(i%2?1:-1)*.12;
      const observed=estimate(physical.x+jitter),gps=fix(time,physical);
      output=moving.update(time,observed,gps);
      // High-rate pose noise exceeds the old .2m displacement admission gate,
      // but conveys no extra independent heading baseline.
      expect(output.source).toBe('gps');expect(output.position).toEqual(gps.position);
      if(output.alignment&&alignedAt===null)alignedAt=time;
      const stopped=estimate(jitter),fixed=fix(time,estimate(0));
      const stationaryOutput=stationary.update(time,stopped,fixed);
      expect(stationaryOutput.alignment).toBeNull();expect(stationaryOutput.quaternion).toBeNull();
    }
    expect(alignedAt).not.toBeNull();expect(alignedAt!).toBeLessThan(4);
    expect(output!.alignment!.pairs).toBeLessThanOrEqual(40);
    expect(output!.alignment!.span).toBeGreaterThan(7);
    expect(output!.alignment!.yaw).toBeCloseTo(.7,2);
    const physical=estimate(8.8),indoor=moving.update(8+1/90,physical,null);
    expect(indoor.source).toBe('slam');expect(indoor.status).toBe('slam');
    expect(new THREE.Vector3(...indoor.position as [number,number,number]).distanceTo(new THREE.Vector3(...fix(8,physical).position as [number,number,number]))).toBeLessThan(.2);
    expect(covarianceAxes(indoor.positionCovariance!).variances.every(value=>value>0)).toBe(true);
    expect(stationary.update(8+1/90,estimate(0),null).status).toBe('unaligned');
  });
  it('never carries a stale alignment through a graph correction or reset',()=>{
    const {helper}=aligned(),corrected=estimate(7.5,.2);corrected.diagnostics={loops:1};
    const changed=helper.update(7,corrected,null);expect(changed.status).toBe('relocalizing');expect(changed.position).toBeNull();expect(changed.alignment).toBeNull();
    let reacquired;for(let i=0;i<35;i++){const t=7.2+i*.2,p=estimate(7.5+i*.24,.2);p.diagnostics={loops:1};reacquired=helper.update(t,p,fix(t,p));}
    expect(reacquired!.status).toBe('gps');helper.reset();expect(helper.update(0,estimate(0),null).status).toBe('unaligned');
  });
});
