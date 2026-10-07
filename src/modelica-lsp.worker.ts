/// <reference lib="webworker" />
/** Browser JSON-RPC/LSP transport over Rumoca's actual language-service APIs. */
type RpcId=number|string|null;
type Message={jsonrpc:'2.0';id?:RpcId;method?:string;params?:any;result?:any;error?:{code:number;message:string}};
type Position={line:number;character:number};
type Document={text:string;version:number};
type Rumoca=Pick<typeof import('@cognipilot/rumoca'),'get_version'|'get_git_commit'|'sync_workspace_sources'|'lsp_diagnostics'|'lsp_completion'|'lsp_hover'|'lsp_definition'|'lsp_document_symbols'|'lsp_semantic_tokens'|'lsp_semantic_token_legend'|'lsp_code_actions'> & Partial<Pick<typeof import('@cognipilot/rumoca'),'get_simulation_models'>>;
class RpcError extends Error {constructor(readonly code:number,message:string){super(message);}}
const position=(value:any):Position=>{
  if(!Number.isInteger(value?.line)||!Number.isInteger(value?.character)||value.line<0||value.character<0||value.line>0xffffffff||value.character>0xffffffff)throw new RpcError(-32602,'Expected a zero-based UTF-16 LSP position');
  return value;
};
function offset(text:string,value:Position) {
  position(value);let start=0;
  for(let line=0;line<value.line;line++){const next=text.indexOf('\n',start);if(next<0)throw new RpcError(-32602,'Change range line is outside the document');start=next+1;}
  let end=text.indexOf('\n',start);if(end<0)end=text.length;if(end>start&&text[end-1]==='\r')end--;
  if(start+value.character>end)throw new RpcError(-32602,'Change range character is outside the document');
  return start+value.character;
}
function localUris(value:any,uri:string):any {
  if(Array.isArray(value))return value.map(v=>localUris(v,uri));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key==='file:///input.mo'?uri:key,localUris(v,uri)]));
  return value==='file:///input.mo'?uri:value;
}

function workspaceSources(settings:unknown):string {
  const record=(value:unknown):object=>{
    if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))
      throw new RpcError(-32602,'Modelica workspaceSources settings require plain objects');
    return value;
  };
  const property=(value:object,key:string):unknown=>{
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!descriptor)return undefined;
    if(!Object.hasOwn(descriptor,'value'))throw new RpcError(-32602,'Modelica workspaceSources settings cannot contain accessors');
    return descriptor.value;
  };
  if(settings===undefined)return '{}';
  const modelica=property(record(settings),'modelica');
  if(modelica===undefined)return '{}';
  const sources=property(record(modelica),'workspaceSources');
  if(sources===undefined)return '{}';
  const entries:[string,string][]=[];
  for(const key of Reflect.ownKeys(record(sources))){
    if(typeof key!=='string'||!key||key.replaceAll('\\','/')==='input.mo')
      throw new RpcError(-32602,'Modelica workspaceSources require companion paths excluding input.mo');
    const source=property(sources as object,key);
    if(typeof source!=='string')throw new RpcError(-32602,`Modelica workspace source must be text: ${key}`);
    entries.push([key,source]);
  }
  // Stable identity prevents re-syncing an unchanged map with different key order.
  entries.sort(([a],[b])=>a<b?-1:a>b?1:0);
  return JSON.stringify(Object.fromEntries(entries));
}

/** Exported for tests; the worker mounts this same server with the WASM loader. */
export class RumocaLanguageServer {
  private documents=new Map<string,Document>();
  private timers=new Map<string,ReturnType<typeof setTimeout>>();
  private compiler?:Promise<Rumoca>;
  private queue:Promise<void>=Promise.resolve();
  private initialized=false;
  private shuttingDown=false;
  private exited=false;
  private base?:string;
  private workspace='{}';
  private syncedWorkspace?:string;
  constructor(private send:(message:Message)=>void,
    private options:{load?:()=>Promise<Rumoca>;diagnosticDelayMs?:number;close?:()=>void}={}) {}

  private async api() {
    this.compiler??=(async()=>{
      if(this.options.load)return this.options.load();
      const site=new URL(this.base??'../',self.location.href);
      if(site.origin!==self.location.origin)throw new RpcError(-32602,'Rumoca language-service assets must use the same origin');
      if(!site.pathname.endsWith('/'))site.pathname+='/';
      const module=await import(/* @vite-ignore */ new URL('vendor/rumoca/rumoca_bind_wasm.js',site).href) as typeof import('@cognipilot/rumoca');
      await module.default({module_or_path:new URL('vendor/rumoca/rumoca_bind_wasm_bg.wasm',site).href});
      return module;
    })();
    return this.compiler;
  }
  private async contextualApi(){
    const api=await this.api();
    if(this.syncedWorkspace!==this.workspace){
      const summary=JSON.parse(api.sync_workspace_sources(this.workspace));
      this.syncedWorkspace=this.workspace;
      if(summary.error_count>0)this.notify('window/logMessage',{type:1,
        message:`Rumoca workspace sources skipped: ${(summary.skipped_files??[]).join('\n')}`});
    }
    return api;
  }
  handle(message:Message):Promise<void> {
    const operation=this.queue.then(()=>this.process(message));
    this.queue=operation.catch(()=>{});return operation;
  }
  private uri(params:any) {
    const uri=params?.textDocument?.uri;if(typeof uri!=='string'||!uri)throw new RpcError(-32602,'textDocument.uri is required');return uri;
  }
  private document(params:any) {
    const uri=this.uri(params),document=this.documents.get(uri);if(!document)throw new RpcError(-32602,'Document is not open');return {uri,document};
  }
  private notify(method:string,params:any) {this.send({jsonrpc:'2.0',method,params});}
  private schedule(uri:string) {
    const previous=this.timers.get(uri);if(previous)clearTimeout(previous);
    const timer=setTimeout(()=>{
      this.timers.delete(uri);const operation=this.queue.then(()=>this.diagnostics(uri));
      this.queue=operation.catch(error=>this.notify('window/logMessage',{type:1,message:`Rumoca diagnostics failed: ${String(error)}`}));
    },this.options.diagnosticDelayMs??180);
    this.timers.set(uri,timer);
  }
  private async diagnostics(uri:string) {
    const document=this.documents.get(uri);if(!document||this.shuttingDown||this.exited)return;
    const api=await this.contextualApi(),diagnostics=localUris(JSON.parse(api.lsp_diagnostics(document.text)),uri);
    if(this.documents.get(uri)?.version===document.version)this.notify('textDocument/publishDiagnostics',{uri,version:document.version,diagnostics});
  }
  /** Flushes pending debounce work, also useful before a save or in tests. */
  flushDiagnostics(uri:string):Promise<void> {
    const timer=this.timers.get(uri);if(timer)clearTimeout(timer);this.timers.delete(uri);
    const operation=this.queue.then(()=>this.diagnostics(uri));this.queue=operation.catch(()=>{});return operation;
  }
  private async process(message:Message) {
    const request=Object.prototype.hasOwnProperty.call(message??{},'id'),id=message?.id??null;
    if(!message||message.jsonrpc!=='2.0'||typeof message.method!=='string') {
      this.send({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid JSON-RPC request'}});return;
    }
    try {
      if(this.exited)return;
      const params=message.params??{};let result:any=null;
      if(message.method==='initialize') {
        if(this.initialized)throw new RpcError(-32600,'Language server already initialized');
        this.base=params.initializationOptions?.base??params.initializationOptions?.baseUrl;
        if(this.base!==undefined&&typeof this.base!=='string')throw new RpcError(-32602,'initializationOptions.base must be a same-origin site base');
        const api=await this.api();this.initialized=true;
        result={serverInfo:{name:'Rumoca Modelica WASM',version:api.get_version()},capabilities:{
          positionEncoding:'utf-16',textDocumentSync:{openClose:true,change:2,save:{includeText:false}},
          hoverProvider:true,completionProvider:{triggerCharacters:['.'],resolveProvider:false},definitionProvider:true,
          documentSymbolProvider:true,codeActionProvider:true,
          semanticTokensProvider:{legend:JSON.parse(api.lsp_semantic_token_legend()),full:true,range:false}}};
      } else {
        if(!this.initialized)throw new RpcError(-32002,'Language server is not initialized');
        if(this.shuttingDown&&message.method!=='exit')throw new RpcError(-32600,'Language server is shutting down');
        switch(message.method) {
          case 'initialized':case '$/cancelRequest':case '$/setTrace':break;
          case 'modelica/simulationModels': {
            if(typeof params.source!=='string'||typeof params.defaultModel!=='string')
              throw new RpcError(-32602,'Model discovery requires source and defaultModel');
            const api=await this.api();
            if(!api.get_simulation_models)throw new RpcError(-32601,'Rumoca model discovery is unavailable');
            const companions=JSON.parse(workspaceSources({modelica:{workspaceSources:params.workspaceSources}}));
            const names=new Set<string>();
            for(const source of [params.source,...Object.values(companions)]){
              const discovered=JSON.parse(api.get_simulation_models(source as string,params.defaultModel));
              if(!discovered.ok)throw new RpcError(-32602,discovered.error??'Model discovery failed');
              discovered.models.forEach((name:string)=>names.add(name));
            }
            result={ok:true,models:Array.from(names),selectedModel:names.has(params.defaultModel)?params.defaultModel:undefined,error:null};break;
          }
          case 'workspace/didChangeConfiguration': {
            const next=workspaceSources(params.settings),changed=next!==this.workspace;
            this.workspace=next;
            if(changed)for(const uri of this.documents.keys())this.schedule(uri);
            await this.contextualApi();break;
          }
          case 'shutdown':this.shuttingDown=true;for(const timer of this.timers.values())clearTimeout(timer);this.timers.clear();break;
          case 'exit':this.exited=true;this.options.close?.();break;
          case 'textDocument/didOpen': {
            const uri=this.uri(params),doc=params.textDocument;
            if(typeof doc.text!=='string'||!Number.isInteger(doc.version))throw new RpcError(-32602,'didOpen requires text and an integer version');
            if(this.documents.has(uri))throw new RpcError(-32602,'Document is already open');
            this.documents.set(uri,{text:doc.text,version:doc.version});this.schedule(uri);break;
          }
          case 'textDocument/didChange': {
            const {uri,document}=this.document(params),version=params.textDocument.version;
            if(!Number.isInteger(version)||!Array.isArray(params.contentChanges))throw new RpcError(-32602,'didChange requires version and contentChanges');
            if(version<=document.version)break; // Stale edit notifications must never overwrite a newer buffer.
            let text=document.text;
            for(const change of params.contentChanges) {
              if(typeof change.text!=='string')throw new RpcError(-32602,'Each change requires text');
              if(change.range){const start=offset(text,change.range.start),end=offset(text,change.range.end);if(end<start)throw new RpcError(-32602,'Change range is reversed');text=text.slice(0,start)+change.text+text.slice(end);}
              else text=change.text;
            }
            this.documents.set(uri,{text,version});this.schedule(uri);break;
          }
          case 'textDocument/didClose': {
            const uri=this.uri(params),timer=this.timers.get(uri);if(timer)clearTimeout(timer);this.timers.delete(uri);this.documents.delete(uri);
            this.notify('textDocument/publishDiagnostics',{uri,diagnostics:[]});break;
          }
          case 'textDocument/didSave':this.schedule(this.document(params).uri);break;
          case 'textDocument/hover':case 'textDocument/completion':case 'textDocument/definition': {
            const {uri,document}=this.document(params),at=position(params.position),api=await this.contextualApi();
            const operation=message.method==='textDocument/hover'?api.lsp_hover:message.method==='textDocument/completion'?api.lsp_completion:api.lsp_definition;
            result=localUris(JSON.parse(operation(document.text,at.line,at.character)),uri);break;
          }
          case 'textDocument/documentSymbol':case 'textDocument/semanticTokens/full': {
            const {uri,document}=this.document(params),api=await this.contextualApi();
            result=localUris(JSON.parse(message.method==='textDocument/documentSymbol'?api.lsp_document_symbols(document.text):api.lsp_semantic_tokens(document.text)),uri);break;
          }
          case 'textDocument/codeAction': {
            const {uri,document}=this.document(params),api=await this.contextualApi(),start=position(params.range?.start),end=position(params.range?.end);
            if(!Array.isArray(params.context?.diagnostics))throw new RpcError(-32602,'codeAction context.diagnostics is required');
            result=localUris(JSON.parse(api.lsp_code_actions(document.text,start.line,start.character,end.line,end.character,JSON.stringify(params.context.diagnostics))),uri);break;
          }
          default:if(request)throw new RpcError(-32601,`Method not found: ${message.method}`);break;
        }
      }
      if(request)this.send({jsonrpc:'2.0',id,result});
    } catch(error) {
      const code=error instanceof RpcError?error.code:-32603,description=error instanceof Error?error.message:String(error);
      if(request)this.send({jsonrpc:'2.0',id,error:{code,message:description}});
      else this.notify('window/logMessage',{type:1,message:description});
    }
  }
}

if(typeof self!=='undefined'&&typeof (self as any).document==='undefined') {
  const server=new RumocaLanguageServer(message=>self.postMessage(message),{close:()=>self.close()});
  self.onmessage=({data})=>{void server.handle(data);};
}
