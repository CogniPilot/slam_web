import {build} from 'esbuild';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
const output=process.argv[2];if(!output)throw Error('Usage: build-office-ci-trace.mjs OUTPUT_JS');
// Match Vite's ?raw contract, including JSON files which esbuild otherwise
// turns into objects before the importing source can parse them.
const rawText={name:'raw-text',setup(builder){
 builder.onResolve({filter:/\?raw$/},args=>({path:resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw-text'}));
 builder.onLoad({filter:/.*/,namespace:'raw-text'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}));
}};
await build({entryPoints:[resolve('scripts/office-ci-trace.worker.ts')],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:resolve(output),sourcemap:false,plugins:[rawText]});
