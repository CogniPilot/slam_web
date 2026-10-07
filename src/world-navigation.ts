import * as THREE from 'three';
import type {Estimate} from './types';
import {WorldMaterials} from './world-materials';
import {covarianceAxes} from './covariance';

export interface RoofVolume {minimum:number[];maximum:number[]}
export const TRAINING_ROOF:RoofVolume={minimum:[35.8,-5.2,0],maximum:[48.2,5.2,3.8]};

/** Demonstration geofence, not an RF propagation or satellite visibility model. */
export function gpsAvailable(position:number[],volume:RoofVolume=TRAINING_ROOF) {
  if(position.length!==3||!position.every(Number.isFinite))return false;
  return !position.every((value,i)=>value>=volume.minimum[i]&&value<=volume.maximum[i]);
}

/** A real enclosure with an open west doorway; no solid building proxy inside. */
export class WorldNavigation {
  readonly group=new THREE.Group();
  readonly roofVolume=TRAINING_ROOF;
  constructor(materials:WorldMaterials) {
    this.group.name='navigation-training-building';
    const geometry=new THREE.BoxGeometry(1,1,1);
    const batches=new Map<THREE.Material,{matrices:THREE.Matrix4[];names:string[]}>();
    const box=(name:string,x:number,y:number,z:number,w:number,d:number,h:number,material:THREE.Material)=>{
      const mesh=new THREE.Mesh(geometry,material);mesh.name=name;
      mesh.position.set(x,z,-y);mesh.scale.set(w,h,d);mesh.updateMatrix();
      let batch=batches.get(material);if(!batch){batch={matrices:[],names:[]};batches.set(material,batch);}
      batch.matrices.push(mesh.matrix.clone());batch.names.push(name);return mesh;
    };
    const brick=materials.surface('brick',0xa56e56),plaster=materials.surface('plaster',0xe1ddd0);
    const paving=materials.surface('paving',0xbcc5c3),wood=materials.surface('wood',0x8e6746);
    box('floor',42,0,.05,12,10,.1,paving);
    box('roof',42,0,3.7,12.4,10.4,.2,plaster);
    box('east-wall',47.9,0,1.8,.2,10,3.6,brick);
    for(const y of [-4.9,4.9])box('side-wall',42,y,1.8,12,.2,3.6,plaster);
    // 3m clear opening from ground to2.8m; independent lintel above it.
    for(const y of [-3.25,3.25])box('entrance-jamb',36.1,y,1.8,.2,3.5,3.6,brick);
    box('entrance-lintel',36.1,0,3.2,.2,3,.8,brick);
    box('approach',34,0,.035,4,3,.07,paving);
    for(const y of [-4.45,4.45])for(const x of [39,43,46]){
      box('cabinet',x,y,.75,1.5,.6,1.3,wood);
      box('shelf',x,y,1.7,1.6,.65,.08,wood);
      box('shelf',x,y,2.3,1.6,.65,.08,wood);
    }
    for(const [i,color] of [0x306e79,0xbb804d,0x6c7960].entries())box('back-panel',47.76,-2.8+i*2.8,1.65,.08,1.7,1.9,materials.surface('wood',color));
    box('training-sign',35.97,0,3.22,.05,2.5,.43,materials.sign('GPS / SLAM LAB',0x2d666b));
    for(const [material,batch] of batches){
      const mesh=new THREE.InstancedMesh(geometry,material,batch.matrices.length);mesh.name='training-surfaces';
      batch.matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.userData.parts=batch.names;
      mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();this.group.add(mesh);
    }
    this.group.updateMatrixWorld(true);
  }
  gpsAvailable(position:number[]) {return gpsAvailable(position,this.roofVolume);}
}

export interface GpsSample {time:number;position:number[];positionCovariance:number[]}
export interface NavigationResult {
  source:'gps'|'slam'|'none';status:'gps'|'slam'|'aligning'|'unaligned'|'unavailable'|'relocalizing';reason:string;
  position:number[]|null;quaternion:number[]|null;positionCovariance:number[]|null;
  alignment:{yaw:number;translation:number[];pairs:number;rms:number;span:number;yawStd:number}|null;
}
type Pair={slam:number[];gps:number[];variance:number};
type Alignment={yaw:number;translation:number[];center:number[];pairs:number;rms:number;span:number;yawStd:number;variance:number};
const squaredDistance=(a:number[],b:number[])=>a.reduce((sum,value,i)=>sum+(value-b[i])**2,0);
const finitePosition=(p:number[])=>p.length===3&&p.every(Number.isFinite);
function validCovariance(covariance:number[]|undefined) {
  if(!covariance)return false;
  try{covarianceAxes(covariance);return true;}catch{return false;}
}
function rotate(position:number[],yaw:number) {const c=Math.cos(yaw),s=Math.sin(yaw);return [c*position[0]-s*position[1],s*position[0]+c*position[1],position[2]];}
function rotateCovariance(covariance:number[],yaw:number) {
  const c=Math.cos(yaw),s=Math.sin(yaw),r=[c,-s,0,s,c,0,0,0,1],result=new Array<number>(9).fill(0);
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)for(let a=0;a<3;a++)for(let b=0;b<3;b++)result[i*3+j]+=r[i*3+a]*covariance[a*3+b]*r[j*3+b];
  return result;
}

/** Navigation display handoff, separate from the SLAM measurement model.
 * Assumes both frames share gravity/up. Yaw is observed from paired motion;
 * neither a single GPS fix nor stationary fixes provide a heading.
 * Correlated SLAM positions make this a conservative alignment approximation,
 * not tightly coupled GNSS/VIO fusion or an absolute-heading receiver.
 */
export class NavigationHandoff {
  private pairs:Pair[]=[];
  private alignment:Alignment|null=null;
  private lastGps:GpsSample|null=null;
  private lastEstimate:{time:number;position:number[];loops:number}|null=null;
  private lastPairTime=-Infinity;
  private relocalizing=false;

  reset() {this.pairs=[];this.alignment=null;this.lastGps=null;this.lastEstimate=null;this.lastPairTime=-Infinity;this.relocalizing=false;}

  update(time:number,estimate:Estimate|null,gps:GpsSample|null):NavigationResult {
    const result:NavigationResult={source:'none',status:'unavailable',reason:'No valid navigation observation',position:null,quaternion:null,positionCovariance:null,alignment:null};
    if(!Number.isFinite(time)){result.reason='Invalid simulation timestamp';return result;}
    const slam=estimate?[estimate.x,estimate.y,estimate.z]:null;
    const covariance=estimate?.uncertainty?.positionCovariance;
    const q=estimate?.quaternion;
    const goodSlam=!!(estimate&&slam&&finitePosition(slam)&&Number.isFinite(estimate.confidence)&&estimate.confidence>=.1&&q?.length===4&&q.every(Number.isFinite)&&Math.abs(q.reduce((sum,v)=>sum+v*v,0)-1)<.02&&validCovariance(covariance)&&covariance![0]+covariance![4]+covariance![8]<=6.25);
    let frameChanged=false;
    if(goodSlam&&slam&&estimate){
      const loops=Number(estimate.diagnostics?.loops??0),previous=this.lastEstimate;
      if(previous){const dt=time-previous.time;frameChanged=dt<0||loops>previous.loops||(dt>0&&squaredDistance(slam,previous.position)>(12*dt+.75)**2);}
      if(frameChanged){this.pairs=[];this.alignment=null;this.relocalizing=true;this.lastPairTime=-Infinity;}
      this.lastEstimate={time,position:slam.slice(),loops};
    }
    let gpsReason='GPS unavailable',goodGps=false;
    if(gps){
      goodGps=finitePosition(gps.position)&&Number.isFinite(gps.time)&&time-gps.time>=-1e-6&&time-gps.time<=.3&&validCovariance(gps.positionCovariance)&&gps.positionCovariance[0]>0&&gps.positionCovariance[4]>0&&gps.positionCovariance[8]>0&&Math.max(gps.positionCovariance[0],gps.positionCovariance[4],gps.positionCovariance[8])<=25;
      gpsReason=goodGps?'GPS observed':'GPS stale, invalid or too uncertain';
      if(goodGps&&this.lastGps){
        const dt=gps.time-this.lastGps.time,noise=3*Math.sqrt(gps.positionCovariance[0]+gps.positionCovariance[4]+gps.positionCovariance[8]+this.lastGps.positionCovariance[0]+this.lastGps.positionCovariance[4]+this.lastGps.positionCovariance[8]);
        if(dt<0||(dt===0&&squaredDistance(gps.position,this.lastGps.position)>1e-12)||(dt>0&&squaredDistance(gps.position,this.lastGps.position)>(12*dt+noise)**2)){goodGps=false;gpsReason='GPS innovation rejected';}
      }
      if(goodGps){
        this.lastGps={time:gps.time,position:gps.position.slice(),positionCovariance:gps.positionCovariance.slice()};
        // Bound history in sensor time: high-rate pose jitter must not fill
        // forty slots before a heading baseline has actually been travelled.
        // GPS validation/output above and below still run on every update.
        if(goodSlam&&slam&&covariance&&gps.time-this.lastPairTime>=.2-1e-9){
          const previous=this.pairs.at(-1);
          if(!previous||squaredDistance(slam,previous.slam)>=.04||gps.time-this.lastPairTime>=.5){
            this.pairs.push({slam:slam.slice(),gps:gps.position.slice(),variance:Math.max(.0001,...[0,4,8].map(i=>gps.positionCovariance[i]+covariance[i]))});
            if(this.pairs.length>40)this.pairs.shift();this.lastPairTime=gps.time;
            const fit=this.fit();if(fit){this.alignment=fit;this.relocalizing=false;}
          }
        }
      }
    }
    if(this.alignment){const a=this.alignment;result.alignment={yaw:a.yaw,translation:a.translation.slice(),pairs:a.pairs,rms:a.rms,span:a.span,yawStd:a.yawStd};}
    if(goodGps&&gps){result.source='gps';result.status=this.alignment?'gps':'aligning';result.reason=this.alignment?'GPS position; SLAM frame aligned from paired motion':'GPS position; heading awaiting an observable motion baseline';result.position=gps.position.slice();result.positionCovariance=gps.positionCovariance.slice();}
    else if(goodSlam&&slam&&covariance&&this.alignment){
      const a=this.alignment,position=rotate(slam,a.yaw);result.position=position.map((value,i)=>value+a.translation[i]);result.positionCovariance=rotateCovariance(covariance,a.yaw);
      const relative=rotate(slam.map((v,i)=>v-a.center[i]),a.yaw),jacobian=[-relative[1],relative[0],0];
      for(let i=0;i<3;i++)for(let j=0;j<3;j++)result.positionCovariance[i*3+j]+=(i===j?a.variance:0)+jacobian[i]*jacobian[j]*a.yawStd**2;
      if(result.positionCovariance[0]+result.positionCovariance[4]+result.positionCovariance[8]>9){result.position=null;result.positionCovariance=null;result.reason='Aligned SLAM navigation uncertainty exceeds3m';}
      else{result.source='slam';result.status='slam';result.reason=`${gpsReason}; aligned SLAM position`;} // No pose freezing on loss.
    } else {result.status=this.relocalizing?'relocalizing':goodSlam?'unaligned':'unavailable';result.reason=this.relocalizing?'SLAM frame correction requires fresh GPS alignment':goodSlam?`${gpsReason}; SLAM has no observable GPS alignment`:`${gpsReason}; SLAM pose invalid or too uncertain`;}
    if(result.source!=='none'&&goodSlam&&q&&this.alignment){
      const c=Math.cos(this.alignment.yaw/2),s=Math.sin(this.alignment.yaw/2); // Hamilton wxyz: left-compose world yaw.
      result.quaternion=[c*q[0]-s*q[3],c*q[1]-s*q[2],c*q[2]+s*q[1],c*q[3]+s*q[0]];
    }
    return result;
  }

  private fit():Alignment|null {
    if(this.pairs.length<6)return null;
    let active=this.pairs.slice(),solution:Alignment|null=null;
    // Bounded robust 2D rigid least squares (gravity supplies the up axis).
    // Same fixed-scale point-pattern alignment as Umeyama, specialized to yaw.
    for(let iteration=0;iteration<3;iteration++){
      if(active.length<6||active.length<this.pairs.length*.7)return null;
      const weights=active.map(pair=>1/pair.variance),total=weights.reduce((a,b)=>a+b,0),center=[0,0,0],gpsCenter=[0,0,0];
      active.forEach((pair,index)=>{for(let i=0;i<3;i++){center[i]+=weights[index]*pair.slam[i]/total;gpsCenter[i]+=weights[index]*pair.gps[i]/total;}});
      let cosine=0,sine=0,spanSquared=0;
      active.forEach((pair,index)=>{const x=pair.slam[0]-center[0],y=pair.slam[1]-center[1],gx=pair.gps[0]-gpsCenter[0],gy=pair.gps[1]-gpsCenter[1];cosine+=weights[index]*(x*gx+y*gy);sine+=weights[index]*(x*gy-y*gx);spanSquared=Math.max(spanSquared,x*x+y*y);});
      if(Math.hypot(cosine,sine)<1e-10)return null;
      const yaw=Math.atan2(sine,cosine),transformed=rotate(center,yaw),translation=gpsCenter.map((v,i)=>v-transformed[i]);
      const residuals=active.map(pair=>Math.sqrt(squaredDistance(rotate(pair.slam,yaw).map((v,i)=>v+translation[i]),pair.gps)));
      const rms=Math.sqrt(residuals.reduce((sum,r)=>sum+r*r,0)/active.length),measurementVariance=Math.max(...active.map(pair=>pair.variance)),variance=Math.max(measurementVariance,rms*rms/3);
      const span=2*Math.sqrt(spanSquared),yawStd=Math.sqrt(2*variance/spanSquared);
      if(span<3||yawStd>.2)return null;
      solution={yaw,translation,center,pairs:active.length,rms,span,yawStd,variance};
      const retained=active.filter((pair,index)=>residuals[index]<=Math.max(.6,3*Math.sqrt(3*pair.variance)));
      if(retained.length===active.length)return rms<=Math.max(.6,3*Math.sqrt(measurementVariance))?solution:null;
      active=retained;
    }
    return null;
  }
}
