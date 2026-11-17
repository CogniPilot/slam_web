import type {ParameterValues} from './model-parameters';
import {modelParameterDeclarations} from './modelica-parameter-declarations.mjs';
import {inspectModelParameters} from './modelica-parameter-inspection';

let multiMemory:boolean|undefined;
/** Rumoca lowers compiled programs to multi-memory WebAssembly, which Safari/WebKit rejects. */
export function supportsWasmMultiMemory(){
  // A module with two declared memories validates only where multi-memory is supported.
  return multiMemory??=WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,5,5,2,0,1,0,1]));
}
/** Compile natively where possible; otherwise run Rumoca's interpreter. */
export function modelicaExecutionPolicy(){return supportsWasmMultiMemory()?'auto':'interpreter';}

/** Rumoca recompiles and reinitializes dependent equations for parameter edits. */
export function configuredModelicaSession(compiler:typeof import('@cognipilot/rumoca'),source:string,model:string,
  dt:number,solver:string,atol:number,rtol:number,initialInputs:string,parameters:ParameterValues={},workspaceSources:Readonly<Record<string,string>>={},
  executionPolicy:'auto'|'interpreter'=modelicaExecutionPolicy()){
  if(!Object.keys(parameters).length&&executionPolicy==='auto')return compiler.WasmSimulationSession.withInteractiveOptions(source,model,dt,solver,atol,rtol,initialInputs);
  const fields: {name:string}[]=inspectModelParameters(compiler,source,model,compiler.model_parameter_metadata,workspaceSources);
  const known=new Set(fields.map(field=>field.name)),numeric:ParameterValues={},bindings:Record<string,any>=Object.create(null);
  const declarations=modelParameterDeclarations(source,JSON.parse(compiler.lsp_document_symbols(source)));
  for(const [name,value]of Object.entries(parameters)){
    if(known.has(name)&&typeof value==='number'){numeric[name]=value;continue;}
    if(!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(name))throw Error(`Structural/text array parameter ${name} requires a Modelica source binding`);
    const parts=name.split('.');let node=bindings;
    for(const part of parts.slice(0,-1))node=node[part]??=Object.create(null);
    const boolean=declarations.some(field=>field.name===name&&field.type==='Boolean');
    node[parts.at(-1)!]=typeof value==='string'?JSON.stringify(value):boolean?(value===1?'true':'false'):String(value);
  }
  if(Object.keys(bindings).length){
    const modification=(node:Record<string,any>):string=>Object.entries(node).map(([name,value])=>typeof value==='string'?`${name}=${value}`:`${name}(${modification(value)})`).join(',');
    let wrapper='ConfiguredExperiment';while(new RegExp(`\\b${wrapper}\\b`).test(source))wrapper+='_';
    const namespace=model.includes('.')?model.slice(0,model.lastIndexOf('.')):source.match(/^\s*within\s+([\w.]+)\s*;/)?.[1];
    source+=`\nmodel ${wrapper}\n extends ${model}(${modification(bindings)});\nend ${wrapper};\n`;
    model=namespace?`${namespace}.${wrapper}`:wrapper;
  }
  return compiler.WasmSimulationSession.withInteractiveConfiguration(source,model,JSON.stringify({dt,solver,atol,rtol,
    initial_inputs:JSON.parse(initialInputs),execution_policy:executionPolicy,parameters:numeric}));
}
