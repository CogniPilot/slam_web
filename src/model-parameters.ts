export interface ModelParameter {
  name:string;label?:string;type:'Real'|'Integer'|'Boolean'|'String';defaultValue:number|string;
  description?:string;unit?:string;group?:string;minValue?:number|null;maxValue?:number|null;
  expression?:string;readOnly?:string;slot?:string;index?:number;
}
export type ParameterValues=Record<string,number|string>;
export type ModelParameters=Record<string,ParameterValues>;
export const NATIVE_SLAM_PARAMETERS='Native RGB-D SLAM';
export function nativeParametersFor(project:{modelParameters?:ModelParameters;loopClosureSettings?:object}):ParameterValues{
  const configured=project.modelParameters?.[NATIVE_SLAM_PARAMETERS];
  return configured??Object.fromEntries(Object.entries(project.loopClosureSettings??{}).map(([name,value])=>[name,Number(value)]));
}

export function checkedModelParameters(input:unknown=undefined):ModelParameters{
  if(input===undefined)return {};
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid Modelica parameter settings');
  const result:ModelParameters={};
  for(const [model,values]of Object.entries(input)){
    if(!model||model==='__proto__'||!values||typeof values!=='object'||Array.isArray(values))throw Error('Invalid Modelica parameter model');
    const checked:ParameterValues={};
    for(const [name,value]of Object.entries(values)){
      if(!name||name==='__proto__'||!(typeof value==='string'||typeof value==='number'&&Number.isFinite(value)))throw Error(`Invalid Modelica parameter ${name}`);
      checked[name]=value;
    }
    result[model]=checked;
  }
  return result;
}

export function checkedParameterValues(fields:readonly ModelParameter[],values:ParameterValues):ParameterValues{
  const checked:ParameterValues={};
  for(const [name,value]of Object.entries(values)){
    const field=fields.find(field=>field.name===name);
    if(!field)throw Error(`Unknown Modelica parameter: ${name}`);
    if(field.readOnly)throw Error(`${name}: ${field.readOnly}`);
    if(field.type==='String'){if(typeof value!=='string')throw Error(`${name} requires text`);checked[name]=value;continue;}
    if(typeof value!=='number'||!Number.isFinite(value)||field.type==='Integer'&&!Number.isSafeInteger(value)||field.type==='Boolean'&&value!==0&&value!==1)
      throw Error(`Invalid ${field.type} value for ${name}`);
    if(field.minValue!=null&&value<field.minValue||field.maxValue!=null&&value>field.maxValue)throw Error(`${name} is outside the Modelica limits`);
    checked[name]=value;
  }
  return checked;
}
