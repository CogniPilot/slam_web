import {modelicaSourcePath} from '../../src/modelica-source-locations.mjs';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {NativeProgram,type NativeProgramArtifact} from '../../src/modelica-native-program';
import {MAP_CAPACITY,CANDIDATE_CAPACITY,mapDefaults,emptyMap,mapFrame,mapOracle,retainMap,fullMap,sparseMap,type MapFrame,type MapSettings} from './modelica-rgbd-landmark-map-fixtures';
const source=['RGBDSpatialIndex','RGBDLandmarkMap'].map(name=>readFileSync(modelicaSourcePath(name),'utf8')).join('\n'),editedSource=source.replace('parameter Real confirmationObservations = 3.0;','parameter Real confirmationObservations = 2.0;');
const directory=process.env.RUMOCA_MAP_ARTIFACT_DIRECTORY,enabled=Boolean(directory),sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const report:Record<string,unknown>={status:enabled?'RUNNING':'SOURCE_ARTIFACT_NOT_AVAILABLE',sourceSha256:sha(source),editedSourceSha256:sha(editedSource),mapCapacity:MAP_CAPACITY,candidateCapacity:CANDIDATE_CAPACITY,oracleFixtureTestsCompleted:0,actualNumericGroupsCompleted:0,actualCases:[],runtimeIntegrated:false,fullSlamAccepted:false,productionPinChanged:false};
function save(){const p=process.env.RUMOCA_MAP_REPORT;if(p){mkdirSync(resolve(p,'..'),{recursive:true});writeFileSync(p,JSON.stringify(report,null,2)+'\n');}}save();
let artifact:NativeProgramArtifact,editedArtifact:NativeProgramArtifact,program:NativeProgram;
beforeAll(async()=>{if(!enabled)return;artifact=JSON.parse(readFileSync(resolve(directory!,'baseline.json'),'utf8'));editedArtifact=JSON.parse(readFileSync(resolve(directory!,'edited.json'),'utf8'));program=await NativeProgram.instantiate(artifact,source);report.moduleSha256=artifact.module_sha256;report.moduleBytes=artifact.module_bytes.length;report.profile=artifact.profile;report.compiler=artifact.compiler;expect(artifact.var_layout.shapes.point).toEqual([MAP_CAPACITY,3]);expect(artifact.var_layout.shapes.occupied).toEqual([MAP_CAPACITY]);save();});
afterAll(()=>{if(enabled&&report.status==='RUNNING')report.status=report.actualNumericGroupsCompleted===4?'ACTUAL_FULL_CAPACITY_NATIVE_NUMERIC_PASS':'FAILED_OR_INCOMPLETE';save();});
function oracleComplete(){report.oracleFixtureTestsCompleted=Number(report.oracleFixtureTestsCompleted)+1;save();}
function execute(name:string,f:MapFrame,s:MapSettings=mapDefaults){
  for(const [key,value] of Object.entries(f))program.input(key).set(Array.isArray(value)?value:[value]);
  const input=new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8).slice(),expected=mapOracle(f,s),start=performance.now();program.evaluate(f.timeNow);
  expect(new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8)).toEqual(input);
  let checked=0;for(const [key,values] of Object.entries(expected)){const actual=program.output(key);expect(actual.length).toBe(values.length);for(let i=0;i<values.length;i++){if(Object.is(actual[i],values[i]))continue;if(!Number.isFinite(actual[i])||!Number.isFinite(values[i])||Math.abs(actual[i]-values[i])>2e-11)throw new Error(`${name}/${key}[${i}]: ${actual[i]} != ${values[i]}`);}checked+=values.length;}
  (report.actualCases as unknown[]).push({name,elapsedMs:performance.now()-start,outputsChecked:checked});save();return expected;
}
function complete(){report.actualNumericGroupsCompleted=Number(report.actualNumericGroupsCompleted)+1;save();}
it('independent full-capacity fixture: repeated candidates cannot confirm within one frame; retained frames can; no Modelica execution',()=>{
  const f=mapFrame();f.candidatePoint=Array(CANDIDATE_CAPACITY).fill([.02,.02,2]).flat();const first=mapOracle(f);expect(first.insertedCount).toEqual([1]);expect(first.mergedCount).toEqual([349]);expect(first.confidence[0]).toBe(1);expect(first.confirmedCount).toEqual([0]);
  const second=mapOracle(mapFrame(retainMap(first)));expect(second.confidence[0]).toBe(2);const third=mapOracle(mapFrame(retainMap(second)));expect(third.confirmed[0]).toBe(1);expect(third.point.length).toBe(14400*3);oracleComplete();
});
it('independent full-capacity fixture: negative voxel boundary/spatial dedup retains the first anchor and full sparse late slots; no Modelica execution',()=>{
  const f=mapFrame(sparseMap());f.candidateEnabled.fill(0);f.candidateEnabled[349]=1;f.candidatePoint.splice(349*3,3,-10.02,0,2);const r=mapOracle(f);expect(r.mergedCount).toEqual([1]);expect(r.confidence[14399]).toBe(4);expect(r.point.slice(-3)).toEqual([-10,0,2]);
  const b=mapFrame();b.candidateEnabled.fill(0);b.candidateEnabled[0]=b.candidateEnabled[349]=1;b.candidatePoint.splice(0,3,-.01,0,2);b.candidatePoint.splice(1047,3,.01,0,2);const boundary=mapOracle(b);expect(boundary.insertedCount).toEqual([1]);expect(boundary.mergedCount).toEqual([1]);expect(boundary.point.slice(0,3)).toEqual([-.01,0,2]);oracleComplete();
});
it('independent full14,400-slot fixture: full storage refuses new distant voxels and pruning recycles the earliest slot; no Modelica execution',()=>{
  const f=mapFrame(fullMap());f.candidatePoint=Array(CANDIDATE_CAPACITY).fill([50,0,2]).flat();const r=mapOracle(f);expect(r.occupiedCount).toEqual([14400]);expect(r.droppedCount).toEqual([350]);
  f.previousLastSeen[14399]=0;f.timeNow=5.01;f.candidateEnabled.fill(0);f.candidateEnabled[349]=1;const prune=mapOracle(f);expect(prune.prunedCount).toEqual([1]);expect(prune.insertedCount).toEqual([1]);expect(prune.point.slice(-3)).toEqual([50,0,2]);oracleComplete();
});
it('independent full-capacity fixture: tentative quota, exact age/distance boundaries and malformed candidates; no Modelica execution',()=>{
  let s=retainMap(mapOracle(mapFrame()));s=retainMap(mapOracle(mapFrame(s)));const f=mapFrame(s);f.candidatePoint=f.candidatePoint.map((v,i)=>i%3===2?v+5:v);const r=mapOracle(f);expect(r.tentativeCount).toEqual([700]);expect(r.insertedCount).toEqual([350]);
  const next=mapFrame(retainMap(r));next.candidatePoint=next.candidatePoint.map((v,i)=>i%3===2?v+10:v);expect(mapOracle(next).droppedCount).toEqual([350]);
  const bad=mapFrame();bad.candidateEnabled.fill(0);bad.candidatePoint.fill(NaN);bad.candidateEnabled[349]=1;expect(mapOracle(bad).invalidCandidateCount).toEqual([1]);
  const age=mapFrame(sparseMap());age.candidateEnabled.fill(0);age.timeNow=6;expect(mapOracle(age).occupiedCount).toEqual([2]);age.timeNow=6+1e-8;expect(mapOracle(age).prunedCount).toEqual([2]);oracleComplete();
});
it('independent full-capacity fixture: distance and tentative-age boundaries are inclusive; malformed empty payload is canonicalized; no Modelica execution',()=>{
  const f=mapFrame(sparseMap());f.candidateEnabled.fill(0);f.previousPoint.splice(0,3,80,0,0);f.previousPoint.splice(43197,3,80+1e-8,0,0);const r=mapOracle(f);expect(r.occupied[0]).toBe(1);expect(r.occupied[14399]).toBe(0);expect(r.prunedCount).toEqual([1]);
  const tentative=mapFrame(sparseMap());tentative.candidateEnabled.fill(0);tentative.previousConfidence.fill(1);tentative.timeNow=1.5;expect(mapOracle(tentative).occupiedCount).toEqual([2]);tentative.timeNow=1.5+1e-8;expect(mapOracle(tentative).prunedCount).toEqual([2]);
  const empty=mapFrame();empty.candidateEnabled.fill(0);empty.previousPoint.fill(NaN);empty.previousConfidence.fill(NaN);const cleared=mapOracle(empty);expect(cleared.accepted).toEqual([1]);expect(cleared.point.every(v=>v===0)).toBe(true);expect(cleared.confidence.every(v=>v===0)).toBe(true);oracleComplete();
});
it('independent full-capacity fixture: rejected frame/state is retained, reset changes world-frame ownership and source settings change confirmation; no Modelica execution',()=>{
  for(const mutation of [(f:MapFrame)=>f.worldFrame++, (f:MapFrame)=>f.frameNow++, (f:MapFrame)=>f.timeNow=f.previousTime, (f:MapFrame)=>f.previousOccupied[14399]=.5, (f:MapFrame)=>f.candidateCount=351, (f:MapFrame)=>f.poseAccepted=0]){const f=mapFrame(sparseMap());mutation(f);const r=mapOracle(f);expect(r.accepted).toEqual([0]);expect(r.point).toEqual(f.previousPoint);expect(r.occupied).toEqual(f.previousOccupied);expect(r.nextFrame).toEqual([f.previousFrame]);}
  const reset=mapFrame(fullMap());reset.resetRequested=1;reset.frameNow=1;reset.worldFrame=17;reset.candidateEnabled.fill(0);reset.previousOccupied[14399]=NaN;const r=mapOracle(reset);expect(r.accepted).toEqual([1]);expect(r.occupiedCount).toEqual([0]);expect(r.nextWorldFrame).toEqual([17]);
  const first=mapOracle(mapFrame());expect(mapOracle(mapFrame(retainMap(first)),{...mapDefaults,confirmationObservations:2}).confirmedCount).toEqual([350]);oracleComplete();
});
it.skipIf(!enabled)('actual full-capacity native state retains confidence across frames and sparse candidates, with immutable input bytes',()=>{
  let state=emptyMap();for(let frame=1;frame<=3;frame++){const r=execute(`retained frame ${frame}`,mapFrame(state));state=retainMap(r);}expect(state.previousConfidence.filter(v=>v===3)).toHaveLength(350);
  const sparse=mapFrame(sparseMap());sparse.candidateEnabled.fill(0);sparse.candidatePoint.fill(NaN);sparse.candidateEnabled[349]=1;sparse.candidatePoint.splice(1047,3,-10.02,0,2);execute('full domain sparse final slot/maskedNaN',sparse);complete();
});
it.skipIf(!enabled)('actual full14,400-slot native storage capacity, ordered duplicate anchors, quotas and pruning',()=>{
  const full=mapFrame(fullMap());full.candidatePoint=Array(CANDIDATE_CAPACITY).fill([50,0,2]).flat();execute('all14400 occupied +350 refused insertions',full);full.previousLastSeen[14399]=0;full.timeNow=5.01;full.candidateEnabled.fill(0);full.candidateEnabled[349]=1;execute('last14400th slot pruned/reused',full);
  const boundary=mapFrame(sparseMap());boundary.candidateEnabled.fill(0);boundary.previousPoint.splice(0,3,80,0,0);boundary.previousPoint.splice(43197,3,80+1e-8,0,0);execute('inclusive spatial boundary+outside last slot',boundary);boundary.previousPoint.splice(0,3,10,0,2);boundary.previousPoint.splice(43197,3,-10,0,2);boundary.timeNow=6;execute('inclusive confirmed lifetime boundary',boundary);boundary.timeNow+=1e-8;execute('confirmed lifetime expires',boundary);
  const duplicate=mapFrame();duplicate.candidatePoint=Array(CANDIDATE_CAPACITY).fill([.02,.02,2]).flat();execute('350 same-frame duplicate confidence1',duplicate);
  const state=retainMap(mapOracle(mapFrame()));const q=mapFrame(state);q.candidatePoint=q.candidatePoint.map((v,i)=>i%3===2?v+5:v);const added=execute('tentative quota reaches700',q);const drop=mapFrame(retainMap(added));drop.candidatePoint=drop.candidatePoint.map((v,i)=>i%3===2?v+10:v);execute('tentative quota refuses350',drop);complete();
});
it.skipIf(!enabled)('actual native time/frame/state/pose refusals are atomic, with reset and recovery',()=>{
  for(const [name,mutate] of [['wrongworld',(f:MapFrame)=>f.worldFrame++],['gap',(f:MapFrame)=>f.frameNow++],['repeatedtime',(f:MapFrame)=>f.timeNow=f.previousTime],['invalidlateoccupied',(f:MapFrame)=>f.previousOccupied[14399]=.5],['NaNlatepoint',(f:MapFrame)=>f.previousPoint[43199]=NaN],['badcount',(f:MapFrame)=>f.candidateCount=351],['rejectedpose',(f:MapFrame)=>f.poseAccepted=0]] as const){const f=mapFrame(sparseMap());mutate(f);execute(name,f);}
  const bad=mapFrame();bad.candidateEnabled[0]=.5;bad.candidatePoint[1049]=NaN;execute('active invalid candidate guards',bad);
  const reset=mapFrame(fullMap());reset.resetRequested=1;reset.frameNow=1;reset.worldFrame=17;reset.candidateEnabled.fill(0);execute('explicit full reset/new world frame',reset);program.reset();execute('native reset +empty map recovery',mapFrame());complete();
});
it.skipIf(!enabled)('actual native source edit and source-bound JSON reload change confirmation across all350 features',async()=>{
  const first=mapOracle(mapFrame()),f=mapFrame(retainMap(first));const baseline=execute('baseline confirmation3',f);expect(baseline.confirmedCount).toEqual([0]);const original=program;program=await NativeProgram.instantiate(editedArtifact,editedSource);execute('edited confirmation2',f,{...mapDefaults,confirmationObservations:2});program=await NativeProgram.instantiate(JSON.parse(JSON.stringify(editedArtifact)),JSON.parse(JSON.stringify({source:editedSource})).source);execute('edited source/artifact JSON reload',f,{...mapDefaults,confirmationObservations:2});await expect(NativeProgram.instantiate(editedArtifact,source)).rejects.toThrow('source');program=original;complete();
});
