import {expect,it} from 'vitest';
import wabtFactory from 'wabt';
import {instrumentNativeFunctions,installNativeFunctionTiming} from '../scripts/native-function-instrumentation.mjs';

it('preserves native arguments, return values, and call targets while clocking wrappers',async()=>{
  const wabt=await wabtFactory();
  const module=wabt.parseWat('fixture',`(module
    (import "env" "sin" (func (param f64) (result f64)))
    (func (param i32 i32 i32) (result i32) local.get 0 local.get 1 i32.add local.get 2 i32.add)
    (func (export "eval_assignments") (param i32 i32 i32) (result i32)
      local.get 0 local.get 1 local.get 2 call 1))`);
  try{
    const original=module.toBinary({}).buffer,instrumented=await instrumentNativeFunctions(original,[1]);
    const log10=Math.log10;
    try{
      installNativeFunctionTiming();const trace=(globalThis as any).__nativeFunctionTiming;trace.active=true;
      const {instance}=await WebAssembly.instantiate(instrumented,{env:{sin:Math.sin,log10:Math.log10}});
      expect((instance.exports.eval_assignments as (a:number,b:number,c:number)=>number)(3,5,7)).toBe(15);
      const result=trace.finish();
      expect(result.rows[1].calls).toBe(1);expect(result.rows[1].totalMs).toBeGreaterThanOrEqual(0);
      expect(result.rows[1].samplesMs).toHaveLength(1);
    }finally{Math.log10=log10;delete (globalThis as any).__nativeFunctionTiming;}
  }finally{module.destroy();}
});
