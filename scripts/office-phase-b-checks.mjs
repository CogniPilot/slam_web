// Phase B office-loop acquisition and boundary checks (holds 1, 2 and 4 of design r2).
// Pure functions over captured frame JSON. No browser, compiler, network or filesystem side effects here;
// the CLI at the bottom reads one capture directory and writes one NEW output directory.
// Blindness is procedural: outputs of boundaries()/snapshotPlan() are coordinator-only and must not be
// shown to the adjudicator before labels are sealed. Nothing here enforces that at the filesystem level.

// ---- Source-owned geometry (src/world-office-loop.ts, models/Vehicles/LabQuadrotor.mo) ----
export const GEOMETRY=Object.freeze({
  length:24,width:16,corridor:3.6,ceiling:3.2,
  // Wall boxes 0.2 m thick centred 1.8 m from the centreline; doors/prints protrude to 0.155 m from the
  // wall centre, so the nearest obstacle face is 1.8-0.155 = 1.645 m from the centreline on both sides.
  freeHalfWidth:1.645,
  // Ceiling lamps hang to 3.2-0.035-0.02 = 3.145 m.
  lowestOverhead:3.145,
  armLength:0.25,            // LabQuadrotor arm_length (source)
  rotorRadius:0.15,          // DECLARED here; not in the plant source (Vale: safe). Recorded in every receipt.
  bodyHalfHeight:0.10,       // DECLARED here; not in the plant source. Recorded in every receipt.
});
export const SWEPT_RADIUS=GEOMETRY.armLength+GEOMETRY.rotorRadius;

// ---- Limits bound by design r2 / reviewed physics check ----
export const LIMITS=Object.freeze({
  horizontalTracking:0.75, altitudeNominal:1.5, altitudeBand:0.25, clearance:0.25,
  returnPosition:0.10, returnAltitude:0.10, returnHeading:0.02, settledHorizontal:0.25,
  frameDt:0.2, frames:1251, duration:250,
});

// ---- Reference: exact port of models/Benchmarks/OfficeLoopProfile.mo ----
const clamp01=v=>Math.min(1,Math.max(0,v));
const progress=(t,a,d)=>{const s=clamp01((t-a)/d);return 10*s**3-15*s**4+6*s**5;};
const X=t=>24*(progress(t,5,60)-progress(t,125,60));
const Y=t=>16*(progress(t,75,40)-progress(t,195,40));
const H=t=>(Math.PI/2)*(progress(t,65,10)+progress(t,115,10)+progress(t,185,10)+progress(t,235,10));
/** Reference pose at capture time t. route 'single' is the original 250 s circuit; 'two-circuit' is design
 * adbad056: s = 2t - 250*floor(t/125), heading h(s) + 2*pi*floor(t/125). Only the command clock is scaled. */
export function reference(t,route){
  if(route==='single')return{x:X(t),y:Y(t),z:1.5,heading:H(t),lap:0};
  if(route!=='two-circuit')throw Error('unknown route '+route);
  const lap=t>=250?1:Math.floor(t/125),s=t>=250?250:2*t-250*lap;
  return{x:X(s),y:Y(s),z:1.5,heading:H(s)+2*Math.PI*lap,lap};
}
/** Reference is stationary at the start corner for s in [235,250]: position settled; heading settled from s=245. */
export function settledSpans(route){
  return route==='single'?{position:[[235,250]],heading:[[245,250]]}
    :{position:[[117.5,125],[242.5,250]],heading:[[122.5,125],[247.5,250]]};
}

const yaw=q=>{const[w,x,y,z]=q;return Math.atan2(2*(w*z+x*y),1-2*(y*y+z*z));};
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
/** Distance from (x,y) to the nearest obstacle face, positive inside the free corridor ring. */
export function wallDistance(x,y,g=GEOMETRY){
  const h=g.freeHalfWidth,ox0=-h,oy0=-h,ox1=g.length+h,oy1=g.width+h,ix0=h,iy0=h,ix1=g.length-h,iy1=g.width-h;
  const outer=Math.min(x-ox0,ox1-x,y-oy0,oy1-y);                               // inside the outer rectangle
  const dx=Math.max(ix0-x,0,x-ix1),dy=Math.max(iy0-y,0,y-iy1),inner=Math.hypot(dx,dy);   // outside the inner block
  const insideInner=x>ix0&&x<ix1&&y>iy0&&y<iy1;
  return Math.min(outer,insideInner?-Math.min(x-ix0,ix1-x,y-iy0,iy1-y):inner);
}

function requireFrames(frames){
  if(!Array.isArray(frames)||frames.length!==LIMITS.frames)throw Error(`need exactly ${LIMITS.frames} frames`);
  frames.forEach((f,i)=>{
    if(f.sequence!==i||Math.abs(f.time-i*LIMITS.frameDt)>1e-9)throw Error('frame sequence/time gap at '+i);
    const t=f.truth;if(!t||![t.x,t.y,t.z,...(t.quaternion??[]),...(t.velocity??[])].every(Number.isFinite)||t.quaternion.length!==4)throw Error('invalid truth at '+i);
  });
}

/** Hold 1: flight envelope on the captured truth. Returns a receipt; status 'pass' only if every frame passes. */
export function envelopeCheck(frames,route){
  requireFrames(frames);
  const worst={tracking:0,altitude:0,clearance:Infinity,overhead:Infinity,floor:Infinity};const violations=[];
  for(const f of frames){
    const r=reference(f.time,route),t=f.truth,speed=Math.hypot(...t.velocity);
    const tracking=Math.hypot(t.x-r.x,t.y-r.y),altitude=Math.abs(t.z-LIMITS.altitudeNominal);
    // Between 0.2 s samples the body can move speed*dt/2 from the nearest sample: subtract that margin.
    const margin=speed*LIMITS.frameDt/2;
    const clearance=wallDistance(t.x,t.y)-SWEPT_RADIUS-margin;
    const overhead=GEOMETRY.lowestOverhead-(t.z+GEOMETRY.bodyHalfHeight)-margin,floor=t.z-GEOMETRY.bodyHalfHeight-margin;
    worst.tracking=Math.max(worst.tracking,tracking);worst.altitude=Math.max(worst.altitude,altitude);
    worst.clearance=Math.min(worst.clearance,clearance);worst.overhead=Math.min(worst.overhead,overhead);worst.floor=Math.min(worst.floor,floor);
    const bad=[];
    if(tracking>LIMITS.horizontalTracking)bad.push('tracking');if(altitude>LIMITS.altitudeBand)bad.push('altitude');
    if(clearance<LIMITS.clearance)bad.push('wall-clearance');if(overhead<LIMITS.clearance)bad.push('overhead-clearance');if(floor<LIMITS.clearance)bad.push('floor-clearance');
    if(clearance<=0||overhead<=0||floor<=0)bad.push('contact');
    if(bad.length&&violations.length<64)violations.push({sequence:f.sequence,time:f.time,reasons:bad});
  }
  return{check:'phase-b-envelope',route,status:violations.length?'refused':'pass',sweptRadius:SWEPT_RADIUS,declaredVehicle:{rotorRadius:GEOMETRY.rotorRadius,bodyHalfHeight:GEOMETRY.bodyHalfHeight},limits:LIMITS,worst,violations,
    scope:'Geometric receipt from captured truth at 5 Hz with an interpolation margin. The physics plant has no wall collision; this is the collision receipt. Not an estimator gate.'};
}

/** Hold 2: return tolerances at the start corner at the end of each lap. */
export function returnCheck(frames,route){
  requireFrames(frames);
  const spans=settledSpans(route),ends=route==='single'?[1250]:[625,1250],out=[],violations=[];
  for(const seq of ends){
    const f=frames[seq],t=f.truth,r=reference(f.time===250?250:f.time,route);
    const position=Math.hypot(t.x-r.x,t.y-r.y),altitude=Math.abs(t.z-r.z),heading=Math.abs(wrap(yaw(t.quaternion)-r.heading));
    out.push({sequence:seq,time:f.time,position,altitude,heading});
    if(position>LIMITS.returnPosition||altitude>LIMITS.returnAltitude||heading>LIMITS.returnHeading)violations.push({sequence:seq,reason:'endpoint'});
  }
  for(const[a,b]of spans.position)for(const f of frames)if(f.time>=a-1e-9&&f.time<=b+1e-9){
    const r=reference(f.time,route),e=Math.hypot(f.truth.x-r.x,f.truth.y-r.y);
    if(e>LIMITS.settledHorizontal&&violations.length<64)violations.push({sequence:f.sequence,reason:'settled-span',error:e});
  }
  return{check:'phase-b-return',route,status:violations.length?'refused':'pass',endpoints:out,spans,violations};
}

// ---- Hold 4: B and recovery events from native outputs (coordinator-only) ----
// Source rule (RGBDGraphMeasurements.mo, flag-on): on a capture frame (not reset, catalog nextId > 1) the anchored branch
// runs whenever the sequential proposal is not valid. sequentialValid also includes ValidProposal checks that the exported
// sequentialRejectionReason does not show (Vale review: 7 = no consensus, 11 = failed motion screen, 6 = descriptor
// failure likely at double speed, 0 = success; a proposal can fail ValidProposal with reason 0). So pass 1 cannot decide R;
// it reports every recovery-like event, and R is the first event whose retained raw next-state proves an anchored admission.
const ids=list=>new Set(list.map(x=>x.id));
/** B: first noninitial baseline frame whose loop candidates name at least two distinct verified reference IDs. */
export function boundaryB(baseline){
  for(let i=1;i<baseline.length;i++){
    const refs=new Set((baseline[i].native.loopClosure?.candidates??[]).filter(c=>c.verified===true).map(c=>c.referenceId));
    if(refs.size>=2)return i;
  }
  return null;
}
/** Every candidate frame at or after B where a new keyframe ID appears, at least one new loop-edge ID touches it, and the
 * whole-graph correction is accepted. Detected by IDs, not counts, so eviction cannot mask or fake an addition. */
export function recoveryEvents(candidate,B){
  if(B===null)return[];
  const events=[];
  for(let i=Math.max(B,1);i<candidate.length;i++){
    const f=candidate[i],p=candidate[i-1],d=f.nativeTrace.derived,g=f.native.poseGraph,gp=p.native.poseGraph;
    const before=ids(gp.keyframes),newKeyframes=g.keyframes.map((k,index)=>({id:k.id,index})).filter(k=>!before.has(k.id));
    const edgesBefore=ids(gp.edges.filter(e=>e.kind==='loop'));
    const newIdx=new Set(newKeyframes.map(k=>k.index));
    const newLoops=g.edges.filter(e=>e.kind==='loop'&&!edgesBefore.has(e.id)&&(newIdx.has(e.from)||newIdx.has(e.to)));
    if(newKeyframes.length>=1&&newLoops.length>=1&&d.graphCorrectionAccepted===true&&d.graphReason===0&&d.graphCommitReason===0)
      events.push({epoch:i,time:f.time,newKeyframeIds:newKeyframes.map(k=>k.id),newLoopEdgeIds:newLoops.map(e=>e.id),
        sequentialRejectionReason:d.sequentialRejectionReason,sequentialInvalidObserved:d.sequentialRejectionReason!==0,
        inEarlyWindow:f.time>=115-1e-9&&f.time<=125+1e-9});
  }
  return events;
}
/** Anchored-admission proof on a decoded saved next-state (Vale review of r2). With the flag on, a capture can be
 * admitted without a consecutive edge into the new keyframe only through the anchored branch. `graph` is the decoded
 * graph state from the reviewed state observer: {lastCaptureId, reset, firstCapture, edges:[{kind, referenceId, currentId}]},
 * kind 1 = consecutive, kind 2 = loop. anchoredCount is the optional per-step count if the observer exports it. */
export function anchoredAdmissionProof(graph,newKeyframeId,anchoredCount){
  const into=graph.edges.filter(e=>e.currentId===newKeyframeId);
  const loopRefs=new Set(into.filter(e=>e.kind===2).map(e=>e.referenceId));
  const clauses={lastCaptureIsNew:graph.lastCaptureId===newKeyframeId,notReset:graph.reset===false,notFirstCapture:graph.firstCapture===false,
    noConsecutiveEdge:!into.some(e=>e.kind===1),twoDistinctLoopReferences:loopRefs.size>=2,
    anchoredCount:anchoredCount===undefined?'not exported':anchoredCount===1};
  const proven=Object.values(clauses).every(v=>v===true||v==='not exported');
  return{proven,clauses};
}
export const MAX_EVENT_SNAPSHOTS=16;
/** Snapshot plan for the second, otherwise identical replay pass. */
export function snapshotPlan(baseline,candidate){
  const B=boundaryB(baseline),events=recoveryEvents(candidate,B),early=events.filter(e=>e.inEarlyWindow);
  const chosen=events.slice(0,MAX_EVENT_SNAPSHOTS);
  const snapshots=B===null?[]:[
    {side:'baseline',epoch:B-1,state:'next'},{side:'baseline',epoch:B,state:'previous'},
    {side:'candidate',epoch:B-1,state:'next'},{side:'candidate',epoch:B,state:'previous'},
    ...chosen.flatMap(e=>[{side:'candidate',epoch:e.epoch,state:'previous'},{side:'candidate',epoch:e.epoch,state:'next'}])];
  const seen=new Set(),unique=snapshots.filter(s=>{const k=s.side+':'+s.epoch+':'+s.state;return seen.has(k)?false:(seen.add(k),true);});
  return{plan:'phase-b-snapshots',B,events,eventsTruncated:events.length>chosen.length,snapshots:unique,
    verdictEffect:B===null?'INCONCLUSIVE (no B)':early.length===0?'INCONCLUSIVE (no recovery-like event in 115-125 s)':'continue',
    rDetermination:'R = first event, in time order, whose decoded saved next-state passes anchoredAdmissionProof for its new keyframe (plus anchored count 1 if the observer exports it). R outside 115-125 s => INCONCLUSIVE.',
    coordinatorOnly:true,
    rules:'Pass 2 must reproduce pass 1 native outputs exactly for all 1251 frames on both sides before any snapshot is used; any difference stops the run.'};
}

// ---- CLI: node office-phase-b-checks.mjs <envelope|return|plan> --capture DIR [--candidate DIR] --route two-circuit --out NEW_DIR ----
if(import.meta.url===`file://${process.argv[1]}`){
  const {readFile,readdir,mkdir,writeFile}=await import('node:fs/promises');const {join}=await import('node:path');
  const [mode,...rest]=process.argv.slice(2);const arg=k=>{const i=rest.indexOf('--'+k);return i<0?undefined:rest[i+1];};
  const load=async dir=>{const names=(await readdir(join(dir,'frames'))).filter(n=>/^\d{4}\.json$/.test(n)).sort();return Promise.all(names.map(async n=>JSON.parse(await readFile(join(dir,'frames',n),'utf8'))));};
  const out=arg('out');if(!out)throw Error('--out NEW_DIR required');await mkdir(out);   // fails if it exists
  const route=arg('route')??'two-circuit';let result;
  if(mode==='envelope')result=envelopeCheck(await load(arg('capture')),route);
  else if(mode==='return')result=returnCheck(await load(arg('capture')),route);
  else if(mode==='plan')result=snapshotPlan(await load(arg('capture')),await load(arg('candidate')));
  else throw Error('mode must be envelope, return or plan');
  await writeFile(join(out,mode+'-receipt.json'),JSON.stringify(result,null,1)+'\n',{flag:'wx'});
  console.log(JSON.stringify({mode,status:result.status??result.verdictEffect}));
  if(result.status==='refused')process.exitCode=2;
}
