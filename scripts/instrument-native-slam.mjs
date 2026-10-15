// Diagnostic rewrite of one pinned native Step module. Never publishes assets.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {instrumentNativeFunctions} from './native-function-instrumentation.mjs';
const {values}=parseArgs({options:{manifest:{type:'string',default:'public/vendor/slam/manifest.json'},resolution:{type:'string',default:'424x240'},out:{type:'string'},functions:{type:'string'}}});
if(!values.out||!values.functions)throw Error('Required: --out DIRECTORY --functions ID,ID,... (IDs must match this exact module)');
const manifestPath=resolve(values.manifest),root=dirname(manifestPath),output=resolve(values.out);
if(output===root||output.startsWith(root+'/'))throw Error('Diagnostic output must be outside published native assets');
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
const entry=manifest.profiles?.[values.resolution]?.models?.step?.files?.module;
if(!entry)throw Error('The selected native Step profile is unavailable');
const encoded=await readFile(join(root,entry.file));
const original=entry.encoding==='gzip'?gunzipSync(encoded):encoded;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
if(hash(original)!==entry.sha256)throw Error('Native module does not match its published hash');
const functionIds=values.functions.split(',').map(Number);
const instrumented=await instrumentNativeFunctions(original,functionIds);
await mkdir(output,{recursive:true});
await writeFile(join(output,entry.file),entry.encoding==='gzip'?gzipSync(instrumented):instrumented);
await writeFile(join(output,'trace-provenance.json'),JSON.stringify({resolution:values.resolution,file:entry.file,functionIds,
  originalSha256:hash(original),instrumentedSha256:hash(instrumented),scope:'Diagnostic function-clock wrappers; original input/output arithmetic and calls retained. Requires SLAM_PROFILE_NATIVE_TRACE=1.'},null,2));
console.log(`Instrumented ${functionIds.length} functions in ${entry.file}; output ${output}`);
