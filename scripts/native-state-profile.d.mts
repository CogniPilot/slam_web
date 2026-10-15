import type {SlamNativeLayout} from '../src/slam-native-program';
export function installNativeStateCapture():void;
export function captureNativeState(layout:Pick<SlamNativeLayout,'state'|'state_runs'|'pages'>):Promise<{
  sha256:string;cells:number;runs:number;bytes:number;stateNamesHash:string;scope:string;
}>;
