import {defineConfig} from 'vitest/config';
export default defineConfig({test:{maxWorkers:1,testTimeout:60000,hookTimeout:60000,include:['tests/compiler-probes/modelica-rgbd-descriptor-native.test.ts']}});
