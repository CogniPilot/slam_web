import {NATIVE_SLAM_PARAMETERS} from './model-parameters';
import {withActorMotion,defaultSensorModelica,defaultEvaluationModelica,type Project} from './project';

/** Inputs that select or compile worker programs. Runtime-only options are
 * reapplied during reset. Artifacts and editor/project labels are not inputs. */
export function runtimeProjectKey(project:Project):string {
  const {physics,algorithm,detector,runtime,detectorLanguage,entryPoint,mainSourcePath,modelicaSources,
    sensorModelica,evaluationModelica,graph,vehicleCount,cameraResolution,slamBackend,modelParameters}=project;
  const parameters={...modelParameters};delete parameters[NATIVE_SLAM_PARAMETERS];
  return JSON.stringify({physics,algorithm,detector,runtime,detectorLanguage,entryPoint,mainSourcePath,modelicaSources,
    sensorModelica:withActorMotion(sensorModelica??defaultSensorModelica),evaluationModelica:evaluationModelica??defaultEvaluationModelica,graph:{nodes:graph.nodes.map(({x:_x,y:_y,title:_title,...node})=>node),edges:graph.edges},
    vehicleCount:vehicleCount??1,cameraResolution:cameraResolution??'848x480',slamBackend:slamBackend??'inertial',modelParameters:parameters},
    (_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
}
