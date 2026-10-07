import {expect,it} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NativeProgram,type NativeProgramArtifact} from '../../src/modelica-native-program';
import {admissibleGraphInputs,cost,eye,expQ,finiteDifferenceOptimizer,graphInputs,inverse,loopFixture,matrix,multiply,mv,norm,numericalJacobians,poseError,product,residual,rotation,transpose,type Edge,type Graph,type Matrix,type Pose} from './pose-graph-fixtures';

const source=readFileSync('models/ModelicaPoseGraph.mo','utf8');
const graphArtifact=process.env.RUMOCA_POSE_GRAPH_ARTIFACT;
const edgeArtifact=process.env.RUMOCA_POSE_GRAPH_EDGE_ARTIFACT;
const sha=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex');
const maxDifference=(a:number[],b:number[])=>Math.max(0,...a.map((v,i)=>Math.abs(v-b[i])));
const flatten=(x:unknown):number[]=>Array.isArray(x)?x.flat(Infinity) as number[]:[x as number];
function set(program:NativeProgram,values:Record<string,unknown>){for(const [name,value] of Object.entries(values))program.input(name).set(flatten(value));}
function parameterBytes(program:NativeProgram,artifact:NativeProgramArtifact){const a=artifact.abi;return new Uint8Array(program.memory.buffer,a.p_offset,a.p_count*8).slice();}
function compareMatrix(actual:Float64Array,wanted:Matrix,tolerance=3e-7){expect(maxDifference([...actual],wanted.flat())).toBeLessThan(tolerance);}

it('independent quaternion finite differences cover rotated manifold edge Jacobians',()=>{
  const {graph}=loopFixture();
  const a={p:[.8,-.4,1.2],q:expQ([.4,-.3,.7])},b={p:[-1,.5,2.8],q:expQ([-.2,.6,1])};
  const e:Edge={from:0,to:1,t:[.2,-.5,.6],q:expQ([.1,.2,-.4]),information:eye(6),slot:255};
  const [Ji,Jj]=numericalJacobians(a,b,e),Rt=transpose(rotation(a.q));
  for(let i=0;i<3;i++)for(let j=0;j<3;j++){
    expect(Ji[i][j]).toBeCloseTo(-Rt[i][j],7);expect(Jj[i][j]).toBeCloseTo(Rt[i][j],7);
    expect(Jj[i][j+3]).toBeCloseTo(0,7);
  }
  // Common world translation and rotation are null directions before gauge fixing.
  for(let axis=0;axis<3;axis++){
    const shift=Array(3).fill(0);shift[axis]=.07;
    const shifted=(p:Pose)=>({p:p.p.map((v,i)=>v+shift[i]),q:p.q});
    expect(maxDifference(residual(shifted(a),shifted(b),e),residual(a,b,e))).toBeLessThan(1e-12);
  }
  const common=expQ([-.4,.2,.5]),transform=(p:Pose)=>({p:mv(rotation(common),p.p),q:product(common,p.q)});
  expect(maxDifference(residual(transform(a),transform(b),e),residual(a,b,e))).toBeLessThan(1e-12);
  expect(graph.edges.at(-1)!.slot).toBe(255);
});

it('independent dense finite-difference optimizer lowers rotated loop objective and drift with exact gauge',()=>{
  const {graph,truth}=loopFixture(8),before=cost(graph),optimized=finiteDifferenceOptimizer(graph);
  expect(cost(optimized)).toBeLessThan(before*.02);expect(poseError(optimized,truth)).toBeLessThan(poseError(graph,truth)*.5);
  expect(optimized.poses[0]).toEqual(graph.poses[0]);
  // The objective has both non-axis-aligned rotations and cross information.
  expect(graph.edges[0].information[0][5]).not.toBe(0);
  expect(norm(residual(graph.poses[0],graph.poses[7],graph.edges.at(-1)!))).toBeGreaterThan(.1);
  const optimizedAgain=finiteDifferenceOptimizer(optimized,3);expect(cost(optimizedAgain)).toBeLessThanOrEqual(cost(optimized)+1e-12);
},30_000);

it('full128/256 fixture uses stable sparse endpoints and a late loop rather than a truncated prefix',()=>{
  const {graph,truth}=loopFixture(128),inputs=graphInputs(graph);
  expect(flatten(inputs.position)).toHaveLength(384);expect(flatten(inputs.rotation)).toHaveLength(1152);
  expect(flatten(inputs.information)).toHaveLength(9216);
  expect((inputs.edgeMask as number[])[127]).toBe(0);expect((inputs.edgeMask as number[])[255]).toBe(1);
  expect((inputs.toNode as number[])[255]).toBe(128);expect(cost(graph)).toBeGreaterThan(100);
  expect(admissibleGraphInputs(inputs)).toBe(true);
  const consistent:Graph={poses:truth,active:graph.active,edges:graph.edges.map(e=>({...e,t:mv(transpose(rotation(truth[e.from].q)),truth[e.to].p.map((v,i)=>v-truth[e.from].p[i])),q:product(inverse(truth[e.from].q),truth[e.to].q)}))};
  expect(cost(consistent)).toBeLessThan(1e-22);
});

it('independent LDL and BFS fixtures classify masks, full correlated SPD information and disconnected graphs',()=>{
  const base=graphInputs(loopFixture(128).graph);expect(admissibleGraphInputs(base)).toBe(true);
  const corruptions:((x:Record<string,unknown>)=>void)[]=[
    x=>{(x.nodeMask as number[])[31]=.5;},x=>{(x.edgeMask as number[])[250]=NaN;},
    x=>{(x.fromNode as number[])[255]=129;},x=>{(x.toNode as number[])[255]=2.2;},
    x=>{(x.edgeMask as number[])[0]=0;(x.edgeMask as number[])[255]=0;},
    x=>{(x.rotation as Matrix[])[17]=matrix(3,3,(i,j)=>i===j?(i===0?-1:1):0);},
    x=>{(x.information as Matrix[])[255][2][4]+=.1;},
    x=>{(x.information as Matrix[])[255]=matrix(6,6,(i,j)=>i===j&&i<5?1:0);},
    x=>{const W=eye(6);W[0][1]=2;W[1][0]=2;(x.information as Matrix[])[255]=W;},
    x=>{(x.information as Matrix[])[255][5][5]=NaN;},
    x=>{const R=x.rotation as Matrix[];(x.measuredRotation as Matrix[])[255]=multiply(multiply(transpose(R[0]),R[127]),rotation(expQ([-Math.PI+.0001,0,0])));},
  ];
  for(const corrupt of corruptions){const x=structuredClone(base);corrupt(x);expect(admissibleGraphInputs(x)).toBe(false);}
  const sparse=graphInputs(loopFixture(8).graph);(sparse.fromNode as number[])[200]=NaN;(sparse.toNode as number[])[200]=Infinity;
  (sparse.information as Matrix[])[200][0][0]=NaN;expect(admissibleGraphInputs(sparse)).toBe(true);
  const edit=finiteDifferenceOptimizer(loopFixture(8).graph,1),original=finiteDifferenceOptimizer(loopFixture(8).graph,8);
  expect(cost(edit)).toBeGreaterThan(cost(original)+1e-6);
});

it.skipIf(!edgeArtifact)('actual source-issued Modelica manifold residual/Jacobians match independent finite differences',async()=>{
  const artifact=JSON.parse(readFileSync(edgeArtifact!,'utf8')) as NativeProgramArtifact;
  const program=await NativeProgram.instantiate(artifact,source);
  const rows:{a:Pose;b:Pose;e:Edge}[]=[];
  for(let k=0;k<15;k++)rows.push({a:{p:[.4*k,-.3,1.2],q:expQ([.25,-.3,.1*k])},
    b:{p:[-.2,.4*k,2.1],q:expQ([-.1,.2,.08*k])},
    e:{from:0,to:1,t:[.1,-.2,.3],q:expQ([.05,.02,-.3]),information:eye(6),slot:255}});
  rows.push({a:{p:[0,0,0],q:expQ([0,0,0])},b:{p:[.2,-.1,.4],q:expQ([1e-8,-2e-8,3e-8])},e:{from:0,to:1,t:[.2,-.1,.4],q:expQ([0,0,0]),information:eye(6),slot:255}});
  const cases:Record<string,unknown>[]=[];
  for(const {a,b,e} of rows){
    set(program,{pi:a.p,pj:b.p,Ri:rotation(a.q),Rj:rotation(b.q),translation:e.t,measuredRotation:rotation(e.q)});
    const P=parameterBytes(program,artifact);program.evaluate(0);expect(parameterBytes(program,artifact)).toEqual(P);
    expect(program.output('valid')[0]).toBe(1);
    expect(maxDifference([...program.output('residual')],residual(a,b,e))).toBeLessThan(2e-10);
    const [Ji,Jj]=numericalJacobians(a,b,e);compareMatrix(program.output('Ji'),Ji);compareMatrix(program.output('Jj'),Jj);
    cases.push({residualError:maxDifference([...program.output('residual')],residual(a,b,e)),JiError:maxDifference([...program.output('Ji')],Ji.flat()),JjError:maxDifference([...program.output('Jj')],Jj.flat())});
  }
  const nearPi=rows[0];set(program,{pi:[0,0,0],pj:[0,0,0],Ri:eye(3),Rj:rotation(expQ([Math.PI-.0001,0,0])),translation:[0,0,0],measuredRotation:eye(3)});
  program.evaluate(0);expect(program.output('valid')[0]).toBe(0);
  set(program,{pi:nearPi.a.p,pj:nearPi.b.p,Ri:rotation(nearPi.a.q),Rj:rotation(nearPi.b.q),translation:nearPi.e.t,measuredRotation:rotation(nearPi.e.q)});
  program.evaluate(0);expect(program.output('valid')[0]).toBe(1);
  const expected=[...program.output('residual')];program.reset();
  set(program,{pi:nearPi.a.p,pj:nearPi.b.p,Ri:rotation(nearPi.a.q),Rj:rotation(nearPi.b.q),translation:nearPi.e.t,measuredRotation:rotation(nearPi.e.q)});program.evaluate(0);expect([...program.output('residual')]).toEqual(expected);
  const reload=await NativeProgram.instantiate(JSON.parse(JSON.stringify(artifact)),source);
  set(reload,{pi:nearPi.a.p,pj:nearPi.b.p,Ri:rotation(nearPi.a.q),Rj:rotation(nearPi.b.q),translation:nearPi.e.t,measuredRotation:rotation(nearPi.e.q)});reload.evaluate(0);expect([...reload.output('residual')]).toEqual(expected);
  await expect(NativeProgram.instantiate(artifact,source+'\n// edited')).rejects.toThrow('does not match its source');
  if(process.env.RUMOCA_POSE_GRAPH_EDGE_REPORT)writeFileSync(process.env.RUMOCA_POSE_GRAPH_EDGE_REPORT,JSON.stringify({sourceSha256:sha(source),moduleSha256:artifact.module_sha256,moduleBytes:artifact.module_bytes.length,cases,nearPiRejected:true,recovered:true,reset:true,jsonReload:true,PReadonly:true,fullOptimizerAccepted:false},null,2)+'\n');
},120_000);

it.skipIf(!graphArtifact)('actual full128/256 Modelica sparse optimizer accepts descent and refuses invalid graphs transactionally',async()=>{
  const artifact=JSON.parse(readFileSync(graphArtifact!,'utf8')) as NativeProgramArtifact;
  const program=await NativeProgram.instantiate(artifact,source),cases:Record<string,unknown>[]=[];
  const run=(label:string,inputs:Record<string,unknown>)=>{
    set(program,inputs);const P=parameterBytes(program,artifact),start=performance.now();program.evaluate(0);
    expect(parameterBytes(program,artifact),`${label} P readonly`).toEqual(P);
    const result={status:program.output('status')[0],before:program.output('costBefore')[0],after:program.output('costAfter')[0],accepted:program.output('acceptedIterations')[0],pcg:program.output('pcgIterations')[0],p:[...program.output('nextPosition')],R:[...program.output('nextRotation')]};
    expect(Number.isFinite(result.status),label).toBe(true);expect(result.accepted).toBeLessThanOrEqual(8);expect(result.pcg).toBeLessThanOrEqual(8*48);
    cases.push({label,status:result.status,before:result.before,after:result.after,accepted:result.accepted,pcg:result.pcg,elapsedMs:performance.now()-start});return result;
  };
  const small=loopFixture(8),smallInputs=graphInputs(small.graph),oracle=finiteDifferenceOptimizer(small.graph),result=run('rotated correlated loop',smallInputs);
  expect(result.status).toBe(2);expect(result.after).toBeLessThan(result.before*.02);
  const expected=graphInputs(oracle);expect(maxDifference(result.p,flatten(expected.position))).toBeLessThan(.003);
  expect(maxDifference(result.R,flatten(expected.rotation))).toBeLessThan(.002);
  expect(result.p.slice(0,3)).toEqual(flatten(smallInputs.position).slice(0,3));expect(result.R.slice(0,9)).toEqual(flatten(smallInputs.rotation).slice(0,9));
  const full=loopFixture(128),fullInputs=graphInputs(full.graph),large=run('all128 nodes and late256th edge',fullInputs);
  expect(large.status).toBe(2);expect(large.after).toBeLessThan(large.before*.1);
  const priorError=poseError(full.graph,full.truth),afterError=Math.sqrt(full.truth.reduce((s,p,i)=>s+norm(large.p.slice(3*i,3*i+3).map((v,k)=>v-p.p[k]))**2,0)/128);
  expect(afterError).toBeLessThan(priorError*.6);
  for(let i=0;i<128;i++){
    const R=matrix(3,3,(u,v)=>large.R[9*i+3*u+v]);expect(maxDifference(multiply(transpose(R),R).flat(),eye(3).flat())).toBeLessThan(1e-7);
  }
  const invalidCases:{label:string;edit:(x:Record<string,unknown>)=>void}[]=[
    {label:'fractional node mask',edit:x=>{(x.nodeMask as number[])[3]=.5;}},
    {label:'NaN edge mask',edit:x=>{(x.edgeMask as number[])[255]=NaN;}},
    {label:'fractional endpoint',edit:x=>{(x.toNode as number[])[255]=2.5;}},
    {label:'out of range endpoint',edit:x=>{(x.toNode as number[])[255]=129;}},
    {label:'inactive endpoint',edit:x=>{(x.toNode as number[])[255]=127;}},
    {label:'disconnected active node',edit:x=>{(x.nodeMask as number[])[127]=1;}},
    {label:'reflected rotation',edit:x=>{(x.rotation as number[][][])[3][0][0]*=-1;}},
    {label:'asymmetric information',edit:x=>{(x.information as number[][][])[255][0][1]+=.2;}},
    {label:'singular information',edit:x=>{(x.information as number[][][])[255]=matrix(6,6,(i,j)=>i===j&&i<5?1:0);}},
    {label:'indefinite correlated information',edit:x=>{const W=eye(6);W[0][1]=2;W[1][0]=2;(x.information as number[][][])[255]=W;}},
    {label:'nonfinite information',edit:x=>{(x.information as number[][][])[255][4][4]=Infinity;}},
    {label:'near pi chart',edit:x=>{const R=x.rotation as Matrix[];(x.measuredRotation as Matrix[])[255]=multiply(multiply(transpose(R[0]),R[7]),rotation(expQ([-Math.PI+.0001,0,0])));}},
  ];
  for(const c of invalidCases){const x=structuredClone(smallInputs);c.edit(x);expect(admissibleGraphInputs(x),c.label).toBe(false);const rejected=run(c.label,x);expect(rejected.status,c.label).toBeLessThan(0);expect(rejected.accepted).toBe(0);expect(rejected.p).toEqual(flatten(x.position));expect(rejected.R).toEqual(flatten(x.rotation));}
  // A genuinely stationary optimum has no accepted descent and preserves state.
  const optimum:Graph={...small.graph,edges:small.graph.edges.slice(0,-1)},optimalInputs=graphInputs(optimum),unchanged=run('no-descent optimum',optimalInputs);
  expect(unchanged.status).toBe(1);expect(unchanged.accepted).toBe(0);expect(unchanged.p).toEqual(flatten(optimalInputs.position));expect(unchanged.R).toEqual(flatten(optimalInputs.rotation));
  const sparse=structuredClone(smallInputs);(sparse.fromNode as number[])[200]=NaN;(sparse.toNode as number[])[200]=Infinity;
  run('disabled sparse padding is not a constraint',sparse);
  const recovered=run('valid after invalid graph',smallInputs);expect(recovered.p).toEqual(result.p);
  const reloaded=await NativeProgram.instantiate(JSON.parse(JSON.stringify(artifact)),source);set(reloaded,smallInputs);reloaded.evaluate(0);expect([...reloaded.output('nextPosition')]).toEqual(result.p);
  const changed=source.replace('maximumIterations = 8','maximumIterations = 7');await expect(NativeProgram.instantiate(artifact,changed)).rejects.toThrow('does not match its source');
  program.reset();run('reset',smallInputs);
  if(process.env.RUMOCA_POSE_GRAPH_REPORT)writeFileSync(process.env.RUMOCA_POSE_GRAPH_REPORT,JSON.stringify({sourceSha256:sha(source),moduleSha256:artifact.module_sha256,fullCapacity:[128,256],cases,priorError,afterError},null,2)+'\n');
},180_000);
