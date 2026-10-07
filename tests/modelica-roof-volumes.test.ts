import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import init,* as rumoca from '@cognipilot/rumoca';
import {expect,it} from 'vitest';
import {ModelicaRuntimeMath} from '../src/modelica-runtime-math';
import {defaultSensorModelica,defaultEvaluationModelica} from '../src/project';
import {BIG_CITY_INTERIORS} from '../src/world-big-city';
import type {Truth} from '../src/types';

const roofs=BIG_CITY_INTERIORS.map(interior=>interior.roofVolume);
const make=(source:string,model:string)=>rumoca.WasmSimulationSession.withInteractiveOptions(source,model,1/90,'rk-like',1e-12,1e-12,'[]');
const origin={x:0,y:0,z:0,quaternion:[1,0,0,0]};
const uniforms=[[.2,.3],[.4,.5],[.6,.7]];
const gaussian=(r:number,a:number)=>Math.sqrt(-2*Math.log(Math.max(1e-9,r)))*Math.cos(2*Math.PI*a);
const truth=(time:number,p:number[]):Truth=>({time,x:p[0],y:p[1],z:p[2],quaternion:[1,0,0,0],velocity:[0,0,0],accel:[.1,-.2,9.81],gyro:[.001,-.003,.2]});
const independentAvailable=(p:number[],enabled:boolean)=>!enabled||!roofs.some(roof=>p.every((v,i)=>v>=roof.minimum[i]&&v<=roof.maximum[i]));

it('production Modelica owns the union of all three city roofs, inclusive faces and conditional GPS draw schedule',async()=>{
  const wasm=readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm');await init({module_or_path:wasm});
  const begin=performance.now(),math=new ModelicaRuntimeMath(make,defaultSensorModelica,defaultEvaluationModelica,origin);
  const prepareMs=performance.now()-begin,frameTimes:number[]=[];let tick=0,checks=0;
  try{
    const positions:number[][]=[[0,0,1.5]];
    for(const roof of roofs){
      const middle=roof.minimum.map((v,i)=>(v+roof.maximum[i])/2);positions.push(middle,roof.minimum,roof.maximum);
      for(let axis=0;axis<3;axis++)for(const boundary of [roof.minimum[axis],roof.maximum[axis]])for(const epsilon of [-1e-8,0,1e-8]){
        const point=[...middle];point[axis]=boundary+epsilon;positions.push(point);
      }
    }
    for(const enabled of [true,false])for(const position of positions){
      const sample=truth(++tick/90,position),start=performance.now(),available=independentAvailable(position,enabled);
      expect(math.gpsAvailable(sample,roofs,enabled),JSON.stringify({position,enabled})).toBe(available);
      const observations=math.observeSensors(sample,{accel:uniforms,gyro:uniforms,...(available?{gps:uniforms}:{})},roofs,enabled);
      expect(Boolean(observations.gps)).toBe(available);
      for(let axis=0;axis<3;axis++){
        expect(observations.imu.accel[axis]).toBeCloseTo(sample.accel[axis]+[.015,-.012,.02][axis]+.015*gaussian(...uniforms[axis] as [number,number]),10);
        expect(observations.imu.gyro[axis]).toBeCloseTo(sample.gyro[axis]+[.0004,-.0003,.0006][axis]+.0005*gaussian(...uniforms[axis] as [number,number]),10);
        if(available)expect(observations.gps!.position[axis]).toBeCloseTo(position[axis]+.1*gaussian(...uniforms[axis] as [number,number]),10);
      }
      if(available)expect(observations.gps!.positionCovariance).toEqual([.01,0,0,0,.01,0,0,0,.01]);
      frameTimes.push(performance.now()-start);checks++;
    }
    const indoor=truth(++tick/90,[34,-12,1.5]);
    expect(()=>math.observeSensors(indoor,{accel:uniforms,gyro:uniforms,gps:uniforms},roofs,true)).toThrow('draw schedule');
    const outdoor=truth(++tick/90,[0,0,1.5]);
    expect(()=>math.observeSensors(outdoor,{accel:uniforms,gyro:uniforms},roofs,true)).toThrow('draw schedule');
    // Shrinking the array must immediately clear the loft/conference slots.
    const changed=truth(++tick/90,[34,-12,1.5]);
    expect(math.gpsAvailable(changed,[roofs[0]],true)).toBe(true);
    expect(math.observeSensors(changed,{accel:uniforms,gyro:uniforms,gps:uniforms},[roofs[0]],true).gps).not.toBeNull();
    expect(math.gpsAvailable(changed,roofs,true)).toBe(false);
    expect(math.gpsAvailable(changed,[],true)).toBe(true);
    expect(math.observeSensors(changed,{accel:uniforms,gyro:uniforms,gps:uniforms},[],true).gps).not.toBeNull();
    expect(()=>math.gpsAvailable(changed,[...roofs,roofs[0]],true)).toThrow('at most three');
    expect(()=>math.gpsAvailable(changed,[{minimum:[4,0,0],maximum:[3,1,1]}],true)).toThrow('rejected roof configuration');
    expect(math.gpsAvailable(changed,roofs,true)).toBe(false);
    const report={status:'PASS',compilerRevision:rumoca.get_git_commit(),compilerVersion:rumoca.get_version(),compilerSha256:createHash('sha256').update(wasm).digest('hex'),sensorSourceSha256:createHash('sha256').update(defaultSensorModelica).digest('hex'),roofs,checks,prepareMs,meanGateAndObservationMs:frameTimes.reduce((a,b)=>a+b,0)/frameTimes.length,maxGateAndObservationMs:Math.max(...frameTimes),scope:'Production-pin ordinary WasmSimulationSession; availability plus three-axis IMU/GPS, no full SLAM admission'};
    console.info(JSON.stringify(report));if(process.env.MODELICA_ROOF_REPORT)writeFileSync(process.env.MODELICA_ROOF_REPORT,JSON.stringify(report,null,2));
  }finally{math.free();}
},45000);

it('production roof profiles explicitly reject malformed counts and preserve source edits and legacy single-volume sessions',async()=>{
  await init({module_or_path:readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
  const source=readFileSync('models/SensorAvailability.mo','utf8'),availability=make(source,'SensorAvailability');let tick=0;
  try{
    for(const roofCount of [-1,.5,3.5,4]){
      availability.set_inputs(JSON.stringify([['roofCount',roofCount],['roofEnabled',0]]));availability.advance_to(++tick/90);
      const values=JSON.parse(availability.state_json()).values;
      expect(values.roofConfigurationValid).toBe(0);expect(values.gpsAvailable).toBe(0);
    }
    availability.set_inputs(JSON.stringify([['roofCount',1],['roofEnabled',1]]));availability.advance_to(++tick/90);
    expect(JSON.parse(availability.state_json()).values.roofConfigurationValid).toBe(1);
  }finally{availability.free();}
  const editedSource=defaultSensorModelica.replaceAll('roofEnabled > 0.5','roofEnabled > 1.5');expect(editedSource).not.toBe(defaultSensorModelica);
  const edited=new ModelicaRuntimeMath(make,editedSource,defaultEvaluationModelica,origin);
  try{
    const sample=truth(1/90,[34,-12,1.5]);expect(edited.gpsAvailable(sample,roofs,true)).toBe(true);
    expect(edited.observeSensors(sample,{accel:uniforms,gyro:uniforms,gps:uniforms},roofs,true).gps).not.toBeNull();
  }finally{edited.free();}
  const legacySource=readFileSync('tests/fixtures/legacy-single-roof-sensors.mo','utf8');
  const legacy=new ModelicaRuntimeMath(make,legacySource,defaultEvaluationModelica,origin);
  try{
    const roof={minimum:[35.8,-5.2,0],maximum:[48.2,5.2,3.8]},sample=truth(1/90,[42,0,1.5]);
    expect(legacy.gpsAvailable(sample,roof,true)).toBe(false);
    expect(legacy.observeSensors(sample,{accel:uniforms,gyro:uniforms},roof,true).gps).toBeNull();
    expect(legacy.gpsAvailable(sample,[],true)).toBe(true);
    expect(legacy.observeSensors(sample,{accel:uniforms,gyro:uniforms,gps:uniforms},[],true).gps).not.toBeNull();
    expect(()=>legacy.gpsAvailable(sample,roofs,true)).toThrow('update SensorAvailability and SensorObservations');
    expect(()=>legacy.observeSensors(sample,{accel:uniforms,gyro:uniforms},roofs,true)).toThrow('update SensorAvailability and SensorObservations');
  }finally{legacy.free();}
},45000);
