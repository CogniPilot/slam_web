/** Browser JSON-RPC transport for real worker-hosted language servers. */
export interface LspPosition {line:number;character:number}
export interface LspRange {start:LspPosition;end:LspPosition}
export interface LspDiagnostic {range:LspRange;message:string;severity?:number;source?:string;code?:string|number}
export interface LspCompletion {label:string;kind?:number;detail?:string;documentation?:string|{value:string};insertText?:string;insertTextFormat?:number;textEdit?:{range:LspRange;newText:string};additionalTextEdits?:{range:LspRange;newText:string}[];sortText?:string;filterText?:string}
type Pending={resolve:(value:any)=>void;reject:(reason:Error)=>void;timer:ReturnType<typeof setTimeout>};

export class LspClient {
  private nextId=0;
  private pending=new Map<number,Pending>();
  private disposed=false;
  capabilities:any={};
  serverInfo?:{name:string;version?:string};
  onDiagnostics?:(uri:string,diagnostics:LspDiagnostic[],version?:number)=>void;
  onError?:(message:string)=>void;
  constructor(readonly worker:Worker,private readonly configuration:Record<string,unknown>={}){
    worker.addEventListener('message',event=>this.receive(event.data));
    worker.addEventListener('error',event=>this.fail(event.message||'Language server worker failed'));
  }
  request<T=any>(method:string,params?:unknown):Promise<T>{
    if(this.disposed)return Promise.reject(new Error('Language server is closed'));
    const id=++this.nextId;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`${method} timed out`));},30_000);
      this.pending.set(id,{resolve,reject,timer});
      this.worker.postMessage({jsonrpc:'2.0',id,method,params});
    });
  }
  notify(method:string,params?:unknown){
    if(!this.disposed)this.worker.postMessage({jsonrpc:'2.0',method,params});
  }
  async initialize(initializationOptions:unknown){
    const result=await this.request('initialize',{
      processId:null,clientInfo:{name:'SLAM Lab',version:'0.1.0'},rootUri:'file:///workspace',rootPath:'/workspace',
      workspaceFolders:[{uri:'file:///workspace',name:'SLAM Lab nodes'}],initializationOptions,
      capabilities:{workspace:{configuration:true,workspaceFolders:true},textDocument:{
        synchronization:{didSave:false,dynamicRegistration:false},publishDiagnostics:{versionSupport:true},
        completion:{completionItem:{snippetSupport:true,documentationFormat:['markdown','plaintext']}},
        hover:{contentFormat:['markdown','plaintext']},semanticTokens:{requests:{full:true},tokenTypes:[],tokenModifiers:[],formats:['relative']}}}
    });
    this.capabilities=result.capabilities??{};this.serverInfo=result.serverInfo;
    this.notify('initialized',{});
    this.notify('workspace/didChangeConfiguration',{settings:this.configuration});
    return result;
  }
  private receive(message:any){
    if(!message||this.disposed)return;
    if(message.method){
      if(message.id!==undefined){
        let result:unknown=null;
        if(message.method==='workspace/configuration')result=(message.params?.items??[]).map((item:any)=>this.configuration[item.section]??{});
        if(message.method==='workspace/workspaceFolders')result=[{uri:'file:///workspace',name:'SLAM Lab nodes'}];
        this.worker.postMessage({jsonrpc:'2.0',id:message.id,result});
      }else if(message.method==='textDocument/publishDiagnostics'){
        const p=message.params;this.onDiagnostics?.(p.uri,p.diagnostics??[],p.version);
      }else if(message.method==='window/logMessage'&&message.params?.type===1){
        this.onError?.(String(message.params.message));
      }
      return;
    }
    const pending=this.pending.get(message.id);if(!pending)return;
    clearTimeout(pending.timer);this.pending.delete(message.id);
    if(message.error)pending.reject(new Error(message.error.message??JSON.stringify(message.error)));
    else pending.resolve(message.result);
  }
  private fail(message:string){
    for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(new Error(message));}
    this.pending.clear();this.onError?.(message);
  }
  dispose(){this.fail('Language server closed');this.disposed=true;this.worker.terminate();}
}
