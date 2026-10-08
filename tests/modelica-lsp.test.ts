import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import init,* as rumoca from '@cognipilot/rumoca';
import {RumocaLanguageServer} from '../src/modelica-lsp.worker';

const uri='inmemory://slam/physics.mo';
const source='model T\n  parameter Real gain=2;\n  Real x(start=0,fixed=true);\nequation\n  der(x)=gain;\nend T;';
let initialized:Promise<unknown>|undefined;
async function service(module=rumoca) {
  initialized??=init({module_or_path:readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});await initialized;
  const messages:any[]=[],server=new RumocaLanguageServer(message=>messages.push(message),{load:async()=>module,diagnosticDelayMs:10_000});
  let nextId=0;
  const request=async(method:string,params:any={})=>{const id=++nextId;await server.handle({jsonrpc:'2.0',id,method,params});return messages.slice().reverse().find(m=>m.id===id);};
  const notify=(method:string,params:any={})=>server.handle({jsonrpc:'2.0',method,params});
  return {server,messages,request,notify};
}

describe('actual Rumoca Modelica language server',()=>{
  it('reads package documentation and components without disturbing the editor workspace',async()=>{
    const {server,messages,request,notify}=await service();await request('initialize');
    await notify('workspace/didChangeConfiguration',{settings:{modelica:{workspaceSources:{'Companion.mo':'model Companion Real y=1; end Companion;'}}}});
    await notify('textDocument/didOpen',{textDocument:{uri,version:1,text:'model Active Companion x; end Active;'}});
    const docsApi=await import(/* @vite-ignore */ pathToFileURL(resolve('public/vendor/rumoca/rumoca_bind_wasm.js')).href+'?documentation-context');
    await docsApi.default({module_or_path:readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
    const docs=await service(docsApi);await docs.request('initialize');
    const sources={'Help/package.mo':'within; package Help "Package help" annotation(Documentation(info="<html><p>Read me</p></html>")); end Help;',
      'Help/Filter.mo':'within Help; model Filter "Filter help" parameter Real gain=2 "Gain"; Real x; equation x=gain; end Filter;'};
    const tree=(await docs.request('modelica/documentation',{sources})).result;
    expect(tree.classes.some((item:any)=>item.qualified_name==='Help')).toBe(true);
    const info=(await docs.request('modelica/documentation',{sources,name:'Help'})).result;
    expect(info.documentation_html).toContain('Read me');
    const filter=(await docs.request('modelica/documentation',{sources,name:'Help.Filter'})).result;
    expect(filter.components).toContainEqual(expect.objectContaining({name:'gain',type_name:'Real',variability:'parameter'}));
    await server.flushDiagnostics(uri);
    expect(messages.slice().reverse().find(m=>m.method==='textDocument/publishDiagnostics').params.diagnostics).toEqual([]);
    expect((await request('modelica/documentation',{sources})).error.code).toBe(-32602);
    const activeInfo=await docs.request('modelica/documentation',{sources:{'models/Active.mo':'model Active "Current project source" Real x=1; end Active;'},name:'Active'});
    expect(activeInfo.result.description).toBe('Current project source');
    expect((await docs.request('modelica/documentation',{sources,name:7})).error.code).toBe(-32602);
    await docs.request('shutdown');
    await notify('textDocument/didClose',{textDocument:{uri}});await request('shutdown');
  });
  it('checks a selected model without creating a simulation session',async()=>{
    const {request}=await service();await request('initialize');
    const result=await request('modelica/checkModel',{source,model:'T',sources:{}});
    expect(result.error).toBeUndefined();expect(result.result).toBeTruthy();
    expect((await request('modelica/checkModel',{source:3,model:'T'})).error.code).toBe(-32602);
    await request('shutdown');
  });
  it('discovers qualified entry points using the same compiler as the language service',async()=>{
    const {request}=await service();await request('initialize');
    const source='package Examples model InertialOnly Real x; equation x=1; end InertialOnly; end Examples;';
    const result=await request('modelica/simulationModels',{source,defaultModel:'Examples.InertialOnly'});
    expect(result.result).toMatchObject({ok:true,models:['Examples.InertialOnly'],selectedModel:'Examples.InertialOnly'});
    const multiple=await request('modelica/simulationModels',{source,defaultModel:'Examples.Other',workspaceSources:{
      'models/Examples/Other.mo':'within Examples; model Other Real x; equation x=2; end Other;'
    }});
    expect(multiple.result.models).toEqual(['Examples.InertialOnly','Examples.Other']);
    expect((await request('modelica/simulationModels',{source:3,defaultModel:''})).error.code).toBe(-32602);
    await request('shutdown');
  });
  it('resolves actual companion definitions and removes them again when empty settings clear the singleton',async()=>{
    const {server,messages,request,notify}=await service();await request('initialize');
    const text='model UsesCompanion\n  Companion.Value x;\nend UsesCompanion;';
    await notify('textDocument/didOpen',{textDocument:{uri,version:1,text}});
    const latest=()=>messages.slice().reverse().find(m=>m.method==='textDocument/publishDiagnostics').params;
    await server.flushDiagnostics(uri);expect(latest().diagnostics.length).toBeGreaterThan(0);
    await notify('workspace/didChangeConfiguration',{settings:{modelica:{workspaceSources:{
      'models/Companion.mo':'package Companion\n model Value\n Real y;\n equation y=1;\n end Value;\nend Companion;'
    }}}});
    await server.flushDiagnostics(uri);expect(latest()).toEqual({uri,version:1,diagnostics:[]});
    const query={textDocument:{uri},position:{line:1,character:12}};
    expect((await request('textDocument/completion',query)).result.some((item:any)=>item.label==='Value')).toBe(true);
    await notify('workspace/didChangeConfiguration',{settings:{}});
    await server.flushDiagnostics(uri);expect(latest().diagnostics.length).toBeGreaterThan(0);
    expect((await request('textDocument/completion',query)).result.some((item:any)=>item.label==='Value')).toBe(false);
    await notify('textDocument/didClose',{textDocument:{uri}});await request('shutdown');
  });
  it('serves completions, hover, definitions, symbols and semantic tokens through JSON-RPC',async()=>{
    const {server,messages,request,notify}=await service();
    const initialized=await request('initialize',{initializationOptions:{base:'/'}});
    expect(initialized.result.serverInfo.version).toBe(rumoca.get_version());expect(initialized.result.capabilities.positionEncoding).toBe('utf-16');
    expect(initialized.result.capabilities.semanticTokensProvider.legend.tokenTypes).toContain('variable');
    await notify('initialized');await notify('textDocument/didOpen',{textDocument:{uri,version:1,languageId:'modelica',text:source}});
    await server.flushDiagnostics(uri);expect(messages.slice().reverse().find(m=>m.method==='textDocument/publishDiagnostics').params.diagnostics).toEqual([]);
    const query={textDocument:{uri},position:{line:4,character:11}};
    expect((await request('textDocument/completion',query)).result.some((item:any)=>item.label==='gain')).toBe(true);
    expect((await request('textDocument/hover',query)).result.contents.value).toContain('parameter Real gain');
    const definition=(await request('textDocument/definition',query)).result;
    expect(definition.uri).toBe(uri);expect(definition.range.start.line).toBe(1);
    expect((await request('textDocument/documentSymbol',{textDocument:{uri}})).result[0].name).toBe('T');
    expect((await request('textDocument/semanticTokens/full',{textDocument:{uri}})).result.data.length).toBeGreaterThan(20);
    await notify('textDocument/didClose',{textDocument:{uri}});
    expect(messages.slice().reverse().find(m=>m.method==='textDocument/publishDiagnostics').params.diagnostics).toEqual([]);
    expect((await request('textDocument/hover',query)).error.code).toBe(-32602);
    await request('shutdown');await notify('exit');
  });
  it('publishes real compiler diagnostics for changed text, rejects stale versions, and clears after correction',async()=>{
    const {server,messages,request,notify}=await service();await request('initialize');
    await notify('textDocument/didOpen',{textDocument:{uri,version:1,text:source}});
    await notify('textDocument/didChange',{textDocument:{uri,version:2},contentChanges:[{range:{start:{line:4,character:9},end:{line:4,character:13}},text:'missing'}]});
    await server.flushDiagnostics(uri);
    const diagnostics=messages.slice().reverse().find(m=>m.method==='textDocument/publishDiagnostics').params;
    expect(diagnostics.version).toBe(2);expect(diagnostics.diagnostics.some((d:any)=>d.code==='ER002'&&d.message.includes('missing'))).toBe(true);
    await notify('textDocument/didChange',{textDocument:{uri,version:1},contentChanges:[{text:source}]});
    await server.flushDiagnostics(uri);expect(messages.slice().reverse().find(m=>m.method==='textDocument/publishDiagnostics').params.version).toBe(2);
    await notify('textDocument/didChange',{textDocument:{uri,version:3},contentChanges:[{text:source}]});
    await server.flushDiagnostics(uri);expect(messages.slice().reverse().find(m=>m.method==='textDocument/publishDiagnostics').params).toEqual({uri,version:3,diagnostics:[]});
    const completion=(await request('textDocument/completion',{textDocument:{uri},position:{line:4,character:11}})).result;
    expect(completion.some((item:any)=>item.label==='gain')).toBe(true);
    await notify('textDocument/didClose',{textDocument:{uri}});await request('shutdown');
  });
  it('offers real compiler quick fixes and remaps edits to the active document URI',async()=>{
    const {server,messages,request,notify}=await service();await request('initialize');
    const broken=source.replace('start=0','startd=0');
    await notify('textDocument/didOpen',{textDocument:{uri,version:1,text:broken}});await server.flushDiagnostics(uri);
    const diagnostics=messages.slice().reverse().find(m=>m.method==='textDocument/publishDiagnostics').params.diagnostics;
    expect(diagnostics.some((d:any)=>d.code==='ET001')).toBe(true);
    const actions=(await request('textDocument/codeAction',{textDocument:{uri},range:{start:{line:0,character:0},end:{line:5,character:6}},context:{diagnostics}})).result;
    expect(Array.isArray(actions)).toBe(true);
    expect(actions.length).toBeGreaterThan(0);
    expect(JSON.stringify(actions)).not.toContain('file:///input.mo');
    expect(JSON.stringify(actions)).toContain(uri);
    await notify('textDocument/didClose',{textDocument:{uri}});await request('shutdown');
  });
  it('applies UTF-16 incremental edits after astral characters and validates protocol errors',async()=>{
    const {server,messages,request,notify}=await service();
    expect((await request('textDocument/completion',{textDocument:{uri},position:{line:0,character:0}})).error.code).toBe(-32002);
    await request('initialize');const unicode=source.replace('  der(x)=gain;','  /* 😀 */ der(x)=gain;');
    await notify('textDocument/didOpen',{textDocument:{uri,version:1,text:unicode}});
    const line=unicode.split('\n')[4],start=line.indexOf('gain');
    await notify('textDocument/didChange',{textDocument:{uri,version:2},contentChanges:[{range:{start:{line:4,character:start},end:{line:4,character:start+4}},text:'missing'}]});
    await server.flushDiagnostics(uri);const diagnostic=messages.slice().reverse().find(m=>m.method==='textDocument/publishDiagnostics').params.diagnostics.find((d:any)=>d.code==='ER002');
    expect(diagnostic.range.start.character).toBe(start);expect(diagnostic.range.end.character).toBe(start+7);
    expect((await request('unknown/method')).error.code).toBe(-32601);
    expect((await request('textDocument/hover',{textDocument:{uri},position:{line:-1,character:0}})).error.code).toBe(-32602);
    await notify('textDocument/didClose',{textDocument:{uri}});await request('shutdown');
  });
});

function fakeService(sync?:(sources:string)=>string){
  const calls:string[]=[],messages:any[]=[];
  const semantic=(method:string,result:any)=>(..._args:any[])=>{calls.push(method);return JSON.stringify(result);};
  const api={get_version:()=> 'test',get_git_commit:()=> 'test',
    sync_workspace_sources:(sources:string)=>{calls.push(`sync:${sources}`);return sync?.(sources)??'{}';},
    lsp_diagnostics:semantic('diagnostics',[]),lsp_completion:semantic('completion',[]),lsp_hover:semantic('hover',null),
    lsp_definition:semantic('definition',null),lsp_document_symbols:semantic('symbols',[]),
    lsp_semantic_tokens:semantic('tokens',{data:[]}),lsp_semantic_token_legend:semantic('legend',{tokenTypes:[],tokenModifiers:[]}),
    lsp_code_actions:semantic('actions',[])};
  const server=new RumocaLanguageServer(message=>messages.push(message),{load:async()=>api,diagnosticDelayMs:10_000});
  let id=0;
  const request=async(method:string,params:any={})=>{const next=++id;await server.handle({jsonrpc:'2.0',id:next,method,params});return messages.find(message=>message.id===next);};
  const notify=(method:string,params:any={})=>server.handle({jsonrpc:'2.0',method,params});
  return {server,calls,messages,request,notify};
}

describe('workspace synchronization ordering and validation',()=>{
  it('captures context once, reuses it across edits and all semantic APIs, then synchronizes replacement before queries',async()=>{
    const {server,calls,request,notify}=fakeService();await request('initialize');
    await notify('textDocument/didOpen',{textDocument:{uri,version:1,text:source}});
    const sources={'b.mo':'// β\r\n','a.mo':''};
    await notify('workspace/didChangeConfiguration',{settings:{modelica:{workspaceSources:sources}}});
    sources['b.mo']='// mutation after submission';
    await server.flushDiagnostics(uri);
    expect(calls).toContain('sync:{"a.mo":"","b.mo":"// β\\r\\n"}');
    const query={textDocument:{uri},position:{line:0,character:0}};
    for(const method of ['hover','completion','definition'])await request(`textDocument/${method}`,query);
    await request('textDocument/documentSymbol',query);await request('textDocument/semanticTokens/full',query);
    await request('textDocument/codeAction',{...query,range:{start:query.position,end:query.position},context:{diagnostics:[]}});
    await notify('textDocument/didChange',{textDocument:{uri,version:2},contentChanges:[{text:source+'\n'}]});
    await server.flushDiagnostics(uri);
    await notify('workspace/didChangeConfiguration',{settings:{modelica:{workspaceSources:{'a.mo':'','b.mo':'// β\r\n'}}}});
    expect(calls.filter(call=>call.startsWith('sync:'))).toHaveLength(1);
    await notify('workspace/didChangeConfiguration',{settings:{}});
    await request('textDocument/completion',query);
    expect(calls.slice(-2)).toEqual(['sync:{}','completion']);
    await request('shutdown');
  });

  it('reschedules diagnostics on every open document after a context change without a document edit',async()=>{
    vi.useFakeTimers();
    try{
      const {calls,messages,request,notify}=fakeService();await request('initialize');
      for(const openUri of [uri,uri+'2'])await notify('textDocument/didOpen',{textDocument:{uri:openUri,version:1,text:source}});
      await vi.advanceTimersByTimeAsync(10_000);calls.length=0;messages.length=0;
      await notify('workspace/didChangeConfiguration',{settings:{modelica:{workspaceSources:{'new.mo':'model New end New;'}}}});
      await vi.advanceTimersByTimeAsync(10_000);
      expect(calls).toEqual(['sync:{"new.mo":"model New end New;"}','diagnostics','diagnostics']);
      expect(messages.filter(message=>message.method==='textDocument/publishDiagnostics').map(message=>message.params.uri)).toEqual([uri,uri+'2']);
      await request('shutdown');
    }finally{vi.useRealTimers();}
  });

  it.each([null,[],new Map(),{'a.mo':42},{[Symbol('path')]:'text'},{'input.mo':'duplicate'}])
  ('refuses invalid workspace map %# without replacing the previous context',async workspaceSources=>{
    const {calls,request}=fakeService();await request('initialize');
    await request('workspace/didChangeConfiguration',{settings:{modelica:{workspaceSources:{'valid.mo':'valid'}}}});
    const result=await request('workspace/didChangeConfiguration',{settings:{modelica:{workspaceSources}}});
    expect(result.error.code).toBe(-32602);
    expect(calls.filter(call=>call.startsWith('sync:'))).toEqual(['sync:{"valid.mo":"valid"}']);
    await request('shutdown');
  });

  it('refuses accessors without running them',async()=>{
    const {request}=fakeService();await request('initialize');
    for(const settings of [Object.defineProperty({},'modelica',{get(){throw Error('Getter ran');}}),
      {modelica:{workspaceSources:Object.defineProperty({},'bad.mo',{get(){throw Error('Getter ran');}})}}]){
      const result=await request('workspace/didChangeConfiguration',{settings});
      expect(result.error.code).toBe(-32602);expect(result.error.message).toContain('accessors');
    }
    await request('shutdown');
  });

  it('retries failed sync before a semantic query and reports skipped companion parses',async()=>{
    let count=0;
    const {calls,messages,request,notify}=fakeService(()=>{
      if(++count===1)throw Error('sync failed');
      return '{"error_count":1,"skipped_files":["bad.mo: parse error"]}';
    });
    await request('initialize');await notify('textDocument/didOpen',{textDocument:{uri,version:1,text:source}});
    const failed=await request('workspace/didChangeConfiguration',{settings:{modelica:{workspaceSources:{'bad.mo':'broken'}}}});
    expect(failed.error.message).toBe('sync failed');
    await request('textDocument/completion',{textDocument:{uri},position:{line:0,character:0}});
    expect(calls.slice(-3)).toEqual(['sync:{"bad.mo":"broken"}','sync:{"bad.mo":"broken"}','completion']);
    expect(messages.some(message=>message.method==='window/logMessage'&&message.params.type===1&&message.params.message.includes('bad.mo'))).toBe(true);
    await request('shutdown');
  });
});
