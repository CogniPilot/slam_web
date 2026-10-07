// Read-only target-layout diagnostic from the actual Rust producer's Solve wire.
// Never writes/reissues an owner, supplies defaults, or drives numerical execution.
import fs from 'node:fs';
const [problemFile, outputFile, profile='dense'] = process.argv.slice(2);
if (!problemFile || !outputFile) throw new Error('PROBLEM OUTPUT required');
if (!['dense','progression'].includes(profile)) throw new Error('PROFILE must be dense or progression');
const problem = JSON.parse(fs.readFileSync(problemFile,'utf8'), (key,value,context) =>
  typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value) ? context.source : value);
const continuous = problem.continuous;
let diagnostic;
for (const [node,source] of continuous.implicit_rhs.nodes.entries()) {
  const [kind,map] = Object.entries(source)[0];
  if (!map.domain) continue;
  const count = map.domain.binders.reduce((size,binder) =>
    size*Math.max(0,Math.floor((binder.upper-binder.lower)/binder.step)+1),1);
  if (!Number.isSafeInteger(count)) throw new Error('Diagnostic domain cannot be represented exactly');
  const targets = continuous.implicit_row_targets.slice(map.output_map.start,map.output_map.start+count)
    .map(target=>target?.Y?.index);
  if (targets.some(target=>!Number.isSafeInteger(target))) throw new Error('Diagnostic target is not a checked scalar Y index');
  const sorted = [...targets].sort((a,b)=>a-b);
  const stride=profile==='dense'?1:sorted.length>1?sorted[1]-sorted[0]:1;
  if (stride>0&&sorted.every((target,i)=>target===sorted[0]+i*stride)) continue;
  diagnostic = {scope:'Read-only diagnostic; unsafe integer literals retained as strings; canonical raw Rust wire is authoritative',
    profile,node,kind,count,domain:map.domain,outputMap:map.output_map,targets,
    baseOps:map.base_ops,loadStrides:map.load_strides,span:map.span};
  break;
}
if (!diagnostic) throw new Error('No noncontiguous affine target family found');
fs.writeFileSync(outputFile,JSON.stringify(diagnostic,null,2)+'\n');
console.log(JSON.stringify(diagnostic));
