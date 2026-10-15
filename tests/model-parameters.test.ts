import {beforeAll,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import init,* as compiler from '@cognipilot/rumoca';
import {reflectedParameters} from '../src/modelica-parameters';
import {configuredModelicaSession} from '../src/modelica-session-parameters';
import {modelParameterDeclarations} from '../src/modelica-parameter-declarations.mjs';
import {checkedModelParameters,checkedParameterValues} from '../src/model-parameters';
import {defaultProject,parseProject,withDefaultModels,estimatorModelicaSources} from '../src/project';
import {inspectModelParameters} from '../src/modelica-parameter-inspection';
import {modelParameterTargets} from '../src/model-parameter-targets';

const source=`model Child
 parameter Real a[2]={2,3} "Array gain";
 parameter Real scale=2*a[1];
 parameter Boolean enabled=true;
 parameter String title="original";
end Child;
model ParameterCase
 parameter Integer count=2;
 final parameter Real fixedValue=5;
 parameter Real gain(unit="m",min=0,max=10)=2 "Gain; preserve punctuation" annotation(Dialog(tab="Plant",group="Gains"));
 Child child;
 Real x[count](each start=0,each fixed=true);
equation
 der(x)=fill(if child.enabled then child.scale else 0,count);
end ParameterCase;`;
beforeAll(async()=>{await init({module_or_path:readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});compiler.sync_workspace_sources('{}');});

it('reflects nested scalar types and arrays, source annotations and structural/final parameters',()=>{
  const raw=JSON.parse(compiler.model_parameter_metadata(source,'ParameterCase'));
  const fields=reflectedParameters(compiler,'ParameterCase',source,raw);
  expect(fields.find(field=>field.name==='child.title')).toMatchObject({type:'String',defaultValue:'original'});
  expect(fields.find(field=>field.name==='child.enabled')).toMatchObject({type:'Boolean',defaultValue:1});
  expect(fields.find(field=>field.name==='child.a[2]')).toMatchObject({type:'Real',defaultValue:3,group:'child'});
  expect(fields.find(field=>field.name==='count')).toMatchObject({type:'Integer',defaultValue:2,group:'Structure'});
  expect(fields.find(field=>field.name==='fixedValue')?.readOnly).toBe('Final Modelica parameter');
  expect(fields.find(field=>field.name==='gain')).toMatchObject({group:'Gains',unit:'m',minValue:0,maxValue:10});
  const declaration=modelParameterDeclarations(source,JSON.parse(compiler.lsp_document_symbols(source))).find(field=>field.name==='gain');
  expect(declaration).toMatchObject({description:'Gain; preserve punctuation',expression:'2',group:'Gains'});
  expect(()=>checkedParameterValues(fields,{gain:-1})).toThrow('limits');
  expect(()=>checkedParameterValues(fields,{fixedValue:9})).toThrow('Final');
});

it('rebuilds structural and String bindings and lets Rumoca propagate nested array overrides',()=>{
  const session=configuredModelicaSession(compiler,source,'ParameterCase',.01,'rk-like',1e-10,1e-10,'[]',
    {count:3,'child.a[1]':5,'child.enabled':1,'child.title':'updated'});
  try{
    session.advance_to(.1);
    const values=JSON.parse(session.state_json()).values;
    expect(Object.keys(values).filter(name=>name.startsWith('x['))).toHaveLength(3);
    expect(values['x[1]']).toBeCloseTo(1,8);expect(values['x[3]']).toBeCloseTo(1,8);
  }finally{session.free();}
});

it('persists typed parameter settings and refuses malformed values without discarding source',()=>{
  const settings={ParameterCase:{gain:3,'child.title':'updated',count:3}};
  expect(checkedModelParameters(settings)).toEqual(settings);
  const project={...defaultProject(),modelParameters:settings};
  expect(parseProject(JSON.stringify(project)).modelParameters).toEqual(settings);
  expect(withDefaultModels(project).modelParameters).toEqual(settings);
  expect(()=>checkedModelParameters({ParameterCase:{gain:NaN}})).toThrow();
});

it('inspects the actual inertial model without runtime inputs and applies its parameter in the solver',()=>{
  const project=defaultProject(),sources=estimatorModelicaSources(project),model=project.entryPoint!;
  const raw=inspectModelParameters(compiler,project.algorithm,model,(source,name)=>compiler.model_parameter_metadata_with_workspace_sources(source,name,JSON.stringify(sources)));
  const fields=reflectedParameters(compiler,model,project.algorithm,raw);
  expect(fields.find(field=>field.name==='accelTimeConstant')).toMatchObject({type:'Real',defaultValue:.03,unit:'s'});
  compiler.sync_workspace_sources(JSON.stringify(sources));
  const session=configuredModelicaSession(compiler,project.algorithm,model,.005,'rk-like',1e-10,1e-8,
    '[["accel[1]",1],["accel[2]",0],["accel[3]",9.81],["gyro[1]",0],["gyro[2]",0],["gyro[3]",0]]',{accelTimeConstant:.15});
  try{session.advance_to(.1);expect(session.get('filteredAccel[1]')).toBeCloseTo(1-Math.exp(-.1/.15),7);}finally{session.free();}
  for(const [name,value] of [['SLAM.Examples.SmoothedInertial',.12],['SLAM.Examples.ResponsiveInertial',.005]] as const){
    const inherited=inspectModelParameters(compiler,project.algorithm,name,(source,selected)=>compiler.model_parameter_metadata_with_workspace_sources(source,selected,JSON.stringify(sources)),sources);
    expect(reflectedParameters(compiler,name,project.algorithm,inherited).find(field=>field.name==='accelTimeConstant')).toMatchObject({type:'Real',defaultValue:value});
    compiler.sync_workspace_sources(JSON.stringify(sources));
    const derived=configuredModelicaSession(compiler,project.algorithm,name,.005,'rk-like',1e-10,1e-8,
      '[["accel[1]",1],["accel[2]",0],["accel[3]",9.81],["gyro[1]",0],["gyro[2]",0],["gyro[3]",0]]',{accelTimeConstant:.15},sources);
    try{derived.advance_to(.1);expect(derived.get('filteredAccel[1]')).toBeCloseTo(1-Math.exp(-.1/.15),7);}finally{derived.free();}
  }
},60_000);

it('inspects the sensor, actor and evaluation catalogs from the actual project',()=>{
  const targets=modelParameterTargets(defaultProject()).filter(target=>['SensorObservations','SensorAvailability','ActorMotion','RuntimeEvaluation'].includes(target.id));
  for(const target of targets){
    const raw=inspectModelParameters(compiler,target.source,target.model,(source,name)=>compiler.model_parameter_metadata_with_workspace_sources(source,name,JSON.stringify(target.sources)),target.sources);
    const fields=reflectedParameters(compiler,target.model,target.source,raw);
    if(target.id==='RuntimeEvaluation')expect(fields).toEqual([]);
    else expect(fields.length,target.id).toBeGreaterThan(0);
    if(target.id==='SensorAvailability')expect(fields.find(field=>field.name==='maximumRoofs')?.readOnly).toContain('constant');
    expect(fields.every(field=>Number.isFinite(field.defaultValue)||typeof field.defaultValue==='string'),target.id).toBe(true);
  }
},30_000);
