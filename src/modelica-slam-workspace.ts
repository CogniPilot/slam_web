import {rgbdSlamManifest,type RGBDSlamSourceProfile} from './modelica-slam-source-manifest.mjs';

/** A complete saved text inventory, independent of future bundled sources.
 * This is a source workspace, not an estimator State or executable artifact.
 */
export interface RGBDSlamWorkspace {
  readonly schemaVersion:1|2;
  readonly sources:Readonly<Record<string,string>>;
}

/** Version1 retains56 historical sources; version2 owns the59 native sources. */
export function rgbdSlamWorkspaceManifest(version:RGBDSlamWorkspace['schemaVersion']){
  if(version!==1&&version!==2)throw new Error('Unsupported Modelica workspace schemaVersion');
  return rgbdSlamManifest(version===1?'legacy':'d435-native');
}

function plainRecord(value:unknown,label:string):object{
  if(!value||typeof value!=='object'||Array.isArray(value)
    ||![Object.prototype,null].includes(Object.getPrototypeOf(value)))
    throw new Error(`${label} must be a plain object`);
  return value;
}

function dataValue(record:object,key:string):unknown{
  const descriptor=Object.getOwnPropertyDescriptor(record,key);
  if(!descriptor||!Object.hasOwn(descriptor,'value'))
    throw new Error(`Modelica workspace requires a data property: ${key}`);
  return descriptor.value;
}

/** Validate a saved snapshot and take an independent copy of every entry.
 * Missing dependencies are refused rather than filled from a newer bundle.
 * Accessors are refused without running them. Text is never normalized.
 */
export function checkedRGBDSlamWorkspace(value:unknown):RGBDSlamWorkspace{
  const record=plainRecord(value,'Modelica workspace');
  for(const key of Reflect.ownKeys(record)){
    if(key!=='schemaVersion'&&key!=='sources')
      throw new Error(`Unknown Modelica workspace field: ${String(key)}`);
  }
  const schemaVersion=dataValue(record,'schemaVersion');
  if(schemaVersion!==1&&schemaVersion!==2)throw new Error('Unsupported Modelica workspace schemaVersion');
  const manifest=rgbdSlamWorkspaceManifest(schemaVersion),knownPaths=new Set(manifest.paths);
  const input=plainRecord(dataValue(record,'sources'),'Modelica workspace sources');
  for(const key of Reflect.ownKeys(input)){
    if(typeof key!=='string'||!knownPaths.has(key))
      throw new Error(`Unknown Modelica workspace source path: ${String(key)}`);
  }
  const sources:Record<string,string>={};
  for(const path of manifest.paths){
    const source=dataValue(input,path);
    if(typeof source!=='string')throw new Error(`Modelica workspace source must be a string: ${path}`);
    sources[path]=source;
  }
  return {schemaVersion,sources};
}

/** Load all authored dependencies only when a new workspace is requested. */
export async function createRGBDSlamWorkspace(profile:RGBDSlamSourceProfile='legacy'):Promise<RGBDSlamWorkspace>{
  const manifest=rgbdSlamManifest(profile),schemaVersion=profile==='legacy'?1:2;
  const {loadRGBDSlamSourceFile}=await import('./modelica-slam-source');
  const entries=await Promise.all(manifest.paths.map(async path=>[path,await loadRGBDSlamSourceFile(path)]));
  return checkedRGBDSlamWorkspace({schemaVersion,sources:Object.fromEntries(entries)});
}

/** Return a new complete snapshot with one exact manifest path replaced.
 * Use assembleRGBDSlamWorkspace to retain its exact inventory when assembling.
 */
export function editRGBDSlamWorkspace(workspace:RGBDSlamWorkspace,path:string,source:string):RGBDSlamWorkspace{
  const checked=checkedRGBDSlamWorkspace(workspace);
  const knownPaths=new Set(rgbdSlamWorkspaceManifest(checked.schemaVersion).paths);
  if(typeof path!=='string'||!knownPaths.has(path))
    throw new Error(`Unknown Modelica workspace source path: ${String(path)}`);
  if(typeof source!=='string')throw new Error(`Modelica workspace source must be a string: ${path}`);
  return {schemaVersion:checked.schemaVersion,sources:{...checked.sources,[path]:source}};
}

/** Assemble every saved file exactly; never fill missing saved dependencies. */
export async function assembleRGBDSlamWorkspace(workspace:RGBDSlamWorkspace){
  const checked=checkedRGBDSlamWorkspace(workspace);
  const {assembleRGBDSlamSource}=await import('./modelica-slam-source');
  return assembleRGBDSlamSource(checked.sources,checked.schemaVersion===1?'legacy':'d435-native');
}
