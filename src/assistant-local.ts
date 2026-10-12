import type {AssistantMessage} from './assistant-agent';
import type {FunctionTool,LocalAssistantProvider} from './assistant-provider';
import {WorkerRpc} from './rpc';

export const localAssistantModels=[
  {id:'Qwen2.5-Coder-0.5B-Instruct-q4f32_1-MLC',label:'Qwen Coder 0.5B · about 1 GB GPU memory'},
  {id:'Qwen2.5-Coder-1.5B-Instruct-q4f32_1-MLC',label:'Qwen Coder 1.5B · about 2 GB GPU memory'},
];

export function localActionSchema(tools:FunctionTool[]){
  return {type:'object',properties:{action:{enum:['answer','tool']},text:{type:'string'},tool:{enum:['none',...tools.map(tool=>tool.function.name)]},arguments:{type:'string'}},required:['action','text','tool','arguments'],additionalProperties:false};
}

export function localActionMessage(text:string,tools:FunctionTool[]):AssistantMessage {
  const action=JSON.parse(text);
  if(!action||typeof action.text!=='string')throw new Error('Local model returned an invalid action. Try a simpler request.');
  if(action.action==='answer')return {role:'assistant',content:action.text};
  if(action.action!=='tool'||!tools.some(tool=>tool.function.name===action.tool)||typeof action.arguments!=='string')throw new Error('Local model returned an unknown tool.');
  const args=JSON.parse(action.arguments);
  if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('Local tool arguments must be a JSON object.');
  return {role:'assistant',content:action.text,tool_calls:[{id:crypto.randomUUID(),type:'function',function:{name:action.tool,arguments:action.arguments}}]};
}

export function localConversation(messages:AssistantMessage[],tools:FunctionTool[]){
  const history=messages.filter(message=>message.role!=='system').map(({responseItems,...message})=>message);
  const content=JSON.stringify({tools:tools.map(tool=>tool.function),conversation:history});
  // Small local models have a bounded context. Never silently drop tool results or source.
  if(content.length>16_000)throw new Error('Local context is full. Forget the conversation or use a remote provider for larger source files.');
  return [{role:'system',content:`${messages.find(message=>message.role==='system')?.content??''}\nUse search_source, read_lines and replace_text for small targeted edits. Keep source excerpts short. Return one JSON action: {"action":"answer" or "tool","text":"answer or short explanation","tool":"none" or a listed tool name,"arguments":"JSON object encoded as a string"}. Call one tool at a time, then use its result. Never invent tool results.`},{role:'user',content}];
}

export class BrowserAssistant implements LocalAssistantProvider {
  private rpc?:WorkerRpc;
  constructor(readonly progress:(text:string)=>void,readonly createWorker=()=>new Worker(new URL('./workers/assistant.worker.ts',import.meta.url),{type:'module'})){}
  async complete(model:string,messages:AssistantMessage[],tools:FunctionTool[],signal:AbortSignal){
    signal.throwIfAborted();
    if(!navigator.gpu)throw new Error('WebLLM requires WebGPU. Choose a remote provider on this browser.');
    if(!localAssistantModels.some(item=>item.id===model))throw new Error('Select an available local model.');
    const localTools=tools.filter(tool=>!['read_file','edit_file'].includes(tool.function.name));
    const conversation=localConversation(messages,localTools);
    if(!this.rpc){
      const worker=this.createWorker();this.rpc=new WorkerRpc(worker);
      worker.addEventListener('message',({data})=>{if(typeof data.progress==='string')this.progress(data.progress);});
    }
    const rpc=this.rpc;
    const abort=()=>this.dispose();signal.addEventListener('abort',abort,{once:true});
    try{
      const text=await rpc.call<string>('complete',{model,messages:conversation,schema:localActionSchema(localTools)},600_000);
      signal.throwIfAborted();return localActionMessage(text,localTools);
    }catch(error){this.dispose();signal.throwIfAborted();throw error;}
    finally{signal.removeEventListener('abort',abort);}
  }
  dispose(){this.rpc?.stop();this.rpc=undefined;}
}
