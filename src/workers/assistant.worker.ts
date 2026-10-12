// Inference and weight loading stay off the viewer's main thread.
export {};
const runtimeUrl='https://esm.run/@mlc-ai/web-llm@0.2.85';
let engine:any,loadedModel='';
self.onmessage=async({data})=>{
  try{
    if(data.type!=='complete')throw new Error('Unknown assistant request');
    if(!engine){
      self.postMessage({progress:'Loading WebLLM runtime…'});
      const runtime=await import(/* @vite-ignore */ runtimeUrl);
      engine=new runtime.MLCEngine({initProgressCallback:(report:{text:string})=>self.postMessage({progress:report.text})});
    }
    if(loadedModel!==data.model){
      self.postMessage({progress:'Downloading local model. First use needs internet; cached weights are reused.'});
      await engine.reload(data.model,{context_window_size:8192});loadedModel=data.model;
    }
    self.postMessage({progress:'Thinking on your GPU. Simulation is paused.'});
    const result=await engine.chat.completions.create({messages:data.messages,temperature:0,max_tokens:1024,response_format:{type:'json_object',schema:JSON.stringify(data.schema)}});
    const choice=result.choices?.[0];
    if(choice?.finish_reason==='length')throw new Error('Local response exceeded its limit. Ask for a smaller edit.');
    if(typeof choice?.message?.content!=='string')throw new Error('Local model returned no text');
    self.postMessage({id:data.id,result:choice.message.content});
  }catch(error){self.postMessage({id:data.id,error:String(error)});}
};
