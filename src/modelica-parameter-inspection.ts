import {modelParameterDeclarations} from './modelica-parameter-declarations.mjs';

interface InspectionCompiler {get_class_info:(name:string)=>string;lsp_document_symbols:(source:string)=>string}
/** The metadata API lowers numeric inputs but has no input-frame argument.
 * Supply temporary, typed input bindings for inspection only. Modelica
 * parameters cannot depend on time-varying inputs. Runtime source is untouched. */
export function inspectModelParameters(api:InspectionCompiler,source:string,model:string,metadata:(source:string,model:string)=>string,sources:Readonly<Record<string,string>>={}):any[]{
  try{return JSON.parse(metadata(source,model));}
  catch(error){
    if(!String(error).includes('neither a checked default nor a runtime value'))throw error;
    const assignments=new Map<string,string>(),seen=new Set<string>(),inspectionErrors:string[]=[];
    const primary=modelParameterDeclarations(source,JSON.parse(api.lsp_document_symbols(source)));
    function visit(name:string){
      if(seen.has(name))return;seen.add(name);
      let text=primary.some(field=>field.owner===name||name.endsWith('.'+field.owner))?source:undefined;
      for(let parts=name.split('.');!text&&parts.length;parts.pop()){
        const suffix=parts.join('/');const path=Object.keys(sources).find(path=>path.endsWith('/'+suffix+'.mo')||path.endsWith('/'+suffix+'/package.mo'));
        if(path)text=sources[path];
      }
      if(!text&&name===model)text=source;
      if(!text)throw Error(`Original declaration source is unavailable for ${name}`);
      const fields=modelParameterDeclarations(text,JSON.parse(api.lsp_document_symbols(text)));
      for(const field of fields.filter(field=>field.kind==='input'&&(field.owner===name||name.endsWith('.'+field.owner))&&!field.expression)){
        if(!['Real','Integer','Boolean','String'].includes(field.type))continue;
        const value=field.type==='Boolean'?'false':field.type==='String'?'""':field.type==='Integer'?'0':'0.0';
        assignments.set(field.name,field.dimensions?.length?`fill(${value},${field.dimensions.join(',')})`:value);
      }
      let rendered=text;try{rendered=JSON.parse(api.get_class_info(name)).source_modelica;}catch{/* The primary source may be temporarily replaced while inspecting another entry. */}
      for(const match of rendered.matchAll(/\bextends\s+([\w.]+)/g)){
        let parent=match[1];const alias=[...text.matchAll(/\bimport\s+(\w+)\s*=\s*([\w.]+)/g)].find((entry:any)=>entry[1]===parent) as RegExpMatchArray|undefined;
        if(alias)parent=alias[2];
        else{
          let exists=false;try{api.get_class_info(parent);exists=true;}catch{/* Resolve in the owning namespace. */}
          for(let parts=name.split('.').slice(0,-1);!exists&&parts.length;parts.pop()){
            const qualified=[...parts,parent].join('.');try{api.get_class_info(qualified);parent=qualified;exists=true;}catch{/* Try enclosing namespace. */}
          }
        }
        try{visit(parent);}catch(reason){inspectionErrors.push(String(reason));}
      }
    }
    visit(model);if(!assignments.size)throw Error(`${String(error)}${inspectionErrors.length?`; inspection: ${inspectionErrors.join('; ')}`:''}`);
    let wrapper='ParameterInspection';while(new RegExp(`\\b${wrapper}\\b`).test(source))wrapper+='_';
    const namespace=model.includes('.')?model.slice(0,model.lastIndexOf('.')):source.match(/^\s*within\s+([\w.]+)\s*;/)?.[1];
    const modified=source+`\nmodel ${wrapper}\n extends ${model}(${[...assignments].map(([name,value])=>`${name}=${value}`).join(',')});\nend ${wrapper};\n`;
    return JSON.parse(metadata(modified,namespace?`${namespace}.${wrapper}`:wrapper));
  }
}
