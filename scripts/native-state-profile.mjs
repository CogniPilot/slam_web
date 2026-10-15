// Diagnostic hooks injected only into the native worker by the profiling CLI.
export function installNativeStateCapture(){
  const original=WebAssembly.instantiate;
  const memories=globalThis.__nativeStateMemories=[];
  WebAssembly.instantiate=function(...args){
    // Initialize is loaded first, Step last. Retain its imported memory without
    // changing the program, its arguments, or the instantiate return value.
    if(args[1]?.env?.memory)memories.push(args[1].env.memory);
    return original.apply(this,args);
  };
}

export async function captureNativeState(layout){
  const memories=globalThis.__nativeStateMemories;
  if(memories?.length!==2)throw Error('Native state capture requires exactly Initialize and Step instantiations');
  const memory=memories[1];
  if(memory.buffer.byteLength!==layout.pages*65536)throw Error('Captured memory size does not match the native Step layout');
  if(!globalThis.crypto?.subtle)throw Error('Native state hashing requires a secure context: use HTTPS or localhost');
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
