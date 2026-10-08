// Browser-issued diagnostics for unchanged full-capacity reset constructors.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {rgbdSlamNativeSourceManifest as manifest} from '../src/modelica-slam-source-manifest.mjs';

const [compilerDirectory, outputDirectory] = process.argv.slice(2);
if (!outputDirectory) throw Error('COMPILER_DIRECTORY NEW_OUTPUT_DIRECTORY required');
assert.ok(!fs.existsSync(outputDirectory),'Choose a fresh output directory');
fs.mkdirSync(outputDirectory,{recursive:true});
const root = path.resolve(outputDirectory), compiler = path.resolve(compilerDirectory);
const sha = value=>createHash('sha256').update(value).digest('hex');
const fixturePath = 'tests/compiler-probes/fixtures/ResetConstructorOwners.mo';
const fixture = fs.readFileSync(fixturePath,'utf8');
const sources = manifest.paths.map(file=>({path:file,sha256:sha(fs.readFileSync(file))}));
const authored = manifest.paths.map(file=>fs.readFileSync(file,'utf8')).join(manifest.separator);
const source = authored+'\n'+fixture, sourceFile = path.join(root,'source.mo');
fs.writeFileSync(sourceFile,source);
const compilerFiles = ['rumoca_bind_wasm.js','rumoca_bind_wasm_bg.wasm'].map(name=>
  ({path:name,sha256:sha(fs.readFileSync(path.join(compiler,name)))}));
const rows = [];
for (const name of ['Estimator','Frame','Graph','Map','Catalog']) {
  const reportFile = path.join(root,`${name}.json`);
  const logFile = path.join(root,`${name}.log`);
  const result = spawnSync(process.execPath,['dev/rumoca-bounded-run.mjs',
    '--seconds','80','--rss-mib','8192','--available-mib','16384','--log',logFile,'--',
    'nice','-n','15','taskset','-c','8,9','env','RUMOCA_BROWSER_TIMEOUT_MS=60000',
    process.execPath,'dev/issue-native-program-browser.mjs',compiler,sourceFile,
    `Reset${name}Owner`,path.join(root,`${name}.artifact.json`),reportFile],
    {encoding:'utf8',timeout:90000,maxBuffer:1024*1024});
  assert.ifError(result.error); assert.equal(result.signal,null);
  fs.writeFileSync(path.join(root,`${name}-resource.json`),result.stdout);
  fs.writeFileSync(path.join(root,`${name}-runner.log`),result.stderr);
  const report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile)) : null;
  if (report) {
    assert.equal(report.sourceSha256,sha(source));
    assert.equal(report.compilerModuleSha256,compilerFiles[1].sha256);
  }
  rows.push({owner:name,exitCode:result.status,report,
    resources:result.stdout ? JSON.parse(result.stdout) : null});
  console.log(JSON.stringify({owner:name,exitCode:result.status,status:report?.status,
    compileMs:report?.compileMs??report?.compilerElapsedMs,moduleBytes:report?.moduleBytes}));
  // A failed smaller owner changes the compiler's next action. Do not escalate.
  if (result.status !== 0) break;
}
for (const file of sources) assert.equal(sha(fs.readFileSync(file.path)),file.sha256);
assert.equal(sha(fs.readFileSync(fixturePath)),sha(fixture));
for (const file of compilerFiles)
  assert.equal(sha(fs.readFileSync(path.join(compiler,file.path))),file.sha256);
const report = {status:'UNCHANGED_RESET_CONSTRUCTOR_ADMISSION_OBSERVED',
  authoredSourceSha256:sha(authored),fixture:{path:fixturePath,sha256:sha(fixture)},
  sourceSha256:sha(source),sources,compilerFiles,bookendsEqual:true,rows,
  probeSha256:sha(fs.readFileSync(import.meta.filename)),
  scope:'Actual browser compiler issuance and consumer ABI admission of full constructor outputs. '
    +'Independent diagnostic roots, unchanged production sources/capacities. '
    +'Not numerical execution, the complete reset, browser SLAM or runtime performance.'};
fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2)+'\n');
