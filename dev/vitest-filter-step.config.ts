import {defineConfig} from 'vitest/config';

// Opt-in review compiler probe; production tests retain their existing scope.
export default defineConfig({test:{maxWorkers:1,include:['tests/compiler-probes/modelica-filter-step.test.ts']}});
