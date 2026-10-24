import{readFile,writeFile,readdir}from'node:fs/promises';import{createReadStream}from'node:fs';import{resolve,join}from'node:path';import{createHash}from'node:crypto';
import{requireCompleteComparison}from'./office-compare-contract.mjs';
import{phaseBComparison,requireCompletePhaseBComparison}from'./office-phase-b-compare.mjs';
import{exact}from'./office-replay-contract.mjs';import{gunzipSync}from'node:zlib';
const root=resolve(process.argv[2]??'');if(!process.argv[2]||process.argv.length!==3)throw Error('Usage: seal-office-comparison.mjs OUTPUT');
const receipt=JSON.parse(await readFile(join(root,'comparison/receipt.json')));
// Phase B recomputes its mode from the restored capture, so the receipt cannot choose its own completion rule.
const mode=await phaseBComparison(join(root,'input/qualified/capture'));
if(mode)requireCompletePhaseBComparison(receipt,mode);else requireCompleteComparison(receipt);if(receipt.prefixQualified!==true)throw Error('Comparison prefix unqualified');
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const snapshot of receipt.snapshots){
 const stem=`epoch-${String(snapshot.epoch).padStart(4,'0')}-${snapshot.side}`;exact(snapshot.file,stem+'.bin.gz','Declared snapshot filename');
 const path=join(root,'comparison/capture/declared-state'),meta=JSON.parse(await readFile(join(path,stem+'.json')));exact(meta,snapshot,'Declared snapshot index');
 const compressed=await readFile(join(path,snapshot.file));exact(compressed.length,snapshot.bytes,'Snapshot compressed size');exact(sha(compressed),snapshot.sha256,'Snapshot compressed hash');
 const raw=gunzipSync(compressed,{maxOutputLength:32*1024**2});exact(raw.length,snapshot.rawBytes,'Snapshot raw size');exact(sha(raw),snapshot.rawSha256,'Snapshot raw hash');
}
const files=[];async function visit(path){for(const e of await readdir(path,{withFileTypes:true})){
 const file=join(path,e.name);if(e.isSymbolicLink())throw Error('Comparison evidence symlink');
 if(e.isDirectory())await visit(file);else if(e.isFile()&&![join(root,'SHA256SUMS'),join(root,'pipeline-status.json'),join(root,'seal.log')].includes(file))files.push(file);
}}
await visit(root);const lines=[];for(const file of files.sort()){
 const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);lines.push(h.digest('hex')+'  '+file.slice(root.length+1));
}
await writeFile(join(root,'SHA256SUMS'),lines.join('\n')+'\n');console.log(JSON.stringify({sealedFiles:files.length,prefixQualified:true,completedFrames:receipt.completedFrames,scope:'Complete collection; human late-edge/correction/alias review remains required.'}));
