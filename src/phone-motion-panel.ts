import {WorkerRpc} from './rpc';
import {estimatorModelicaSources,phoneMotionEKFPath,phoneMotionEKFSource,type Project} from './project';
import {modelicaModelsSources} from './modelica-models-library';
import {AccelSignDetector,MotionBatcher,eulerDegrees,initialTilt,motionSample,type MotionSample} from './phone-motion';
import './phone-motion.css';

const inertialOnlyPath='models/Libraries/CogniPilot/SLAM/Examples/InertialOnly.mo';
const MODELS={
  PhoneMotionEKF:{path:phoneMotionEKFPath,label:'EKF · phone-tuned',bundled:phoneMotionEKFSource,tilt:true},
  'SLAM.Examples.InertialOnly':{path:inertialOnlyPath,label:'Inertial only · no corrections',bundled:modelicaModelsSources[inertialOnlyPath],tilt:false},
} as const;
type ModelName=keyof typeof MODELS;
const OBSERVE=['gyroBias[1]','gyroBias[2]','gyroBias[3]','attitudeStd[1]','attitudeStd[2]','stationarity','gravityWeight'];
/** Orientation events settle the accelerometer sign; give up waiting after this. */
const ALIGN_SECONDS=.6;
type PermissionRequest={requestPermission?:()=>Promise<'granted'|'denied'>};

/** Live phone IMU into a compiled Modelica estimator, independent of the drone
 * simulation. iOS only delivers motion events over HTTPS after a tap. */
export function mountPhoneMotionPanel(parent:Element,project:()=>Project){
  const document=parent.ownerDocument;
  const section=document.createElement('section');section.className='phone-motion';
  section.innerHTML='<h2>Phone motion sensors</h2><p>Runs a Modelica estimator on this phone\'s accelerometer and gyroscope. Roll and pitch stay corrected by gravity; heading and position drift without a camera or GPS.</p>'
    +'<label>Estimator<select id="phone-motion-model" aria-label="Phone motion estimator"></select></label>'
    +'<button id="phone-motion-start" class="primary">Use this phone\'s motion sensors</button>'
    +'<canvas id="phone-motion-attitude" width="240" height="120" aria-label="Phone attitude"></canvas>'
    +'<dl class="phone-motion-readout"></dl><p class="phone-motion-status" role="status"></p>';
  parent.append(section);
  const select=section.querySelector<HTMLSelectElement>('#phone-motion-model')!;
  for(const [name,model] of Object.entries(MODELS))select.add(new Option(model.label,name));
  const button=section.querySelector<HTMLButtonElement>('#phone-motion-start')!;
  const canvas=section.querySelector<HTMLCanvasElement>('#phone-motion-attitude')!;
  const readout=section.querySelector('dl')!,statusLine=section.querySelector('.phone-motion-status')!;
  const status=(text:string,error=false)=>{statusLine.textContent=text;statusLine.classList.toggle('error',error);};
  if(typeof DeviceMotionEvent==='undefined'){button.disabled=true;status('This browser does not report motion sensors.');}

  let running=false,rpc:WorkerRpc|undefined,generation=0,busy=false,ready=false;
  let detector=new AccelSignDetector(),aligning:MotionSample[]=[],alignStart:number|undefined,accelSign=1;
  let orientation:{beta:number;gamma:number}|undefined;
  const batcher=new MotionBatcher();
  let samples=0,rateStart=performance.now(),rate=0;

  const onOrientation=(event:DeviceOrientationEvent)=>{
    if(typeof event.beta==='number'&&typeof event.gamma==='number')orientation={beta:event.beta,gamma:event.gamma};
  };
  const onMotion=(event:DeviceMotionEvent)=>{
    samples++;
    if(alignStart===undefined||!ready){
      const raw=motionSample(event);if(!raw)return;
      alignStart??=event.timeStamp;
      if(orientation)detector.add(raw.accel,orientation.beta,orientation.gamma);
      aligning.push(raw);
      if((detector.done||(event.timeStamp-alignStart)/1000>ALIGN_SECONDS)&&!rpc)void start();
      return;
    }
    const sample=motionSample(event,accelSign);if(!sample)return;
    if(batcher.add(sample,event.timeStamp)==='restart'){restart(busy?'Estimator fell behind the sensor; restarting':'Sensor paused; restarting');return;}
    pump();
  };

  async function start(){
    const token=++generation;
    accelSign=detector.sign;
    const accel=[0,1,2].map(i=>accelSign*aligning.reduce((sum,sample)=>sum+sample.accel[i],0)/aligning.length);
    const name=select.value as ModelName,model=MODELS[name],current=project();
    const source=model.path===current.mainSourcePath?current.algorithm:current.modelicaSources?.[model.path]??model.bundled;
    const workspaceSources=estimatorModelicaSources(current);delete workspaceSources[model.path];
    const parameters={...current.modelParameters?.[name],...(model.tilt?initialTilt(accel):{})};
    status('Compiling the estimator…');
    const worker=new WorkerRpc(new Worker(new URL('./modelica-state.worker.ts',import.meta.url),{type:'module'}));
    rpc=worker;
    try{
      await worker.call('init',{base:new URL(import.meta.env.BASE_URL,location.href).href,source,workspaceSources,modelName:name,parameters},180_000);
      if(token!==generation){worker.stop();return;}
      // Samples that arrived while compiling are not integrated; the next
      // sample starts the session clock at zero.
      batcher.reset();ready=true;
      status(accelSign<0?'Running · accelerometer sign inverted for this browser':'Running');
    }catch(error){if(token===generation){stop();status(String(error),true);}}
  }
  function pump(){
    if(busy||!ready||!rpc)return;
    const frame=batcher.take();if(!frame)return;
    busy=true;const token=generation,worker=rpc;
    worker.call<{quaternion:number[];x:number;y:number;z:number;observed?:Record<string,number>}>('step',{frame,observe:OBSERVE},10_000)
      .then(result=>{if(token===generation)render(result);})
      .catch(error=>{if(token===generation){stop();status(String(error),true);}})
      .finally(()=>{if(token===generation){busy=false;pump();}});
  }
  function render(result:{quaternion:number[];x:number;y:number;z:number;observed?:Record<string,number>}){
    const now=performance.now();
    if(now-rateStart>1000){rate=samples*1000/(now-rateStart);samples=0;rateStart=now;}
    const {roll,pitch,yaw}=eulerDegrees(result.quaternion),o=result.observed??{};
    const deg=(value:number|undefined)=>value===undefined?'—':`${(value*180/Math.PI).toFixed(2)}°`;
    const rows:[string,string][]=[
      ['Roll',`${roll.toFixed(1)}°`],['Pitch',`${pitch.toFixed(1)}°`],['Heading · drifts',`${yaw.toFixed(1)}°`],
      ['Tilt σ',o['attitudeStd[1]']===undefined?'—':`${deg(o['attitudeStd[1]'])} / ${deg(o['attitudeStd[2]'])}`],
      ['Gyro bias',o['gyroBias[1]']===undefined?'—':[1,2,3].map(i=>deg(o[`gyroBias[${i}]`])).join(' ')],
      ['Still',o.stationarity===undefined?'—':`${Math.round(o.stationarity*100)}%`],
      ['Position · drifts',`${result.x.toFixed(2)}, ${result.y.toFixed(2)}, ${result.z.toFixed(2)} m`],
      ['Sensor rate',`${rate.toFixed(0)} Hz`],
    ];
    readout.replaceChildren(...rows.flatMap(([term,value])=>{
      const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=term;dd.textContent=value;return [dt,dd];
    }));
    drawHorizon(canvas,roll,pitch);
  }
  function restart(reason:string){
    rpc?.stop();rpc=undefined;generation++;busy=false;ready=false;
    detector=new AccelSignDetector();aligning=[];alignStart=undefined;batcher.reset();
    status(reason);
  }
  function stop(){
    window.removeEventListener('devicemotion',onMotion);window.removeEventListener('deviceorientation',onOrientation);
    rpc?.stop();rpc=undefined;generation++;busy=false;ready=false;running=false;
    aligning=[];alignStart=undefined;batcher.reset();
    button.textContent='Use this phone\'s motion sensors';select.disabled=false;
  }
  button.onclick=()=>{
    if(running){stop();status('Stopped');return;}
    // iOS grants motion access only from a tap; request both before any await.
    const motion=(DeviceMotionEvent as unknown as PermissionRequest).requestPermission?.();
    const tilt=typeof DeviceOrientationEvent==='undefined'?undefined:(DeviceOrientationEvent as unknown as PermissionRequest).requestPermission?.();
    void Promise.all([motion,tilt].map(request=>request?.catch(()=>'denied' as const))).then(([motionState])=>{
      if(motionState==='denied'){status('Motion access was denied. Allow it in Safari settings for this site and try again.',true);return;}
      running=true;button.textContent='Stop phone sensors';select.disabled=true;
      detector=new AccelSignDetector();aligning=[];alignStart=undefined;
      window.addEventListener('deviceorientation',onOrientation);window.addEventListener('devicemotion',onMotion);
      status('Hold the phone still while the estimator aligns…');
      setTimeout(()=>{if(running&&!samples&&!ready)status('No motion events yet. iPhone Safari needs HTTPS and motion access.',true);},2000);
    });
  };
  /** Show the panel and start the sensors in one tap. Call from a click handler:
   * iOS only grants motion access during the tap itself. */
  function open(){
    document.getElementById('configuration-tab')?.click();
    section.scrollIntoView({behavior:'smooth',block:'start'});
    if(!running&&!button.disabled)button.click();
  }
  return {stop,open};
}

/** A toolbar shortcut on touch devices that report motion, where the panel is
 * otherwise far down the page. */
export function mountPhoneMotionShortcut(toolbar:Element,panel:{open():void}){
  const view=toolbar.ownerDocument.defaultView;
  if(!view||typeof view.DeviceMotionEvent==='undefined')return;
  if(!(view.navigator.maxTouchPoints>0||view.matchMedia('(pointer: coarse)').matches))return;
  const shortcut=toolbar.ownerDocument.createElement('button');
  shortcut.id='phone-motion-shortcut';shortcut.className='phone-motion-shortcut';shortcut.textContent='Phone sensors';
  shortcut.onclick=()=>panel.open();
  toolbar.append(shortcut);
}

/** An artificial horizon: the sky tilts against roll and slides with pitch. */
function drawHorizon(canvas:HTMLCanvasElement,roll:number,pitch:number){
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const {width,height}=canvas;
  ctx.save();ctx.clearRect(0,0,width,height);
  ctx.translate(width/2,height/2);ctx.rotate(-roll*Math.PI/180);
  const shift=Math.max(-height,Math.min(height,pitch*height/90));
  ctx.fillStyle='#21435a';ctx.fillRect(-width,-2*height+shift,2*width,2*height);
  ctx.fillStyle='#3b3324';ctx.fillRect(-width,shift,2*width,2*height);
  ctx.strokeStyle='#53e2b2';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-width,shift);ctx.lineTo(width,shift);ctx.stroke();
  ctx.restore();
  ctx.strokeStyle='#d7e1e9';ctx.lineWidth=2;ctx.beginPath();
  ctx.moveTo(width/2-30,height/2);ctx.lineTo(width/2-8,height/2);ctx.moveTo(width/2+8,height/2);ctx.lineTo(width/2+30,height/2);ctx.stroke();
}
