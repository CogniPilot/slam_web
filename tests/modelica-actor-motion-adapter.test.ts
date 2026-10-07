import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import init,* as rumoca from '@cognipilot/rumoca';
import {ModelicaRuntimeMath,type AlgebraicFactory} from '../src/modelica-runtime-math';
import {readActorMotionFrame,validateActorMotionFrame} from '../src/modelica-actor-motion';
import {defaultProject} from '../src/project';

const origin={x:0,y:0,z:0,quaternion:[1,0,0,0]};
const fields=['east','north','sceneYaw','distance','walkTime'] as const;
const make:AlgebraicFactory=(source,model)=>rumoca.WasmSimulationSession.withInteractiveOptions(source,model,1/90,'rk-like',1e-12,1e-12,'[]');
const vector=(value:number)=>Array.from({length:6},()=>value);

it('production WASM adapter returns complete edited actor batches for negative/repeated/rewound sample time using a monotonic dispatch clock',async()=>{
  await init({module_or_path:readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
  const project=defaultProject(),source=readFileSync('models/Scene/ActorMotion.mo','utf8');
  const clocks:number[]=[],inputs:number[]=[];
  const tracked:AlgebraicFactory=(text,model)=>{
    const session=make(text,model);
    return model!=='ActorMotion'?session:{
      set_inputs(input){inputs.push(JSON.parse(input)[0][1]);session.set_inputs(input);},
      advance_to(time){clocks.push(time);session.advance_to(time);},
      state_json:()=>session.state_json(),free:()=>session.free(),
    };
  };
  const math=new ModelicaRuntimeMath(tracked,project.sensorModelica!,project.evaluationModelica!,origin,source);
  const edited=new ModelicaRuntimeMath(make,project.sensorModelica!,project.evaluationModelica!,origin,
    source.replace('{0.78,0.78,0.78,2.2,2.2,2.2}','{0.91,0.78,0.78,2.2,2.2,2.2}').replace('animationRate = 0.85','animationRate = 0.72'));
  try{
    const samples=[0,1/90,-1/90,73,-91,73,0,73],frames=samples.map(time=>math.actors(time));
    expect(frames[3]).toEqual(frames[5]);expect(frames[3]).toEqual(frames[7]);expect(frames[0]).toEqual(frames[6]);
    expect(inputs).toEqual([0,...samples]);
    expect(clocks).toEqual(Array.from({length:samples.length+1},(_,i)=>i/90));
    for(const [index,frame] of frames.entries()){
      validateActorMotionFrame(frame);expect(frame.time).toBe(samples[index]);
      for(let i=0;i<6;i++){
        expect(frame.distance[i]).toBe((i<3?.78:2.2)*samples[index]);
        expect(frame.walkTime[i]).toBe(samples[index]*.85+(i<3?i*.43:0));
      }
    }
    // All six actor positions remain source-owned; a separate actual session
    // at each original time supplies their complete named Modelica values.
    const independent=make(source,'ActorMotion');let tick=0;
    try{for(const frame of frames){
      independent.set_inputs(JSON.stringify([['sampleTime',frame.time]]));independent.advance_to(++tick/90);
      const expected=readActorMotionFrame(JSON.parse(independent.state_json()).values,frame.time);
      expect(frame).toEqual(expected);
    }}finally{independent.free();}
    const changed=edited.actors(10);
    expect(changed.distance[0]).toBe(9.1);
    for(let i=0;i<6;i++)expect(changed.walkTime[i]).toBe(10*.72+(i<3?i*.43:0));
    const beforeInvalid=clocks.length;
    for(const time of [NaN,Infinity,-Infinity])expect(()=>math.actors(time)).toThrow('finite sampled time');
    expect(clocks).toHaveLength(beforeInvalid);
  }finally{math.free();edited.free();}
},60_000);

it('actor initialization refuses missing/renamed interfaces and frees every created production session',async()=>{
  await init({module_or_path:readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
  const project=defaultProject(),source=readFileSync('models/Scene/ActorMotion.mo','utf8');
  for(const [actorSource,count,message] of [['model Unrelated end Unrelated;',3,'ActorMotion initialization failed'],[source.replaceAll('east[','easting['),4,'finite east[1]']] as const){
    let created=0,freed=0;
    const traced:AlgebraicFactory=(text,model)=>{
      const session=make(text,model);created++;
      return {set_inputs:input=>session.set_inputs(input),advance_to:time=>session.advance_to(time),state_json:()=>session.state_json(),free(){freed++;session.free();}};
    };
    expect(()=>new ModelicaRuntimeMath(traced,project.sensorModelica!,project.evaluationModelica!,origin,actorSource)).toThrow(message);
    expect(created).toBe(count);expect(freed).toBe(count);
  }
  const optional=new ModelicaRuntimeMath(make,project.sensorModelica!,project.evaluationModelica!,origin);
  try{expect(()=>optional.actors(0)).toThrow('source has not been initialized');}finally{optional.free();}
},60_000);

it('actor boundary validation refuses malformed batches and preserves finite signed times and output copies',()=>{
  const good={time:-7,east:vector(1),north:vector(2),sceneYaw:vector(3),distance:vector(4),walkTime:vector(5)};
  expect(()=>validateActorMotionFrame(good)).not.toThrow();
  for(const field of fields)for(const malformed of [vector(0).slice(1),[...vector(0),0],[0,0,0,NaN,0,0]])
    expect(()=>validateActorMotionFrame({...good,[field]:malformed})).toThrow(`six finite ${field}`);
  for(const time of [NaN,Infinity,'0'])expect(()=>validateActorMotionFrame({...good,time})).toThrow('finite sampled time');
  const values=Object.fromEntries(fields.flatMap(field=>good[field].map((value,i)=>[`${field}[${i+1}]`,value])));
  const frame=readActorMotionFrame(values,good.time);expect(frame).toEqual(good);
  frame.east[0]=99;expect(values['east[1]']).toBe(1);
  expect(()=>readActorMotionFrame({...values,'north[7]':0},0)).toThrow('exactly six actors');
  expect(()=>readActorMotionFrame({...values,'east[1]':'1'},0)).toThrow('finite east[1]');
});

it('scene route inputs keep pedestrians on sidewalks and cars in lanes, and preserve legacy authored sources',async()=>{
  await init({module_or_path:readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
  const project=defaultProject(),source=readFileSync('models/Scene/ActorMotion.mo','utf8');
  const math=new ModelicaRuntimeMath(make,project.sensorModelica!,project.evaluationModelica!,origin,source);
  const legacySource=source.replace(/  input Real (useSceneRoutes|pedestrianRouteRadius|carRouteRadius) = [^;]+;\n/g,'')
    .replace(/    effectiveRadius\[i\] = radius\[i\]\+useSceneRoutes\*\n      \(\(if i <= 3 then pedestrianRouteRadius else carRouteRadius\)-radius\[i\]\);/,'    effectiveRadius[i] = radius[i];').replaceAll('useSceneRoutes*','0.0*');
  const legacy=new ModelicaRuntimeMath(make,project.sensorModelica!,project.evaluationModelica!,origin,legacySource);
  try{
    for(const route of [{pedestrianRadius:7.1,carRadius:1.65},{pedestrianRadius:5.8,carRadius:1.65},{pedestrianRadius:4.05,carRadius:1.4}]){
      const frame=math.actors(0,route);
      expect(frame.north).toEqual([-route.pedestrianRadius,route.pedestrianRadius,-route.pedestrianRadius,-route.carRadius,route.carRadius,-route.carRadius]);
      const ahead=math.actors(10,route);expect(math.actors(0,route)).toEqual(frame);expect(math.actors(10,route)).toEqual(ahead);
    }
    expect(math.actors(0).north).toEqual([-4.05,4.05,-4.05,-1.4,1.4,-1.4]);
    expect(legacy.actors(0,{pedestrianRadius:7.1,carRadius:1.65})).toEqual(math.actors(0));
    const street={pedestrianRadius:7.1,carRadius:1.65,pedestrianCrossings:true,streetCars:true,carStreetHalfLength:33};
    const eastboundWrap=(66-8)/2.2;
    for(const time of [-100,0,20,60,100,300,eastboundWrap-1e-7,eastboundWrap,eastboundWrap+1e-7]){
      const frame=math.actors(time,street);
      expect(frame.north.slice(3)).toEqual([-1.65,1.65,-1.65]);
      frame.sceneYaw.slice(3).forEach((yaw,i)=>expect(yaw).toBeCloseTo(i===1?-Math.PI/2:Math.PI/2,12));
      frame.east.slice(3).forEach(x=>{
        expect(Math.abs(x)).toBeLessThanOrEqual(33);
        // The 5 m car body remains before the training enclosure at x=36.
        expect(x+2.5).toBeLessThan(36);
      });
      for(let i=0;i<3;i++){
        const onSidewalk=Math.abs(Math.abs(frame.north[i])-7.1)<1e-10;
        const onCrosswalk=Math.min(Math.abs(frame.east[i]+29.8),Math.abs(frame.east[i]-32))<1e-10;
        expect(onSidewalk||onCrosswalk).toBe(true);
        expect(frame.east[i]).toBeGreaterThanOrEqual(-29.8-1e-10);expect(frame.east[i]).toBeLessThanOrEqual(32+1e-10);
      }
    }
    expect(()=>math.actors(0,{pedestrianRadius:0,carRadius:1.65})).toThrow('positive finite radii');
  }finally{math.free();legacy.free();}
},60_000);
