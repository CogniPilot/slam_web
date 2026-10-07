import {defineConfig} from 'vitest/config';
export default defineConfig({test: {maxWorkers:1, hookTimeout:60000, testTimeout:60000,
  include:['tests/compiler-probes/modelica-d435-fast-native.test.ts']}});
