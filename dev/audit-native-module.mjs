// Static audit of an existing issued module; no compilation or execution.
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
process.on('uncaughtException', error => { console.error(error.message); process.exitCode = 1; });
const require = createRequire(import.meta.url);
const wabt = await require('wabt')();
const [artifactFile, reviewFile, reportFile] = process.argv.slice(2);
if (!reportFile) throw new Error('Expected ARTIFACT PINNED_REVIEW OUTPUT_REPORT');
const review = JSON.parse(readFileSync(reviewFile));
const bytes = new Uint8Array(review.moduleBytes);
let prefix = '', carry = '', position = 0, found = false, ended = false;
const before = performance.now();
for await (const chunk of createReadStream(artifactFile, {highWaterMark:65536})) {
  let text = chunk.toString('utf8');
  if (!found) {
    prefix += text;
    const marker = '"module_bytes":[';
    const start = prefix.indexOf(marker);
    if (start < 0) {
      if (prefix.length > 65536) throw new Error('module byte field missing from bounded prefix');
      continue;
    }
    text = prefix.slice(start + marker.length); prefix = ''; found = true;
  }
  text = carry + text;
  const end = text.indexOf(']');
  if (end >= 0) { text = text.slice(0,end) + ']'; ended = true; }
  let last = 0;
  for (const match of text.matchAll(/(\d+)([,\]])/g)) {
    const byte = Number(match[1]);
    if (byte > 255 || position >= bytes.length) throw new Error('invalid byte extent');
    bytes[position++] = byte; last = match.index + match[0].length;
  }
  carry = text.slice(last);
  if (ended) break;
}
if (!ended || position !== bytes.length || carry !== '') throw new Error('incomplete byte field');
const sha256 = createHash('sha256').update(bytes).digest('hex');
if (sha256 !== review.moduleSha256) throw new Error('issued module digest mismatch');
const module = wabt.readWasm(bytes,{readDebugNames:false,bulk_memory:true,multi_memory:true});
const wat = module.toText({foldExprs:false,inlineExport:false});
const bodies = [];
let current = null, previous = [], recent = [], controls = [], firstEightByteCopyContext = null;
for (const line of wat.split('\n')) {
  const text = line.trim();
  if (text.startsWith('(func ')) {
    current = {index:bodies.length,loops:0,memoryCopies:0,eightByteCopiesWithinLoops:0,staticCopyWidths:{},oneExtentI32Comparisons:0,oneExtentI64Comparisons:0};
    bodies.push(current); previous=[]; recent=[]; controls=[];
  }
  if (!current) continue;
  if (/^loop(?:\s|$)/.test(text)) current.loops++;
  if (/^(block|loop|if)(?:\s|$)/.test(text)) controls.push(text.split(/\s/)[0]);
  if (/^end(?:\s|$|\))/.test(text)) controls.pop();
  if (/^memory\.copy(?:\s|$)/.test(text)) {
    current.memoryCopies++;
    const width = /^i32\.const (\d+)$/.exec(previous.at(-1) ?? '');
    if (width) current.staticCopyWidths[width[1]] = (current.staticCopyWidths[width[1]] ?? 0) + 1;
    if (width?.[1] === '8') {
      if (controls.includes('loop')) current.eightByteCopiesWithinLoops++;
      if (!firstEightByteCopyContext) firstEightByteCopyContext = {functionIndex:current.index,loopDepth:controls.filter(c=>c==='loop').length,instructions:[...recent,text]};
    }
  }
  // A nearby loop and const1/GeU/BrIf identify a one-extent guard candidate,
  // not a proof that every such guard is emitted by a particular source helper.
  if (text.startsWith('br_if ') && recent.some(x=>x.startsWith('loop '))) {
    if (previous.at(-1)==='i32.ge_u' && previous.at(-2)==='i32.const 1') current.oneExtentI32Comparisons++;
    if (previous.at(-1)==='i64.ge_u' && previous.at(-2)==='i64.const 1') current.oneExtentI64Comparisons++;
  }
  if (text && !text.startsWith('(;')) { previous.push(text); recent.push(text); if(previous.length>3)previous.shift(); if(recent.length>12)recent.shift(); }
}
module.destroy();
const totals = bodies.reduce((a,b)=>{
  for(const key of ['loops','memoryCopies','eightByteCopiesWithinLoops','oneExtentI32Comparisons','oneExtentI64Comparisons'])a[key]+=b[key];
  for(const [width,count] of Object.entries(b.staticCopyWidths))a.staticCopyWidths[width]=(a.staticCopyWidths[width]??0)+count;
  return a;
},{loops:0,memoryCopies:0,eightByteCopiesWithinLoops:0,oneExtentI32Comparisons:0,oneExtentI64Comparisons:0,staticCopyWidths:{}});
writeFileSync(reportFile,JSON.stringify({
  status:'EXISTING_PRODUCTION_MODULE_STATIC_AUDIT',moduleSha256:sha256,moduleBytes:bytes.length,
  functionBodies:bodies.length,totals,firstEightByteCopyContext,bodies,
  elapsedMs:performance.now()-before,peakRssKiB:process.resourceUsage().maxRSS,
  scope:'Static operator counts, not dynamic execution counts or timings. One-extent guards are candidates identified from local instruction context. No WASM compilation, validation, numerical execution or compiler build.',
},null,2)+'\n');
