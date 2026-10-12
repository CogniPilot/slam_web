import type {AssistantConnection,AssistantMessage,ToolCall} from './assistant-agent';

export interface FunctionTool {type:string;function:{name:string;description:string;parameters:unknown}}
export interface ResponseItem {type:string;[key:string]:unknown}
export interface LocalAssistantProvider {
  complete(model:string,messages:AssistantMessage[],tools:FunctionTool[],signal:AbortSignal):Promise<AssistantMessage>;
  dispose():void;
}

export function assistantApi(connection:AssistantConnection):'responses'|'chat' {
  return connection.api??(new URL(connection.endpoint).hostname==='api.openai.com'?'responses':'chat');
}

export function assistantEndpoint(value:string,api:'responses'|'chat'='chat'):string {
  const url=new URL(value);
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))
    throw new Error('Use HTTPS, or HTTP for a loopback local provider.');
  if(url.username||url.password||url.search||url.hash)
    throw new Error('Endpoint must not contain credentials, query parameters or fragments.');
  const path=url.href.replace(/\/$/,'').replace(/\/(chat\/completions|responses)$/,'');
  return `${path}/${api==='responses'?'responses':'chat/completions'}`;
}

function responseInput(messages:AssistantMessage[]):ResponseItem[] {
  return messages.flatMap((message):ResponseItem[]=>{
    if(message.role==='system')return [];
    if(message.role==='tool')return [{type:'function_call_output',call_id:message.tool_call_id,output:message.content??''}];
    // Replay the complete output, including encrypted reasoning, with store:false.
    if(message.responseItems)return message.responseItems;
    const items:ResponseItem[]=message.content?[{type:'message',role:message.role,content:message.content}]:[];
    for(const call of message.tool_calls??[])items.push({type:'function_call',call_id:call.id,name:call.function.name,arguments:call.function.arguments});
    return items;
  });
}

function responseMessage(result:any):AssistantMessage {
  if(!result||result.error||(result.status&&result.status!=='completed'))
    throw new Error('Provider did not complete the response. Try a shorter request.');
  if(!Array.isArray(result.output))throw new Error('Provider returned no response output.');
  const calls:ToolCall[]=[],text:string[]=[];
  for(const item of result.output){
    if(!item||typeof item.type!=='string')throw new Error('Invalid response item.');
    if(item.type==='function_call')calls.push({id:item.call_id,type:'function',function:{name:item.name,arguments:item.arguments}});
    else if(item.type==='message'){
      if(!Array.isArray(item.content))throw new Error('Invalid response message.');
      for(const part of item.content){
        if(!part)throw new Error('Invalid response content.');
        if(part.type==='output_text'&&typeof part.text==='string')text.push(part.text);
        else if(part.type==='refusal'&&typeof part.refusal==='string')text.push(part.refusal);
      }
    }else if(item.type!=='reasoning')throw new Error('Provider returned an unsupported response item.');
  }
  if(!calls.length&&!text.length)throw new Error('Provider returned no assistant message.');
  return {role:'assistant',content:text.join('\n'),...(calls.length?{tool_calls:calls}:{}),responseItems:result.output};
}

export async function requestAssistantTurn(connection:AssistantConnection,messages:AssistantMessage[],tools:FunctionTool[],signal:AbortSignal):Promise<AssistantMessage> {
  const api=assistantApi(connection),endpoint=assistantEndpoint(connection.endpoint,api);
  const body=api==='responses'?{
    model:connection.model,store:false,include:['reasoning.encrypted_content'],
    instructions:messages.filter(message=>message.role==='system').map(message=>message.content??'').join('\n'),
    input:responseInput(messages),tools:tools.map(tool=>({type:'function',...tool.function,strict:true})),
    ...(connection.reasoning?{reasoning:{effort:connection.reasoning}}:{}),stream:false,
  }:{model:connection.model,messages:messages.map(({responseItems,...message})=>message),tools,stream:false};
  const response=await fetch(endpoint,{method:'POST',signal,headers:{'Content-Type':'application/json',...(connection.key?{Authorization:`Bearer ${connection.key}`}:{})},body:JSON.stringify(body)});
  if(!response.ok)throw new Error(`Provider returned HTTP ${response.status}. Check endpoint, model, credentials and browser CORS support.`);
  const result=await response.json();
  if(api==='responses')return responseMessage(result);
  const message=result.choices?.[0]?.message;
  if(!message||typeof message!=='object')throw new Error('Provider returned no assistant message.');
  return message;
}
