import {afterEach,describe,expect,it,vi} from 'vitest';
import {AssistantAgent,assistantEndpoint,type AssistantHost} from '../src/assistant-agent';
function fixture(){
  const sources:Record<string,string>={'models/Main.mo':'model Main end Main;'};
  const host:AssistantHost={files:()=>sources,activePath:()=>Object.keys(sources)[0],apply:(path,source)=>{sources[path]=source;},diagnostics:()=>[],compile:vi.fn(async()=>({ok:true})),searchDocs:async query=>[{title:query}]};
  return {sources,host,agent:new AssistantAgent(host,()=>{})};
}
afterEach(()=>vi.unstubAllGlobals());
describe('browser algorithm assistant',()=>{
  it('restricts endpoint transports and rejects embedded credentials',()=>{
    expect(assistantEndpoint('http://localhost:11434/v1')).toBe('http://localhost:11434/v1/chat/completions');
    expect(assistantEndpoint('https://provider.example/v1/chat/completions')).toBe('https://provider.example/v1/chat/completions');
    expect(()=>assistantEndpoint('http://provider.example/v1')).toThrow('HTTPS');
    expect(()=>assistantEndpoint('https://secret@provider.example')).toThrow('credentials');
    expect(()=>assistantEndpoint('https://provider.example?key=secret')).toThrow('query');
  });
  it('never mutates source until an edit is accepted and rejects stale proposals',async()=>{
    const {agent,sources}=fixture();
    await agent.tool('propose_edit',{path:'models/Main.mo',source:'model Main Real x; end Main;',reason:'Add state'});
    expect(sources['models/Main.mo']).toBe('model Main end Main;');
    sources['models/Main.mo']='model Main Real y; end Main;';
    expect(()=>agent.accept(agent.proposals[0])).toThrow('Source changed');
    sources['models/Main.mo']=agent.proposals[0].before;agent.accept(agent.proposals[0]);
    expect(sources['models/Main.mo']).toBe(agent.proposals[0].after);
    expect(()=>agent.accept(agent.proposals[0])).toThrow('already reviewed');
  });
  it('rejects unknown paths and tools',async()=>{
    const {agent}=fixture();
    await expect(agent.tool('read_file',{path:'../secret'})).rejects.toThrow('Unknown file');
    await expect(agent.tool('propose_edit',{path:'../secret',source:'',reason:''})).rejects.toThrow('existing');
    await expect(agent.tool('shell',{})).rejects.toThrow('Unknown tool');
  });
  it('runs provider tool calls and sends tool results without auto-applying edits',async()=>{
    const {agent,sources}=fixture();const before={...sources};
    const mock=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'1',type:'function',function:{name:'read_file',arguments:'{"path":"models/Main.mo"}'}},{id:'2',type:'function',function:{name:'propose_edit',arguments:JSON.stringify({path:'models/Main.mo',source:'model Main Real x; end Main;',reason:'Example'})}}]}}]}))).mockResolvedValueOnce(new Response(JSON.stringify({choices:[{message:{role:'assistant',content:'Review the edit.'}}]})));
    vi.stubGlobal('fetch',mock);
    await agent.send('Help',{endpoint:'https://provider.example/v1',model:'test',key:'session-secret'});
    expect(mock).toHaveBeenCalledTimes(2);expect(sources).toEqual(before);expect(agent.proposals).toHaveLength(1);
    const body=JSON.parse(mock.mock.calls[1][1].body);expect(body.messages.filter((message:any)=>message.role==='tool')).toHaveLength(2);
    expect(JSON.stringify(agent.messages)).not.toContain('session-secret');expect(agent.busy).toBe(false);
  });
  it('surfaces provider errors without echoing credential-bearing responses',async()=>{
    const {agent}=fixture();vi.stubGlobal('fetch',vi.fn(async()=>new Response('secret',{status:401})));
    await expect(agent.send('Help',{endpoint:'https://provider.example/v1',model:'test',key:'secret'})).rejects.toThrow('HTTP 401');expect(agent.busy).toBe(false);
  });
  it('cancels an in-flight request and restores controls',async()=>{
    const {agent}=fixture();
    vi.stubGlobal('fetch',vi.fn((_url,init)=>new Promise((_resolve,reject)=>{
      init.signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError')));
    })));
    const pending=agent.send('Help',{endpoint:'https://provider.example/v1',model:'test',key:''});
    expect(agent.busy).toBe(true);agent.cancel();await expect(pending).rejects.toThrow('Stopped');expect(agent.busy).toBe(false);
  });
  it('rejects edits after switching to an identical-source project',async()=>{
    const {agent,host}=fixture();let project={};host.identity=()=>project;
    await agent.tool('propose_edit',{path:'models/Main.mo',source:'changed',reason:'Example'});
    project={};expect(()=>agent.accept(agent.proposals[0])).toThrow('Project changed');
  });
  it('starts fresh when changing providers to avoid sharing previous source context',async()=>{
    const {agent}=fixture();
    const mock=vi.fn(async(_url:string,_init:RequestInit)=>new Response(JSON.stringify({choices:[{message:{content:'Ready'}}]})));vi.stubGlobal('fetch',mock);
    await agent.send('private old context',{endpoint:'https://first.example/v1',model:'test',key:'first-key'});
    await agent.send('new request',{endpoint:'https://second.example/v1',model:'test',key:'second-key'});
    const second=JSON.parse(mock.mock.calls[1][1].body as string);expect(JSON.stringify(second)).not.toContain('private old context');
  });
  it('retrieves class documentation through the host',async()=>{
    const {agent,host}=fixture();host.readDocs=async name=>({name,documentation:'Modelica class docs',components:[]});
    await expect(agent.tool('read_docs',{name:'Modelica.Blocks'})).resolves.toEqual({name:'Modelica.Blocks',documentation:'Modelica class docs',components:[]});
  });
  it('supports asynchronous documentation lookup',async()=>{const {agent}=fixture();await expect(agent.tool('search_docs',{query:'connect'})).resolves.toEqual([{title:'connect'}]);});
});
