// Static files only: the browser worker executes the actual compiler artifacts.
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const [artifactPath, sourcePath, editedArtifactPath, editedSourcePath, reportPath] = process.argv.slice(2);
if (!reportPath) throw Error('ARTIFACT SOURCE EDITED_ARTIFACT EDITED_SOURCE REPORT required');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const files = new Map([
  ['/artifact.json', fs.readFileSync(artifactPath)], ['/source.mo', fs.readFileSync(sourcePath)],
  ['/edited.json', fs.readFileSync(editedArtifactPath)], ['/edited.mo', fs.readFileSync(editedSourcePath)],
]);
const consumer = fs.readFileSync('src/modelica-native-program.ts');
const fixtures = fs.readFileSync('tests/compiler-probes/rgbd-feature-matching-fixtures.ts');
const bundles = await build({entryPoints:{consumer:'src/modelica-native-program.ts',
  fixtures:'tests/compiler-probes/rgbd-feature-matching-fixtures.ts'},
  bundle:true, platform:'browser', format:'esm', outdir:'unused', write:false});
for (const file of bundles.outputFiles) files.set('/' + path.basename(file.path), file.contents);
const server = createServer((request, response) => {
  if (files.has(request.url)) {
    response.setHeader('Content-Type', request.url.endsWith('.js') ? 'text/javascript'
      : request.url.endsWith('.json') ? 'application/json' : 'text/plain');
    response.end(files.get(request.url));
  } else if (request.url === '/') response.end('<!doctype html><title>Modelica matcher WASM</title>');
  else response.writeHead(404).end();
});

async function inWorker({base}) {
  const [{NativeProgram}, {fullMatchingFixture, matchingOracle}, source, artifact, editedSource, edited] = await Promise.all([
    import(base + '/consumer.js'), import(base + '/fixtures.js'),
    fetch(base + '/source.mo').then(r => r.text()), fetch(base + '/artifact.json').then(r => r.json()),
    fetch(base + '/edited.mo').then(r => r.text()), fetch(base + '/edited.json').then(r => r.json()),
  ]);
  const start = performance.now(), program = await NativeProgram.instantiate(artifact, source);
  const admissionMs = performance.now() - start, cases = [];
  function run(target, executable, fixture, name) {
    for (const field of ['referenceDescriptor', 'currentDescriptor'])
      if (executable.var_layout.shapes[field].join(',') !== '350,49') throw Error('Full matcher required');
    for (const field of ['referenceDescriptor', 'currentDescriptor', 'referencePoint', 'currentPoint', 'predictedRotation'])
      target.input(field).set(fixture[field].flat());
    for (const field of ['referenceEnabled', 'currentEnabled', 'predictedTranslation']) target.input(field).set(fixture[field]);
    for (const field of ['referenceCount', 'currentCount', 'usePrediction']) target.input(field)[0] = fixture[field];
    const memory = target.memory.buffer;
    const inputBytes = new Uint8Array(memory, executable.abi.p_offset, executable.abi.p_count * 8), before = inputBytes.slice();
    const expected = matchingOracle(fixture), start = performance.now(); target.evaluate(cases.length / 90);
    const executeMs = performance.now() - start; let checked = 0;
    for (const field of ['currentIndex', 'pairEnabled', 'sourcePoint', 'targetPoint', 'count',
      'configurationValid', 'invalidReference', 'invalidCurrent', 'nearestDistance', 'secondDistance']) {
      const wanted = [expected[field]].flat(2), actual = target.output(field);
      if (wanted.length !== actual.length) throw Error(name + '/' + field + ' shape');
      for (let i = 0; i < wanted.length; i++) {
        if (!Number.isFinite(actual[i]) || Math.abs(actual[i] - wanted[i]) > 2e-10) throw Error(name + '/' + field + '/' + i);
        checked++;
      }
    }
    if (checked !== 3504 || target.memory.buffer !== memory || inputBytes.some((value, i) => value !== before[i]))
      throw Error('Output/input contract');
    cases.push({name, count:expected.count, checked, executeMs});
  }
  for (const kind of ['dense', 'sparse', 'ambiguous', 'poisoned-disabled', 'poisoned-active', 'empty', 'reset']) {
    const fixture = fullMatchingFixture();
    if (kind === 'sparse') fixture.referenceEnabled = fixture.referenceEnabled.map((_, i) => +(i % 3 === 2));
    if (kind === 'ambiguous') fixture.currentDescriptor[1] = [...fixture.currentDescriptor[0]];
    if (kind.startsWith('poisoned')) { fixture.currentEnabled[349] = +(kind === 'poisoned-active'); fixture.currentDescriptor[349][0] = NaN; }
    if (kind === 'empty') fixture.currentCount = 0;
    if (kind === 'reset') program.reset();
    run(program, artifact, fixture, kind);
  }
  const fixture = fullMatchingFixture(); fixture.referenceCount = 1; fixture.currentCount = 3;
  fixture.referenceDescriptor[0] = [1, ...Array(48).fill(0)];
  fixture.currentDescriptor[0] = [Math.cos(.4), Math.sin(.4), ...Array(47).fill(0)];
  fixture.currentDescriptor[1] = [Math.cos(.8), Math.sin(.8), ...Array(47).fill(0)];
  fixture.currentDescriptor[2] = [-1, ...Array(48).fill(0)];
  run(program, artifact, fixture, 'original ratio');
  const reloaded = await NativeProgram.instantiate(JSON.parse(JSON.stringify(edited)), editedSource);
  fixture.ratio = .49; run(reloaded, edited, fixture, 'edited ratio after JSON reload');
  if (cases.at(-2).count !== 1 || cases.at(-1).count !== 0) throw Error('Source edit must change executed result');
  let refused = false;
  try { await NativeProgram.instantiate(artifact, editedSource); }
  catch (error) { refused = String(error).includes('does not match its source'); }
  if (!refused) throw Error('Stale source admitted');
  return {cases, admissionMs, readonlyInputs:true, resetRecovery:true, sourceEditExecuted:true,
    jsonReload:true, staleSourceRefused:true, compiler:artifact.compiler, moduleSha256:artifact.module_sha256};
}

let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH, args:['--no-sandbox', '--disable-gpu']});
  const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const result = await page.evaluate(async text => {
    const code = `onmessage=async({data})=>{try{postMessage({result:await (${text})(data)})}catch(e){postMessage({error:String(e.stack||e)})}}`;
    const url = URL.createObjectURL(new Blob([code], {type:'text/javascript'})), worker = new Worker(url);
    try {
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Matcher worker timeout')), 60000);
        worker.onmessage = ({data}) => { clearTimeout(timer); data.error ? reject(Error(data.error)) : resolve(data.result); };
        worker.onerror = error => { clearTimeout(timer); reject(Error(error.message)); };
        worker.postMessage({base:location.origin});
      });
    } finally { worker.terminate(); URL.revokeObjectURL(url); }
  }, inWorker.toString());
  for (const [url, file] of [['/artifact.json', artifactPath], ['/source.mo', sourcePath], ['/edited.json', editedArtifactPath], ['/edited.mo', editedSourcePath]])
    if (!fs.readFileSync(file).equals(files.get(url))) throw Error('Input changed');
  if (!fs.readFileSync('src/modelica-native-program.ts').equals(consumer)
      || !fs.readFileSync('tests/compiler-probes/rgbd-feature-matching-fixtures.ts').equals(fixtures)) throw Error('Consumer/fixture changed');
  const report = {status:'ACTUAL_FULL350_MATCHER_STATIC_BROWSER_WORKER_PASS', browser:browser.version(), result,
    staticFileSha256:Object.fromEntries([...files].map(([name, bytes]) => [name, sha(bytes)])),
    consumerSha256:sha(consumer), fixtureSha256:sha(fixtures), harnessSha256:sha(fs.readFileSync(import.meta.filename)),
    scope:'Static files and actual compiler-issued WASM; all 3504 matcher outputs per case, source edit, JSON reload, reset and input immutability. No sensor/GPU ingress or complete-SLAM acceptance.',
    fullSlamAccepted:false, productionPinChanged:false};
  fs.mkdirSync(path.dirname(reportPath), {recursive:true}); fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
