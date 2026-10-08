import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';
import './editor.css';
import {LspClient,type LspDiagnostic,type LspPosition,type LspCompletion,type LspRange} from './lsp-client';

export type SourceLanguage='modelica'|'plaintext';
export type LanguageServerFactory=()=>Worker;
const factories=new Map<SourceLanguage,LanguageServerFactory>([
  ['modelica',()=>new Worker(new URL('./modelica-lsp.worker.ts',import.meta.url),{type:'module'})]
]);
export function registerLanguageServer(language:SourceLanguage,factory:LanguageServerFactory){factories.set(language,factory);}
const activeEditors=new Map<string,SourceEditor>();
let nextEditor=0;
(globalThis as any).MonacoEnvironment={getWorker:()=>new EditorWorker()};
monaco.editor.defineTheme('slam-lab',{base:'vs-dark',inherit:true,rules:[],colors:{'editor.background':'#0d151e','editor.foreground':'#c1dccf','editorLineNumber.foreground':'#617888','editor.selectionBackground':'#244c49','editorCursor.foreground':'#53e2b2'}});
monaco.languages.register({id:'modelica',extensions:['.mo'],aliases:['Modelica']});
monaco.languages.setLanguageConfiguration('modelica',{comments:{lineComment:'//',blockComment:['/*','*/']},brackets:[['{','}'],['[',']'],['(',')']],autoClosingPairs:[{open:'(',close:')'},{open:'[',close:']'},{open:'{',close:'}'},{open:'"',close:'"'}]});
monaco.languages.setMonarchTokensProvider('modelica',{
  keywords:['algorithm','and','annotation','block','break','class','connect','connector','constant','constrainedby','der','discrete','each','else','elseif','elsewhen','encapsulated','end','enumeration','equation','expandable','extends','external','false','final','flow','for','function','if','import','in','initial','inner','input','loop','model','not','operator','or','outer','output','package','parameter','partial','protected','public','record','redeclare','replaceable','return','stream','then','true','type','when','while','within'],
  typeKeywords:['Real','Integer','Boolean','String'],
  tokenizer:{root:[[/\/\*/, 'comment','@comment'],[/\/\/.*$/,'comment'],[/"/,'string','@string'],[/\b\d+(\.\d+)?([eE][+-]?\d+)?\b/,'number'],[/[A-Za-z_$][\w$]*/,{cases:{'@keywords':'keyword','@typeKeywords':'type','@default':'identifier'}}],[/[{}()[\]]/,'@brackets'],[/[=+*\/<>:;.,-]/,'delimiter']],comment:[[/[^/*]+/,'comment'],[/\*\//,'comment','@pop'],[/[/*]/,'comment']],string:[[/[^\\"]+/,'string'],[/\\./,'string.escape'],[/"/,'string','@pop']]}
});
const range=(r:LspRange):monaco.IRange=>({startLineNumber:r.start.line+1,startColumn:r.start.character+1,endLineNumber:r.end.line+1,endColumn:r.end.character+1});
const position=(p:monaco.Position):LspPosition=>({line:p.lineNumber-1,character:p.column-1});
const completionKinds=[monaco.languages.CompletionItemKind.Text,monaco.languages.CompletionItemKind.Method,monaco.languages.CompletionItemKind.Function,monaco.languages.CompletionItemKind.Constructor,monaco.languages.CompletionItemKind.Field,monaco.languages.CompletionItemKind.Variable,monaco.languages.CompletionItemKind.Class,monaco.languages.CompletionItemKind.Interface,monaco.languages.CompletionItemKind.Module,monaco.languages.CompletionItemKind.Property,monaco.languages.CompletionItemKind.Unit,monaco.languages.CompletionItemKind.Value,monaco.languages.CompletionItemKind.Enum,monaco.languages.CompletionItemKind.Keyword,monaco.languages.CompletionItemKind.Snippet,monaco.languages.CompletionItemKind.Color,monaco.languages.CompletionItemKind.File,monaco.languages.CompletionItemKind.Reference,monaco.languages.CompletionItemKind.Folder,monaco.languages.CompletionItemKind.EnumMember,monaco.languages.CompletionItemKind.Constant,monaco.languages.CompletionItemKind.Struct,monaco.languages.CompletionItemKind.Event,monaco.languages.CompletionItemKind.Operator,monaco.languages.CompletionItemKind.TypeParameter];
for(const language of ['modelica']){
  monaco.languages.registerCompletionItemProvider(language,{triggerCharacters:['.'],async provideCompletionItems(model,p){
    const owner=activeEditors.get(model.uri.toString());if(!owner)return {suggestions:[]};
    const items=await owner.requestCompletion(position(p)).catch(()=>[]);
    const word=model.getWordUntilPosition(p),fallback={startLineNumber:p.lineNumber,endLineNumber:p.lineNumber,startColumn:word.startColumn,endColumn:word.endColumn};
    return {suggestions:items.map(item=>({label:item.label,kind:completionKinds[(item.kind??1)-1]??monaco.languages.CompletionItemKind.Text,detail:item.detail,documentation:typeof item.documentation==='string'?item.documentation:item.documentation?.value,insertText:item.textEdit?.newText??item.insertText??item.label,insertTextRules:item.insertTextFormat===2?monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet:undefined,range:item.textEdit?range(item.textEdit.range):fallback,sortText:item.sortText,filterText:item.filterText,additionalTextEdits:item.additionalTextEdits?.map(edit=>({range:range(edit.range),text:edit.newText}))}))};
  }});
  monaco.languages.registerHoverProvider(language,{async provideHover(model,p){
    const owner=activeEditors.get(model.uri.toString());if(!owner)return null;
    const hover=await owner.requestHover(position(p)).catch(()=>null);if(!hover)return null;
    const values=Array.isArray(hover.contents)?hover.contents:[hover.contents];
    return {range:hover.range?range(hover.range):undefined,contents:values.filter(Boolean).map((value:any)=>({value:typeof value==='string'?value:value.language?`\`\`\`${value.language}\n${value.value}\n\`\`\``:value.value,isTrusted:false}))};
  }});
}

export interface SourceEditor {
  setLanguage(language:SourceLanguage):void;
  setWorkspaceSources(sources:Readonly<Record<string,string>>|undefined,activePath?:string):void;
  syncFromTextarea():void;
  readonly ready:Promise<void>;
  readonly language:SourceLanguage;
  readonly status:string;
  readonly editor:monaco.editor.IStandaloneCodeEditor;
  getDiagnostics():LspDiagnostic[];
  requestCompletion(position:LspPosition):Promise<LspCompletion[]>;
  requestHover(position:LspPosition):Promise<any>;
  simulationModels(source:string,defaultModel:string,workspaceSources?:Readonly<Record<string,string>>):Promise<string[]>;
  documentation<T>(sources:Readonly<Record<string,string>>,name?:string):Promise<T>;
  checkModel(source:string,model:string,sources:Readonly<Record<string,string>>):Promise<unknown>;
  dispose():void;
}

/** The textarea remains the application's source of truth and input event API. */
export function createSourceEditor(textarea:HTMLTextAreaElement,onChange?:()=>void,onStatus?:(message:string)=>void):SourceEditor{
  const originalTabIndex=textarea.tabIndex;
  const shell=document.createElement('div');shell.className='source-editor-shell';
  const container=document.createElement('div');container.className='source-editor-monaco';
  const statusElement=document.createElement('div');statusElement.className='source-editor-status';statusElement.setAttribute('role','status');
  const problems=document.createElement('div');problems.className='source-editor-problems';
  textarea.before(shell);shell.append(container,statusElement,problems,textarea);
  textarea.classList.add('source-editor-compat');textarea.tabIndex=-1;
  const id=++nextEditor;
  let language:SourceLanguage='plaintext',model=monaco.editor.createModel(textarea.value,'plaintext',monaco.Uri.parse(`file:///workspace/source-${id}.txt`));
  const editor=monaco.editor.create(container,{model,theme:'slam-lab',automaticLayout:true,readOnly:textarea.readOnly,fontSize:12,lineHeight:20,fontFamily:'"DejaVu Sans Mono",ui-monospace,monospace',minimap:{enabled:false},scrollBeyondLastLine:false,wordWrap:'off',tabSize:4,ariaLabel:'Highlighted source editor',padding:{top:12,bottom:12},renderValidationDecorations:'on'});
  let client:LspClient|undefined,opened=false,lastSentVersion=0,ready:Promise<void>=Promise.resolve(),mutating=false,generation=0,diagnostics:LspDiagnostic[]=[],status='',changeTimer:ReturnType<typeof setTimeout>|undefined,semantic:monaco.IDisposable|undefined;
  let documentationClient:LspClient|undefined,documentationReady:Promise<unknown>|undefined;
  let workspaceSources:Record<string,string>={};
  let workspaceGeneration=0;
  const updateStatus=(message:string)=>{status=message;statusElement.textContent=message;onStatus?.(message);};
  const displayProblems=()=>{
    monaco.editor.setModelMarkers(model,'slam-lsp',diagnostics.map(d=>({...range(d.range),message:d.message,severity:d.severity===2?monaco.MarkerSeverity.Warning:d.severity===3?monaco.MarkerSeverity.Info:d.severity===4?monaco.MarkerSeverity.Hint:monaco.MarkerSeverity.Error,source:d.source,code:d.code===undefined?undefined:String(d.code)})));
    problems.replaceChildren();
    for(const d of diagnostics.slice(0,12)){
      const button=document.createElement('button');button.type='button';button.className=d.severity===1||d.severity===undefined?'source-problem-error':'source-problem-warning';button.textContent=`${d.range.start.line+1}:${d.range.start.character+1} ${d.message}`;
      button.onclick=()=>{editor.setPosition({lineNumber:d.range.start.line+1,column:d.range.start.character+1});editor.revealLineInCenter(d.range.start.line+1);editor.focus();};problems.append(button);
    }
    updateStatus(`Modelica · Rumoca language server ready · ${diagnostics.length} diagnostic${diagnostics.length===1?'':'s'}`);
  };
  const flushChange=()=>{
    if(changeTimer)clearTimeout(changeTimer);
    if(client&&opened&&model.getVersionId()>lastSentVersion){
      lastSentVersion=model.getVersionId();
      client.notify('textDocument/didChange',{textDocument:{uri:model.uri.toString(),version:lastSentVersion},contentChanges:[{text:model.getValue()}]});
    }
  };
  const changed=()=>{
    if(changeTimer)clearTimeout(changeTimer);
    changeTimer=setTimeout(flushChange,120);
  };
  const input=()=>{if(!mutating)api.syncFromTextarea();};textarea.addEventListener('input',input);
  const content=editor.onDidChangeModelContent(()=>{
    if(!mutating){mutating=true;textarea.value=model.getValue();textarea.dispatchEvent(new Event('input',{bubbles:true}));mutating=false;onChange?.();}
    changed();
  });
  async function startServer(token:number){
    const uri=model.uri.toString(),currentLanguage=language;
    const options={base:new URL(import.meta.env.BASE_URL,location.href).pathname};
    const factory=factories.get(language);
    if(!factory){updateStatus('Built-in rendering or transport node');return;}
    updateStatus('Starting Modelica language server…');
    const connection=new LspClient(factory(),{});client=connection;
    connection.onError=message=>{if(token===generation)updateStatus(`${currentLanguage} language server: ${message}`);};
    connection.onDiagnostics=(documentUri,values,version)=>{
      if(token!==generation||documentUri!==model.uri.toString()||version!==undefined&&version<model.getVersionId())return;
      diagnostics=values;displayProblems();
    };
    await connection.initialize(options);if(token!==generation)return;
    connection.notify('workspace/didChangeConfiguration',{settings:{modelica:{workspaceSources}}});
    connection.notify('textDocument/didOpen',{textDocument:{uri,languageId:language,version:model.getVersionId(),text:model.getValue()}});
    opened=true;lastSentVersion=model.getVersionId();
    const legend=connection.capabilities.semanticTokensProvider?.legend;
    if(legend)semantic=monaco.languages.registerDocumentSemanticTokensProvider(language,{getLegend:()=>legend,async provideDocumentSemanticTokens(requestedModel){
      if(requestedModel!==model)return null;
      const result=await connection.request('textDocument/semanticTokens/full',{textDocument:{uri}}).catch(()=>null);
      return result?{data:Uint32Array.from(result.data),resultId:result.resultId}:null;
    },releaseDocumentSemanticTokens:()=>{}});
    displayProblems();
  }
  const api:SourceEditor={
    setWorkspaceSources(sources,activePath){
      // The compiler's current document owns the active file; companions must
      // exclude it so the same class is not declared twice in its workspace.
      const next=Object.fromEntries(Object.entries(sources??{}).filter(([path])=>path!==activePath));
      const keys=Object.keys(next);
      if(keys.length===Object.keys(workspaceSources).length&&keys.every(path=>next[path]===workspaceSources[path]))return;
      workspaceSources=next;
      workspaceGeneration++;
      if(client&&opened)client.notify('workspace/didChangeConfiguration',{settings:{modelica:{workspaceSources}}});
    },
    setLanguage(value){
      if(value===language){api.syncFromTextarea();return;}
      generation++;opened=false;if(changeTimer)clearTimeout(changeTimer);semantic?.dispose();semantic=undefined;
      if(client){client.notify('textDocument/didClose',{textDocument:{uri:model.uri.toString()}});client.dispose();client=undefined;}
      activeEditors.delete(model.uri.toString());model.dispose();language=value;diagnostics=[];
      model=monaco.editor.createModel(textarea.value,language,monaco.Uri.parse(`file:///workspace/source-${id}.${language==='modelica'?'mo':'txt'}`));editor.setModel(model);activeEditors.set(model.uri.toString(),api);editor.updateOptions({readOnly:textarea.readOnly});problems.replaceChildren();
      const token=generation;ready=startServer(token).catch(error=>{if(token===generation)updateStatus(`${language} language server: ${error instanceof Error?error.message:String(error)}`);});
    },
    syncFromTextarea(){editor.updateOptions({readOnly:textarea.readOnly});if(model.getValue()!==textarea.value){mutating=true;model.setValue(textarea.value);mutating=false;}},
    get ready(){return ready;},get language(){return language;},get status(){return status;},editor,
    getDiagnostics:()=>diagnostics.map(d=>({...d})),
    async checkModel(source,model,sources){
      await ready;if(!client)throw new Error('Rumoca language server is unavailable');
      return client.request('modelica/checkModel',{source,model,sources});
    },
    async documentation<T>(sources:Readonly<Record<string,string>>,name?:string):Promise<T>{
      if(!documentationClient){
        documentationClient=new LspClient(new Worker(new URL('./modelica-lsp.worker.ts',import.meta.url),{type:'module'}));
        documentationReady=documentationClient.initialize({base:new URL(import.meta.env.BASE_URL,location.href).pathname});
      }
      await documentationReady;
      return documentationClient.request<T>('modelica/documentation',{sources,name});
    },
    async simulationModels(source,defaultModel,workspaceSources){
      await ready;
      if(!client)throw new Error('Rumoca language server is unavailable');
      const result=await client.request('modelica/simulationModels',{source,defaultModel,workspaceSources});
      if(!result?.ok||!Array.isArray(result.models)||result.models.some((name:unknown)=>typeof name!=='string'))
        throw new Error(result?.error??'Rumoca returned an invalid model list');
      return result.models;
    },
    async requestCompletion(p){const token=generation,version=model.getVersionId(),context=workspaceGeneration;
      const current=()=>token===generation&&version===model.getVersionId()&&context===workspaceGeneration;
      await ready;if(!current())return [];flushChange();if(!client)return [];
      const result=await client.request('textDocument/completion',{textDocument:{uri:model.uri.toString()},position:p});
      if(!current())return [];return Array.isArray(result)?result:result?.items??[];
    },
    async requestHover(p){const token=generation,version=model.getVersionId(),context=workspaceGeneration;
      const current=()=>token===generation&&version===model.getVersionId()&&context===workspaceGeneration;
      await ready;if(!current())return null;flushChange();
      const result=await client?.request('textDocument/hover',{textDocument:{uri:model.uri.toString()},position:p});
      return current()?result??null:null;
    },
    dispose(){generation++;if(changeTimer)clearTimeout(changeTimer);client?.dispose();documentationClient?.dispose();semantic?.dispose();content.dispose();textarea.removeEventListener('input',input);activeEditors.delete(model.uri.toString());model.dispose();editor.dispose();shell.before(textarea);shell.remove();textarea.classList.remove('source-editor-compat');textarea.tabIndex=originalTabIndex;}
  };
  activeEditors.set(model.uri.toString(),api);api.setLanguage('modelica');return api;
}
