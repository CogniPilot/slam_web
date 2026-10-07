// Independent test-only object/slot oracle. Production math is Modelica.
export const MAP_CAPACITY=90*160,CANDIDATE_CAPACITY=350;
export const mapDefaults={coordinateLimit:1e6,voxelWidth:.25,mergeRadius:.15,maximumDistance:80,tentativeLifetime:.5,confirmedLifetime:5,confirmationObservations:3,maximumConfidence:8,maximumTentative:700};
export type MapSettings=typeof mapDefaults;
export type MapState={previousPoint:number[];previousOccupied:number[];previousConfidence:number[];previousLastSeen:number[];previousLastFrame:number[];previousTime:number;previousFrame:number;previousWorldFrame:number};
export type MapFrame=MapState&{candidatePoint:number[];candidateEnabled:number[];candidateCount:number;bodyPosition:number[];poseAccepted:number;timeNow:number;frameNow:number;worldFrame:number;resetRequested:number};
export type MapResult={point:number[];occupied:number[];confidence:number[];lastSeen:number[];lastFrame:number[];confirmed:number[];accepted:number[];rejectionReason:number[];nextTime:number[];nextFrame:number[];nextWorldFrame:number[];occupiedCount:number[];confirmedCount:number[];tentativeCount:number[];insertedCount:number[];mergedCount:number[];prunedCount:number[];droppedCount:number[];invalidCandidateCount:number[]};
export function emptyMap():MapState{return {previousPoint:Array(MAP_CAPACITY*3).fill(0),previousOccupied:Array(MAP_CAPACITY).fill(0),previousConfidence:Array(MAP_CAPACITY).fill(0),previousLastSeen:Array(MAP_CAPACITY).fill(0),previousLastFrame:Array(MAP_CAPACITY).fill(0),previousTime:0,previousFrame:0,previousWorldFrame:0};}
export function mapFrame(state:MapState=emptyMap()):MapFrame{return {...structuredClone(state),candidatePoint:Array.from({length:CANDIDATE_CAPACITY},(_,i)=>[(i%25-12)*.6,(Math.floor(i/25)-7)*.6,2]).flat(),candidateEnabled:Array(CANDIDATE_CAPACITY).fill(1),candidateCount:CANDIDATE_CAPACITY,bodyPosition:[0,0,0],poseAccepted:1,timeNow:state.previousTime+1/30,frameNow:state.previousFrame+1,worldFrame:state.previousWorldFrame,resetRequested:0};}
export function retainMap(result:MapResult):MapState{return {previousPoint:result.point.slice(),previousOccupied:result.occupied.slice(),previousConfidence:result.confidence.slice(),previousLastSeen:result.lastSeen.slice(),previousLastFrame:result.lastFrame.slice(),previousTime:result.nextTime[0],previousFrame:result.nextFrame[0],previousWorldFrame:result.nextWorldFrame[0]};}
const bounded=(v:number,limit:number)=>Number.isFinite(v)&&Math.abs(v)<=limit;
const integer=(v:number,lower:number,upper:number)=>Number.isInteger(v)&&v>=lower&&v<=upper;
type Entry={slot:number;position:number[];confidence:number;seen:number;frame:number};
export function mapOracle(f:MapFrame,s:MapSettings=mapDefaults):MapResult{
  const reset=f.resetRequested===1,configuration=bounded(s.coordinateLimit,1e6)&&s.coordinateLimit>0&&s.voxelWidth>=.001&&s.voxelWidth<=10&&s.mergeRadius>=0&&s.mergeRadius<=10&&s.maximumDistance>0&&s.maximumDistance<=1e4&&s.tentativeLifetime>0&&s.tentativeLifetime<=1e4&&s.confirmedLifetime>=s.tentativeLifetime&&s.confirmedLifetime<=1e4&&integer(s.confirmationObservations,2,s.maximumConfidence)&&integer(s.maximumConfidence,s.confirmationObservations,100)&&integer(s.maximumTentative,0,MAP_CAPACITY)&&integer(f.candidateCount,0,CANDIDATE_CAPACITY)&&f.poseAccepted===1&&f.bodyPosition.every(v=>bounded(v,s.coordinateLimit))&&bounded(f.timeNow,1e9)&&f.timeNow>=0&&integer(f.worldFrame,0,1e9)&&((reset&&f.frameNow===1)||(f.resetRequested===0&&f.previousTime>=0&&f.previousTime<f.timeNow&&bounded(f.previousTime,1e9)&&integer(f.previousFrame,0,1e9-1)&&f.frameNow===f.previousFrame+1&&f.previousWorldFrame===f.worldFrame));
  const entries:Entry[]=[];let stateValid=true;
  for(let slot=0;slot<MAP_CAPACITY;slot++){
    if(f.previousOccupied[slot]===0)continue;
    const position=f.previousPoint.slice(slot*3,slot*3+3);
    const valid=f.previousOccupied[slot]===1&&position.every(v=>bounded(v,s.coordinateLimit))&&integer(f.previousConfidence[slot],1,s.maximumConfidence)&&f.previousLastSeen[slot]>=0&&f.previousLastSeen[slot]<=f.previousTime&&integer(f.previousLastFrame[slot],1,f.previousFrame);
    if(!valid)stateValid=false;
    entries.push({slot,position,confidence:f.previousConfidence[slot],seen:f.previousLastSeen[slot],frame:f.previousLastFrame[slot]});
  }
  const accepted=configuration&&(reset||stateValid),result:MapResult={point:f.previousPoint.slice(),occupied:f.previousOccupied.slice(),confidence:f.previousConfidence.slice(),lastSeen:f.previousLastSeen.slice(),lastFrame:f.previousLastFrame.slice(),confirmed:Array(MAP_CAPACITY).fill(0),accepted:[+accepted],rejectionReason:[configuration?(reset||stateValid?0:2):1],nextTime:[accepted?f.timeNow:f.previousTime],nextFrame:[accepted?f.frameNow:f.previousFrame],nextWorldFrame:[accepted?f.worldFrame:f.previousWorldFrame],occupiedCount:[0],confirmedCount:[0],tentativeCount:[0],insertedCount:[0],mergedCount:[0],prunedCount:[0],droppedCount:[0],invalidCandidateCount:[0]};
  const distanceSquared=(point:number[],origin:number[])=>point.reduce((sum,v,k)=>sum+(v-origin[k])*(v-origin[k]),0);
  if(accepted){
    const survivors=reset?[]:entries.filter(e=>f.timeNow-e.seen<=(e.confidence>=s.confirmationObservations?s.confirmedLifetime:s.tentativeLifetime)&&distanceSquared(e.position,f.bodyPosition)<=s.maximumDistance*s.maximumDistance);
    result.prunedCount[0]=reset?0:entries.length-survivors.length;
    const bySlot=new Map(survivors.map(e=>[e.slot,e]));let tentative=survivors.filter(e=>e.confidence<s.confirmationObservations).length;
    for(let candidate=0;candidate<CANDIDATE_CAPACITY;candidate++){
      if(candidate>=f.candidateCount||f.candidateEnabled[candidate]===0)continue;
      const position=f.candidatePoint.slice(candidate*3,candidate*3+3);
      if(f.candidateEnabled[candidate]!==1||!position.every(v=>bounded(v,s.coordinateLimit))){result.invalidCandidateCount[0]++;continue;}
      if(distanceSquared(position,f.bodyPosition)>s.maximumDistance*s.maximumDistance)continue;
      const voxel=position.map(v=>Math.floor(v/s.voxelWidth));let duplicate:Entry|undefined,vacant=-1;
      for(let slot=0;slot<MAP_CAPACITY;slot++){
        const e=bySlot.get(slot);
        if(!e){if(vacant<0)vacant=slot;continue;}
        if(!duplicate&&(e.position.every((v,k)=>Math.floor(v/s.voxelWidth)===voxel[k])||distanceSquared(position,e.position)<=s.mergeRadius*s.mergeRadius))duplicate=e;
      }
      if(duplicate){
        if(duplicate.frame<f.frameNow){const wasTentative=duplicate.confidence<s.confirmationObservations;duplicate.confidence=Math.min(s.maximumConfidence,duplicate.confidence+1);if(wasTentative&&duplicate.confidence>=s.confirmationObservations)tentative--;}
        duplicate.seen=f.timeNow;duplicate.frame=f.frameNow;result.mergedCount[0]++;
      }else if(vacant>=0&&tentative<s.maximumTentative){bySlot.set(vacant,{slot:vacant,position,confidence:1,seen:f.timeNow,frame:f.frameNow});tentative++;result.insertedCount[0]++;}
      else result.droppedCount[0]++;
    }
    result.point.fill(0);result.occupied.fill(0);result.confidence.fill(0);result.lastSeen.fill(0);result.lastFrame.fill(0);
    for(const e of bySlot.values()){result.point.splice(e.slot*3,3,...e.position);result.occupied[e.slot]=1;result.confidence[e.slot]=e.confidence;result.lastSeen[e.slot]=e.seen;result.lastFrame[e.slot]=e.frame;}
  }
  for(let i=0;i<MAP_CAPACITY;i++)if(result.occupied[i]===1){result.occupiedCount[0]++;if(result.confidence[i]>=s.confirmationObservations){result.confirmed[i]=1;result.confirmedCount[0]++;}else result.tentativeCount[0]++;}
  return result;
}
export function fullMap():MapState{const s=emptyMap();s.previousTime=1;s.previousFrame=3;s.previousOccupied.fill(1);s.previousConfidence.fill(3);s.previousLastSeen.fill(1);s.previousLastFrame.fill(3);s.previousPoint=Array.from({length:MAP_CAPACITY},(_,i)=>[(i%120-60)*.4,(Math.floor(i/120)-60)*.4,0]).flat();return s;}
export function sparseMap():MapState{const s=emptyMap();s.previousTime=1;s.previousFrame=3;for(const slot of [0,MAP_CAPACITY-1]){s.previousOccupied[slot]=1;s.previousConfidence[slot]=3;s.previousLastSeen[slot]=1;s.previousLastFrame[slot]=3;s.previousPoint.splice(slot*3,3,slot===0?10:-10,0,2);}return s;}
