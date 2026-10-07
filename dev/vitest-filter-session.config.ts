import {defineConfig} from 'vitest/config';
export default defineConfig({test:{maxWorkers:1,include:['tests/compiler-probes/modelica-filter-session.test.ts']}});
