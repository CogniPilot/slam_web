import {checkedParameterValues,type ModelParameter,type ParameterValues} from './model-parameters';
import './model-parameters.css';

export interface ParameterTarget {id:string;label:string;native?:boolean}
export interface ParameterPanelHost {
  targets:()=>ParameterTarget[];
  load:(id:string)=>Promise<{fields:ModelParameter[];version:string}>;
  values:(id:string)=>ParameterValues;
  apply:(id:string,values:ParameterValues,version:string)=>Promise<string>;
  source:(id:string)=>void;
}

export function mountModelParameters(host:ParameterPanelHost){
  const element=document.createElement('div');element.className='model-parameters';
  const heading=document.createElement('h2');heading.textContent='Model parameters';
  const introduction=document.createElement('p');introduction.textContent='Modelica defines these settings, their units and limits. Expand a component or search by parameter name or description.';
  const selector=document.createElement('select');selector.setAttribute('aria-label','Parameter model');
  const search=document.createElement('input');search.type='search';search.placeholder='Find a parameter…';search.setAttribute('aria-label','Find a parameter');
  const modified=document.createElement('input');modified.type='checkbox';modified.setAttribute('aria-label','Modified parameters only');
  const modifiedLabel=document.createElement('label');modifiedLabel.className='parameter-modified-filter';modifiedLabel.append(modified,'Modified only');
  const refresh=document.createElement('button');refresh.textContent='Refresh';
  const source=document.createElement('button');source.textContent='Open Modelica source';
  const tools=document.createElement('div');tools.className='parameter-tools';tools.append(selector,search,modifiedLabel,refresh,source);
  const count=document.createElement('p');count.className='parameter-count';
  const fieldsElement=document.createElement('div');fieldsElement.className='parameter-groups';
  const form=document.createElement('form'),actions=document.createElement('div');actions.className='parameter-actions';
  const apply=document.createElement('button');apply.type='submit';
  const defaults=document.createElement('button');defaults.type='button';defaults.textContent='Restore model defaults';
  const status=document.createElement('p');status.setAttribute('role','status');
  actions.append(apply,defaults);form.append(count,fieldsElement,actions,status);element.append(heading,introduction,tools,form);
  let busy=false,pending=false,request=0,fields:ModelParameter[]=[],version='',active='',draft:Record<string,string|number>={};
  const expanded=new Map<string,boolean>();
  function setBusy(value:boolean){busy=value;const locked=busy||pending;selector.disabled=refresh.disabled=source.disabled=defaults.disabled=apply.disabled=locked||!fields.length;
    if(!pending)selector.disabled=refresh.disabled=busy;
    source.disabled=locked||!active;
    for(const input of Array.from(fieldsElement.querySelectorAll<HTMLInputElement>('input')))input.disabled=locked||!!fields.find(field=>field.name===input.name)?.readOnly;
  }
  function render(){
    const query=search.value.trim().toLowerCase(),groups=new Map<string,ModelParameter[]>();
    const changed=fields.filter(field=>draft[field.name]!==field.defaultValue);
    const visible=fields.filter(field=>(!modified.checked||changed.includes(field))&&(!query||[field.name,field.description,field.group,field.unit].some(text=>text?.toLowerCase().includes(query))));
    for(const field of visible){const group=field.group??'General';if(!groups.has(group))groups.set(group,[]);groups.get(group)!.push(field);}
    count.textContent=`${fields.length} parameters · ${changed.length} modified${visible.length!==fields.length?` · ${visible.length} shown`:''}`;
    fieldsElement.replaceChildren();
    for(const [group,items]of groups){
      const section=document.createElement('details');section.open=!!query||(expanded.get(group)??(group==='General'||groups.size===1));
      const summary=document.createElement('summary');summary.textContent=`${group} · ${items.length}`;
      section.ontoggle=()=>{if(!query)expanded.set(group,section.open);};
      const grid=document.createElement('div');grid.className='parameter-fields';
      for(const field of items){
        const label=document.createElement('label');label.className='model-parameter';label.dataset.parameter=field.name;
        const title=document.createElement('span');title.textContent=(field.label??field.name)+(field.unit?` (${field.unit})`:'');
        const name=document.createElement('code');name.textContent=field.name;
        const input=document.createElement('input');input.name=field.name;input.setAttribute('aria-label',field.name);
        input.type=field.type==='Boolean'?'checkbox':field.type==='String'?'text':'number';
        if(input.type==='checkbox')input.checked=draft[field.name]===1;else input.value=String(draft[field.name]??'');
        if(input.type==='number'){input.step=field.type==='Integer'?'1':'any';input.required=true;if(field.minValue!=null)input.min=String(field.minValue);if(field.maxValue!=null)input.max=String(field.maxValue);}
        input.disabled=busy||pending||!!field.readOnly;
        input.oninput=()=>{draft[field.name]=input.type==='checkbox'?(input.checked?1:0):input.type==='number'?input.valueAsNumber:input.value;count.textContent=`${fields.length} parameters · ${fields.filter(field=>draft[field.name]!==field.defaultValue).length} modified`;};
        const help=document.createElement('small');help.textContent=[field.description,`Default: ${field.type==='Boolean'?field.defaultValue===1?'true':'false':field.defaultValue}`,field.readOnly].filter(Boolean).join(' · ');
        label.append(title,name,input,help);grid.append(label);
      }
      section.append(summary,grid);fieldsElement.append(section);
    }
    if(!visible.length){const empty=document.createElement('p');empty.textContent=fields.length?'No matching parameters.':'This model exposes no tunable parameters.';fieldsElement.append(empty);}
    apply.textContent=host.targets().find(target=>target.id===active)?.native?'Apply parameters':'Apply & reset';setBusy(busy);
  }
  async function load(id:string){
    const token=++request;active=id;selector.value=id;pending=true;setBusy(busy);status.textContent='Reading Modelica parameters…';
    try{
      const result=await host.load(id);if(token!==request)return;
      fields=result.fields;version=result.version;draft=Object.fromEntries(fields.map(field=>[field.name,field.defaultValue]));Object.assign(draft,host.values(id));
      status.textContent=host.targets().find(target=>target.id===id)?.native?'Apply pauses at a completed frame and retains the map.':'Applying Modelica parameters recompiles and resets the simulation.';
    }catch(error){if(token!==request)return;fields=[];status.textContent=error instanceof Error?error.message:String(error);}
    finally{if(token===request){pending=false;render();}}
  }
  function syncTargets(){
    const targets=host.targets();selector.replaceChildren(...targets.map(target=>new Option(target.label,target.id)));
    if(!targets.some(target=>target.id===active))active=targets[0]?.id??'';selector.value=active;
  }
  selector.onchange=()=>{void load(selector.value);};refresh.onclick=()=>{void load(active);};source.onclick=()=>host.source(active);
  search.oninput=modified.onchange=()=>render();
  defaults.onclick=()=>{draft=Object.fromEntries(fields.map(field=>[field.name,field.defaultValue]));render();status.textContent='Model defaults ready. Apply to activate them.';};
  form.onsubmit=async event=>{
    event.preventDefault();if(pending||busy)return;
    try{
      const values=checkedParameterValues(fields,Object.fromEntries(fields.filter(field=>!field.readOnly&&draft[field.name]!==field.defaultValue).map(field=>[field.name,field.type==='String'?String(draft[field.name]):Number(draft[field.name])])));
      pending=true;setBusy(busy);status.textContent='Applying model parameters…';
      status.textContent=await host.apply(active,values,version);
    }catch(error){status.textContent=error instanceof Error?error.message:String(error);}
    finally{pending=false;setBusy(busy);}
  };
  syncTargets();
  return {element,setBusy,async show(id?:string){syncTargets();await load(id??active);},sync(){syncTargets();}};
}
