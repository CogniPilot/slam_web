import {LOOP_CLOSURE_PARAMETERS,DEFAULT_LOOP_CLOSURE_SETTINGS,checkedLoopClosureSettings,type LoopClosureSettings} from './loop-closure-settings';

export function mountLoopClosureSettings(container:HTMLElement,options:{settings:()=>LoopClosureSettings|undefined;onApply:(settings:LoopClosureSettings)=>Promise<void>}){
  const section=document.createElement('section');section.id='loop-closure-settings';
  const heading=document.createElement('h2');heading.textContent='Loop closure tuning';
  const help=document.createElement('p');help.textContent='Tune appearance retrieval, geometric verification and keyframe capture. Apply pauses at a completed frame and keeps the current map.';
  const form=document.createElement('form'),fields=document.createElement('div');fields.className='loop-tuning-fields';
  const inputs=new Map<string,HTMLInputElement>();
  for(const field of LOOP_CLOSURE_PARAMETERS){
    const label=document.createElement('label');label.textContent=field.label;
    const input=document.createElement('input');input.type=typeof field.value==='boolean'?'checkbox':'number';input.name=field.key;input.id=`tuning-${field.key}`;
    if('min' in field){input.min=String(field.min);input.max=String(field.max);input.step='any';input.required=true;}
    input.setAttribute('aria-label',field.label);input.setAttribute('aria-describedby',`${input.id}-help`);
    const description=document.createElement('small');description.id=`${input.id}-help`;description.textContent=field.help;
    label.append(input,description);inputs.set(field.key,input);fields.append(label);
  }
  const actions=document.createElement('div');actions.className='loop-tuning-actions';
  const apply=document.createElement('button');apply.type='submit';apply.textContent='Apply tuning';
  const defaults=document.createElement('button');defaults.type='button';defaults.textContent='Restore defaults';
  const status=document.createElement('p');status.setAttribute('role','status');
  actions.append(apply,defaults);form.append(fields,actions,status);section.append(heading,help,form);container.append(section);
  let pending=false,busy=false,lastSaved='';
  const draft=()=>checkedLoopClosureSettings(Object.fromEntries([...inputs].map(([key,input])=>[key,input.type==='checkbox'?input.checked:input.valueAsNumber])));
  function setBusy(value:boolean){busy=value;for(const input of inputs.values())input.disabled=pending||busy;apply.disabled=defaults.disabled=pending||busy;}
  function fill(settings:LoopClosureSettings){for(const [key,input] of inputs){if(input.type==='checkbox')input.checked=settings[key as keyof LoopClosureSettings]===true;else input.value=String(settings[key as keyof LoopClosureSettings]);}}
  function sync(){const settings=checkedLoopClosureSettings(options.settings());const saved=JSON.stringify(settings);if(saved!==lastSaved){fill(settings);lastSaved=saved;}}
  defaults.onclick=()=>{fill({...DEFAULT_LOOP_CLOSURE_SETTINGS});status.textContent='Defaults ready. Apply tuning to use them.';};
  form.onsubmit=async event=>{
    event.preventDefault();if(pending||busy)return;
    let settings:LoopClosureSettings;
    try{settings=draft();}catch(error){status.textContent=String(error instanceof Error?error.message:error);return;}
    pending=true;setBusy(busy);status.textContent='Applying tuning…';
    try{await options.onApply(settings);sync();status.textContent='Tuning saved for RGB-D SLAM. Press Run to continue.';}
    catch(error){status.textContent=String(error instanceof Error?error.message:error);}
    finally{pending=false;setBusy(busy);}
  };
  sync();
  return {sync,setBusy,focus(){section.scrollIntoView({block:'start'});inputs.values().next().value?.focus();}};
}
