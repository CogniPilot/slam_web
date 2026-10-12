import {afterEach,describe,expect,it,vi} from 'vitest';
import {AssistantAgent,type AssistantHost} from '../src/assistant-agent';
import {assistantApi,assistantEndpoint,requestAssistantTurn} from '../src/assistant-provider';

const connection={endpoint:'https://api.openai.com/v1',model:'gpt-6.1-sol',key:'memory-only',reasoning:'medium' as const};
const host:AssistantHost={files:()=>({'Main.mo':'model Main end Main;'}),activePath:()=> 'Main.mo',apply:vi.fn(),diagnostics:()=>[],compile:async()=>({ok:true}),searchDocs:()=>[]};
afterEach(()=>vi.unstubAllGlobals());
describe('assistant provider protocols',()=>{
  it('selects Responses for OpenAI and preserves custom Chat Completions support',()=>{
    expect(assistantApi(connection)).toBe('responses');
    expect(assistantApi({...connection,endpoint:'https://compatible.example/v1'})).toBe('chat');
    expect(assistantEndpoint('https://api.openai.com/v1/chat/completions','responses')).toBe('https://api.openai.com/v1/responses');
  });
  it('replays encrypted reasoning and function results with stateless Responses',async()=>{
    const reasoning={type:'reasoning',id:'rs_1',summary:[],encrypted_content:'encrypted-state'};
    const call={type:'function_call',id:'fc_1',call_id:'read-1',name:'read_file',arguments:'{"path":"Main.mo"}'};
    const fetch=vi.fn().mockResolvedValueOnce(Response.json({status:'completed',output:[reasoning,call]})).mockResolvedValueOnce(Response.json({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'Read the model.'}]}]}));
    vi.stubGlobal('fetch',fetch);
    const agent=new AssistantAgent(host,()=>{});await agent.send('Inspect source',connection);
    expect(fetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/responses');
    const first=JSON.parse(fetch.mock.calls[0][1].body),second=JSON.parse(fetch.mock.calls[1][1].body);
    expect(first).toMatchObject({model:'gpt-6.1-sol',store:false,reasoning:{effort:'medium'},include:['reasoning.encrypted_content']});
    expect(first.tools[0]).toMatchObject({type:'function',name:'list_files',strict:true});
    expect(first.tools[0]).not.toHaveProperty('function');
    expect(second.input).toContainEqual(reasoning);expect(second.input).toContainEqual(call);
    expect(second.input).toContainEqual({type:'function_call_output',call_id:'read-1',output:'"model Main end Main;"'});
    expect(agent.messages.at(-1)?.content).toBe('Read the model.');
    expect(JSON.stringify(agent.messages)).not.toContain('memory-only');
  });
  it('completes interrupted tool turns before continuing a Responses conversation',async()=>{
    const agent=new AssistantAgent(host,()=>{});
    host.compile=async()=>{agent.cancel();return {ok:true};};
    const fetch=vi.fn().mockResolvedValueOnce(Response.json({status:'completed',output:[{type:'function_call',call_id:'compile-1',name:'compile',arguments:'{}'}]})).mockResolvedValueOnce(Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Ready'}]}]}));
    vi.stubGlobal('fetch',fetch);
    await expect(agent.send('Compile',connection)).rejects.toThrow();
    await agent.send('Continue',connection);
    const second=JSON.parse(fetch.mock.calls[1][1].body);
    expect(second.input.find((item:any)=>item.type==='function_call_output')).toMatchObject({call_id:'compile-1'});
  });
  it.each([{status:'incomplete',output:[]},{status:'completed',output:[null]},{status:'completed',output:[{type:'web_search_call'}]}])('rejects incomplete or unsupported output %j',async output=>{
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json(output)));
    await expect(requestAssistantTurn(connection,[],[],new AbortController().signal)).rejects.toThrow();
  });
});
