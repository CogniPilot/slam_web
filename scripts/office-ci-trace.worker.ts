/// <reference lib="webworker" />
// A separately built diagnostic worker. Production worker/source is unchanged.
import {SlamNativeProgram} from '../src/slam-native-program';
import {installOfficeNativeTrace} from './office-native-observation.mjs';
import '../src/modelica-slam.worker';
installOfficeNativeTrace(SlamNativeProgram);
