import {expect,it} from 'vitest';
import {DESKTOP_NATIVE_DEFAULT,useNativeDefault,supportsWasmSimd} from '../src/estimator-default';
const desktop={hardwareRenderer:true,mobile:false,simd:true,memoryGB:8,logicalCores:16};
it('keeps the rollout disabled and admits a capable desktop only when enabled',()=>{
  expect(DESKTOP_NATIVE_DEFAULT).toBe(false);expect(useNativeDefault(desktop)).toBe(false);expect(useNativeDefault(desktop,true)).toBe(true);
});
it('keeps mobile, software graphics, missing SIMD and uncertain or small budgets inertial',()=>{
  for(const change of [{mobile:true},{hardwareRenderer:false},{simd:false},{memoryGB:undefined},{memoryGB:4},{logicalCores:4}])
    expect(useNativeDefault({...desktop,...change},true)).toBe(false);
});
it('detects the actual SIMD instruction without allocating native-program memory',()=>{
  expect(supportsWasmSimd()).toBe(true);
});
