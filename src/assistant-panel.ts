import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import {AssistantAgent,type AssistantHost,type EditProposal} from './assistant-agent';
import {BrowserAssistant,localAssistantModels} from './assistant-local';
import './assistant.css';

/** Provider credentials and conversations stay in this page's memory. */
export function createAssistantPanel(host:AssistantHost){
  const element=document.createElement('section');element.className='assistant-panel';
  element.innerHTML=`<h2>Algorithm assistant</h2><p>Explore Modelica files, review proposed edits, check compilation and run short simulations.</p><form class="assistant-connect"><label>Provider <select aria-label="Assistant provider"><option value="openai">OpenAI API key</option><option value="webllm">WebLLM · on this device</option><option value="local">Local Ollama</option><option value="custom">Compatible endpoint</option></select></label><label>API base URL <input aria-label="Assistant endpoint" value="https://api.openai.com/v1" type="url" required></label><label>Model <input aria-label="Assistant model" value="gpt-6.1-sol" placeholder="Provider model ID" required></label><label hidden>Local model <select aria-label="Assistant local model"></select></label><label hidden>API <select aria-label="Assistant API"><option value="responses">Responses</option><option value="chat">Chat Completions</option></select></label><label>Reasoning <select aria-label="Assistant reasoning"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select></label><label>API key <input aria-label="Assistant API key" type="password" autocomplete="off" spellcheck="false"></label><button type="button" class="assistant-forget">Forget key & conversation</button><button type="button" class="assistant-unload" hidden>Unload local model</button></form><p class="assistant-provider-help"></p><div class="assistant-log" role="log" aria-label="Assistant conversation" aria-live="polite"></div><form class="assistant-prompt"><label>Ask about your algorithm <textarea aria-label="Assistant prompt" required rows="3" placeholder="Inspect the current algorithm and suggest an improvement"></textarea></label><div><button class="primary" type="submit">Send</button><button type="button" class="assistant-stop" disabled>Stop</button></div></form><p class="assistant-status" role="status"></p><div class="assistant-proposals"></div>`;
  const find=<T extends HTMLElement>(selector:string)=>element.querySelector<T>(selector)!;
  const provider=find<HTMLSelectElement>('select'),endpoint=find<HTMLInputElement>('[aria-label="Assistant endpoint"]'),model=find<HTMLInputElement>('[aria-label="Assistant model"]'),key=find<HTMLInputElement>('[type="password"]');
  const log=find<HTMLDivElement>('.assistant-log'),status=find<HTMLParagraphElement>('.assistant-status'),proposals=find<HTMLDivElement>('.assistant-proposals'),send=find<HTMLButtonElement>('[type="submit"]'),stop=find<HTMLButtonElement>('.assistant-stop'),forget=find<HTMLButtonElement>('.assistant-forget');
  const localModel=find<HTMLSelectElement>('[aria-label="Assistant local model"]'),api=find<HTMLSelectElement>('[aria-label="Assistant API"]'),reasoning=find<HTMLSelectElement>('[aria-label="Assistant reasoning"]'),unload=find<HTMLButtonElement>('.assistant-unload');
  for(const item of localAssistantModels)localModel.add(new Option(item.label,item.id));
  const local=new BrowserAssistant(text=>{status.textContent=text;});
  function providerControls(){
    const browser=provider.value==='webllm',responses=provider.value==='openai'||(provider.value==='custom'&&api.value==='responses');
    for(const input of [endpoint,model,key]){input.closest('label')!.hidden=browser;input.disabled=browser||agent.busy;}
    localModel.closest('label')!.hidden=!browser;localModel.disabled=agent.busy;
    api.closest('label')!.hidden=provider.value!=='custom';api.disabled=agent.busy;
    reasoning.closest('label')!.hidden=!responses;reasoning.disabled=agent.busy;
    unload.hidden=!browser;unload.disabled=agent.busy;
    find('.assistant-provider-help').textContent=browser?'Runs on your WebGPU device without API billing. First Send downloads a small model and caches its weights. About 1–2 GB of GPU memory is needed; some phones cannot fit it. Simulation pauses during inference. Small models may need simpler requests.':provider.value==='local'?'Ollama needs a tool-capable model and OLLAMA_ORIGINS set to this site’s origin. Source and diagnostics are sent only when tools request them.':'Source and diagnostics are sent to your chosen provider when tools request them. Credentials and conversation stay in page memory. ChatGPT subscriptions do not cover API usage.';
  }
  const views=new Map<number,{element:HTMLElement;accept:HTMLButtonElement;reject:HTMLButtonElement;undo:HTMLButtonElement;diff:monaco.editor.IStandaloneDiffEditor;models:monaco.editor.ITextModel[]}>();
  function proposalView(proposal:EditProposal){
    const card=document.createElement('section');card.className='assistant-proposal';
    const title=document.createElement('h3');title.textContent=proposal.path;
    const reason=document.createElement('p');reason.textContent=proposal.reason;
    const diffElement=document.createElement('div');diffElement.className='assistant-diff';diffElement.setAttribute('aria-label',`Proposed edit to ${proposal.path}`);
    const accept=document.createElement('button');accept.textContent='Accept edit';
    const reject=document.createElement('button');reject.textContent='Reject';
    const undo=document.createElement('button');undo.textContent='Undo edit';
    card.append(title,reason,diffElement,accept,reject,undo);proposals.append(card);
    const models=[monaco.editor.createModel(proposal.before,'modelica'),monaco.editor.createModel(proposal.after,'modelica')];
    const diff=monaco.editor.createDiffEditor(diffElement,{readOnly:true,originalEditable:false,automaticLayout:true,renderSideBySide:false,minimap:{enabled:false},theme:'slam-lab',scrollBeyondLastLine:false});
    diff.setModel({original:models[0],modified:models[1]});
    accept.onclick=()=>{try{agent.accept(proposal);status.textContent='Edit accepted. Check diagnostics and build before running.';}catch(error){status.textContent=String(error);}};
    reject.onclick=()=>agent.reject(proposal);
    undo.onclick=()=>{try{agent.undo(proposal);status.textContent='Edit undone. Simulation paused; rebuild before running.';}catch(error){status.textContent=String(error);}};
    views.set(proposal.id,{element:card,accept,reject,undo,diff,models});
  }
  const agent=new AssistantAgent(host,()=>{
    send.disabled=agent.busy;stop.disabled=!agent.busy;forget.disabled=agent.busy;
    provider.disabled=agent.busy;providerControls();
    log.replaceChildren();
    for(const message of agent.messages){
      const line=document.createElement('p');
      line.textContent=message.role==='tool'?`Tool result: ${(message.content??'').slice(0,1500)}${(message.content?.length??0)>1500?'…':''}`:message.role==='assistant'&&message.tool_calls?.length?`${message.content??''}\nTools: ${message.tool_calls.map(call=>call.function?.name??'unknown').join(', ')}`:`${message.role==='user'?'You':'Assistant'}: ${message.content??''}`;
      log.append(line);
    }
    for(const proposal of agent.proposals){
      if(!views.has(proposal.id))proposalView(proposal);
      const view=views.get(proposal.id)!;view.accept.disabled=view.reject.disabled=agent.busy||proposal.state!=='pending';
      view.undo.hidden=proposal.state!=='accepted';view.undo.disabled=agent.busy;
      view.accept.textContent=proposal.state==='accepted'?'Accepted':proposal.state==='rejected'?'Rejected':proposal.state==='undone'?'Undone':'Accept edit';
    }
  },local);
  provider.onchange=()=>{
    local.dispose();forgetConversation();
    endpoint.value=provider.value==='openai'?'https://api.openai.com/v1':provider.value==='local'?'http://localhost:11434/v1':'';
    model.value=provider.value==='openai'?'gpt-6.1-sol':'';api.value=provider.value==='custom'?'chat':'responses';providerControls();
  };
  api.onchange=providerControls;
  function forgetConversation(){key.value='';agent.clear();for(const view of views.values()){view.diff.dispose();view.models.forEach(model=>model.dispose());}views.clear();proposals.replaceChildren();status.textContent='Key and conversation forgotten.';}
  forget.onclick=()=>{local.dispose();forgetConversation();};
  unload.onclick=()=>{local.dispose();status.textContent='Local model unloaded. Cached weights remain available.';};
  stop.onclick=()=>agent.cancel();
  find<HTMLFormElement>('.assistant-connect').onsubmit=event=>event.preventDefault();
  find<HTMLFormElement>('.assistant-prompt').onsubmit=async event=>{
    event.preventDefault();const prompt=find<HTMLTextAreaElement>('[aria-label="Assistant prompt"]');if(!prompt.value.trim())return;
    status.textContent='Working…';const text=prompt.value;prompt.value='';
    const browser=provider.value==='webllm',responses=provider.value==='openai'||(provider.value==='custom'&&api.value==='responses');
    try{await agent.send(text,{provider:provider.value as 'openai'|'local'|'custom'|'webllm',endpoint:endpoint.value,model:browser?localModel.value:model.value,key:browser?'':key.value,api:responses?'responses':'chat',...(responses?{reasoning:reasoning.value as 'low'|'medium'|'high'}:{})});status.textContent='Done. Source changes and tool results are shown below; applied edits have Undo.';}
    catch(error){status.textContent=error instanceof DOMException&&error.name==='AbortError'?'Stopped.':`${String(error)}${provider.value==='local'?' Check OLLAMA_ORIGINS and browser local-network permissions.':''}`;}
  };
  providerControls();
  return {element,agent,dispose(){agent.cancel();local.dispose();for(const view of views.values()){view.diff.dispose();view.models.forEach(model=>model.dispose());}}};
}
