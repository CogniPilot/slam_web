import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['tests/compiler-probes/modelica-robust-registration-native.test.ts'],
  maxWorkers:1, fileParallelism:false, testTimeout:120_000}});
