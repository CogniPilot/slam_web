// CPU research only: select existing generated Modelica functions unchanged.
import * as compiler from '@cognipilot/rumoca';
import {readFile,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
const [stage,capacityText,output]=process.argv.slice(2),capacity=Number(capacityText);
if(!output||!['matching','graph'].includes(stage)||!Number.isInteger(capacity)||capacity<2||(stage==='graph'?capacity>128:capacity!==350))
  throw Error('Usage: compile-slam-kernel.mjs matching|graph GRAPH_CAPACITY_2_TO_128_OR_MATCHING_350 OUTPUT_PREFIX');
await compiler.default({module_or_path:await readFile(new URL('../node_modules/@cognipilot/rumoca/rumoca_bind_wasm_bg.wasm',import.meta.url))});
const path=stage==='graph'?'Optimization/ModelicaPoseGraph.mo':'Vision/Matching/RGBDFeatureMatching.mo';
const original=await readFile(new URL('../models/'+path,import.meta.url),'utf8');
// Matching retains all 350 allocated slots; profiling tests 100 and350 active.
// Graph capacity is within the source's explicit 128/256 gate.
const source=original+(stage==='graph'?`\nmodel ResearchGraph\n extends ModelicaPoseGraph(nodeCapacity=${capacity},edgeCapacity=${2*capacity});\nend ResearchGraph;\n`:'');
const start=performance.now();
const artifact=JSON.parse(compiler.prepare_native_program(source,stage==='graph'?'ResearchGraph':'RGBDFeatureMatching'));
await writeFile(output+'.mo',source);await writeFile(output+'.json',JSON.stringify(artifact));
console.log(JSON.stringify({stage,capacity,compileMs:performance.now()-start,profile:artifact.profile,error:artifact.error??null}));
if(artifact.error)process.exitCode=1;
