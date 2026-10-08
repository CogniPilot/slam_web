import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import {AssistantAgent,type AssistantHost,type EditProposal} from './assistant-agent';
import './assistant.css';

/** Provider credentials and conversations stay in this page's memory. */
export function createAssistantPanel(host:AssistantHost){
  const element=document.createElement('section');element.className='assistant-panel';
  element.innerHTML=`<h2>Algorithm assistant</h2><p>Connect a provider that supports OpenAI-compatible tools. Source and diagnostics are sent to your chosen provider when requested. Credentials last until this page closes.</p><form class="assistant-connect"><label>Provider <select aria-label="Assistant provider"><option value="openai">OpenAI API key</option><option value="local">Local Ollama</option><option value="custom">Compatible endpoint</option></select></label><label>API base URL <input aria-label="Assistant endpoint" value="https://api.openai.com/v1" type="url" required></label><label>Model <input aria-label="Assistant model" placeholder="Provider model ID" required></label><label>API key <input aria-label="Assistant API key" type="password" autocomplete="off" spellcheck="false"></label><button type="button" class="assistant-forget">Forget key & conversation</button></form><p>ChatGPT account sign-in and Claude's native API are not connected here. Local Ollama needs a tool-capable model and OLLAMA_ORIGINS set to this site's origin.</p><div class="assistant-log" role="log" aria-label="Assistant conversation" aria-live="polite"></div><form class="assistant-prompt"><label>Ask about your algorithm <textarea aria-label="Assistant prompt" required rows="3" placeholder="Inspect the current algorithm and suggest an improvement"></textarea></label><div><button class="primary" type="submit">Send</button><button type="button" class="assistant-stop" disabled>Stop</button></div></form><p class="assistant-status" role="status"></p><div class="assistant-proposals"></div>`;
  const find=<T extends HTMLElement>(selector:string)=>element.querySelector<T>(selector)!;
  const provider=find<HTMLSelectElement>('select'),endpoint=find<HTMLInputElement>('[aria-label="Assistant endpoint"]'),model=find<HTMLInputElement>('[aria-label="Assistant model"]'),key=find<HTMLInputElement>('[type="password"]');
  const log=find<HTMLDivElement>('.assistant-log'),status=find<HTMLParagraphElement>('.assistant-status'),proposals=find<HTMLDivElement>('.assistant-proposals'),send=find<HTMLButtonElement>('[type="submit"]'),stop=find<HTMLButtonElement>('.assistant-stop'),forget=find<HTMLButtonElement>('.assistant-forget');
  const views=new Map<number,{element:HTMLElement;accept:HTMLButtonElement;reject:HTMLButtonElement;diff:monaco.editor.IStandaloneDiffEditor;models:monaco.editor.ITextModel[]}>();
  function proposalView(proposal:EditProposal){
    const card=document.createElement('section');card.className='assistant-proposal';
    const title=document.createElement('h3');title.textContent=proposal.path;
    const reason=document.createElement('p');reason.textContent=proposal.reason;
    const diffElement=document.createElement('div');diffElement.className='assistant-diff';diffElement.setAttribute('aria-label',`Proposed edit to ${proposal.path}`);
    const accept=document.createElement('button');accept.textContent='Accept edit';
    const reject=document.createElement('button');reject.textContent='Reject';
    card.append(title,reason,diffElement,accept,reject);proposals.append(card);
    const models=[monaco.editor.createModel(proposal.before,'modelica'),monaco.editor.createModel(proposal.after,'modelica')];
    const diff=monaco.editor.createDiffEditor(diffElement,{readOnly:true,originalEditable:false,automaticLayout:true,renderSideBySide:false,minimap:{enabled:false},theme:'slam-lab',scrollBeyondLastLine:false});
    diff.setModel({original:models[0],modified:models[1]});
    accept.onclick=()=>{try{agent.accept(proposal);status.textContent='Edit accepted. Check diagnostics and build before running.';}catch(error){status.textContent=String(error);}};
    reject.onclick=()=>agent.reject(proposal);
    views.set(proposal.id,{element:card,accept,reject,diff,models});
  }
  const agent=new AssistantAgent(host,()=>{
    send.disabled=agent.busy;stop.disabled=!agent.busy;forget.disabled=agent.busy;
    provider.disabled=endpoint.disabled=model.disabled=key.disabled=agent.busy;
    log.replaceChildren();
    for(const message of agent.messages){
      const line=document.createElement('p');
      line.textContent=message.role==='tool'?'Tool result received':message.role==='assistant'&&message.tool_calls?.length?`${message.content??''}\nTools: ${message.tool_calls.map(call=>call.function?.name??'unknown').join(', ')}`:`${message.role==='user'?'You':'Assistant'}: ${message.content??''}`;
      log.append(line);
    }
    for(const proposal of agent.proposals){
      if(!views.has(proposal.id))proposalView(proposal);
      const view=views.get(proposal.id)!;view.accept.disabled=view.reject.disabled=agent.busy||proposal.state!=='pending';
      view.accept.textContent=proposal.state==='accepted'?'Accepted':proposal.state==='rejected'?'Rejected':'Accept edit';
    }
  });
  provider.onchange=()=>{
    key.value='';endpoint.value=provider.value==='openai'?'https://api.openai.com/v1':provider.value==='local'?'http://localhost:11434/v1':'';
    model.value='';
  };
  forget.onclick=()=>{key.value='';agent.clear();for(const view of views.values()){view.diff.dispose();view.models.forEach(model=>model.dispose());}views.clear();proposals.replaceChildren();status.textContent='Key and conversation forgotten.';};
  stop.onclick=()=>agent.cancel();
  find<HTMLFormElement>('.assistant-connect').onsubmit=event=>event.preventDefault();
  find<HTMLFormElement>('.assistant-prompt').onsubmit=async event=>{
    event.preventDefault();const prompt=find<HTMLTextAreaElement>('[aria-label="Assistant prompt"]');if(!prompt.value.trim())return;
    status.textContent='Working…';const text=prompt.value;prompt.value='';
    try{await agent.send(text,{endpoint:endpoint.value,model:model.value,key:key.value});status.textContent='Ready. Review proposed edits before accepting.';}
    catch(error){status.textContent=error instanceof DOMException&&error.name==='AbortError'?'Stopped.':`${String(error)} If a local connection fails, enable this origin in OLLAMA_ORIGINS and check browser local-network permissions.`;}
  };
  return {element,agent,dispose(){agent.cancel();for(const view of views.values()){view.diff.dispose();view.models.forEach(model=>model.dispose());}}};
}
