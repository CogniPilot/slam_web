import {imuIntervals} from './imu-intervals';
import type {SensorFrame} from './types';

/** Rumoca owns compilation, Solve IR evaluation and numerical integration. */
export interface InertialSolverSession {
  input_names():string;
  get(name:string):number|undefined;
  values_for?(names:string):string;
  set_inputs(values:string):void;
  advance_to(time:number):void;
  time():number;
  reset():void;
  reset_at?(time:number):void;
  free():void;
}
export interface InertialSessionMetadata {
  format:'rumoca-simulation-session';version:1;modelName:string;
  sourceSha256:string;compilerVersion:string;compilerCommit:string;
  executionPolicy:'auto';
}
type Frame=Pick<SensorFrame,'time'|'dt'|'imu'|'imuIntervals'>;
const inputs=['accel[1]','accel[2]','accel[3]','gyro[1]','gyro[2]','gyro[3]'];
const outputs=[...['position','quaternion','velocity','filteredAccel','filteredGyro'].flatMap(
  name=>Array.from({length:name==='quaternion'?4:3},(_,i)=>`${name}[${i+1}]`))];
const outputSelection=JSON.stringify(outputs);

/** This adapter validates and transfers a small IMU interface. It does not
 * lower equations, plan storage, emit WASM or implement an integrator. */
export class ModelicaInertialSession {
  private started=false;
  constructor(private readonly solver:InertialSolverSession){
    try{
      const names=JSON.parse(solver.input_names());
      if(!Array.isArray(names)||names.length!==inputs.length||!inputs.every(name=>names.includes(name)))
        throw new Error('Modelica inertial source must declare accel[3] and gyro[3] inputs');
      this.estimate();
    }catch(error){solver.free();throw error;}
  }
  reset(time=0){
    if(!Number.isFinite(time)||time<0)throw new Error('Modelica reset requires a finite nonnegative timestamp');
    // Absolute initialization belongs to Rumoca: edited initial equations
    // may depend on time. Older compiler packages can reset only at zero.
    if(time===0)this.solver.reset();
    else if(this.solver.reset_at)this.solver.reset_at(time);
    else throw new Error('Nonzero-time reset requires Rumoca reset_at support');
    this.started=false;
    const resetTime=this.solver.time();
    if(!Number.isFinite(resetTime)||Math.abs(resetTime-time)>1e-6)throw new Error('Rumoca did not reset at the requested timestamp');
    return this.estimate();
  }
  step(frame:Frame){
    if(!frame||!Number.isFinite(frame.time)||!Number.isFinite(frame.dt)||frame.dt<=0||frame.dt>.2)
      throw new Error('Modelica INS requires a finite timestamp and 0 < dt ≤ 0.2 seconds');
    const intervals=imuIntervals(frame);
    const start=frame.time-frame.dt;
    if(!this.started&&Math.abs(start)>1e-6&&Math.abs(start-this.solver.time())>1e-6){
      if(!this.solver.reset_at)throw new Error('Replay starting after zero requires Rumoca reset_at support');
      this.reset(start);
    }
    const currentTime=this.solver.time();
    if(!Number.isFinite(currentTime)||Math.abs(start-currentTime)>1e-6)
      throw new Error('Discontinuous Modelica inertial frame');
    // Validate every supplied interval before handing any of the batch over.
    for(const interval of intervals){
      this.solver.set_inputs(JSON.stringify([
        ...interval.imu.accel.map((v,i)=>[inputs[i],v]),
        ...interval.imu.gyro.map((v,i)=>[inputs[i+3],v]),
      ]));
      this.solver.advance_to(interval.time);
      const committedTime=this.solver.time();
      if(!Number.isFinite(committedTime)||Math.abs(committedTime-interval.time)>1e-6)
        throw new Error('Rumoca did not reach the committed IMU timestamp');
    }
    this.started=true;return this.estimate();
  }
  estimate(){
    // The compiler batch API performs one checked observation. Scalar reads
    // remain compatible with the old pin until the new compiler is published.
    // Never retry scalar reads after a batch error: that could hide a fault.
    let selected:Record<string,unknown>|undefined;
    if(this.solver.values_for){
      const result:unknown=JSON.parse(this.solver.values_for(outputSelection));
      if(!result||typeof result!=='object'||Array.isArray(result))
        throw new Error('Rumoca selected outputs must be a named object');
      selected=result as Record<string,unknown>;
    }
    const vector=(name:string,count:number)=>Array.from({length:count},(_,i)=>{
      const key=`${name}[${i+1}]`;
      const value=selected?(Object.hasOwn(selected,key)?selected[key]:undefined):this.solver.get(key);
      if(typeof value!=='number'||!Number.isFinite(value))throw new Error(`Modelica inertial source must expose finite ${name}[${i+1}]`);
      return value;
    });
    const position=vector('position',3),quaternion=vector('quaternion',4);
    vector('velocity',3);vector('filteredAccel',3);vector('filteredGyro',3);
    return {x:position[0],y:position[1],z:position[2],quaternion,points:[],confidence:.1,
      diagnostics:{model:'Modelica nominal INS',backend:'Rumoca Solve IR session',executionPolicy:'auto'}};
  }
  free(){this.solver.free();}
}
