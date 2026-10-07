import {defineConfig} from 'vitest/config';
// Strict numerical gates for SLAM features not yet supported by Rumoca 0.10.0.
export const compilerAdmissionTests=[
  "tests/modelica-es15.test.ts",
  "tests/modelica-nominal-prediction.test.ts",
  "tests/modelica-vision-readability.test.ts"
];
export default defineConfig({test:{maxWorkers:1,include:compilerAdmissionTests}});
