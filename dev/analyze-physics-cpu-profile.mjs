// Attribute saved CDP physics samples without counting V8 entry trampolines
// as compiler-issued kernels. The current emitter leaves its functions unnamed.
export function analyzePhysicsCpuProfile(profile) {
  if(!Array.isArray(profile.nodes)||!Array.isArray(profile.samples)||!Array.isArray(profile.timeDeltas)
    ||profile.samples.length===0||profile.samples.length!==profile.timeDeltas.length)throw new Error('Invalid or empty CPU profile');
  const nodes=new Map(profile.nodes.map(node=>[node.id,node])),parents=new Map();
  if(nodes.size!==profile.nodes.length)throw new Error('Duplicate CPU profile node');
  for(const node of profile.nodes)for(const child of node.children??[]){
    if(!nodes.has(child)||parents.has(child))throw new Error('CPU profile is not one call tree');
    parents.set(child,node.id);
  }
  const bridge=frame=>frame.url.startsWith('wasm://')&&/^(js-to-wasm|wasm-to-js):/.test(frame.functionName);
  const kernel=frame=>frame.url.startsWith('wasm://')&&/^wasm-function\[\d+\]$/.test(frame.functionName);
  const compiler=frame=>frame.url.endsWith('/compiler.wasm');
  const attribution={sampledUs:0,advanceUs:0,advanceGeneratedKernelInclusiveUs:0,generatedKernelLeafUs:0,
    compilerWasmLeafUs:0,engineBridgeLeafUs:0,unclassifiedWasmLeafUs:0,generatedModuleUrls:[]};
  const advanceGroups={projectionSingletonAssignmentInclusiveUs:0,typedPureCallInclusiveUs:0,linearSolveInclusiveUs:0};
  const moduleUrls=new Set(),unknownFrames=new Set(),selfFrames=new Map();
  for(let index=0;index<profile.samples.length;index++){
    const delta=profile.timeDeltas[index],leaf=nodes.get(profile.samples[index]);
    if(!leaf||!Number.isFinite(delta)||delta<0)throw new Error('Invalid CPU profile sample');
    attribution.sampledUs+=delta;
    const frame=leaf.callFrame,key=JSON.stringify(frame),self=selfFrames.get(key)??{frame,microseconds:0};
    self.microseconds+=delta;selfFrames.set(key,self);
    if(kernel(frame)){attribution.generatedKernelLeafUs+=delta;moduleUrls.add(frame.url);}
    if(compiler(frame))attribution.compilerWasmLeafUs+=delta;
    if(bridge(frame))attribution.engineBridgeLeafUs+=delta;
    if(frame.url.startsWith('wasm://')&&!bridge(frame)&&!kernel(frame)){
      attribution.unclassifiedWasmLeafUs+=delta;unknownFrames.add(key);
    }
    let advance=false,native=false,projection=false,pureCall=false,linearSolve=false,current=leaf;
    const visited=new Set();
    while(current){
      if(visited.has(current.id))throw new Error('CPU profile call tree contains a cycle');
      visited.add(current.id);
      const currentFrame=current.callFrame;
      advance||=currentFrame.functionName==='advance_to'&&currentFrame.url.endsWith('/compiler.js');
      native||=kernel(currentFrame);
      if(kernel(currentFrame))moduleUrls.add(currentFrame.url);
      if(compiler(currentFrame)){
        projection||=currentFrame.functionName.includes('::projection::project_algebraic_singleton_assignment');
        pureCall||=currentFrame.functionName.includes('::typed_program::eval_pure_call');
        linearSolve||=currentFrame.functionName.includes('::linear_solve::');
      }
      current=nodes.get(parents.get(current.id));
    }
    if(advance){
      attribution.advanceUs+=delta;
      if(native)attribution.advanceGeneratedKernelInclusiveUs+=delta;
      if(projection)advanceGroups.projectionSingletonAssignmentInclusiveUs+=delta;
      if(pureCall)advanceGroups.typedPureCallInclusiveUs+=delta;
      if(linearSolve)advanceGroups.linearSolveInclusiveUs+=delta;
    }
  }
  attribution.generatedModuleUrls=[...moduleUrls];
  attribution.scope='Weighted CDP samples. Only unnamed wasm-function[index] frames from the current generated emitter count as kernels; V8 js-to-wasm/wasm-to-js entry trampolines are separate. Compiler functions use served /compiler.wasm. Unclassified WASM frames remain explicit. Inclusive groups can overlap; sampled durations are not exact invocation counts or unprofiled timings.';
  return {attribution,advanceGroups,unclassifiedWasmFrames:[...unknownFrames].map(value=>JSON.parse(value)),
    topSelfFrames:[...selfFrames.values()].toSorted((a,b)=>b.microseconds-a.microseconds).slice(0,30)};
}
