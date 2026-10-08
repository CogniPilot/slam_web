export interface ModelicaClass {
  name:string;
  qualified_name:string;
  class_type:string;
  children:ModelicaClass[];
}
export interface ModelicaClassInfo {
  qualified_name:string;
  class_type:string;
  description:string|null;
  documentation_html:string|null;
  documentation_revisions_html:string|null;
  source_modelica:string;
  components:{name:string;type_name:string;variability:string;causality:string;description:string|null}[];
}
export interface ModelicaDocsHost {
  sources:()=>Readonly<Record<string,string>>;
  request:<T>(sources:Readonly<Record<string,string>>,name?:string)=>Promise<T>;
  openSource:(path:string)=>void;
}

export function flattenClasses(classes:readonly ModelicaClass[]):ModelicaClass[]{
  return classes.flatMap(item=>[item,...flattenClasses(item.children)]);
}

export function documentationSource(name:string,paths:readonly string[]):string|undefined{
  for(let parts=name.split('.');parts.length;parts.pop()){
    const suffix=parts.join('/');
    const match=paths.find(path=>path.endsWith('/'+suffix+'.mo')||path.endsWith('/'+suffix+'/package.mo'));
    if(match)return match;
  }
}

// Modelica help may come from an edited project. Keep formatting, never executable markup.
export function documentationFragment(html:string,document:Document):DocumentFragment{
  const template=document.createElement('template');template.innerHTML=html;
  const allowed=new Set('p div span h1 h2 h3 h4 h5 h6 ul ol li dl dt dd table thead tbody tfoot tr th td caption pre code blockquote strong em b i u sub sup br hr a html body'.split(' '));
  const blocked=new Set(['script','style','iframe','object','embed','svg','math','form','input','button','img','link','meta']);
  function copy(source:Node,target:Node){
    if(source.nodeType===3){target.appendChild(document.createTextNode(source.textContent??''));return;}
    if(source.nodeType!==1)return;
    const element=source as Element,tag=element.localName.toLowerCase();
    if(blocked.has(tag))return;
    let destination=target;
    if(allowed.has(tag)&&tag!=='html'&&tag!=='body'){
      const clean=document.createElement(tag);
      if(tag==='a'){
        const href=element.getAttribute('href')??'';
        if(/^modelica:\/\/[A-Za-z_]\w*(\.[A-Za-z_]\w*)*$/.test(href))clean.dataset.modelicaClass=href.slice(11);
        else if(/^https?:\/\//i.test(href)){clean.setAttribute('href',href);clean.setAttribute('target','_blank');clean.setAttribute('rel','noopener noreferrer');}
        if(clean.dataset.modelicaClass){clean.setAttribute('href','#');}
      }
      if(tag==='th'||tag==='td')for(const key of ['colspan','rowspan']){
        const value=element.getAttribute(key);if(value&&/^[1-9]\d?$/.test(value))clean.setAttribute(key,value);
      }
      target.appendChild(clean);destination=clean;
    }
    source.childNodes.forEach(child=>copy(child,destination));
  }
  const fragment=document.createDocumentFragment();template.content.childNodes.forEach(child=>copy(child,fragment));return fragment;
}

export function createModelicaDocs(host:ModelicaDocsHost){
  const element=document.createElement('section');element.className='modelica-docs';
  element.innerHTML='<div class="docs-toolbar"><input type="search" aria-label="Find a Modelica class" placeholder="Find a class or package…"><button type="button">Refresh</button></div><p class="docs-status" role="status">Open Docs to browse the Modelica library.</p><div class="docs-body"><nav aria-label="Modelica documentation classes"></nav><article aria-label="Modelica class documentation"></article></div>';
  const search=element.querySelector('input')!,refresh=element.querySelector('button')!;
  const status=element.querySelector<HTMLElement>('.docs-status')!,listing=element.querySelector('nav')!,article=element.querySelector('article')!;
  let classes:ModelicaClass[]=[],sources:Readonly<Record<string,string>>={},selected='',generation=0,loadGeneration=0;
  function render(){
    const query=search.value.trim().toLowerCase();listing.replaceChildren();
    for(const item of classes.filter(item=>item.qualified_name.toLowerCase().includes(query))){
      const button=document.createElement('button');button.type='button';button.textContent=item.qualified_name;
      button.title=item.class_type;button.setAttribute('aria-label',`Documentation for ${item.qualified_name}`);
      if(selected===item.qualified_name)button.setAttribute('aria-current','page');
      button.onclick=()=>{void show(item.qualified_name);};listing.append(button);
    }
    if(!listing.childElementCount)listing.textContent='No matching classes';
  }
  async function show(name:string){
    const token=++generation;selected=name;render();article.replaceChildren();status.textContent=`Loading ${name}…`;
    try{
      const info=await host.request<ModelicaClassInfo>(sources,name);if(token!==generation)return;
      const title=document.createElement('h2');title.textContent=info.qualified_name;
      const summary=document.createElement('p');summary.textContent=info.description??info.class_type;
      article.append(title,summary);
      if(info.documentation_html)article.append(documentationFragment(info.documentation_html,document));
      else{const empty=document.createElement('p');empty.textContent='This class has no Documentation annotation.';article.append(empty);}
      if(info.components.length){
        const heading=document.createElement('h3');heading.textContent='Components';article.append(heading);
        const table=document.createElement('table');const header=table.createTHead().insertRow();
        for(const label of ['Name','Type','Description']){const cell=document.createElement('th');cell.textContent=label;header.append(cell);}
        const body=table.createTBody();
        for(const component of info.components){
          const row=body.insertRow();
          for(const value of [component.name,[component.causality,component.variability,component.type_name].filter(v=>v&&v!=='none'&&v!=='continuous').join(' '),component.description??''])row.insertCell().textContent=value;
        }
        article.append(table);
      }
      const path=documentationSource(name,Object.keys(sources));
      if(path){const open=document.createElement('button');open.type='button';open.textContent='Open source';open.onclick=()=>host.openSource(path);article.append(open);}
      if(info.documentation_revisions_html){
        const details=document.createElement('details'),label=document.createElement('summary');label.textContent='Revisions';details.append(label,documentationFragment(info.documentation_revisions_html,document));article.append(details);
      }
      status.textContent=`${classes.length} classes · ${info.class_type}`;
    }catch(error){if(token===generation)status.textContent=String(error);}
  }
  async function reload(){
    const token=++loadGeneration;++generation;sources={...host.sources()};status.textContent='Loading Modelica package documentation…';refresh.disabled=true;
    try{
      const result=await host.request<{classes:ModelicaClass[]}>(sources);if(token!==loadGeneration)return;
      classes=flattenClasses(result.classes);render();status.textContent=`${classes.length} classes · select a package or class`;
      const name=classes.some(item=>item.qualified_name===selected)?selected:classes.find(item=>item.qualified_name==='SLAM')?.qualified_name??classes.find(item=>item.qualified_name==='Examples')?.qualified_name??classes[0]?.qualified_name;
      if(name)await show(name);
    }catch(error){if(token===loadGeneration)status.textContent=String(error);}
    finally{if(token===loadGeneration)refresh.disabled=false;}
  }
  search.oninput=render;refresh.onclick=()=>{void reload();};
  element.addEventListener('workspace:show',()=>{void reload();});
  article.onclick=event=>{
    const link=(event.target as Element).closest<HTMLAnchorElement>('a[data-modelica-class]');
    if(link){event.preventDefault();void show(link.dataset.modelicaClass!);}
  };
  async function refreshChanged(){
    const current=host.sources(),keys=Object.keys(current);
    if(!classes.length||keys.length!==Object.keys(sources).length||keys.some(path=>current[path]!==sources[path]))await reload();
  }
  return {element,reload,async read(name:string){
    await refreshChanged();
    if(!classes.some(item=>item.qualified_name===name))throw new Error(`Unknown Modelica class: ${name}`);
    return host.request<ModelicaClassInfo>(sources,name);
  },async search(query:string){
    await refreshChanged();const term=query.toLowerCase();
    return classes.filter(item=>item.qualified_name.toLowerCase().includes(term)).slice(0,30).map(item=>({name:item.qualified_name,kind:item.class_type}));
  }};
}
