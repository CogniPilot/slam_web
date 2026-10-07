import {defineConfig} from 'vitest/config';
import {compilerAdmissionTests} from './vitest.compiler.config';
export default defineConfig({test:{maxWorkers:2,include:['tests/*.test.ts'],exclude:compilerAdmissionTests}});
