import {build} from 'esbuild';import {resolve} from 'node:path';import {readFile,writeFile} from 'node:fs/promises';import{createHash}from'node:crypto';
import{OFFICE_REPLAY,exact}from'./office-replay-contract.mjs';
import{activeReplayPin}from'./office-phase-b-replay-pin.mjs';
const pin=activeReplayPin();
const output=process.argv[2];if(!output)throw Error('Usage: build-office-replay.mjs OUTPUT_JS');
const sha=b=>createHash('sha256').update(b).digest('hex');
const sourcePin=JSON.parse(await readFile(new URL('./office-replay-source-pin.json',import.meta.url),'utf8'));
// Phase A replays on its original host source; Phase B on exactly the commit that made the capture.
if(pin.phaseB)exact(process.env.GITHUB_SHA,pin.head,'Phase B replay host is the capture commit');
else exact(sourcePin.sourceHead,OFFICE_REPLAY.head,'Original host source head');
for(const [path,hash]of Object.entries(sourcePin.preservedSources))exact(sha(await readFile(resolve(path))),hash,'Unchanged original source '+path);
const rawText={name:'raw-text',setup(builder){
 builder.onResolve({filter:/\?raw$/},a=>({path:resolve(a.resolveDir,a.path.slice(0,-4)),namespace:'raw-text'}));
 builder.onLoad({filter:/.*/,namespace:'raw-text'},async a=>({contents:await readFile(a.path,'utf8'),loader:'text'}));
}};
await build({entryPoints:[resolve('scripts/office-replay.browser.ts')],bundle:true,format:'iife',platform:'browser',target:'es2022',outfile:resolve(output),sourcemap:false,plugins:[rawText]});
await writeFile(output+'.source.json',JSON.stringify({...sourcePin,...(pin.phaseB?{sourceHead:pin.head}:{}),bundleSha256:sha(await readFile(output))},null,2)+'\n');
