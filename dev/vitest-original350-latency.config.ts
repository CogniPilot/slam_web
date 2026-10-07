import {defineConfig} from 'vitest/config';
export default defineConfig({test:{maxWorkers:1,include:['tests/compiler-probes/modelica-original350-uncertainty-latency.test.ts']}});
