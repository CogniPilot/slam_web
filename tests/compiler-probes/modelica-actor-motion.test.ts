import {it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import init,* as rumoca from '@cognipilot/rumoca';

type Actor={speed:number;offset:number;halfLength:number;radius:number;phase:number};
const defaults:Actor[]=Array.from({length:6},(_,i)=>i<3?{
  speed:.78,offset:[24,36+Math.PI*4.05+7,10][i],halfLength:18,radius:4.05,phase:i*.43,
}:{speed:2.2,offset:[8,40+Math.PI*1.4+6,30][i-3],halfLength:20,radius:1.4,phase:0});

// Independent original route mathematics; this is a test oracle only.
function original(time:number,actor:Actor,animationRate=.85){
  const distance=actor.speed*time,straight=2*actor.halfLength,arc=Math.PI*actor.radius,length=2*(straight+arc);
  let s=((distance+actor.offset)%length+length)%length;
  let east:number,north:number,dx:number,dy:number;
  if(s<straight){east=-actor.halfLength+s;north=-actor.radius;dx=1;dy=0;}
  else if((s-=straight)<arc){const a=-Math.PI/2+s/actor.radius;east=actor.halfLength+actor.radius*Math.cos(a);north=actor.radius*Math.sin(a);dx=-Math.sin(a);dy=Math.cos(a);}
  else if((s-=arc)<straight){east=actor.halfLength-s;north=actor.radius;dx=-1;dy=0;}
  else{const a=Math.PI/2+(s-straight)/actor.radius;east=-actor.halfLength+actor.radius*Math.cos(a);north=actor.radius*Math.sin(a);dx=-Math.sin(a);dy=Math.cos(a);}
  return {east,north,sceneYaw:Math.atan2(dx,-dy),distance,walkTime:time*animationRate+actor.phase};
}

const hash=(data:string|Uint8Array)=>createHash('sha256').update(data).digest('hex');
const fields=['east','north','sceneYaw','distance','walkTime'] as const;
type Values=Record<string,number>;
const snapshot=(values:Values)=>fields.flatMap(name=>defaults.map((_,i)=>values[`${name}[${i+1}]`]));

it('production-pin editable Modelica batches all six actor routes and absolute animation clocks across seeks and parameter edits',async()=>{
  const wasm=readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm');
  await init({module_or_path:wasm});
  const source=readFileSync('models/Scene/ActorMotion.mo','utf8');
  const editedSource=source.replace('{0.78,0.78,0.78,2.2,2.2,2.2}','{0.91,0.78,0.78,2.2,2.2,2.2}')
    .replace('{18.0,18.0,18.0,20.0,20.0,20.0}','{21.0,18.0,18.0,20.0,20.0,20.0}')
    .replace('animationRate = 0.85','animationRate = 0.72');
  expect(editedSource).not.toBe(source);
  const make=(text=source)=>rumoca.WasmSimulationSession.withInteractiveOptions(text,'ActorMotion',1/90,'rk-like',1e-12,1e-12,'[]');
  const coldStart=performance.now(),session=make(),coldPreparationMs=performance.now()-coldStart;
  const editedStart=performance.now(),edited=make(editedSource),editedPreparationMs=performance.now()-editedStart;
  let tick=0,editedTick=0,calls=0,checkedValues=0;
  const times:number[]=[],errors:number[]=[];
  const evaluate=(s:typeof session,t:number,n:number)=>{
    const start=performance.now();s.set_inputs(JSON.stringify([['sampleTime',t]]));s.advance_to(n/90);
    const out=JSON.parse(s.state_json()).values as Values;times.push(performance.now()-start);calls++;return out;
  };
  const check=(out:Values,t:number,actors=defaults,rate=.85)=>{
    for(const [i,actor] of actors.entries())for(const field of fields){
      const actual=out[`${field}[${i+1}]`],expected=original(t,actor,rate)[field];
      expect(Number.isFinite(actual),`${field} actor${i+1} time${t}`).toBe(true);
      // atan2 has an equivalent ±pi branch at a tangent's signed zero.
      const error=field==='sceneYaw'?Math.abs(Math.atan2(Math.sin(actual-expected),Math.cos(actual-expected))):Math.abs(actual-expected);
      expect(error,`${field} actor${i+1} time${t}: ${actual} != ${expected}`).toBeLessThan(3e-10*Math.max(1,Math.abs(expected)));
      errors.push(error);checkedValues++;
    }
  };
  try{
    const samples=[0,1/90,-1/90,1,-1,17.5,-91,503,-501,17.5,17.5];
    for(const actor of defaults){
      const straight=2*actor.halfLength,arc=Math.PI*actor.radius,length=2*(straight+arc);
      for(const cycle of [-2,0,3]){
        for(const boundary of [0,straight,straight+arc,2*straight+arc,length])for(const delta of [-1e-7,0,1e-7])
          samples.push((cycle*length+boundary+delta-actor.offset)/actor.speed);
        for(const point of [straight/2,straight+arc/2,straight+arc+straight/2,2*straight+arc+arc/2])
          samples.push((cycle*length+point-actor.offset)/actor.speed);
      }
    }
    for(const t of samples)check(evaluate(session,t,++tick),t);
    const replayTimes=[0,27,-9,27,0],replay: number[][]=[];
    for(const t of replayTimes){const out=evaluate(session,t,++tick);check(out,t);replay.push(snapshot(out));}
    expect(replay[1]).toEqual(replay[3]);expect(replay[0]).toEqual(replay[4]);
    session.reset();tick=0;
    for(const [i,t] of replayTimes.entries()){
      const out=evaluate(session,t,++tick);check(out,t);expect(snapshot(out)).toEqual(replay[i]);
    }
    const changed=defaults.map(actor=>({...actor}));changed[0].speed=.91;changed[0].halfLength=21;
    for(const t of [0,1,-1,17.5,-91,503])check(evaluate(edited,t,++editedTick),t,changed,.72);
    if(process.env.RUMOCA_ACTOR_REPORT)writeFileSync(process.env.RUMOCA_ACTOR_REPORT,JSON.stringify({
      schemaVersion:1,status:'PASS',runtimeIntegrated:false,productionPinChanged:false,actors:6,outputsPerCall:30,
      sourceSha256:hash(source),editedSourceSha256:hash(editedSource),compilerWasmSha256:hash(wasm),
      compiler:{version:rumoca.get_version(),revision:rumoca.get_git_commit()},
      sourceOwner:'src/world-actors.ts::route and WorldActors.setTime',sourceEditChecked:true,replayResetChecked:true,
      routeBoundaryEpsilonMetres:1e-7,routeCycles:[-2,0,3],fullRouteSamples:samples.length,calls,checkedValues,
      coldPreparationMs,editedPreparationMs,meanCallMs:times.reduce((a,b)=>a+b,0)/times.length,maxCallMs:Math.max(...times),
      maximumAbsoluteOrWrappedYawError:Math.max(...errors),
      includes:'set_inputs JSON, advance_to, state_json JSON parse for the complete six-actor batch',
      excludes:'asset loading, Three.js transforms/wheels/skinning/rendering, workers, full SLAM',
      interface:{input:'sampleTime',outputs:fields,actorOrder:['pedestrian-1','pedestrian-2','pedestrian-3','traffic-car-1','traffic-car-2','traffic-car-3']},
      limitations:['Source staged; production WorldActors integration pending','Yaw is compared modulo two pi at the equivalent atan2 branch','No whole-pipeline speedup claim'],
    },null,2)+'\n');
  }finally{session.free();edited.free();}
},90_000);
