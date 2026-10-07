// Syntax admission only, using the exact statically shipped browser compiler.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.resolve(process.argv[2]??'dev/artifacts/modelica-image-acquisition-guard/full-slam-source');
const source=fs.readFileSync(path.join(directory,'source.mo'),'utf8');
const inventory=JSON.parse(fs.readFileSync(path.join(directory,'source-manifest.json')));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(sha(source)!==inventory.sourceSha256)throw Error('Source/manifest mismatch');
const jsPath=path.join(app,'public/vendor/rumoca/rumoca_bind_wasm.js');
const wasmPath=path.join(app,'public/vendor/rumoca/rumoca_bind_wasm_bg.wasm');
const wasm=fs.readFileSync(wasmPath),js=fs.readFileSync(jsPath);
const compiler=await import(pathToFileURL(jsPath));await compiler.default({module_or_path:wasm});
const start=performance.now();
const result=compiler.parse(source),elapsedMs=performance.now()-start;
const invalid=compiler.parse(source+'\nmodel BrokenSyntaxControl Real x; equation x = ; end BrokenSyntaxControl;');
const pass=result.success===true&&result.error==null&&invalid.success===false&&typeof invalid.error==='string';
const report={status:pass?'PUBLISHED_WASM_SYNTAX_PARSE_PASS':'FAILED_OR_INCOMPLETE',
  sourceSha256:sha(source),sourceFiles:inventory.sources.length,wasmSha256:sha(wasm),javascriptSha256:sha(js),
  compilerVersion:compiler.get_version(),compilerRevision:compiler.get_git_commit(),elapsedMs,result,invalidControl:invalid,
  checkScriptSha256:sha(fs.readFileSync(fileURLToPath(import.meta.url))),
  syntaxOnly:true,typecheckQualified:false,nativeArtifactIssued:false,browserFullSlamAccepted:false};
fs.writeFileSync(path.join(directory,'syntax-parse.json'),JSON.stringify(report,null,2)+'\n');
fs.copyFileSync(fileURLToPath(import.meta.url),path.join(directory,'probe-modelica-slam-syntax.mjs'));
console.log(JSON.stringify(report));process.exitCode=pass?0:1;
