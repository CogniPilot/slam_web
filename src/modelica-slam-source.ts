import {rgbdSlamManifest,rgbdSlamNativeSourceManifest,type RGBDSlamSourceProfile} from './modelica-slam-source-manifest.mjs';
import {sourceDigest} from './source-digest';

export interface RGBDSlamSourceFileIdentity {
  path:string;
  sha256:string;
  bytes:number;
  overridden:boolean;
}
export interface RGBDSlamSourceComposition {
  schemaVersion:1;
  modelNames:readonly string[];
  source:string;
  sourceSha256:string;
  sources:RGBDSlamSourceFileIdentity[];
}

// Vite creates lazy raw-text loaders. Only the manifest's authored files are
// requested; no Modelica text is loaded by merely importing this module.
const loaders=import.meta.glob<string>(['../models/**/*.mo','!../models/Libraries/**'],{query:'?raw',import:'default'});
const knownPaths=new Set(rgbdSlamNativeSourceManifest.paths);

/** Load one exact manifest path on demand, preserving its authored text. */
export async function loadRGBDSlamSourceFile(path:string):Promise<string>{
  if(typeof path!=='string'||!knownPaths.has(path))
    throw new Error(`Unknown Modelica source path: ${String(path)}`);
  const load=loaders[`../${path}`];
  if(!load)throw new Error(`Missing authored Modelica source loader: ${path}`);
  const source=await load();
  if(typeof source!=='string')throw new Error(`Modelica source loader must return text: ${path}`);
  return source;
}

function checkedOverrides(value:unknown,paths:readonly string[]):Map<string,string>{
  const allowedPaths=new Set(paths);
  if(!value||typeof value!=='object'||Array.isArray(value)
    ||![Object.prototype,null].includes(Object.getPrototypeOf(value)))
    throw new Error('Modelica source overrides require a plain path-to-string object');
  const result=new Map<string,string>();
  for(const key of Reflect.ownKeys(value)){
    if(typeof key!=='string'||!allowedPaths.has(key))throw new Error(`Unknown Modelica source override: ${String(key)}`);
    const descriptor=Object.getOwnPropertyDescriptor(value,key)!;
    if(!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='string')
      throw new Error(`Modelica source override must be a string: ${key}`);
    result.set(key,descriptor.value);
  }
  return result;
}

/** Exact authored source for the selected staged SLAM entrypoints.
 * Load on demand with `await import('./modelica-slam-source')`; this module is
 * deliberately not connected to inertial startup, UI presets or execution.
 * Override keys are exact manifest paths such as `models/SLAM/RGBDFastSLAMStep.mo`.
 * Text (including empty edits, CRLF, BOM and trailing newlines) is unchanged.
 * Returned hashes identify text, not successful compilation or execution.
 */
export async function assembleRGBDSlamSource(
  overrides:Readonly<Record<string,string>>={},profile:RGBDSlamSourceProfile='legacy'
):Promise<RGBDSlamSourceComposition>{
  // Capture the caller's edits before the first asynchronous file load.
  const manifest=rgbdSlamManifest(profile);
  const edits=checkedOverrides(overrides,manifest.paths),encoder=new TextEncoder();
  const files=await Promise.all(manifest.paths.map(async path=>{
    const overridden=edits.has(path);
    const source=overridden?edits.get(path)!:await loadRGBDSlamSourceFile(path);
    return {source,identity:{path,sha256:await sourceDigest(source),bytes:encoder.encode(source).byteLength,overridden}};
  }));
  const source=files.map(file=>file.source).join(manifest.separator);
  return {schemaVersion:manifest.schemaVersion,modelNames:manifest.modelNames,source,
    sourceSha256:await sourceDigest(source),sources:files.map(file=>file.identity)};
}
