// Diagnostic hooks injected only into the native worker by the profiling CLI.
export function installNativeStateCapture(){
  const original=WebAssembly.instantiate;
  WebAssembly.instantiate=function(...args){
    // Initialize is loaded first, Step last. Retain its imported memory without
    // changing the program, its arguments, or the instantiate return value.
    if(args[1]?.env?.memory)globalThis.__nativeStateMemory=args[1].env.memory;
    return original.apply(this,args);
  };
}

export async function captureNativeState(layout){
  const memory=globalThis.__nativeStateMemory;
  if(!memory)throw Error('Native Step memory was not captured');
  const runs=[...layout.state_runs].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
  const cells=runs.reduce((sum,run)=>sum+run.count,0);
  if(cells!==layout.state.count)throw Error('Named runs do not cover every native state cell');
  const header=new TextEncoder().encode(JSON.stringify(runs.map(({name,lane,count})=>({name,lane,count}))));
  const bytes=runs.reduce((sum,run)=>sum+run.count*(run.lane==='u8'?1:8),0);
  const snapshot=new Uint8Array(header.length+bytes);snapshot.set(header);
  let offset=header.length;
  for(const run of runs){
    const length=run.count*(run.lane==='u8'?1:8);
    snapshot.set(new Uint8Array(memory.buffer,run.next,length),offset);offset+=length;
  }
  const digest=await crypto.subtle.digest('SHA-256',snapshot);
  const sha256=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  return {sha256,cells,runs:runs.length,bytes,stateNamesHash:layout.state.next_hash,
    scope:'All carried state bytes in canonical named-run order, including lane/name/count metadata. Captured after the timed window; program and inputs unchanged.'};
}
