/** Diagnostic wrappers for one exact compiler-exported module. */
export function instrumentNativeFunctions(bytes:Uint8Array,ids:readonly number[]):Promise<Uint8Array<ArrayBuffer>>;
export function installNativeFunctionTiming():void;
