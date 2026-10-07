import type {Pose} from './types';
import {poseSnapshot} from './trajectory';
import {alignPose,validatePose} from './evaluation';
export interface TimedPose extends Pose {time?:number}
export interface ComparisonStream {
  topic:string;color:string;path:TimedPose[];samples:number;pairs:number;
  squaredDifference:number;latestDifference:number|null;
  sourceAnchor?:Pose;targetAnchor?:Pose;paired:Set<string>;
}
const colors=['#bd9afa','#ffbd73','#68c9eb','#ef87b4','#a8d978','#f3df82','#c3ccd5','#78d6c1'];
const key=(time:number)=>String(Math.round(time*1e6));
export class ComparisonTracker {
  readonly streams=new Map<string,ComparisonStream>();
  private local=new Map<string,Pose>();
  alignFirst=true;
  clear(){this.streams.clear();this.local.clear();}
  private pair(stream:ComparisonStream,p:TimedPose) {
    if(p.time===undefined)return;
    const stamp=key(p.time),local=this.local.get(stamp);
    if(!local||stream.paired.has(stamp))return;
    if(!stream.sourceAnchor){stream.sourceAnchor=p;stream.targetAnchor=local;}
    const aligned=this.alignFirst?alignPose(p,stream.sourceAnchor,stream.targetAnchor!):p;
    const difference=Math.hypot(aligned.x-local.x,aligned.y-local.y,aligned.z-local.z);
    stream.squaredDifference+=difference*difference;stream.latestDifference=difference;stream.pairs++;
    stream.paired.add(stamp);if(stream.paired.size>2000)stream.paired.delete(stream.paired.values().next().value!);
  }
  addLocal(time:number,pose:Pose) {
    validatePose(pose);this.local.set(key(time),poseSnapshot(pose));
    if(this.local.size>300)this.local.delete(this.local.keys().next().value!);
    for(const stream of this.streams.values())for(const sample of stream.path)if(sample.time!==undefined&&key(sample.time)===key(time))this.pair(stream,sample);
  }
  addExternal(topic:string,p:TimedPose) {
    validatePose(p);
    if(p.time!==undefined&&(!Number.isFinite(p.time)||p.time<0))throw new Error('External odometry has an invalid timestamp');
    let stream=this.streams.get(topic);
    if(!stream){
      if(this.streams.size>=8)throw new Error('At most eight comparison streams are supported');
      stream={topic,color:colors[this.streams.size],path:[],samples:0,pairs:0,squaredDifference:0,latestDifference:null,paired:new Set()};this.streams.set(topic,stream);
    }
    const previous=stream.path.at(-1)?.time;
    if(p.time!==undefined&&previous!==undefined){
      if(p.time<previous)throw new Error('External odometry clock restarted or reordered; apply/reset before comparing');
      if(p.time===previous)return;
    }
    p={...poseSnapshot(p),time:p.time};stream.path.push(p);if(stream.path.length>2000)stream.path.shift();stream.samples++;
    this.pair(stream,p);
  }
  path(stream:ComparisonStream):Pose[] {
    if(this.alignFirst&&!stream.sourceAnchor)return [];
    return this.alignFirst?stream.path.map(p=>alignPose(p,stream.sourceAnchor!,stream.targetAnchor!)):stream.path;
  }
}
