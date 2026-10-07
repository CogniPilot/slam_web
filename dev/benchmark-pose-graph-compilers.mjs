// Runtime comparison only. OMC's generated C and Rumoca's issued WASM run the
// same PGRun inputs; fixture generation, I/O and checks stay outside timings.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';

const [artifactPath,sourcePath,executablePath,directory] = process.argv.slice(2);
if (!directory) throw Error('ARTIFACT SOURCE OMC_EXECUTABLE DIRECTORY required');
if (os.endianness() !== 'LE') throw Error('Binary driver currently requires a little-endian host');
const sha = data => createHash('sha256').update(data).digest('hex');
const proofFiles = ['src/modelica-native-program.ts','tests/compiler-probes/pose-graph-run-fixtures.ts',
  'tests/compiler-probes/pose-graph-fixtures.ts','dev/benchmark-pose-graph-omc.c',import.meta.filename];
const digests = Object.fromEntries(proofFiles.map(file => [file,sha(fs.readFileSync(file))]));
async function bundled(entry) {
  const result = await build({entryPoints:[entry],bundle:true,platform:'node',format:'esm',write:false});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
}
const {NativeProgram} = await bundled(proofFiles[0]);
const {runCases,loadRun,certifyRun} = await bundled(proofFiles[1]);
const artifactBytes = fs.readFileSync(artifactPath), artifact = JSON.parse(artifactBytes);
const source = fs.readFileSync(sourcePath,'utf8'), executable = fs.readFileSync(executablePath);
if (artifact.model_name !== 'PoseGraphRunStorage') throw Error('Wrong artifact root');
const program = await NativeProgram.instantiate(artifact,source), results = [];
const a = artifact.abi;
const inputs = [new Uint8Array(program.memory.buffer,a.p_offset,a.p_count*8),
  new Uint8Array(program.memory.buffer,a.input_lanes_offset,a.input_lanes_bytes)];
fs.mkdirSync(directory,{recursive:true});
const statistics = times => {
  if (!times.length || !times.every(x => Number.isFinite(x) && x > 0)) throw Error('Invalid timings');
  const sorted = [...times].sort((a,b) => a-b);
  return {timesMs:times,medianMs:(sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.floor(sorted.length/2)])/2,
    minimumMs:sorted[0],maximumMs:sorted.at(-1)};
};
for (const [index,test] of runCases().entries()) {
  program.reset(); loadRun(program,test);
  const before = inputs.map(view => Buffer.from(view)), inputPath = path.resolve(directory,`case-${index}.bin`);
  const integerBytes = names => {
    const values = names.flatMap(name => name === 'source' || name === 'target'
      ? Array.from({length:256},(_,i) => program.integerInput(`${name}[${i+1}]`)[0])
      : [program.integerInput(name)[0]]);
    const bytes = Buffer.alloc(values.length*8);
    values.forEach((v,i) => bytes.writeBigInt64LE(v,8*i)); return bytes;
  };
  const capacities = Buffer.alloc(16); capacities.writeBigUInt64LE(128n); capacities.writeBigUInt64LE(256n,8);
  const realBytes = names => Buffer.concat(names.map(name => Buffer.from(program.input(name).buffer,
    program.input(name).byteOffset,program.input(name).byteLength)));
  fs.writeFileSync(inputPath,Buffer.concat([capacities,
    realBytes(['position','rotation','nodeMask','edgeMask','translation','measuredRotation','information']),
    integerBytes(['source','target']),
    realBytes(['initialCost','initialDamping','maximumPositionStep','maximumAngleStep','pcgTolerance']),
    integerBytes(['maximumIterations','maximumPCG','maximumBacktracks'])]));
  let reference;
  const omc = [], wasm = [], assertions = [];
  // ABBA order reduces one-direction drift; each block warms its own process.
  for (const [block,engine] of ['omc','wasm','wasm','omc'].entries()) {
    let output, times, controls;
    if (engine === 'omc') {
      const outputPath = path.resolve(directory,`case-${index}-block-${block}.out`);
      const result = spawnSync(path.resolve(executablePath),[inputPath,outputPath,'3','2'],
        {encoding:'utf8',timeout:45000,env:{...process.env,OMP_NUM_THREADS:'1',GC_MARKERS:'1'}});
      fs.writeFileSync(path.join(directory,`case-${index}-block-${block}.log`),JSON.stringify(result)+'\n');
      if (result.status !== 0 || result.error) throw Error(`OMC driver failed: ${result.stderr} ${result.error ?? ''}`);
      controls = JSON.parse(result.stdout); times = controls.timesMs;
      if (!controls.readonlyInputs || !controls.repeatedOutputBitsEqual) throw Error('OMC repeated/input proof missing');
      const bytes = fs.readFileSync(outputPath);
      if (bytes.length !== (128*12+3)*8) throw Error('Wrong OMC output shape');
      const values = new Float64Array(bytes.length/8);
      for (let i=0; i<values.length; i++) values[i] = bytes.readDoubleLE(i*8);
      output = {nextPosition:values.slice(0,384),nextRotation:values.slice(384,1536),
        cost:values.slice(1536,1537),acceptedIterations:values.slice(1537,1538),pcgIterations:values.slice(1538)};
      omc.push(...times);
    } else {
      for (let i=0; i<2; i++) program.evaluate(0);
      const snapshot = Buffer.from(new Uint8Array(program.memory.buffer,a.y_offset,a.y_count*8));
      times = [];
      for (let i=0; i<3; i++) {
        const start = performance.now(); program.evaluate(0); times.push(performance.now()-start);
        if (!Buffer.from(program.memory.buffer,a.y_offset,a.y_count*8).equals(snapshot)) throw Error('WASM output changed');
      }
      output = Object.fromEntries(['nextPosition','nextRotation','cost','acceptedIterations','pcgIterations']
        .map(name => [name,program.output(name).slice()]));
      wasm.push(...times);
    }
    if (!inputs.every((view,i) => Buffer.from(view).equals(before[i]))) throw Error('WASM input mutation');
    const certified = certifyRun(test,name => output[name]);
    let maximumPoseDifference = 0;
    if (!reference) reference = output;
    for (const [name,width] of [['nextPosition',3],['nextRotation',9]])
      test.graph.poses.forEach((_,node) => {
        if (test.graph.active[node]) for (let k=0; k<width; k++) maximumPoseDifference = Math.max(maximumPoseDifference,
          Math.abs(reference[name][node*width+k]-output[name][node*width+k]));
      });
    if (!Number.isFinite(maximumPoseDifference) || maximumPoseDifference > 1e-7) throw Error('Cross-engine active pose mismatch');
    assertions.push({engine,block,maximumPoseDifference,...certified});
  }
  const native = statistics(omc), portable = statistics(wasm);
  results.push({name:test.name,inputSha256:sha(fs.readFileSync(inputPath)),omc:native,rumoca:portable,
    rumocaMillisecondsDividedByOmc:portable.medianMs/native.medianMs,assertions});
  console.log(JSON.stringify(results.at(-1)));
}
if (!fs.readFileSync(executablePath).equals(executable) || fs.readFileSync(sourcePath,'utf8') !== source
  || !fs.readFileSync(artifactPath).equals(artifactBytes)
  || proofFiles.some(file => sha(fs.readFileSync(file)) !== digests[file])) throw Error('Source/artifact changed');
const report = {status:'MATCHED_PGRUN_RUNTIME_PASS',recordedAt:new Date().toISOString(),
  scope:'Same Modelica PGRun and full128/256 runtime inputs. OMC native C versus Rumoca CPU WASM, not full SLAM or equivalent compiler targets. ABBA blocks, two warmups and three timed evaluations each. No compilation, I/O, fixture generation or oracle inside timed intervals.',
  nodeVersion:process.version,compiler:artifact.compiler,cpuModel:os.cpus()[0].model,loadAverage:os.loadavg(),
  cpuAffinity:fs.readFileSync('/proc/self/status','utf8').match(/^Cpus_allowed_list:\s*(.+)$/m)?.[1],
  sourceSha256:sha(source),artifactSha256:sha(artifactBytes),moduleSha256:sha(Uint8Array.from(artifact.module_bytes)),
  executableSha256:sha(executable),moduleBytes:artifact.module_bytes.length,executableBytes:executable.length,
  wasmMemoryBytes:program.memory.buffer.byteLength,proofSources:digests,results,fullSlamAccepted:false};
fs.writeFileSync(path.join(directory,'runtime-comparison.json'),JSON.stringify(report,null,2)+'\n');
