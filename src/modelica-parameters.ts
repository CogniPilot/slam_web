import type {ModelParameter} from './model-parameters';
import {parameterLabel,modelParameterDeclarations} from './modelica-parameter-declarations.mjs';

interface Info {qualified_name:string;source_modelica:string;components:{name:string;type_name:string}[]}
interface Raw {name:string;defaultValue:number;unit?:string;start?:string;description?:string;minValue?:number;maxValue?:number}
export function reflectedParameters(api:{get_class_info:(name:string)=>string;lsp_document_symbols:(source:string)=>string},model:string,source:string,raw:Raw[]):ModelParameter[]{
  const cache=new Map<string,Info|undefined>();
  const info=(name:string)=>{
    if(!cache.has(name)){try{cache.set(name,JSON.parse(api.get_class_info(name)));}catch{cache.set(name,undefined);}}
    return cache.get(name);
  };
  const resolve=(name:string,owner:Info):string=>{
    const alias=[...owner.source_modelica.matchAll(/\bimport\s+(\w+)\s*=\s*([\w.]+)/g)].find(match=>match[1]===name);
    if(alias)return alias[2];
    if(info(name))return name;
    const parts=owner.qualified_name.split('.');parts.pop();
    while(parts.length){const candidate=[...parts,name].join('.');if(info(candidate))return candidate;parts.pop();}
    return name;
  };
  const component=(owner:Info|undefined,name:string,seen=new Set<string>()):{field:{name:string;type_name:string};owner:Info}|undefined=>{
    if(!owner||seen.has(owner.qualified_name))return;seen.add(owner.qualified_name);
    const field=owner.components.find(field=>field.name===name);if(field)return {field,owner};
    for(const match of owner.source_modelica.matchAll(/\bextends\s+([\w.]+)/g)){
      const found=component(info(resolve(match[1],owner)),name,seen);if(found)return found;
    }
  };
  const declarations=modelParameterDeclarations(source,JSON.parse(api.lsp_document_symbols(source)));
  const result=raw.map(parameter=>{
    const path=parameter.name.split('.');let owner=info(model),found:ReturnType<typeof component>;
    for(const part of path){found=component(owner,part.replace(/\[.*$/,''));if(!found)break;owner=info(resolve(found.field.type_name,found.owner));}
    let type=found?.field.type_name,readOnly:string|undefined;
    if(found&&!['Real','Integer','Boolean','String'].includes(type??'')){
      // Class rendering is used for type aliases only, never numeric values.
      const alias=info(resolve(found.field.type_name,found.owner));
      type=alias?.source_modelica.match(/\btype\s+\w+\s*=\s*(Real|Integer|Boolean|String)\b/)?.[1];
    }
    if(!type||!['Real','Integer','Boolean','String'].includes(type)){readOnly='Resolved scalar type is unavailable; edit its Modelica source';type='Real';}
    const declaration=path.length===1?declarations.find(field=>(field.owner===model||model.endsWith('.'+field.owner))&&field.name===parameter.name):undefined;
    let defaultValue:number|string=parameter.defaultValue;
    if(type==='String'){try{defaultValue=JSON.parse(parameter.start??'""');if(typeof defaultValue!=='string')throw Error();}catch{defaultValue=parameter.start??'';readOnly='String binding is an expression; edit its Modelica source';}}
    if(type==='Integer'&&!Number.isSafeInteger(defaultValue))readOnly='Integer is outside the browser’s exact numeric range';
    return {...parameter,type:type as ModelParameter['type'],defaultValue,label:parameterLabel(path.at(-1)!),
      expression:parameter.start,group:declaration?.group??(path.length>1?path.slice(0,-1).join('.'):'General'),...(readOnly?{readOnly}:{})};
  });
  for(const declaration of declarations.filter(d=>d.kind==='parameter'&&(d.owner===model||model.endsWith('.'+d.owner))&&!raw.some(field=>field.name===d.name))){
    const value=declaration.type==='Boolean'&&/^(true|false)$/.test(declaration.expression)?Number(declaration.expression==='true'):Number(declaration.expression);
    result.push({...declaration,type:declaration.type as ModelParameter['type'],defaultValue:Number.isFinite(value)?value:declaration.expression,
      group:declaration.group??'Structure',...(declaration.constant?{readOnly:'Modelica constant; edit its source declaration'}:declaration.final?{readOnly:'Final Modelica parameter'}:!Number.isFinite(value)?{readOnly:'Structural expression; edit its Modelica binding in source'}:{})});
  }
  return result;
}
