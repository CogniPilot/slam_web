// Opt-in investigation of stripped compiler exports. IDs belong to the exact
// module hash: never infer source names from them or ship the rewritten module.
import wabtFactory from 'wabt';
export async function instrumentNativeFunctions(bytes,ids){
  const wabt=await wabtFactory();
  const source=wabt.readWasm(bytes,{readDebugNames:true,multi_memory:true,bulk_memory:true,simd:true});
  try{
    source.generateNames();source.applyNames();
    let wat=source.toText({foldExprs:false,inlineExport:false});
    if(/\(import "env" "log10"/.test(wat))throw Error('Native module already uses the timing import');
    const wrappers=[];
    for(const id of ids){
      if(!Number.isSafeInteger(id)||id<=0)throw Error('Invalid native function ID');
      const name=`f${id}`,pattern=new RegExp(`^  \\(func \\$${name} (.*)$`,'m'),match=wat.match(pattern);
      if(!match||!match[1].endsWith('(result i32)'))throw Error(`Unsupported native function ${id}`);
      const args=[...match[1].matchAll(/\(param (\$\w+) /g)].map(m=>`local.get ${m[1]}`).join('\n');
      wat=wat.replace(pattern,`  (func $trace_body_${name} ${match[1]}`);
      wrappers.push(`(func $${name} ${match[1]} (local $trace_result i32)
        f64.const ${id} call $profile_clock drop
        ${args} call $trace_body_${name} local.set $trace_result
        f64.const -${id} call $profile_clock drop local.get $trace_result)`);
    }
    const at=wat.indexOf('  (func ');
    wat=wat.slice(0,at)+'  (import "env" "log10" (func $profile_clock (param f64) (result f64)))\n'+wat.slice(at);
    wat=wat.replace(/\)\s*$/,wrappers.join('\n')+'\n)');
    const result=wabt.parseWat('profile-native.wat',wat,{multi_memory:true,bulk_memory:true,simd:true});
    try{result.resolveNames();result.validate({multi_memory:true,bulk_memory:true,simd:true});return new Uint8Array(result.toBinary({}).buffer);}
    finally{result.destroy();}
  }finally{source.destroy();}
}

export function installNativeFunctionTiming(){
  const rows={},edges={},stack=[];
  const trace=globalThis.__nativeFunctionTiming={active:false,rows,finish(){
    this.active=false;if(stack.length)throw Error('Native function timing stack is incomplete');
    return {rows,edges,scope:'Instrumented function wall times. totalMs is inclusive; selfMs excludes only instrumented descendants, not all calls. Edges group calls by nearest instrumented parent (root means none). Overlapping functions must not be summed. IDs require the exact original module hash and source mapping.'};
  }};
  // The instrumented module imports this otherwise unused math symbol. The
  // normal native program has no log10 import and is left unchanged.
  Math.log10=id=>{
    if(!trace.active)return 0;
    if(id>0)stack.push({id,started:performance.now(),children:0});
    else{
      const call=stack.pop();if(call?.id!==-id)throw Error('Native function timing stack mismatch');
      const elapsed=performance.now()-call.started,row=rows[call.id]??={calls:0,totalMs:0,selfMs:0,samplesMs:[]};
      row.calls++;row.totalMs+=elapsed;row.selfMs+=elapsed-call.children;
      if(row.samplesMs.length<4096)row.samplesMs.push(elapsed);
      const key=`${stack.at(-1)?.id??'root'}/${call.id}`,edge=edges[key]??={calls:0,totalMs:0,selfMs:0};
      edge.calls++;edge.totalMs+=elapsed;edge.selfMs+=elapsed-call.children;
      if(stack.length)stack.at(-1).children+=elapsed;
    }
    return 0;
  };
}
