import {declaredView,copyInputs,installOfficeNativeTrace} from './office-native-observation.mjs';
import {exactCaptured} from './office-replay-contract.mjs';
export function copyDeclaredState(program,side){
 if(!['previous','next'].includes(side))throw Error('Invalid declared state side');
 const parts=[],runs=[];let byteLength=0;
 for(const run of program.layout.state_runs){
  const view=declaredView(program,run,run[side]);
  const bytes=new Uint8Array(view.buffer,view.byteOffset,view.byteLength).slice();
  runs.push({name:run.name,lane:run.lane,count:run.count,byteOffset:byteLength,byteLength:bytes.length});parts.push(bytes);byteLength+=bytes.length;
 }
 const bytes=new Uint8Array(byteLength);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}
 return{runs,bytes};
}
export function requireImageInputs(program,frame){
 for(const [name,data,layout,channels] of [['rgb',frame.rgb,frame.imageLayout.color,3],['depth',frame.depth,frame.imageLayout.depth,1]]){
  const view=program.real(name),width=layout.width*channels,stride=layout.strideBytes/data.BYTES_PER_ELEMENT;
  if(view.length!==width*layout.height)throw Error('Raw '+name+' input shape differs');
  for(let row=0;row<layout.height;row++)for(let col=0;col<width;col++)
   if(!Object.is(view[row*width+col],data[row*stride+col]))throw Error('Raw '+name+' input differs at '+row+','+col);
 }
}
export function installReplayObserver(Program,context){
 installOfficeNativeTrace(Program,context.traceTarget);
 const load=Program.load;
 Program.load=async function(...args){
  const program=await load.apply(this,args);context.programs.set(program.layout.model,program);
  wrapReplayEntry(program,context);
  return program;
 };
}
export function wrapReplayEntry(program,context){
 const entry=program.entry;
 program.entry=function(...call){
   const imageOn=!program.hasInput('imageRequested')||program.boolean('imageRequested')[0]===1;
   if(!imageOn)return entry(...call);
   exactCaptured(copyInputs(program),context.expected.nativeTrace.inputs,'Raw image-on inputs in captured JSON encoding');
   requireImageInputs(program,context.frame);
   if(context.wanted.has(context.epoch))context.pending.push({side:'previous',...copyDeclaredState(program,'previous')});
   const status=entry(...call);
   if(status===0&&context.wanted.has(context.epoch))context.pending.push({side:'next',...copyDeclaredState(program,'next')});
   return status;
 };
}
