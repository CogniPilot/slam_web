import {defineConfig} from 'vitest/config';
export default defineConfig({test:{maxWorkers:1,include:['tests/compiler-probes/modelica-rgbd-landmark-map.test.ts'],testTimeout:60000,hookTimeout:170000}});
