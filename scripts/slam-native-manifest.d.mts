import type {SlamNativeLayout} from '../src/slam-native-program';
export const SLAM_NATIVE_FILES:readonly string[];
export function compactLayout(model:string,layout:Record<string,unknown>):Omit<SlamNativeLayout,'files'>;
export function readExport(model:string,directory:string):Promise<{layout:Omit<SlamNativeLayout,'files'>;files:Record<string,Uint8Array>}>;
export function publishedAssets(exports:Record<string,{layout:Omit<SlamNativeLayout,'files'>;files:Record<string,Uint8Array>}>,metadata?:Record<string,unknown>):{
  manifest:{schemaVersion:1;models:Record<string,SlamNativeLayout>}&Record<string,unknown>;
  blobs:Map<string,{bytes:Uint8Array;sha256:string;rawBytes:number}>;
};
