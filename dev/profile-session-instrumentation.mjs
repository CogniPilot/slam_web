// Opt-in diagnostic only. Wrap the actual loaded Rumoca session APIs in
// numerical workers; never supply a solver, output cache or alternative math.
async function installWorkerTiming(base){
  if(globalThis.__rumocaSessionTiming)throw Error('Session timing already installed');
  const compiler=await import(new URL('vendor/rumoca/rumoca_bind_wasm.js',base).href);
  const prototype=compiler.WasmSimulationSession.prototype,originals=new Map(),sessions=new WeakMap(),rows=[];
  const requests=new Map(),messages={},originalPost=self.postMessage,originalMessage=self.onmessage;
  if(typeof originalMessage!=='function')throw Error('Numerical worker message handler is unavailable');
  const entry=session=>{let row=sessions.get(session);if(!row){row={id:rows.length+1,firstInputPrefix:null,methods:{}};sessions.set(session,row);rows.push(row);}return row;};
  const accumulate=(table,key,elapsed)=>{const row=table[key]??={calls:0,totalMs:0,maxMs:0};row.calls++;row.totalMs+=elapsed;row.maxMs=Math.max(row.maxMs,elapsed);return row;};
  for(const name of ['set_inputs','set_input','advance_to','step','state_json','get']){
    const original=prototype[name];if(typeof original!=='function')throw Error(`Missing public Rumoca API: ${name}`);originals.set(name,original);
    prototype[name]=function(...args){
      const row=entry(this);if(row.firstInputPrefix===null&&name==='set_inputs')row.firstInputPrefix=args[0].slice(0,100);
      const started=performance.now();let result;
      try{return result=original.apply(this,args);}
      finally{const method=accumulate(row.methods,name,performance.now()-started);
        if(name==='state_json'&&typeof result==='string')method.resultCharacters=(method.resultCharacters??0)+result.length;
        if(name==='set_inputs')method.inputCharacters=(method.inputCharacters??0)+(args[0]?.length??0);
      }
    };
  }
  // Wrap the registered handler itself. A later event listener can run after
  // the handler's Promise microtask has already sent the reply.
  self.onmessage=function(event){const {data}=event;if(data?.id!==undefined)requests.set(data.id,{type:data.type,received:performance.now()});return originalMessage.call(this,event);};
  self.postMessage=function(...args){
    const request=requests.get(args[0]?.id),started=performance.now();let row;
    if(request){row=accumulate(messages,request.type,started-request.received);requests.delete(args[0].id);}
    try{return originalPost.apply(this,args);}
    finally{if(row)row.postMessageMs=(row.postMessageMs??0)+performance.now()-started;}
  };
  globalThis.__rumocaSessionTiming={finish(){
    for(const [name,original] of originals)prototype[name]=original;
    self.postMessage=originalPost;self.onmessage=originalMessage;
    if(requests.size)throw Error('Session timing has unmatched worker requests');
    const result={sessions:rows,messages,pendingRequests:requests.size};delete globalThis.__rumocaSessionTiming;return result;
  }};
  return {installed:true};
}

export async function startSessionTiming(root,call,base){
  const numerical=(await root.send('Target.getTargets')).targetInfos.filter(t=>t.type==='worker'&&/\/(?:physics|modelica-runtime-math|modelica-state)\.worker[-.]/.test(t.url));
  if(numerical.length!==3)throw Error(`Expected three numerical workers, found ${numerical.length}`);
  const observers=[];
  for(const target of numerical){
    const {sessionId}=await root.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});
    const reply=await call(sessionId,'Runtime.evaluate',{expression:`(${installWorkerTiming.toString()})(${JSON.stringify(base)})`,awaitPromise:true,returnByValue:true});
    if(reply.exceptionDetails||!reply.result?.value?.installed)throw Error('Worker session timing installation failed: '+JSON.stringify(reply));
    observers.push({sessionId,url:target.url});
  }
  return {async finish(){
    const results=[];
    for(const observer of observers){
      const reply=await call(observer.sessionId,'Runtime.evaluate',{expression:'globalThis.__rumocaSessionTiming.finish()',returnByValue:true});
      if(reply.exceptionDetails||!reply.result?.value)throw Error('Worker session timing extraction failed: '+JSON.stringify(reply));
      results.push({url:observer.url,...reply.result.value});await root.send('Target.detachFromTarget',{sessionId:observer.sessionId});
    }
    return {workers:results,scope:'Actual pinned Rumoca APIs and worker receive-to-send intervals after warmup. Wrappers add timer/counter overhead. API time is a subset of worker time; worker time is a subset of RPC wall time. Intervals must not be added. No replacement math, cache or numerical path.'};
  }};
}

export function startRpcTiming(){
  const lab=window.__slamLab,rows={},restore=[];
  for(const [role,rpc] of [['physics',lab.runtime.physics],['math',lab.runtime.modelicaMath],['state',lab.runtime.modelicaState]]){
    const original=rpc.call;restore.push(()=>rpc.call=original);
    rpc.call=async function(type,...args){
      const started=performance.now();
      try{return await original.call(this,type,...args);}
      finally{const elapsed=performance.now()-started,key=role+'/'+type,row=rows[key]??={calls:0,totalMs:0,maxMs:0};row.calls++;row.totalMs+=elapsed;row.maxMs=Math.max(row.maxMs,elapsed);}
    };
  }
  window.__profileRpcTiming={finish(){for(const fn of restore)fn();delete window.__profileRpcTiming;return rows;}};
}
