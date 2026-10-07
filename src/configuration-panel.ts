import {SENSOR_RATE_OPTIONS,sensorRates,type SensorRates} from './sensor-clock';
import type {SceneDetail} from './types';
import {D435_IMAGE,D435_PAIRED_MAX_HZ} from './camera-profile';

interface ConfigurationProject {sceneDetail?:SceneDetail;sensorRates?:SensorRates}
interface ConfigurationOptions {
  project:()=>ConfigurationProject;
  onRatesChange:(rates:SensorRates|undefined)=>Promise<void>;
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
  configuration.querySelector('#sensor-rate-help')!.textContent=`D435 RGB and depth: ${D435_IMAGE.width} × ${D435_IMAGE.height}, with separate optics. Paired capture supports15–${D435_PAIRED_MAX_HZ} Hz in simulation time; RGB is the limiting stream. Physics waits for processing. Viewer presentation remains independent at30 FPS.`;
  configuration.querySelector('.configuration-scene')!.append(document.querySelector('.scene-controls')!,document.getElementById('graphics-budget')!);
  configuration.querySelector('.configuration-flight')!.append(document.getElementById('tour')!.parentElement!,document.getElementById('tour-mode')!);
  const labels:Record<keyof SensorRates,string>={cameraHz:'RGB + depth rate',lidarHz:'LiDAR rate',imuHz:'Airframe IMU rate',gpsHz:'GPS rate'};
  const controls={} as Record<keyof SensorRates,HTMLSelectElement>;
  const defaults=configuration.querySelector<HTMLButtonElement>('#quality-sensor-defaults')!;
  let pending=false,externalBusy=false;
  function setBusy(busy:boolean) {
    externalBusy=busy;defaults.disabled=pending||externalBusy;
    Object.values(controls).forEach(control=>{control.disabled=pending||externalBusy;});
  }
  function sync(project:ConfigurationProject) {
    const rates=sensorRates(project);
    for(const key of Object.keys(controls) as (keyof SensorRates)[])controls[key].value=String(rates[key]);
    configuration.querySelector('#sensor-rate-policy')!.textContent=project.sensorRates?'Custom rates · retained when graphics quality changes':`Following ${(project.sceneDetail??'high')} quality defaults`;
    const summary=document.getElementById('sensor-rate-summary');
    if(summary)summary.textContent=`RGB + depth · ${D435_IMAGE.width} × ${D435_IMAGE.height} · ${rates.cameraHz} Hz sim time`;
  }
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
  function show(index:number,focus=false) {
    editor.hidden=index!==0;configuration.hidden=index!==1;
    buttons.forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;});
    if(focus)buttons[index].focus();
  }
  buttons.forEach((button,index)=>{
    button.onclick=()=>show(index);
    button.onkeydown=event=>{
      const next=event.key==='ArrowRight'||event.key==='ArrowLeft'?1-index:event.key==='Home'?0:event.key==='End'?1:undefined;
      if(next!==undefined){event.preventDefault();show(next,true);}
    };
  });
  sync(options.project());
  return {sync,setBusy,showEditor:()=>show(0)};
}
