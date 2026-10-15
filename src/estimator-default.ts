/** Deliberately disabled until the desktop-default rollout is approved. */
export const DESKTOP_NATIVE_DEFAULT=false;
export interface NativeDefaultCapabilities {hardwareRenderer:boolean;mobile:boolean;simd:boolean;memoryGB:number|undefined;logicalCores:number}
export function useNativeDefault(capabilities:NativeDefaultCapabilities,enabled=DESKTOP_NATIVE_DEFAULT){
  return enabled&&capabilities.hardwareRenderer&&!capabilities.mobile&&capabilities.simd&&
    (capabilities.memoryGB??0)>=8&&capabilities.logicalCores>=8;
}
export function supportsWasmSimd(){
  // A minimal () -> v128 function; capability test only, no memory reservation.
  try{return WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,22,1,20,0,253,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11]));}
  catch{return false;}
}
