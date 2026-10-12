import {describe,expect,it,vi} from 'vitest';
import {runAssistantSimulation,type SimulationControl} from '../src/assistant-simulation';
import {AssistantAgent,type AssistantHost} from '../src/assistant-agent';

function fixture(){
  let frames=0,revision=0;
  const control:SimulationControl={pause:vi.fn(),busy:()=>false,revision:()=>revision,prepare:vi.fn(async()=>{}),step:vi.fn(async()=>{frames++;}),status:()=>({frames,model:'InertialOnly',pending:{slam:'pending'}})};
  return {control,change:()=>revision++};
}
describe('bounded assistant simulation',()=>{
  it('prepares accepted source, finishes exact lockstep frames and leaves playback paused',async()=>{
    const {control}=fixture();
    const result=await runAssistantSimulation(control,3,new AbortController().signal);
    expect(control.prepare).toHaveBeenCalledOnce();expect(control.step).toHaveBeenCalledTimes(3);expect(control.pause).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({completedFrames:3,stoppedReason:'frame limit',simulation:{frames:3,pending:{slam:'pending'}}});
  });
  it('cancels after finishing an in-flight frame and pauses',async()=>{
    const {control}=fixture(),abort=new AbortController();control.step=vi.fn(async()=>{abort.abort();});
    await expect(runAssistantSimulation(control,3,abort.signal)).rejects.toMatchObject({name:'AbortError'});
    expect(control.step).toHaveBeenCalledOnce();expect(control.pause).toHaveBeenCalledTimes(2);
  });
  it('stops after project edits instead of mixing source revisions',async()=>{
    const {control,change}=fixture();control.step=vi.fn(async()=>{change();});
    await expect(runAssistantSimulation(control,3,new AbortController().signal)).rejects.toThrow('Project changed');
    expect(control.step).toHaveBeenCalledOnce();expect(control.pause).toHaveBeenCalledTimes(2);
  });
  it('does not step when compilation fails',async()=>{
    const {control}=fixture();control.prepare=async()=>{throw new Error('Invalid Modelica');};
    await expect(runAssistantSimulation(control,1,new AbortController().signal)).rejects.toThrow('Invalid Modelica');
    expect(control.step).not.toHaveBeenCalled();expect(control.pause).toHaveBeenCalledTimes(2);
  });
  it('reports partial progress when the wall time budget expires',async()=>{
    const {control}=fixture();let time=0;const clock=vi.spyOn(performance,'now').mockImplementation(()=>time);
    control.step=vi.fn(async()=>{time+=10;});
    try{expect(await runAssistantSimulation(control,30,new AbortController().signal,25)).toMatchObject({completedFrames:3,stoppedReason:'wall time budget'});}finally{clock.mockRestore();}
  });
  it.each([0,31,1.5,NaN])('rejects invalid frame counts: %s',async frames=>{
    const {control}=fixture();await expect(runAssistantSimulation(control,frames,new AbortController().signal)).rejects.toThrow('1 to 30');expect(control.step).not.toHaveBeenCalled();
  });
  it('enforces a cumulative frame budget across tool calls',async()=>{
    const host:AssistantHost={files:()=>({}),activePath:()=>'',apply:()=>{},diagnostics:()=>[],compile:async()=>{},searchDocs:()=>[],runSimulation:vi.fn(async frames=>({frames}))};
    const agent=new AssistantAgent(host,()=>{});
    await agent.tool('run_simulation',{frames:20});await expect(agent.tool('run_simulation',{frames:20})).rejects.toThrow('budget');expect(host.runSimulation).toHaveBeenCalledOnce();
  });
});
