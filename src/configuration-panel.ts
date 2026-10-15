import {SENSOR_RATE_OPTIONS,sensorRates,type SensorRates} from './sensor-clock';
import type {SceneDetail} from './types';
import {D435_PAIRED_RESOLUTIONS,type CameraResolution} from './camera-profile';

interface ConfigurationProject {sceneDetail?:SceneDetail;sensorRates?:SensorRates;cameraResolution?:CameraResolution}
interface ConfigurationOptions {
  project:()=>ConfigurationProject;
  onRatesChange:(rates:SensorRates|undefined)=>Promise<void>;
  onResolutionChange?:(resolution:CameraResolution)=>Promise<void>;
  camera?:()=>{width:number;height:number;software:boolean};
}

/** Move existing controls intact so their labels, state and event handlers survive. */
export function mountConfigurationPanel(aside:HTMLElement,options:ConfigurationOptions) {
  const document=aside.ownerDocument;
  const editor=document.createElement('div');editor.id='editor-view';editor.className='editor-view';
  editor.setAttribute('role','tabpanel');editor.setAttribute('aria-labelledby','editor-tab');
  editor.append(...Array.from(aside.childNodes));
  const tabs=document.createElement('div');tabs.className='configuration-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Workspace pane');
  tabs.innerHTML='<button id="editor-tab" role="tab" aria-controls="editor-view" aria-selected="true">Editor</button><button id="configuration-tab" role="tab" aria-controls="configuration-view" aria-selected="false" tabindex="-1">Configuration</button>';
  const configuration=document.createElement('div');configuration.id='configuration-view';configuration.className='configuration-view';configuration.hidden=true;
  configuration.setAttribute('role','tabpanel');configuration.setAttribute('aria-labelledby','configuration-tab');
  configuration.innerHTML='<section><h2>Scene & display</h2><p>Appearance changes camera imagery as well as the viewer.</p><div class="configuration-scene"></div></section><section><h2>Flight</h2><div class="configuration-flight"></div></section><section><h2>Sensor rates</h2><p id="sensor-rate-help">Rates use simulation time. RGB and depth share one capture; physics waits for each sensor event. Viewer presentation remains independent.</p><div class="configuration-rates"></div><p id="sensor-rate-policy"></p><button id="quality-sensor-defaults">Use quality defaults</button></section>';
  configuration.querySelector('.configuration-scene')!.append(document.querySelector('.scene-controls')!,document.getElementById('graphics-budget')!);
  configuration.querySelector('.configuration-flight')!.append(document.getElementById('tour-mode')!);
  const labels:Record<keyof SensorRates,string>={cameraHz:'RGB + depth rate',lidarHz:'LiDAR rate',imuHz:'Airframe IMU rate',gpsHz:'GPS rate'};
  const controls={} as Record<keyof SensorRates,HTMLSelectElement>;
  const defaults=configuration.querySelector<HTMLButtonElement>('#quality-sensor-defaults')!;
  const resolution=document.createElement('select');resolution.setAttribute('aria-label','RGB + depth resolution');
  const resolutionLabel=document.createElement('label');resolutionLabel.textContent='RGB + depth resolution';resolutionLabel.append(resolution);
  for(const mode of D435_PAIRED_RESOLUTIONS)resolution.add(new Option(`${mode.width} × ${mode.height}`,mode.id));
  configuration.querySelector('.configuration-rates')!.append(resolutionLabel);
  let pending=false,externalBusy=false;
  function setBusy(busy:boolean) {
    externalBusy=busy;defaults.disabled=pending||externalBusy;
    resolution.disabled=pending||externalBusy;
    Object.values(controls).forEach(control=>{control.disabled=pending||externalBusy;});
  }
  function sync(project:ConfigurationProject) {
    const rates=sensorRates(project);
    resolution.value=project.cameraResolution??'848x480';
    const mode=D435_PAIRED_RESOLUTIONS.find(mode=>mode.id===resolution.value)!;
    const cameraNow=options.camera?.()??{...mode,software:false};
    const maxHz=mode.maxHz;
    for(const option of Array.from(controls.cameraHz.options))option.disabled=Number(option.value)>maxHz;
    configuration.querySelector('#sensor-rate-help')!.textContent=`${cameraNow.software?'Software preview':'D435 RGB and depth'}: ${cameraNow.width} × ${cameraNow.height}, with separate optics. Selected hardware mode supports up to ${maxHz} Hz. Lower simulated rates reduce processing. Viewer presentation remains independent at 30 FPS.`;
    for(const key of Object.keys(controls) as (keyof SensorRates)[])controls[key].value=String(rates[key]);
    configuration.querySelector('#sensor-rate-policy')!.textContent=project.sensorRates?'Custom rates · retained when graphics quality changes':`Following ${(project.sceneDetail??'high')} quality defaults`;
    const summary=document.getElementById('sensor-rate-summary');
    if(summary)summary.textContent=`RGB + depth · ${cameraNow.width} × ${cameraNow.height} · ${rates.cameraHz} Hz sim time${cameraNow.software?' · software preview':''}`;
  }
  resolution.onchange=async()=>{
    if(pending||externalBusy)return;
    pending=true;setBusy(externalBusy);
    try{await options.onResolutionChange?.(resolution.value as CameraResolution);}
    finally{pending=false;setBusy(externalBusy);sync(options.project());}
  };
  async function change(rates:SensorRates|undefined) {
    if(pending||externalBusy)return;
    pending=true;setBusy(externalBusy);
    try {await options.onRatesChange(rates);}
    finally {pending=false;setBusy(externalBusy);sync(options.project());}
  }
  for(const key of Object.keys(labels) as (keyof SensorRates)[]) {
    const label=document.createElement('label');label.textContent=labels[key];
    const select=document.createElement('select');select.id=`sensor-${key}`;select.setAttribute('aria-label',labels[key]);select.setAttribute('aria-describedby','sensor-rate-help');
    for(const value of SENSOR_RATE_OPTIONS[key])select.add(new Option(`${value} Hz`,String(value)));
    controls[key]=select;label.append(select);configuration.querySelector('.configuration-rates')!.append(label);
    select.onchange=()=>{const rates=sensorRates(options.project());Object.assign(rates,{[key]:Number(select.value)});void change(rates);};
  }
  defaults.onclick=()=>{void change(undefined);};
  aside.append(tabs,editor,configuration);
  const buttons=Array.from(tabs.querySelectorAll<HTMLButtonElement>('button'));
  const panels:HTMLElement[]=[editor,configuration];
  function show(index:number,focus=false) {
    panels.forEach((panel,i)=>{panel.hidden=i!==index;});
    buttons.forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;});
    if(focus)buttons[index].focus();
    panels[index].dispatchEvent(new Event('workspace:show'));
  }
  function bind(button:HTMLButtonElement,index:number){
    button.onclick=()=>show(index);
    button.onkeydown=event=>{
      const next=event.key==='ArrowRight'?(index+1)%buttons.length:event.key==='ArrowLeft'?(index+buttons.length-1)%buttons.length:event.key==='Home'?0:event.key==='End'?buttons.length-1:undefined;
      if(next!==undefined){event.preventDefault();show(next,true);}
    };
  }
  buttons.forEach(bind);
  function addPanel(id:string,label:string,panel:HTMLElement){
    if(document.getElementById(`${id}-tab`))throw new Error(`Duplicate workspace tab: ${id}`);
    const button=document.createElement('button');button.type='button';button.id=`${id}-tab`;
    button.textContent=label;button.setAttribute('role','tab');button.setAttribute('aria-controls',`${id}-view`);
    button.setAttribute('aria-selected','false');button.tabIndex=-1;
    panel.id=`${id}-view`;panel.hidden=true;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);
    const index=panels.length;panels.push(panel);buttons.push(button);bind(button,index);
    tabs.insertBefore(button,tabs.querySelector('.pane-actions'));aside.append(panel);
    return {show:()=>show(index)};
  }
  sync(options.project());
  return {sync,setBusy,addPanel,showEditor:()=>show(0),showConfiguration:()=>show(1)};
}
