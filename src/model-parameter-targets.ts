import {estimatorModelicaSources,defaultSensorModelica,defaultEvaluationModelica,type Project} from './project';
import {NATIVE_SLAM_PARAMETERS} from './model-parameters';

export interface ModelParameterTarget {id:string;label:string;model:string;source:string;sources:Record<string,string>;native?:boolean}
export function modelParameterTargets(project:Project):ModelParameterTarget[]{
  const library=estimatorModelicaSources(project),physicsLibrary={...project.modelicaSources};delete physicsLibrary['models/Vehicles/LabQuadrotor.mo'];
  const inertial=project.entryPoint??'ModelicaInertial';
  const native={id:NATIVE_SLAM_PARAMETERS,label:'RGB-D SLAM',native:true,model:'D435FastSLAMStep',source:'',sources:{}};
  const estimator={id:inertial,label:`Inertial estimator · ${inertial}`,model:inertial,source:project.algorithm,sources:library};
  const sensor=project.sensorModelica??defaultSensorModelica;
  return [project.slamBackend==='native'?native:estimator,
    {id:'LabQuadrotor',label:'Vehicle · plant and controller',model:'LabQuadrotor',source:project.physics,sources:physicsLibrary},
    project.slamBackend==='native'?estimator:native,
    ...['SensorObservations','SensorAvailability','ActorMotion'].map((model,index)=>({id:model,label:['Sensors · IMU and GPS','Sensors · availability','Scene · actors'][index],model,source:sensor,sources:{}})),
    {id:'RuntimeEvaluation',label:'Evaluation',model:'RuntimeEvaluation',source:project.evaluationModelica??defaultEvaluationModelica,sources:{}}];
}
export function parameterTargetVersion(project:Project,id:string){
  const target=modelParameterTargets(project).find(target=>target.id===id);if(!target)throw Error('Parameter model no longer exists');
  return target.native?`native:${project.cameraResolution??'848x480'}`:JSON.stringify({model:target.model,source:target.source,sources:target.sources});
}
