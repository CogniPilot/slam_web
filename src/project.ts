import physics from '../models/Vehicles/LabQuadrotor.mo?raw';
import imageProfile from '../models/Sensors/D435ImageProfile.mo?raw';
import harrisNative from '../models/Vision/Features/HarrisNativeFrame.mo?raw';
import harrisProfile from '../models/Vision/Features/D435HarrisFeatures.mo?raw';
import fastNative from '../models/Vision/Features/FastNativeFrame.mo?raw';
import fastProfile from '../models/Vision/Features/D435FastFeatures.mo?raw';
import modelicaInertial from '../models/Estimation/Inertial/ModelicaInertial.mo?raw';
import exampleModels from '../models/Examples/package.mo?raw';
import inertialExample from '../models/Examples/InertialOnly.mo?raw';
import responsiveExample from '../models/Examples/ResponsiveInertial.mo?raw';
import smoothedExample from '../models/Examples/SmoothedInertial.mo?raw';
import sensorEquations from '../models/Sensors/SensorObservations.mo?raw';
import sensorAvailability from '../models/Sensors/SensorAvailability.mo?raw';
import actorMotion from '../models/Scene/ActorMotion.mo?raw';
import evaluationEquations from '../models/Evaluation/RuntimeEvaluation.mo?raw';
import type { Environment,SceneDetail } from './types';
import { defaultGraph, type Graph } from './graph';
import type {InertialSessionMetadata} from './modelica-inertial-session';
import {validateSensorRates,type SensorRates} from './sensor-clock';
import {checkedRGBDSlamWorkspace,type RGBDSlamWorkspace} from './modelica-slam-workspace';
const modelicaHarris=`${imageProfile}\n${harrisNative}\n${harrisProfile}`;
export const detectors: Record<string,string> = { 'Modelica Harris · integration pending':modelicaHarris, 'Modelica FAST · integration pending':`${imageProfile}\n${fastNative}\n${fastProfile}` };
export function visibleDetectorPresets(_project:Pick<Project,'detectorPreset'|'detectorLanguage'>):Record<string,string> {
  return {...detectors};
}
export const algorithms: Record<string,string> = { 'Modelica inertial propagation':inertialExample };
const defaultModelicaSources = {
  'models/Examples/package.mo':exampleModels,
  'models/Examples/ResponsiveInertial.mo':responsiveExample,
  'models/Examples/SmoothedInertial.mo':smoothedExample,
  'models/Estimation/Inertial/ModelicaInertial.mo':modelicaInertial,
};
/** Add the new editable component without replacing a saved sensor model. */
export function withActorMotion(source:string):string {
  return /\bmodel\s+ActorMotion\b/.test(source)?source:`${source}\n${actorMotion}`;
}
export const defaultSensorModelica=withActorMotion(`${sensorEquations}\n${sensorAvailability}`);
export const defaultEvaluationModelica=evaluationEquations;
export interface Project {
  format: 'slam-lab-project'; version: 1; name: string;
  environment: Environment; seed: number; algorithm: string; detector: string; physics: string;
  algorithmPreset: string; detectorPreset: string;
  runtime: 'modelica';
  entryPoint?:string;
  modelicaSources?:Record<string,string>;
  mainSourcePath?:string;
  algorithmArtifact?:InertialSessionMetadata;
  /** Complete editable SLAM source snapshot; distinct from the active estimator. */
  slamWorkspace?:RGBDSlamWorkspace;
  sensorModelica?:string;
  evaluationModelica?:string;
  graph: Graph;
  detectorLanguage:'modelica';
  /** Retired cache field, ignored and removed on load; source remains editable. */
  detectorArtifact?:unknown;
  sceneDetail?:SceneDetail;
  sensorRates?:SensorRates;
  lidarEnabled?:boolean;
  depthCloudEnabled?:boolean;
  carsEnabled?:boolean;
  peopleEnabled?:boolean;
  lightingMode?:'day'|'night'|'cycle';
}
export const defaultProject = (mobile=false): Project => ({
  format:'slam-lab-project',
  version:1,
  name:'My quadrotor SLAM',
  environment:'city',
  sceneDetail:mobile?'low':'medium',
  depthCloudEnabled:false,
  lidarEnabled:false,
  seed:7,
  algorithm:algorithms['Modelica inertial propagation'],
  entryPoint:'Examples.InertialOnly',
  mainSourcePath:'models/Examples/InertialOnly.mo',
  modelicaSources:{...defaultModelicaSources},
  algorithmPreset:'Modelica inertial propagation',
  detector:modelicaHarris,
  detectorPreset:'Modelica Harris · integration pending',
  detectorLanguage:'modelica',
  runtime:'modelica',
  physics,
  sensorModelica:defaultSensorModelica,
  evaluationModelica:defaultEvaluationModelica,
  graph:defaultGraph(),
});
export function parseProject(text: string): Project {
  const p=JSON.parse(text);
  if(p.format!=='slam-lab-project'||p.version!==1) throw new Error('Unsupported project version');
  for(const key of ['name','algorithm','detector','physics','algorithmPreset','detectorPreset']) if(typeof p[key]!=='string') throw new Error(`Project is missing ${key}`);
  if(p.entryPoint!==undefined&&(typeof p.entryPoint!=='string'||!p.entryPoint.trim()))throw new Error('Invalid Modelica entry point');
  if(p.mainSourcePath!==undefined&&(typeof p.mainSourcePath!=='string'||!/^models\/(?:[A-Za-z_]\w*\/)*[A-Za-z_]\w*\.mo$/.test(p.mainSourcePath)))throw new Error('Invalid main source path');
  if(p.modelicaSources!==undefined){
    if(!p.modelicaSources||typeof p.modelicaSources!=='object'||Array.isArray(p.modelicaSources))throw new Error('Invalid Modelica library');
    for(const [path,source] of Object.entries(p.modelicaSources))
      if(!/^models\/(?:[A-Za-z_]\w*\/)*[A-Za-z_]\w*\.mo$/.test(path)||typeof source!=='string')throw new Error('Invalid Modelica library source');
    if(p.mainSourcePath&&Object.hasOwn(p.modelicaSources,p.mainSourcePath))throw new Error('Main source must not be duplicated in the library');
  }
  if(p.runtime!=='modelica'||p.detectorLanguage!=='modelica'||p.graph?.nodes?.some((n:any)=>n.kind==='python'))throw new Error('This project uses a retired runtime. Convert its algorithm, detector and custom nodes to Modelica before opening it. Your saved source has not been changed.');
  if(!['city','warehouse','courtyard','tokyo','asset-city','big-city'].includes(p.environment)||!Number.isInteger(p.seed)) throw new Error('Invalid project settings');
  if(p.sceneDetail!==undefined&&!['low','medium','high'].includes(p.sceneDetail))throw new Error('Invalid scene detail level');
  // Earlier previews offered paired90 Hz despite D435 RGB's60 Hz limit at
  //848×480. Preserve saved sources and the other rates when migrating them.
  if(p.sensorRates?.cameraHz===90)p.sensorRates.cameraHz=60;
  if(p.sensorRates!==undefined)validateSensorRates(p.sensorRates);
  if(p.lidarEnabled!==undefined&&typeof p.lidarEnabled!=='boolean')throw new Error('Invalid LiDAR setting');
  if(p.depthCloudEnabled!==undefined&&typeof p.depthCloudEnabled!=='boolean')throw new Error('Invalid depth cloud setting');
  for(const key of ['carsEnabled','peopleEnabled'])if(p[key]!==undefined&&typeof p[key]!=='boolean')throw new Error(`Invalid ${key} setting`);
  if(p.lightingMode!==undefined&&!['day','night','cycle'].includes(p.lightingMode))throw new Error('Invalid lighting mode');
  for(const key of ['sensorModelica','evaluationModelica'])if(p[key]!==undefined&&typeof p[key]!=='string')throw new Error(`Invalid ${key} source`);
  if(p.slamWorkspace!==undefined)p.slamWorkspace=checkedRGBDSlamWorkspace(p.slamWorkspace);
  p.sensorModelica=withActorMotion(p.sensorModelica??defaultSensorModelica);p.evaluationModelica??=defaultEvaluationModelica;
  // Migrate old projects to the single browser simulation clock.
  delete p.sensorHz;delete p.sensorSource;delete p.liveTopic;
  delete p.wasmBase64;
  // Old app-generated INS binaries are retired. Preserve editable source.
  if(p.algorithmArtifact?.format!=='rumoca-simulation-session')delete p.algorithmArtifact;
  delete p.detectorArtifact;
  p.graph ??= defaultGraph();
  if(!Array.isArray(p.graph.nodes)||!Array.isArray(p.graph.edges)) throw new Error('Invalid project graph');
  for(const n of p.graph.nodes) if(typeof n.id!=='string'||typeof n.title!=='string'||!Number.isFinite(n.x)||!Number.isFinite(n.y)||!['physics','sensor','detector','slam','map','evaluation','modelica'].includes(n.kind)) throw new Error('Invalid graph node');
  return p;
}
const KEY='slam-lab.project.v1';
const DB='slam-lab-projects';
let database:Promise<IDBDatabase>|undefined;
function openDatabase() {
  return database??=new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open(DB,1);
    request.onupgradeneeded=()=>{request.result.createObjectStore('projects');};
    request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();database=undefined;};resolve(request.result);};
    request.onerror=()=>{database=undefined;reject(request.error);};
    request.onblocked=()=>{database=undefined;reject(new Error('Project database is blocked by another tab'));};
  });
}
export async function saveProject(project:Project) {
  // Portable WASM artifacts can exceed localStorage's common 5 MB quota.
  // Snapshot before awaiting so rapid edits retain their transaction order.
  const snapshot=structuredClone(project),db=await openDatabase();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(snapshot,KEY);
    tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new Error('Project save aborted'));tx.onerror=()=>reject(tx.error);
  });
}
/** Read without interpreting source so retired projects remain downloadable. */
export async function readSavedProject():Promise<unknown> {
  const db=await openDatabase();
  const saved=await new Promise<unknown>((resolve,reject)=>{
    const tx=db.transaction('projects','readonly'),request=tx.objectStore('projects').get(KEY);
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  if(saved)return saved;
  const legacy=localStorage.getItem(KEY);
  return legacy?JSON.parse(legacy):undefined;
}
export async function loadProject(mobile=false):Promise<Project> {
  const saved=await readSavedProject();
  return saved?parseProject(JSON.stringify(saved)):defaultProject(mobile);
}
export function download(name: string, text: string, type='application/json') {
  const url=URL.createObjectURL(new Blob([text],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
