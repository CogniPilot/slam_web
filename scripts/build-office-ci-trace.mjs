import {build} from 'esbuild';
import {resolve} from 'node:path';
const output=process.argv[2];if(!output)throw Error('Usage: build-office-ci-trace.mjs OUTPUT_JS');
await build({entryPoints:[resolve('scripts/office-ci-trace.worker.ts')],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:resolve(output),sourcemap:false});
