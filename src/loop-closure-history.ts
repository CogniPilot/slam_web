import type {Estimate,SensorFrame} from './types';
export interface KeyframeImage {id:number;time:number;imageEpoch:number;width:number;height:number;rgba:Uint8ClampedArray}
export interface ClosureImage {edgeId:number;referenceId:number;currentId:number;time:number;reference?:KeyframeImage;current?:KeyframeImage;similarity?:number}

/** Presentation-only, bounded snapshots of measured keyframe rasters. Stable
 * model IDs survive catalog-ring slot reuse; no appearance score is invented. */
export class LoopClosureHistory {
  readonly images=new Map<number,KeyframeImage>();
  readonly closures:ClosureImage[]=[];
  acceptedCount=0;
  candidateCount:number|undefined;
  private highestEdgeId=0;
  private lastSequence=-1;
  private lastTime=-1;
  revision=0;
  reset(){this.images.clear();this.closures.length=0;this.acceptedCount=0;this.candidateCount=undefined;this.highestEdgeId=0;this.lastSequence=-1;this.lastTime=-1;this.revision++;}
  observe(frame:SensorFrame,estimate:Estimate){
    if(frame.time<this.lastTime||frame.sequence<this.lastSequence)this.reset();
    const graph=estimate.poseGraph;
    if(!graph){if(this.images.size||this.closures.length)this.reset();return;}
    const fresh=frame.sequence!==this.lastSequence;
    this.lastTime=frame.time;this.lastSequence=frame.sequence;
    const candidates=estimate.diagnostics?.loopCandidates;
    if(fresh&&typeof candidates==='number'&&Number.isSafeInteger(candidates)&&candidates>=0)
      this.candidateCount=(this.candidateCount??0)+candidates;
    const retained=new Set(graph.keyframes.map(node=>node.id));
    for(const id of this.images.keys())if(!retained.has(id))this.images.delete(id);
    for(const node of graph.keyframes){
      if(node.id===undefined||node.time===undefined||node.imageEpoch!==frame.sequence||this.images.has(node.id))continue;
      const image=keyframeThumbnail(frame,node.id,node.time,node.imageEpoch);
      if(image)this.images.set(node.id,image);
    }
    let newest=this.highestEdgeId;
    for(const edge of graph.edges){
      if(edge.kind!=='loop'||edge.id===undefined||!Number.isSafeInteger(edge.id)||edge.id<=this.highestEdgeId)continue;
      const reference=graph.keyframes[edge.from],current=graph.keyframes[edge.to];
      if(reference?.id===undefined||current?.id===undefined)continue;
      newest=Math.max(newest,edge.id);this.acceptedCount++;
      this.closures.unshift({edgeId:edge.id,referenceId:reference.id,currentId:current.id,time:frame.time,
        reference:this.images.get(reference.id),current:this.images.get(current.id),
        similarity:edge.similarity!==undefined&&Number.isFinite(edge.similarity)&&edge.similarity>=0&&edge.similarity<=1?edge.similarity:undefined});
      this.closures.length=Math.min(6,this.closures.length);this.revision++;
    }
    this.highestEdgeId=newest;
    // The authored catalog holds 128 keyframes. External sources must not
    // turn a presentation cache into an unbounded recording.
    while(this.images.size>128)this.images.delete(this.images.keys().next().value!);
  }
}

export function keyframeThumbnail(frame:SensorFrame,id:number,time:number,imageEpoch:number):KeyframeImage|undefined {
  const {width:sourceWidth,height:sourceHeight}=frame.calibration;
  const channels=frame.imageLayout?3:4,stride=frame.imageLayout?.color.strideBytes??sourceWidth*channels;
  if(!Number.isSafeInteger(sourceWidth)||sourceWidth<1||!Number.isSafeInteger(sourceHeight)||sourceHeight<1||
    !Number.isSafeInteger(stride)||stride<sourceWidth*channels||frame.rgb.length<stride*sourceHeight)return;
  const scale=Math.min(1,160/sourceWidth,120/sourceHeight),width=Math.max(1,Math.round(sourceWidth*scale)),height=Math.max(1,Math.round(sourceHeight*scale));
  const rgba=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const from=Math.min(sourceHeight-1,Math.floor(y*sourceHeight/height))*stride+Math.min(sourceWidth-1,Math.floor(x*sourceWidth/width))*channels,to=(y*width+x)*4;
    rgba[to]=frame.rgb[from];rgba[to+1]=frame.rgb[from+1];rgba[to+2]=frame.rgb[from+2];rgba[to+3]=255;
  }
  return {id,time,imageEpoch,width,height,rgba};
}
