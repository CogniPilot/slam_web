import {expect,it,vi} from 'vitest';
import wabtFactory from 'wabt';
import {SlamNativeProgram,type SlamNativeLayout} from '../src/slam-native-program';

async function fixture(){
  const wabt=await wabtFactory(),wat=wabt.parseWat('reset.wat',`(module
    (import "env" "memory" (memory 1 1))
    (func (export "eval_assignments") (param i32 i32 f64 i32 i32) (result i32)
      (f64.store (i32.const 0) (f64.add (f64.load (i32.const 8)) (f64.load (i32.const 16))))
      (i32.const 0)))`);
  const module=wat.toBinary({}).buffer;wat.destroy();
  const bytes=(v:Float64Array|Uint32Array)=>new Uint8Array(v.buffer);
  const data:Record<string,Uint8Array>={module,y:bytes(new Float64Array([0,2])),p:bytes(new Float64Array([1.5])),
    lanes:new Uint8Array(16).fill(3),state_in:bytes(new Uint32Array([8])),state_out:bytes(new Uint32Array([0])),
    state_lane:new Uint8Array([0]),state_init:bytes(new Float64Array([5]))};
  const layout:SlamNativeLayout={model:'ResetFixture',pages:1,y_bytes:16,p_offset:16,scratch_offset:48,typed_offset:32,typed_bytes:16,
    y_count:2,p_count:1,state:{count:1,previous_hash:'one',next_hash:'one'},carry:[0,8,8],inputs:{},outputs:[],y_names:[],model_outputs:[],state_runs:[],
    files:Object.fromEntries(Object.entries(data).map(([file,value])=>[file,{file,sha256:'',bytes:value.length,encoding:'identity'}]))};
  const fetch=vi.fn(async(file:string)=>data[file].slice());
  return {layout,data,fetch};
}

it('restores actual native memory and carry state repeatedly without compiling or replacing the step entry/memory',async()=>{
  const {layout,fetch}=await fixture(),compile=vi.spyOn(WebAssembly,'compile');
  try{
    const program=await SlamNativeProgram.load(layout,fetch),memory=program.memory;
    const initial=new Uint8Array(memory.buffer).slice();expect(compile).toHaveBeenCalledTimes(1);
    for(let i=0;i<2;i++){
      expect(program.step(0)).toBe(0);expect(program.y(0,1)[0]).toBe(6.5);
      program.step(1);expect(program.y(0,1)[0]).toBe(8);
      new Uint8Array(memory.buffer).fill(0xff);
      await program.reset();
      expect(program.memory).toBe(memory);expect(new Uint8Array(memory.buffer)).toEqual(initial);
      expect(compile).toHaveBeenCalledTimes(1);
    }
  }finally{compile.mockRestore();}
});

it('re-instantiates initialization with one retained module, and refuses incomplete reset images before altering memory',async()=>{
  const {layout,data,fetch}=await fixture(),compile=vi.spyOn(WebAssembly,'compile');
  try{
    const factory=await SlamNativeProgram.prepare(layout,fetch),first=await factory(),second=await factory();
    expect(compile).toHaveBeenCalledTimes(1);expect(first.memory).not.toBe(second.memory);
    first.step(0);expect(second.y(0,1)[0]).toBe(0);
    const before=new Uint8Array(first.memory.buffer).slice();data.state_init=new Uint8Array(0);
    await expect(first.reset()).rejects.toThrow('initial state size');
    expect(new Uint8Array(first.memory.buffer)).toEqual(before);
  }finally{compile.mockRestore();}
});

it('native session reset clears map counters, prediction prefix and clock before initializing the time-zero image again',async()=>{
  const {ModelicaSlamSession}=await import('../src/modelica-slam-session');
  const makeProgram=()=>{
    const cells=new Map<string,Float64Array>();
    return {layout:{model:'ResetFixture',inputs:{}},hasInput:(name:string)=>['accel','gyro'].includes(name),
      real:(name:string)=>{if(!cells.has(name))cells.set(name,new Float64Array(['accel','gyro'].includes(name)?3:name==='rgb'?6:name==='depth'?2:1));return cells.get(name)!;},
      integer:()=>new BigInt64Array(1),boolean:()=>new Uint8Array(1),reset:vi.fn(async()=>{}),step:vi.fn(()=>0),transferTo:vi.fn(),
      derived:()=>({}),stateRun:()=>undefined,y:()=>new Float64Array(3),
      output:(name:string)=>name==='nextQuaternion'?new Float64Array([1,0,0,0]):undefined};
  };
  const step=makeProgram(),initialize=makeProgram(),factory=vi.fn(async()=>initialize);
  const session=Reflect.construct(ModelicaSlamSession,[{},step,factory]) as import('../src/modelica-slam-session').ModelicaSlamSession;
  Object.assign(session,{epoch:43,frames:42,visualUpdates:20,clock:9,predicted:{epoch:44,intervals:[{}],stepMs:[1]}});
  const frame={imageEpoch:0,frameTime:0,rgb:new Uint8Array(6),depth:new Uint16Array(2),imu:{accel:[0,0,9.81],gyro:[0,0,0]},
    imageLayout:{color:{width:2,height:1,strideBytes:6},depth:{width:2,height:1,strideBytes:4}}} as any;
  const estimate=await session.reset(frame);
  expect(step.reset).toHaveBeenCalledOnce();expect(factory).toHaveBeenCalledOnce();
  expect(initialize.step).toHaveBeenCalledWith(0);expect(initialize.transferTo).toHaveBeenCalledWith(step);
  expect(estimate.diagnostics).toMatchObject({frames:0,visualUpdates:0,imageEpoch:0});
  expect(session['clock']).toBe(0);expect(session['predicted']).toEqual({epoch:-1,intervals:[],stepMs:[]});
});
