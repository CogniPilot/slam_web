import './style.css';
import './diagnostics.css';
import {poseSnapshot} from './trajectory';
import { World } from './world';
import { Runtime } from './runtime';
import { sourceFor,setSource,nodeRuntimeLabel,type GraphNode } from './graph';
import { algorithms,detectors,visibleDetectorPresets,defaultProject,loadProject,readSavedProject,saveProject,parseProject,download } from './project';
import type { Estimate,Pose,RunRecord,SensorFrame,Truth } from './types';
import {ComparisonTracker,type TimedPose} from './comparison';
import {validateSensorFrame} from './packet';
import {createSourceEditor} from './source-editor';
import {NavigationHandoff} from './world-navigation';
import {BrowserPerformanceMonitor} from './performance-monitor';
import {WorkerViewer} from './worker-viewer';
import {GRAPHICS_DESCRIPTIONS} from './graphics-quality';
import {ViewerCameraControls,VIEWER_KEYS,isTextEntry} from './viewer-camera-controls';
import {mountConfigurationPanel} from './configuration-panel';
import {sensorRates,type SensorRates} from './sensor-clock';
import {createRGBDSlamWorkspace,editRGBDSlamWorkspace,rgbdSlamWorkspaceManifest} from './modelica-slam-workspace';
import {checkRGBDSlamBuild,type SlamBuildReceipt} from './modelica-slam-build';
import {DepthPreview} from './depth-preview';
import {ColorPreview} from './color-preview';
import {createSourceExplorer} from './source-explorer';
import {mountWorkspacePanes} from './workspace-panes';
import {startupScreen} from './startup-screen';
import './workspace.css';

const startup=startupScreen();
document.querySelector('#app')!.innerHTML=`
<header><a class="brand" href="./"><span class="brand-mark">⌘</span><span>SLAM<span class="brand-light">LAB</span><small>UAV robotics · in your browser</small></span></a><div class="project-name"><input id="name" aria-label="Project name"><span id="saved">Local project</span></div><div class="project-actions"><button id="save">Save project</button><label class="button">Open project<input id="open" type="file" accept=".json,.slam.json" hidden></label><button id="download">Download</button></div><a class="project-github" href="https://github.com/CogniPilot/slam_web" target="_blank" rel="noopener noreferrer" aria-label="SLAM Lab on GitHub">GitHub</a><a class="powered-by" href="https://github.com/CogniPilot/rumoca" target="_blank" rel="noopener noreferrer"><img src="${import.meta.env.BASE_URL}brand/rumoca.svg" width="24" height="24" alt=""><span>Powered by Rumoca</span></a></header>
<main><div class="toolbar"><div class="run-controls"><button id="run" class="primary" disabled>▶ Run</button><button id="step" disabled>Step</button><button id="reset" disabled>↺ Reset</button><select id="speed" aria-label="Simulation speed"><option value="1">1× real time</option><option value="4">4× real time</option><option value="Infinity">As fast as possible</option></select><label class="check"><input id="tour" type="checkbox" checked>Flight tour</label></div><div class="scene-controls"><select id="environment" aria-label="Environment"><option value="city">City blocks</option><option value="warehouse">Warehouse</option><option value="courtyard">Courtyard</option></select><label class="check"><input id="show-map" type="checkbox" checked>Show map</label><button id="help">Lesson guide</button></div></div>
<div class="workspace"><section class="visuals"><div class="scene panel"><div class="panel-label"><span class="live-dot"></span>WORLD VIEW<span class="right">Three.js · orbit to explore</span></div><div id="world"></div><div class="scene-overlay"><span>QUADROTOR + D435</span><small id="flight-status">Initializing browser runtimes</small></div><div class="scene-bottom">WASD move · Q/E yaw · R/F altitude <span id="sim-time">t = 0.00 s</span></div></div>
<div class="sensor-row"><div class="panel sensor"><div class="panel-label">RGB CAMERA<span class="right">features overlay</span></div><canvas id="rgb" width="160" height="90"></canvas><div class="sensor-foot">69° × 42° · RGBA8</div></div><div class="panel sensor"><div class="panel-label">DEPTH CAMERA<span class="right">axial depth, meters</span></div><canvas id="depth" width="160" height="90"></canvas><div class="sensor-foot">87° × 58° · 0.28–10 m</div></div><div class="panel trajectory"><div class="panel-label">TRAJECTORY<span class="right">ENU · meters</span></div><canvas id="trajectory" width="260" height="146"></canvas><div class="legend"><span class="truth-key">Truth</span><span class="estimate-key">Estimate</span><span class="compare-key">External</span></div></div></div>
<div class="metrics"><div><small>SIM TIME</small><strong id="metric-time">0.00 <em>s</em></strong></div><div><small>TRAJECTORY RMSE</small><strong id="metric-ate">— <em>m</em></strong></div><div><small>FEATURES</small><strong id="metric-features">0</strong></div><div><small>MAP POINTS</small><strong id="metric-points">0</strong></div><div><small>SIM / WALL TIME</small><strong id="metric-rtf">— <em>×</em></strong></div></div></section>
<aside class="panel editor"><div class="editor-top"><button id="files-toggle" aria-controls="source-explorer" aria-expanded="false">Files</button><div><small>MODELICA SOURCE</small><h2 id="editor-title">RGB-D / inertial SLAM</h2></div><span id="language" class="badge">Modelica · Rumoca</span></div><div class="editor-selects"><label>Preset <select id="preset" aria-label="Feature detector preset"></select></label></div><p id="editor-description">Estimate a 6-DOF pose from camera images and the airframe IMU.</p><textarea id="code" aria-label="Modelica source" spellcheck="false"></textarea><div class="editor-bottom"><span id="line-count"></span><button id="apply" disabled class="primary">Apply & reset</button></div></aside></div>
<div class="bottom-row"><section class="panel connection"><h2>Embedded deployment</h2><p>Portable Modelica programs will run in the browser and on embedded hardware. Native deployment and optional ROS 2 / MAVLink adapters are under development.</p><button id="deploy" disabled>Deploy project</button><small id="deploy-state">Modelica embedded host integration pending</small></section><section class="panel recordings"><h2>Experiments</h2><p>Record synchronized sensor frames, then rerun them through edited source.</p><button id="record" disabled>● Record dataset</button><button id="export-recording" disabled>Export dataset</button><label class="button">Replay dataset<input id="replay" type="file" accept=".json" hidden></label><button id="export-node">Export source</button><small id="record-state">Up to 300 RGB-D / IMU frames per recording</small></section></div>
<div id="status" role="status">Loading Modelica environment…</div><details id="lesson" class="panel lesson"><summary>Lesson guide · Modelica robotics</summary><ol><li><b>Run the default experiment.</b> Modelica inertial propagation prepares automatically. Phones start in the city with Low graphics; desktops use Balanced graphics. Click Run to start; no initial Apply is needed. Test physics and camera data. Native feature detection is pending. This baseline has no visual localization, map or loop closure; full Modelica SLAM integration is pending.</li><li><b>Edit Modelica.</b> Physics, detector and estimator source use Rumoca diagnostics and highlighting. Apply resets the experiment.</li><li><b>Save your work.</b> Projects save locally and can be downloaded and reopened. Full Modelica SLAM execution integration is pending.</li></ol><p>Select sensor rates in Configuration. RGB and depth share a simulation clock; IMU, GPS and LiDAR use their selected rates. Physics waits for every sensor event before advancing. Three.js presents the world independently at a target of 30 FPS. The camera uses 848×480 pinhole optics with stereo disparity noise; the D435 has no IMU, so IMU measurements belong to the airframe. Traffic, pedestrians and lighting vary the scene. Open the site to use the browser environment.</p></details></main>`;

const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id)! as T;
el('environment').insertAdjacentHTML('afterend','<select id="scene-detail" aria-label="Graphics quality" aria-describedby="graphics-budget"><option value="low">Low · economical</option><option value="medium">Medium · balanced</option><option value="high">High · showcase</option></select>');
document.querySelector('.toolbar')!.insertAdjacentHTML('afterend','<p id="graphics-budget" class="graphics-budget"></p>');
el('scene-detail').insertAdjacentHTML('afterend','<select id="lighting-mode" aria-label="Lighting"><option value="day">Daylight</option><option value="night">Moonlight</option><option value="cycle">Day / night cycle</option></select>');
el('environment').insertAdjacentHTML('beforeend','<option value="tokyo">Littlest Tokyo · animated</option><option value="asset-city">Asset city</option><option value="big-city">Big city · furnished interiors</option>');
el('scene-detail').title='Controls viewer resolution, textures, shadows, clouds and scene detail. Appearance also changes sensor imagery. Sensor rates follow quality defaults unless customized.';
el('environment').insertAdjacentHTML('afterend','<select id="interior-view" aria-label="Inspect Big city" title="Move the viewer camera; simulation and sensor pose stay on the flight path" hidden><option value="overview">City overview</option><option value="store">Corner Market</option><option value="apartment">Daylight Loft</option><option value="conference">Civic Workspace</option></select>');
el('scene-detail').insertAdjacentHTML('afterend','<span id="sensor-rate-summary" class="badge"></span><label class="check"><input id="lidar-enabled" type="checkbox">64-beam LiDAR</label><label class="check"><input id="show-paths" type="checkbox" checked>3D paths</label>');
el('tour').parentElement!.insertAdjacentHTML('afterend','<select id="tour-mode" aria-label="Flight tour route"><option value="circuit">Street circuit</option><option value="indoor">Outdoor → indoor → outdoor</option></select>');
el('lidar-enabled').parentElement!.insertAdjacentHTML('afterend','<label class="check"><input id="cars-enabled" type="checkbox" checked>Cars</label><label class="check"><input id="people-enabled" type="checkbox" checked>People</label>');
el('lidar-enabled').parentElement!.insertAdjacentHTML('afterend','<label class="check"><input id="depth-cloud-enabled" type="checkbox">Raw depth cloud</label>');
document.querySelector('.scene .panel-label .right')!.innerHTML='<span id="world-fps">— FPS · target 30</span> · Three.js';
document.querySelector('.metrics')!.insertAdjacentHTML('afterend','<details class="panel estimator-diagnostics" open><summary>Estimator diagnostics</summary><div class="diagnostic-controls"><label class="check"><input id="show-uncertainty" type="checkbox" checked>2σ position ellipsoid</label><label class="check"><input id="show-graph" type="checkbox" checked>Keyframes & loop edges</label><label class="check"><input id="show-matches" type="checkbox" checked>Feature matches</label></div><div id="tracking-state">Waiting for observations</div><div id="uncertainty-state">Covariance unavailable</div><div id="graph-state">No keyframes yet · loop edges are orange</div><div id="frame-timings"></div><small>Matches connect reference → current RGB pixels. Covariance comes from the estimator; the visual frontend approximates correlations.</small></details>');
el('deploy-state').insertAdjacentHTML('afterend','<div id="comparisons"></div><small>External comparison adapters are under development.</small>');
const status=(message:string,error=false)=>{el('status').textContent=message;el('status').classList.toggle('error',error);};
const mobileDefaults=matchMedia('(max-width:760px)').matches;
let project=defaultProject(mobileDefaults);
let selected=project.graph.nodes.find(n=>n.kind==='slam')!;
const world=new World(el('world'));
document.querySelector('.visuals')!.insertAdjacentHTML('afterbegin','<div id="render-warning" class="render-warning" role="status" hidden></div>');
if(world.graphics.acceleration==='software'){
  const camera=world.calibration;
  el('render-warning').hidden=false;
  el('render-warning').textContent=`Software rendering detected: graphics are running on the CPU. Reduced preview: ${camera.width} × ${camera.height} RGB-D and 64 × 128 LiDAR, with graphics below Low. Enable browser hardware acceleration for full quality.`;
}
const graphicsDescription=()=>world.sensorProfile==='software'?'Software fallback · tiny sensor images · reduced viewer resolution · no shadows or normal maps':GRAPHICS_DESCRIPTIONS[project.sceneDetail??'high'];
el('frame-timings').insertAdjacentHTML('beforebegin','<div id="graphics-state"></div>');
el('graphics-state').textContent=`Renderer: ${world.graphics.api} · ${world.graphics.renderer} · ${world.graphics.acceleration==='software'?'software rendering':world.graphics.acceleration==='hardware-reported'?'hardware driver reported':'driver acceleration unknown'} · Vision: native Modelica integration pending`;
el('graphics-state').insertAdjacentHTML('afterend','<small id="scene-credit"></small>');
el('scene-credit').insertAdjacentHTML('afterend','<div id="navigation-state">Navigation · GPS roof geofence demonstration</div><div id="lidar-state">LiDAR disabled</div>');
const runtime=new Runtime(world);
const depthPreview=new DepthPreview(el<HTMLCanvasElement>('depth'));
const colorPreview=new ColorPreview();
let pendingSensorPreview:{frame:SensorFrame;estimate:Estimate}|undefined;
let finishInitialization!:()=>void;
const initializationReady=new Promise<void>(resolve=>{finishInitialization=resolve;});
let initialized=false;
const navigation=new NavigationHandoff();
let viewer:WorkerViewer|undefined;
let viewerPresented=true;
el('graphics-state').insertAdjacentHTML('afterend','<div id="performance-state"></div>');
const performanceMonitor=new BrowserPerformanceMonitor({targetFps:30,onUpdate:s=>{
  const display=viewer?.latest??s;
  el('world-fps').textContent=`${display.fps.toFixed(0)} FPS · target 30${viewer?' · worker':''}`;
  el('performance-state').textContent=`RGB-D input ${s.captureHz.toFixed(1)} Hz real time · Estimation ${s.visionHz.toFixed(1)} Hz real time · LiDAR ${s.lidarHz.toFixed(1)} Hz real time · lockstep cameras ${sensorRates(project).cameraHz} Hz sim time · render submission ${display.meanRenderSubmitMs?.toFixed(1)??'—'} ms · display interval p95 ${display.p95FrameIntervalMs?.toFixed(1)??'—'} ms${s.longTasks?` · main-thread stalls ${s.longTasks.count} / ${s.longTasks.blockedMs.toFixed(0)} ms`:''}`;
}});
runtime.onSensor=()=>performanceMonitor.captured();runtime.onLidar=()=>performanceMonitor.lidarCaptured();
const code=el<HTMLTextAreaElement>('code');
const configuration=mountConfigurationPanel(document.querySelector<HTMLElement>('aside.editor')!,{project:()=>project,onRatesChange:changeSensorRates,camera:()=>({...world.calibration,software:world.sensorProfile==='software'})});
const sourceEditor=createSourceEditor(code);
const runModelLabel=document.createElement('label');runModelLabel.className='run-model';runModelLabel.textContent='Run model';
const runModel=document.createElement('select');runModel.id='run-model';runModel.setAttribute('aria-label','Run model');
runModelLabel.append(runModel);document.querySelector('.run-controls')!.append(runModelLabel);
let modelDiscovery=0,modelDiscoveryTimer:ReturnType<typeof setTimeout>|undefined;
async function refreshRunModels(){
  const token=++modelDiscovery,owner=project,source=project.algorithm,companions=project.modelicaSources;
  const entryPoint=project.entryPoint??'ModelicaInertial';
  if(!Array.from(runModel.options).some(option=>option.value===entryPoint))runModel.add(new Option(entryPoint,entryPoint));
  runModel.value=entryPoint;
  try{
    const models=await sourceEditor.simulationModels(source,entryPoint,companions);
    if(token!==modelDiscovery||owner!==project||source!==project.algorithm||companions!==project.modelicaSources)return;
    runModel.replaceChildren(...models.map(name=>new Option(name,name)));
    if(!models.includes(entryPoint)){
      const missing=new Option(entryPoint+' · missing from source',entryPoint);missing.disabled=true;runModel.add(missing);
    }
    runModel.value=entryPoint;runModel.title='Select a top-level Modelica model. Run compiles your saved source.';
  }catch(error){if(token===modelDiscovery)runModel.title=String(error);}
}
runModel.onchange=()=>{
  ++modelDiscovery;
  project.entryPoint=runModel.value;delete project.algorithmArtifact;
  changed();status(`Selected ${project.entryPoint} · click Run to compile and start`);
};
const explorer=createSourceExplorer(id=>{void openSource(id);});
const workbench=document.createElement('div');workbench.className='editor-workbench';
const sourceDocument=document.createElement('div');sourceDocument.className='source-document';
const editorView=el('editor-view');
sourceDocument.append(...Array.from(editorView.children).filter(child=>!child.classList.contains('editor-top')));
workbench.append(explorer.element,sourceDocument);editorView.append(workbench);
function showFiles(show:boolean){
  workbench.classList.toggle('files-open',show);
  explorer.element.hidden=!show;
  el('files-toggle').setAttribute('aria-expanded',String(show));
}
showFiles(!mobileDefaults);
el('files-toggle').onclick=()=>showFiles(explorer.element.hidden);
function refreshFiles(){
  const manifest=rgbdSlamWorkspaceManifest(project.slamWorkspace?.schemaVersion??2);
  explorer.update([
    ...project.graph.nodes.filter(node=>node.kind!=='map').map(node=>({id:'experiment:'+node.id,path:node.kind==='slam'&&project.mainSourcePath?project.mainSourcePath.slice('models/'.length):'Experiment/'+({physics:'Quadrotor',sensor:'Sensors',detector:'FeatureDetector',slam:'Main',evaluation:'Evaluation',map:'Map',modelica:node.id}[node.kind])+'.mo'})),
    ...Object.keys(project.modelicaSources??{}).map(path=>({id:'library:'+path,path:path.slice('models/'.length)})),
    ...manifest.paths.map(path=>({id:path,path:'SLAM sources/'+path.slice('models/'.length)}))
  ],viewingSlamFile()?activeSlamFile:viewingLibraryFile()?'library:'+activeLibraryFile:'experiment:'+selected.id);
}
mountWorkspacePanes([
  {name:'viewer',panel:document.querySelector('.scene')!,header:document.querySelector('.scene .panel-label')!,fullScreenControls:document.querySelector<HTMLElement>('.run-controls')!},
  {name:'editor',panel:document.querySelector('aside.editor')!,header:document.querySelector('.configuration-tabs')!,fullScreenControls:document.querySelector<HTMLElement>('.run-controls')!}
],()=>{
  viewerPresented=!document.querySelector('.scene.pane-collapsed, aside.editor.pane-fullscreen');
  viewer?.presentationVisible(viewerPresented);
});
const slamBuildPanel=document.createElement('div');slamBuildPanel.className='slam-source-build';slamBuildPanel.hidden=true;
slamBuildPanel.innerHTML='<button id="check-slam-build">Check WASM build</button> <button id="cancel-slam-build" hidden>Cancel build</button><pre id="slam-build-result" role="status">Checks all saved SLAM sources using Rumoca in this browser. Execution integration is pending.</pre>';
document.querySelector('.editor-selects')!.after(slamBuildPanel);
let slamBuildAbort:AbortController|undefined;
let slamBuildReceipt:SlamBuildReceipt|undefined;
el('check-slam-build').onclick=async()=>{
  if(slamBuildAbort||!project.slamWorkspace)return;
  const workspace=project.slamWorkspace,owner=project,abort=new AbortController();slamBuildAbort=abort;slamBuildReceipt=undefined;
  const result=el('slam-build-result');
  el<HTMLButtonElement>('check-slam-build').disabled=true;el('cancel-slam-build').hidden=false;
  runtime.pause();el('run').textContent='▶ Run';
  result.textContent='Preparing saved source snapshot…';
  try{
    const receipt=await checkRGBDSlamBuild(workspace,{base:new URL(import.meta.env.BASE_URL,location.href).href,signal:abort.signal,
      onProgress:progress=>{result.textContent=progress.phase==='loading'?'Loading Rumoca WASM…':`${progress.phase==='compiling'?'Compiling':'Checking executable'} ${progress.model}…`;}});
    slamBuildReceipt=receipt;
    const identity=`Source ${receipt.sourceSha256.slice(0,12)} · Rumoca ${receipt.compiler?.version??'unavailable'}${receipt.compiler?' / '+receipt.compiler.revision:''}`;
    const stale=project!==owner||project.slamWorkspace!==workspace?'\nSource changed during this build; check again.':'';
    result.textContent=receipt.status==='pass'?`WASM build check passed (${receipt.programs.length} programs). Numerical execution integration is pending.\n${identity}${stale}`
      :`WASM build failed${receipt.failedAt?.model?' · '+receipt.failedAt.model:''}\n${receipt.error}\n${identity}${stale}`;
  }catch(error){result.textContent=abort.signal.aborted?'Build cancelled.':`WASM build failed: ${String(error)}`;}
  finally{slamBuildAbort=undefined;el<HTMLButtonElement>('check-slam-build').disabled=false;el('cancel-slam-build').hidden=true;slamBuildPanel.hidden=!viewingSlamFile();}
};
el('cancel-slam-build').onclick=()=>slamBuildAbort?.abort();
window.addEventListener('pagehide',()=>slamBuildAbort?.abort());
let activeSlamFile='',activeLibraryFile='',slamFileLoad=0;
const viewingSlamFile=()=>selected.kind==='slam'&&!!activeSlamFile&&!!project.slamWorkspace;
const viewingLibraryFile=()=>selected.kind==='slam'&&!!activeLibraryFile&&Object.hasOwn(project.modelicaSources??{},activeLibraryFile);
const selectedSource=()=>viewingSlamFile()?project.slamWorkspace!.sources[activeSlamFile]:viewingLibraryFile()?project.modelicaSources![activeLibraryFile]:sourceFor(selected,project);
function syncApplyButton(){
  const button=el<HTMLButtonElement>('apply');
  button.disabled=compiling||viewingSlamFile();
  button.textContent=viewingSlamFile()?'Full SLAM execution pending':'Apply & reset';
}
let ready=false,dirty=false,compiling=false,localPersistenceBlocked=false;
let truthPath:Pose[]=[],estimatePath:Pose[]=[];
const comparisons=new ComparisonTracker();
let externalLatest:TimedPose|undefined;
let latest:{frame:SensorFrame;estimate:Estimate;truth?:Truth}|undefined;
let autosaveTimer:ReturnType<typeof setTimeout>|undefined;
function changed(requiresCompilation=true) {
  runtime.pause();if(requiresCompilation)dirty=true;
  el('run').textContent='▶ Run';
  if(autosaveTimer)clearTimeout(autosaveTimer);
  autosaveTimer=setTimeout(()=>{autosaveTimer=undefined;if(localPersistenceBlocked)return;void saveProject(project).then(()=>{el('saved').textContent='Autosaved locally';}).catch(()=>{el('saved').textContent='Cannot save locally · download your project';});},350);
}
function syncProject() {
  slamBuildAbort?.abort();
  if(activeSlamFile&&!Object.hasOwn(project.slamWorkspace?.sources??{},activeSlamFile))activeSlamFile='';
  if(activeLibraryFile&&!Object.hasOwn(project.modelicaSources??{},activeLibraryFile))activeLibraryFile='';
  el<HTMLInputElement>('name').value=project.name;
  el<HTMLSelectElement>('environment').value=project.environment;
  el<HTMLSelectElement>('scene-detail').value=project.sceneDetail??'high';
  el('graphics-budget').textContent=graphicsDescription();
  el<HTMLInputElement>('lidar-enabled').checked=project.lidarEnabled??false;
  el<HTMLInputElement>('depth-cloud-enabled').checked=project.depthCloudEnabled??false;
  el<HTMLInputElement>('cars-enabled').checked=project.carsEnabled??true;
  el<HTMLInputElement>('people-enabled').checked=project.peopleEnabled??true;
  el<HTMLSelectElement>('lighting-mode').value=project.lightingMode??'day';
  configuration.sync(project);
  selectNode(project.graph.nodes.find(n=>n.id===selected?.id)??project.graph.nodes.find(n=>n.kind==='slam')!,false);
  return refreshRunModels();
}
function selectNode(node:GraphNode,showEditor=true) {
  ++slamFileLoad;
  if(showEditor)configuration.showEditor();
  selected=node;
  el('editor-title').textContent=node.title;
  el('language').textContent=nodeRuntimeLabel(node,project);
  const description:Record<string,string>={
    physics:'Quadrotor dynamics, controller and flight-tour setpoints.',
    sensor:'IMU/GPS observations and scene motion. Three.js renders camera images and depth noise at the simulation timestamps.',
    detector:'Image features in RGB pixel coordinates. Native feature detection integration is pending.',
    slam:'Modelica estimator and experiment composition.',
    map:'Estimated 3D point cloud display.',
    evaluation:'Trajectory and orientation errors in the initial reference frame.',
    modelica:'Editable Modelica source. Runtime integration is pending.'
  };
  el('editor-description').textContent=description[node.kind];
  code.value=selectedSource();code.readOnly=!['physics','sensor','detector','slam','evaluation','modelica'].includes(node.kind);
  if(code.readOnly&&node.kind!=='slam')code.value='// This built-in node is configured through its graph ports.\n// Connect an editable Modelica node to describe a transformation.';
  if(node.kind==='slam'){
    el('editor-title').textContent=viewingLibraryFile()?activeLibraryFile.slice('models/'.length):project.mainSourcePath?.slice('models/'.length)??'Main.mo';
    el('editor-description').textContent='Wire components in Modelica and choose the entry point with Run model. The current examples run inertial navigation; full RGB-D SLAM integration is pending.';
  }
  refreshFiles();
  slamBuildPanel.hidden=!viewingSlamFile()&&!slamBuildAbort;
  if(viewingSlamFile()){
    el('editor-title').textContent=activeSlamFile.slice('models/'.length);
    el('editor-description').textContent='Edit the full Modelica SLAM source workspace. All dependency files are saved with this project. Browser execution integration is pending; Run model still selects the active experiment.';
  }
  const presets=el<HTMLSelectElement>('preset');presets.replaceChildren();
  const collection=node.kind==='detector'?visibleDetectorPresets(project):node.kind==='slam'?algorithms:{};
  for(const key of Object.keys(collection)){
    presets.add(new Option(key,key));
  }
  presets.add(new Option('Custom source','custom'));
  presets.value=node.kind==='detector'?project.detectorPreset:node.kind==='slam'?project.algorithmPreset:'custom';
  if(!presets.value)presets.value='custom';presets.disabled=compiling||viewingSlamFile()||!['slam','detector'].includes(node.kind);
  document.querySelector<HTMLElement>('.editor-selects')!.hidden=viewingSlamFile()||node.kind!=='detector';
  const library=selected.kind==='slam'?{...project.modelicaSources,[project.mainSourcePath??'models/Main.mo']:project.algorithm}:undefined;
  sourceEditor.setWorkspaceSources(viewingSlamFile()?project.slamWorkspace!.sources:library,
    viewingSlamFile()?activeSlamFile:viewingLibraryFile()?activeLibraryFile:project.mainSourcePath??'models/Main.mo');
  sourceEditor.setLanguage(code.readOnly?'plaintext':'modelica');
  sourceEditor.syncFromTextarea();
  el<HTMLButtonElement>('export-node').disabled=!['physics','sensor','detector','slam','evaluation','modelica'].includes(node.kind);
  lineCount();
  syncApplyButton();
}
function lineCount(){el('line-count').textContent=`${code.value.split('\n').length} lines · ${code.readOnly?'read-only source':'editable source'}`;}
code.addEventListener('input',()=>{
  if(viewingLibraryFile()){
    project.modelicaSources={...project.modelicaSources,[activeLibraryFile]:code.value};
    delete project.algorithmArtifact;
    if(modelDiscoveryTimer)clearTimeout(modelDiscoveryTimer);
    modelDiscoveryTimer=setTimeout(()=>{void refreshRunModels();},350);
    lineCount();changed();return;
  }
  if(viewingSlamFile()){
    project.slamWorkspace=editRGBDSlamWorkspace(project.slamWorkspace!,activeSlamFile,code.value);
    lineCount();changed(false);return;
  }
  setSource(selected,project,code.value);if(selected.kind==='slam'){
    project.algorithmPreset='custom';project.runtime='modelica';delete project.algorithmArtifact;
    if(modelDiscoveryTimer)clearTimeout(modelDiscoveryTimer);
    modelDiscoveryTimer=setTimeout(()=>{void refreshRunModels();},350);
  }if(selected.kind==='detector')project.detectorPreset='custom';el<HTMLSelectElement>('preset').value='custom';lineCount();changed();
});
async function openSource(id:string){
  if(id.startsWith('experiment:')){
    const node=project.graph.nodes.find(node=>node.id===id.slice('experiment:'.length));
    if(!node)return;
    activeSlamFile='';activeLibraryFile='';selectNode(node);
    if(mobileDefaults)showFiles(false);
    sourceEditor.editor.focus();return;
  }
  if(id.startsWith('library:')){
    const path=id.slice('library:'.length);
    if(!Object.hasOwn(project.modelicaSources??{},path))return;
    activeSlamFile='';activeLibraryFile=path;selectNode(project.graph.nodes.find(node=>node.kind==='slam')!);
    if(mobileDefaults)showFiles(false);
    sourceEditor.editor.focus();return;
  }
  const path=id,token=++slamFileLoad,owner=project;
  try{
    const workspace=owner.slamWorkspace??await createRGBDSlamWorkspace('d435-native');
    if(token!==slamFileLoad||owner!==project)return;
    if(!Object.hasOwn(workspace.sources,path))throw new Error('Unknown source file: '+path);
    if(!owner.slamWorkspace){owner.slamWorkspace=workspace;changed(false);}
    activeSlamFile=path;activeLibraryFile='';selectNode(project.graph.nodes.find(node=>node.kind==='slam')!);
    if(mobileDefaults)showFiles(false);
    sourceEditor.editor.focus();
  }catch(error){if(token===slamFileLoad&&owner===project)status(String(error),true);}
}
code.addEventListener('keydown',e=>{if(e.key==='Tab'&&!code.readOnly){e.preventDefault();const at=code.selectionStart;code.setRangeText('    ',at,code.selectionEnd,'end');code.dispatchEvent(new Event('input'));}});
el<HTMLSelectElement>('preset').onchange=async e=>{
  const value=(e.target as HTMLSelectElement).value;if(value==='custom')return;
  if(selected.kind==='detector'){project.detector=detectors[value];project.detectorPreset=value;project.detectorLanguage='modelica';delete project.detectorArtifact;}
  else {project.algorithm=algorithms[value];project.algorithmPreset=value;project.runtime='modelica';delete project.algorithmArtifact;}
  selectNode(selected);changed();
  await initializationReady;
  while(compiling||runtime.busy)await new Promise(resolve=>setTimeout(resolve,20));
  await compile();
  if(ready){runtime.play();el('run').textContent='Ⅱ Pause';}
};
el<HTMLInputElement>('name').oninput=e=>{project.name=(e.target as HTMLInputElement).value;changed();};
el<HTMLSelectElement>('environment').onchange=async e=>{
  project.environment=(e.target as HTMLSelectElement).value as typeof project.environment;changed();ready=false;disableRun(true);
  await initializationReady;
  while(runtime.busy||compiling)await new Promise(resolve=>setTimeout(resolve,20));
  ready=false;
  compiling=true;configuration.setBusy(true);el<HTMLSelectElement>('environment').disabled=true;el<HTMLSelectElement>('scene-detail').disabled=true;
  try {await buildProjectScene();status('Environment updated · apply an available experiment before running');}
  catch(error){status(String(error),true);}
  finally {compiling=false;configuration.setBusy(false);disableRun(true);syncApplyButton();el<HTMLButtonElement>('reset').disabled=false;el<HTMLSelectElement>('environment').disabled=false;el<HTMLSelectElement>('scene-detail').disabled=false;}
};
function syncSceneControls() {
  el('interior-view').hidden=project.environment!=='big-city';el<HTMLSelectElement>('interior-view').value='overview';
  el('scene-credit').innerHTML=project.environment==='tokyo'?'<a href="models/TOKYO-LICENSE.md" target="_blank" rel="noopener">Littlest Tokyo · Glen Fox · CC Attribution</a>':(['city','asset-city','big-city'].includes(project.environment)?'<a href="models/licenses/ACTORS.md" target="_blank" rel="noopener">Actor credits & licenses</a>':'');
  if(project.environment==='big-city')el('scene-credit').insertAdjacentHTML('beforeend',' · Original city & furnished interiors · CC0 surface textures');
  if(project.environment==='asset-city')el('scene-credit').insertAdjacentHTML('beforeend',' · <a href="models/city/ATTRIBUTION.txt" target="_blank" rel="noopener">Buildings · J-Toastie · CC BY 3.0</a>');
}
async function buildProjectScene() {
  world.build(project.environment,project.sceneDetail??'high');await world.ready;
  world.configureActors(project.carsEnabled??true,project.peopleEnabled??true);
  world.setDepthCloudEnabled(project.depthCloudEnabled??false);world.setLighting(project.lightingMode??'day');
  syncSceneControls();
}
el<HTMLSelectElement>('interior-view').onchange=e=>world.inspectInterior((e.target as HTMLSelectElement).value as 'overview'|'store'|'apartment'|'conference');
el<HTMLSelectElement>('scene-detail').onchange=async e=>{
  project.sceneDetail=(e.target as HTMLSelectElement).value as 'low'|'medium'|'high';changed(false);
  configuration.sync(project);
  await initializationReady;
  if(compiling){dirty=true;return;}
  compiling=true;disableRun(true);el<HTMLSelectElement>('scene-detail').disabled=true;
  configuration.setBusy(true);
  try{
    while(runtime.busy)await new Promise(resolve=>setTimeout(resolve,20));
    await runtime.setGraphicsQuality(project.sceneDetail);
    el('graphics-budget').textContent=graphicsDescription();
    status(ready?'Graphics quality updated · run preserved · press Run to continue':'Graphics quality updated · select an available experiment to run');
  }catch(error){ready=false;dirty=true;status(String(error),true);}
  finally{
    compiling=false;configuration.setBusy(false);disableRun(!ready);syncApplyButton();el<HTMLButtonElement>('reset').disabled=false;el<HTMLSelectElement>('scene-detail').disabled=false;
  }
};
async function changeSensorRates(rates:SensorRates|undefined) {
  if(rates)project.sensorRates={...rates};else delete project.sensorRates;
  changed(false);configuration.sync(project);
  disableRun(true);el<HTMLSelectElement>('scene-detail').disabled=true;
  try {
    await initializationReady;
    while(runtime.busy||compiling)await new Promise(resolve=>setTimeout(resolve,20));
    runtime.setSensorRates(rates);
    status(ready?'Sensor rates updated · run preserved · press Run to continue':'Sensor rates saved · select an available experiment to run');
  }catch(error){status(String(error),true);}
  finally {disableRun(!ready);syncApplyButton();el<HTMLButtonElement>('reset').disabled=false;el<HTMLSelectElement>('scene-detail').disabled=false;}
}
el<HTMLInputElement>('lidar-enabled').onchange=async e=>{project.lidarEnabled=(e.target as HTMLInputElement).checked;changed();await compile();};
el<HTMLInputElement>('depth-cloud-enabled').onchange=async e=>{project.depthCloudEnabled=(e.target as HTMLInputElement).checked;changed();await compile();};
el<HTMLInputElement>('show-paths').onchange=e=>{world.trajectories.visible=(e.target as HTMLInputElement).checked;syncViewerFlags();};
el<HTMLSelectElement>('lighting-mode').onchange=()=>{project.lightingMode=el<HTMLSelectElement>('lighting-mode').value as 'day'|'night'|'cycle';world.setLighting(project.lightingMode);changed();};
for(const id of ['cars-enabled','people-enabled'])el<HTMLInputElement>(id).onchange=()=>{
  project.carsEnabled=el<HTMLInputElement>('cars-enabled').checked;project.peopleEnabled=el<HTMLInputElement>('people-enabled').checked;
  world.configureActors(project.carsEnabled,project.peopleEnabled);
  changed();
};
el<HTMLSelectElement>('speed').onchange=e=>runtime.speed=Number((e.target as HTMLSelectElement).value);
el<HTMLInputElement>('tour').onchange=e=>runtime.autopilot=(e.target as HTMLInputElement).checked;
el<HTMLSelectElement>('tour-mode').onchange=e=>{runtime.tourMode=(e.target as HTMLSelectElement).value as 'circuit'|'indoor';};
el<HTMLInputElement>('show-map').onchange=e=>{world.showMap((e.target as HTMLInputElement).checked);syncViewerFlags();};
el<HTMLInputElement>('show-uncertainty').onchange=()=>{if(latest){world.setEstimate(latest.estimate);world.covariance.visible=!!latest.estimate.uncertainty&&el<HTMLInputElement>('show-uncertainty').checked;}syncViewerFlags();};
el<HTMLInputElement>('show-graph').onchange=()=>{for(const object of [world.graphEdges,world.loopEdges,world.keyframes])object.visible=el<HTMLInputElement>('show-graph').checked;syncViewerFlags();};
function syncViewerFlags(){viewer?.visibility({uncertainty:el<HTMLInputElement>('show-uncertainty').checked,graph:el<HTMLInputElement>('show-graph').checked,showMap:el<HTMLInputElement>('show-map').checked,showPaths:el<HTMLInputElement>('show-paths').checked});}
el<HTMLInputElement>('show-matches').onchange=()=>{if(latest)drawSensors(latest.frame,latest.estimate);};
el('help').onclick=()=>{el<HTMLDetailsElement>('lesson').open=!el<HTMLDetailsElement>('lesson').open;el('lesson').scrollIntoView({behavior:'smooth'});};
function disableRun(disabled:boolean){for(const id of ['run','step','reset','apply','record'])el<HTMLButtonElement>(id).disabled=disabled;runModel.disabled=compiling;}
async function compile() {
  await initializationReady;
  if(compiling)return;
  compiling=true;ready=false;disableRun(true);el<HTMLSelectElement>('scene-detail').disabled=true;el<HTMLSelectElement>('preset').disabled=true;runtime.pause();
  configuration.setBusy(true);
  while(runtime.busy)await new Promise(resolve=>setTimeout(resolve,20));
  const snapshot=structuredClone(project),revision=JSON.stringify(project);
  try {
    await runtime.compile(snapshot);
    if(JSON.stringify(project)!==revision){dirty=true;status('Source changed during compilation · apply your latest edits');return;}
    project.detectorArtifact=snapshot.detectorArtifact;
    project.algorithmArtifact=snapshot.algorithmArtifact;
    dirty=false;ready=true;truthPath=[];estimatePath=[];comparisons.clear();externalLatest=undefined;latest=undefined;pendingSensorPreview=undefined;el('run').textContent='▶ Run';drawTrajectory();
    navigation.reset();
    syncSceneControls();
    if(!localPersistenceBlocked)try{await saveProject(project);}catch{el('saved').textContent='Cannot save locally · download your project';}
  }
  catch(error){ready=false;status(String(error),true);}
  finally {
    compiling=false;configuration.setBusy(false);disableRun(!ready);el<HTMLButtonElement>('apply').disabled=false;el<HTMLButtonElement>('reset').disabled=false;
    el<HTMLButtonElement>('step').disabled=!ready;
    el<HTMLSelectElement>('scene-detail').disabled=false;
    el<HTMLSelectElement>('preset').disabled=viewingSlamFile()||!['slam','detector'].includes(selected.kind);
    syncApplyButton();
  }
}
el('apply').onclick=()=>{if(!viewingSlamFile())void compile();};el('reset').onclick=()=>void compile();
el('run').onclick=async()=>{
  if(runtime.running){runtime.pause();el('run').textContent='▶ Run';return;}
  if(dirty||!ready)await compile();
  if(ready){runtime.play();el('run').textContent='Ⅱ Pause';}
};
el('step').onclick=async()=>{
  runtime.pause();while(runtime.busy)await new Promise(resolve=>setTimeout(resolve,20));
  if(dirty||!ready)await compile();
  if(ready)try{await runtime.step();}catch(error){status(String(error),true);}
};
el('save').onclick=async()=>{if(autosaveTimer)clearTimeout(autosaveTimer);autosaveTimer=undefined;try{await saveProject(project);status('Project saved in this browser');el('saved').textContent='Saved locally';}catch(error){status(String(error),true);}};
el('download').onclick=()=>download(`${project.name.replace(/[^a-z0-9_-]/gi,'_')}.slam.json`,JSON.stringify(project,null,2));
el<HTMLInputElement>('open').onchange=async e=>{
  const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;
  try{project=parseProject(await file.text());localPersistenceBlocked=false;el<HTMLButtonElement>('save').disabled=false;syncProject();changed();await compile();}catch(error){status(String(error),true);}
};
el('record').onclick=()=>{runtime.recording=!runtime.recording;el('record').textContent=runtime.recording?'■ Stop recording':'● Record dataset';el<HTMLButtonElement>('export-recording').disabled=runtime.records.length===0;};
el('export-recording').onclick=()=>{
  const records=runtime.records.map(r=>({...r,estimate:{...r.estimate,points:[]},frame:{...r.frame,rgb:Array.from(r.frame.rgb),depth:Array.from(r.frame.depth)}}));
  download(`${project.name}-dataset.json`,JSON.stringify({format:'slam-lab-dataset',version:2,project,evaluationOrigin:runtime.evaluationOrigin,records}));
};
el<HTMLInputElement>('replay').onchange=async e=>{
  const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;
  runtime.pause();while(runtime.busy)await new Promise(resolve=>setTimeout(resolve,20));
  try {
    const data=JSON.parse(await file.text());
    if(data.format!=='slam-lab-dataset'||![1,2].includes(data.version)||!Array.isArray(data.records)||data.records.length>300)throw new Error('Unsupported dataset');
    const records:RunRecord[]=data.records.map((r:any)=>({...r,frame:{...r.frame,rgb:new Uint8Array(r.frame.rgb),depth:r.frame.imageLayout?new Uint16Array(r.frame.depth):new Float32Array(r.frame.depth)}}));
    for(let i=0;i<records.length;i++) {const f=records[i].frame;validateSensorFrame(f);if(i>0&&(f.sequence<=records[i-1].frame.sequence||f.time<=records[i-1].frame.time))throw new Error('Reordered sensor frame in dataset');}
    if(dirty||!ready)await compile();await runtime.loadReplay(records,data.evaluationOrigin);truthPath=[];estimatePath=[];comparisons.clear();externalLatest=undefined;runtime.play();el('run').textContent='Ⅱ Pause';
  }catch(error){status(String(error),true);}
};
el('export-node').onclick=()=>{
  const path=viewingSlamFile()?activeSlamFile:viewingLibraryFile()?activeLibraryFile:
    selected.kind==='slam'?project.mainSourcePath:undefined;
  download(path?.split('/').at(-1)??`${selected.id}.mo`,selectedSource(),'text/plain');
};
const cameraControls=new ViewerCameraControls(),keys=new Set<string>();
el('world').tabIndex=0;el('world').setAttribute('aria-label','World camera');
el('world').addEventListener('pointerdown',()=>el('world').focus({preventScroll:true}));
document.querySelector('.scene-bottom')!.firstChild!.textContent='Viewer: WASD move · Q/E yaw · R/F altitude · Shift faster ';
el('world').insertAdjacentHTML('afterend','<label class="camera-mode">Keys control <select id="keyboard-mode" aria-label="Keyboard control"><option value="viewer">Viewer camera</option><option value="drone">Drone commands</option></select></label>');
function clearKeys(){keys.clear();cameraControls.clear();updateCommand();}
function updateCommand(){runtime.command={forward:(+keys.has('w')-+keys.has('s'))*.8,left:(+keys.has('a')-+keys.has('d'))*.8,up:(+keys.has('r')-+keys.has('f'))*.4,yaw:(+keys.has('q')-+keys.has('e'))*.5};}
el('keyboard-mode').addEventListener('change',()=>{
  clearKeys();const drone=el<HTMLSelectElement>('keyboard-mode').value==='drone';
  document.querySelector('.scene-bottom')!.firstChild!.textContent=drone?'Drone: WASD velocity · Q/E yaw · R/F climb (Run, Flight tour off) ':'Viewer: WASD move · Q/E yaw · R/F altitude · Shift faster ';
  el('world').focus({preventScroll:true});
});
window.addEventListener('keydown',e=>{
  const key=e.key.toLowerCase();
  if(document.body.classList.contains('app-loading')||!viewerPresented||isTextEntry(e.target)||e.ctrlKey||e.metaKey||e.altKey||!VIEWER_KEYS.has(key))return;
  e.preventDefault();
  if(el<HTMLSelectElement>('keyboard-mode').value==='viewer')cameraControls.keys.add(key);
  else{keys.add(key);updateCommand();}
});
window.addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());cameraControls.keys.delete(e.key.toLowerCase());updateCommand();});
window.addEventListener('blur',clearKeys);
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearKeys();});
document.addEventListener('focusin',e=>{if(isTextEntry(e.target))clearKeys();});
function drawSensors(frame:SensorFrame,estimate:Estimate) {
  const rgb=el<HTMLCanvasElement>('rgb'),ctx=rgb.getContext('2d')!;
  const k=frame.calibration;
  colorPreview.draw(ctx,frame.rgb,k.width,k.height,frame.imageLayout?.color);
  ctx.strokeStyle='#50ffc4';ctx.lineWidth=.75;
  for(const [u,v] of estimate.features??[])ctx.strokeRect(u-1.8,v-1.8,3.6,3.6);
  if(el<HTMLInputElement>('show-matches').checked) {
    ctx.strokeStyle=estimate.tracking?.accepted?'#ffbd73':'#bd9afa';ctx.lineWidth=.6;
    for(const match of estimate.tracking?.matches??[]) {
      ctx.beginPath();ctx.moveTo(match.previous[0],match.previous[1]);ctx.lineTo(match.current[0],match.current[1]);ctx.stroke();
    }
  }
  depthPreview.draw(frame.depth,k.width,k.height,k.far,frame.imageLayout?.depth);
  document.querySelector('#rgb + .sensor-foot')!.textContent=`${k.width} × ${k.height} · fx ${k.rgbFx.toFixed(1)} · ${frame.imageLayout?'RGB8':'RGBA8 dataset'}`;
  document.querySelector('#depth + .sensor-foot')!.textContent=`${k.width} × ${k.height} · ${frame.imageLayout?`Z16 · ${frame.imageLayout.depth.unitsMeters*1000} mm/unit · `:''}${k.near.toFixed(2)}–${k.far.toFixed(1)} m · black = no depth return`;
}
function drawTrajectory() {
  const canvas=el<HTMLCanvasElement>('trajectory'),ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,canvas.width,canvas.height);
  const paths:[Pose[],string][]=[[truthPath,'#b4c5d4'],[estimatePath,'#50e6b2'],...Array.from(comparisons.streams.values(),s=>[comparisons.path(s),s.color] as [Pose[],string])];
  const all=paths.flatMap(([path])=>path);
  const minX=Math.min(-2,...all.map(p=>p.x)),maxX=Math.max(8,...all.map(p=>p.x));
  const minY=Math.min(-2,...all.map(p=>p.y)),maxY=Math.max(8,...all.map(p=>p.y));
  const scale=Math.min((canvas.width-24)/(maxX-minX),(canvas.height-24)/(maxY-minY));
  ctx.strokeStyle='#26333f';ctx.lineWidth=.5;
  for(let x=0;x<canvas.width;x+=20){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}
  for(let y=0;y<canvas.height;y+=20){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}
  for(const [path,color] of paths) {
    ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.beginPath();
    path.forEach((p,i)=>{const x=12+(p.x-minX)*scale,y=canvas.height-12-(p.y-minY)*scale;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();
  }
  const table=document.createElement('table');
  for(const stream of comparisons.streams.values()) {
    const row=document.createElement('tr'),name=document.createElement('td'),value=document.createElement('td');
    name.textContent=stream.topic;name.style.color=stream.color;
    value.textContent=stream.pairs?`${Math.sqrt(stream.squaredDifference/stream.pairs).toFixed(3)} m RMS · ${stream.pairs} pairs`:`${stream.samples} samples · waiting for shared timestamps`;
    row.append(name,value);table.append(row);
  }
  el('comparisons').replaceChildren(table);
}
runtime.onStatus=message=>{status(message);el('flight-status').textContent=message;};
runtime.onError=error=>{status(error.message,true);el('run').textContent='▶ Run';};
runtime.onFrame=(frame,estimate,truth,metrics)=>{
  performanceMonitor.visionProcessed();
  latest={frame,estimate,truth};if(truth)truthPath.push(poseSnapshot(runtime.referenceTruth(truth)));estimatePath.push(poseSnapshot(estimate));truthPath=truthPath.slice(-2000);estimatePath=estimatePath.slice(-2000);
  comparisons.addLocal(frame.time,estimate);
  const paths=[{id:'truth',color:0xc9d7e3,points:truthPath},{id:'slam',color:0x50e6b2,points:estimatePath},...Array.from(comparisons.streams.values()).map((stream,i)=>({id:`external-${i}`,color:Number.parseInt(stream.color.replace('#',''),16),points:comparisons.path(stream)}))];
  world.setTrajectories(paths);
  if(world.latestLidar)viewer?.lidar(world.latestLidar);
  viewer?.depthCloudEnabled(world.depthCloudEnabled);
  const depthDisplay=world.latestDepthRaster??world.latestDepthCloud;
  if(depthDisplay)viewer?.depthCloud(depthDisplay);
  viewer?.diagnostics(estimate,truth?runtime.evaluationOrigin:undefined,paths,{uncertainty:el<HTMLInputElement>('show-uncertainty').checked,graph:el<HTMLInputElement>('show-graph').checked,showMap:el<HTMLInputElement>('show-map').checked,showPaths:el<HTMLInputElement>('show-paths').checked});
  const nav=navigation.update(frame.time,estimate,runtime.gps);
  el('navigation-state').textContent=truth?`Navigation · ${nav.status} · ${nav.reason}${nav.alignment?` · alignment ${nav.alignment.pairs} fixes / ${nav.alignment.rms.toFixed(2)} m RMS`:''}`:'GPS handoff unavailable for this external/replayed dataset';
  el('lidar-state').textContent=world.latestLidar?`LiDAR · 64 × ${world.latestLidar.columns} samples · raw GPU cloud · t=${world.latestLidar.time.toFixed(3)} s · ${world.lidar.timings?.totalMs.toFixed(1)} ms`:'LiDAR disabled';
  pendingSensorPreview={frame,estimate};
  el('sim-time').textContent=`t = ${metrics.time.toFixed(2)} s`;el('metric-time').innerHTML=`${metrics.time.toFixed(2)} <em>s</em>`;
  el('metric-ate').innerHTML=metrics.ate===null?'Unavailable':`${metrics.ate.toFixed(3)} <em>m</em>`;el('metric-features').textContent=runtime.pendingNodes.size?'Pending':String(metrics.features);
  el('metric-points').textContent=metrics.points.toLocaleString();el('metric-rtf').innerHTML=`${metrics.rtf.toFixed(2)} <em>×</em>`;
  el('metric-time').previousElementSibling!.textContent=truth?'SIM TIME':'SENSOR TIME';
  el('metric-rtf').previousElementSibling!.textContent=truth?'SIM / WALL TIME':'SENSOR / WALL TIME';
  el('flight-status').textContent=`${truth?'Simulation':'Measured input'} · frame ${frame.sequence} · ${runtime.pendingNodes.size?'Inertial baseline · visual SLAM pending':`${(metrics.confidence*100).toFixed(0)}% tracking · ${metrics.loops} loop matches`}${metrics.dropped?` · ${metrics.dropped} skipped in browser`:''}`;
  world.covariance.visible=!!estimate.uncertainty&&el<HTMLInputElement>('show-uncertainty').checked;
  el('tracking-state').textContent=estimate.tracking?`${estimate.tracking.matches.length} proposed feature matches${estimate.tracking.referenceSequence===undefined?'':` to frame ${estimate.tracking.referenceSequence}`} · ${estimate.tracking.reason} · ${estimate.diagnostics?.visualUpdates??0} visual updates / ${estimate.diagnostics?.visualRejected??0} rejected`:'Matching diagnostics unavailable for this node';
  el('uncertainty-state').textContent=estimate.uncertainty?`Position σ trace norm ${Number(estimate.diagnostics?.positionStd??0).toFixed(3)} m · accelerometer bias ${Number(estimate.diagnostics?.accelBiasNorm??0).toFixed(4)} m/s² · gyro bias ${Number(estimate.diagnostics?.gyroBiasNorm??0).toFixed(5)} rad/s`:'Covariance unavailable for this node';
  el('graph-state').textContent=estimate.poseGraph?`${estimate.poseGraph.keyframes.length} keyframes · ${estimate.poseGraph.edges.length} constraints · ${metrics.loops} verified loops · ${estimate.diagnostics?.loopRejections??0} rejected candidates`:'Pose graph unavailable for this node';
  if(estimate.diagnostics?.loopWords!==undefined)el('graph-state').textContent+=` · ${estimate.diagnostics.loopWords} visual words / ${estimate.diagnostics.loopCandidates??0} retrieved candidates`;
  if(estimate.diagnostics?.landmarksConfirmed!==undefined)el('graph-state').textContent+=` · ${estimate.diagnostics.landmarksConfirmed} confirmed / ${estimate.diagnostics.landmarksTentative??0} tentative landmarks · ${estimate.diagnostics.landmarksPruned??0} pruned (${estimate.diagnostics.landmarksFreeSpacePruned??0} free-space contradictions)`;
  if(estimate.diagnostics?.mappingStatus)el('graph-state').textContent+=` · ${estimate.diagnostics.mappingStatus}`;
  el('frame-timings').textContent=`Frame work: ${Object.entries(runtime.lastTimings).map(([id,ms])=>`${id} ${ms.toFixed(1)} ms`).join(' · ')}`;
  if(world.captureTimings&&truth)el('frame-timings').textContent+=` · camera submission ${world.captureTimings.renderSubmission.toFixed(1)} ms / readback wait ${world.captureTimings.readback.toFixed(1)} ms`;
  el('record-state').textContent=`${runtime.records.length} recorded frames${runtime.recording?' · recording':''}`;
  el<HTMLButtonElement>('export-recording').disabled=runtime.records.length===0;
};
// A single independently paced overview; simulation awaits every graph node.
// Correct the deadline phase rather than drawing bursts after a missed slot.
let cameraWall=performance.now();
function render(now=0){
  if(performanceMonitor.shouldRender(now)){
    const started=performance.now();world.controls.update();cameraControls.update(world.view,world.controls,(now-cameraWall)/1000);cameraWall=now;
    if(viewerPresented){
      if(viewer){viewer.flushClouds();viewer.camera();viewer.running(runtime.running);}else world.render(runtime.running);
    }
    if(pendingSensorPreview){const {frame,estimate}=pendingSensorPreview;pendingSensorPreview=undefined;drawSensors(frame,estimate);drawTrajectory();}
    performanceMonitor.rendered(performance.now()-started);
  }
  requestAnimationFrame(render);
}requestAnimationFrame(render);
// Exposed state supports browser integration checks without privileged access.
(window as any).__slamLab={runtime,comparisons,sourceEditor,performanceMonitor,get initialized(){return initialized;},get viewer(){return viewer;},get project(){return project;},get slamBuildReceipt(){return slamBuildReceipt;},get latest(){return latest;},get ready(){return ready;},get compiling(){return compiling;},get externalSamples(){return Array.from(comparisons.streams.values()).reduce((sum,s)=>sum+s.samples,0);},get externalLatest(){return externalLatest;}};
void (async()=>{
  startup.stage(0,'Opening your project…');
  try{project=await loadProject(mobileDefaults);selected=project.graph.nodes.find(n=>n.kind==='slam')!;}
  catch(error){
    localPersistenceBlocked=true;el<HTMLButtonElement>('save').disabled=true;
    el<HTMLButtonElement>('apply').disabled=false;el<HTMLButtonElement>('reset').disabled=false;
    el('saved').textContent='Saved project preserved · migration required';
    const notice=document.createElement('div');notice.id='migration-notice';notice.textContent=`${error}. Automatic saving is disabled until you open a converted Modelica project.`;
    const backup=document.createElement('button');backup.textContent='Download saved project';backup.onclick=async()=>{try{const saved=await readSavedProject();if(saved)download('saved-project-for-migration.slam.json',JSON.stringify(saved,null,2));}catch(error){status(String(error),true);}};
    notice.append(backup);el('status').after(notice);status(String(error),true);
  }
  try{
    const modelsReady=syncProject();
    startup.stage(1,'Preparing the scene and graphics…');
    if(typeof OffscreenCanvas!=='undefined'&&typeof HTMLCanvasElement.prototype.transferControlToOffscreen==='function'){
      const candidate=new WorkerViewer(world,el('world'));
      try{await candidate.ready;viewer=candidate;candidate.presentationVisible(viewerPresented);world.onBuild=(environment,detail,preservePresentation)=>candidate.configure(environment,detail,project.carsEnabled??true,project.peopleEnabled??true,preservePresentation);world.onPose=truth=>candidate.pose(truth);world.onActors=(cars,people)=>candidate.actors(cars,people);world.onActorMotion=frame=>candidate.actorMotion(frame);world.onEnvironmentVisible=visible=>candidate.sceneVisible(visible);world.onLighting=mode=>candidate.lighting(mode);await world.enableSensorWorker();}
      catch(error){candidate.worker.terminate();candidate.canvas.remove();viewer=undefined;el('world').appendChild(world.renderer.domElement);world.controls.disconnect();world.controls.connect(world.renderer.domElement);world.onBuild=async()=>{};world.onPose=()=>{};world.onActors=()=>{};world.onActorMotion=()=>{};world.onEnvironmentVisible=()=>{};world.onLighting=()=>{};status(`Rendering worker unavailable: ${error} · using main-thread renderer`);}
    }
    await buildProjectScene();
    initialized=true;finishInitialization();
    startup.stage(2,'Compiling your Modelica model…');
    if(!localPersistenceBlocked){await compile();if(ready)status('Ready · click Run to start the Modelica inertial experiment');}
    else{el<HTMLButtonElement>('apply').disabled=false;el<HTMLButtonElement>('reset').disabled=false;}
    if(!ready&&!localPersistenceBlocked){startup.fail(el('status').textContent);return;}
    startup.stage(3,'Preparing the editor and first view…');
    await modelsReady;
    if(viewer)await viewer.present();else world.render();
    startup.complete();
  }
  catch(error){status(String(error),true);startup.fail(error);}
})();
