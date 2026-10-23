import{readFile,readdir,writeFile}from'node:fs/promises';import{createReadStream}from'node:fs';import{resolve,join}from'node:path';import{createHash}from'node:crypto';
import{requireCompleteReplay,exact}from'./office-replay-contract.mjs';
const root=resolve(process.argv[2]??'');if(!process.argv[2]||process.argv.length!==3)throw Error('Usage: seal-office-replay.mjs OUTPUT');
const receipt=JSON.parse(await readFile(join(root,'replay/receipt.json'),'utf8'));requireCompleteReplay(receipt);
if(receipt.qualified!==true)throw Error('Replay state snapshots remain unqualified');
for(const snapshot of receipt.snapshots){
 const expected=`epoch-${String(snapshot.epoch).padStart(4,'0')}-${snapshot.side}.bin.gz`;
 exact(snapshot.file,expected,'Snapshot filename');
 const bytes=await readFile(join(root,'replay/snapshots',expected));
 exact(createHash('sha256').update(bytes).digest('hex'),snapshot.sha256,'Snapshot compressed hash');
 exact(bytes.length,snapshot.bytes,'Snapshot compressed byte count');
}
const files=[];
async function visit(path){for(const entry of await readdir(path,{withFileTypes:true})){
 const file=join(path,entry.name);if(entry.isSymbolicLink())throw Error('Replay evidence symlink refused');
 if(entry.isDirectory())await visit(file);else if(entry.isFile()&&![join(root,'SHA256SUMS'),join(root,'pipeline-status.json'),join(root,'seal.log')].includes(file))files.push(file);
}}
await visit(root);const lines=[];for(const file of files.sort()){
 const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);lines.push(h.digest('hex')+'  '+file.slice(root.length+1));
}
await writeFile(join(root,'SHA256SUMS'),lines.join('\n')+'\n');console.log(JSON.stringify({sealedFiles:files.length,verifiedFrames:receipt.verifiedFrames,qualified:true}));
