import {defineConfig} from 'vitest/config';
// Compiler capability probes have their own explicit gate. They are not
// production-node tests: the pinned compiler has known failures/timeouts.
export default defineConfig({test:{maxWorkers:1,include:['tests/compiler-probes/*.test.ts']}});
