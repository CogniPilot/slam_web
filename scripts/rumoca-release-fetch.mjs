// Fetch the pinned Rumoca parser package from a public, hash-pinned release asset, with no gh and no token.
// The asset is the exact CI artifact zip, so its sha256 covers every byte. Nothing is written until the whole
// download matches the pinned size and sha256, and zip entries may only land inside the destination directory.
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,isAbsolute,join,normalize,sep} from 'node:path';
import {inflateRawSync} from 'node:zlib';

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

/** Download URL into memory, refusing anything that is not exactly BYTES long with sha256 SHA. */
export async function fetchPinned(url,{bytes,sha256:expected},fetchImpl=fetch){
  // RUMOCA_RELEASE_TEST_ALLOW_HTTP=1 is for local tests only (a localhost server); the sha256 still guards the bytes.
  if(!/^https:\/\//.test(url)&&process.env.RUMOCA_RELEASE_TEST_ALLOW_HTTP!=='1')throw new Error(`Rumoca release URL must be https: ${url}`);
  const response=await fetchImpl(url,{redirect:'follow'});
  if(!response.ok)throw new Error(`Rumoca release download failed: HTTP ${response.status}`);
  const declared=Number(response.headers.get('content-length'));
  if(declared&&declared!==bytes)throw new Error(`Rumoca release size ${declared} differs from the pinned ${bytes}`);
  const chunks=[];let total=0;
  for await(const chunk of response.body){
    total+=chunk.length;
    if(total>bytes)throw new Error(`Rumoca release exceeds the pinned ${bytes} bytes`);
    chunks.push(chunk);
  }
  const data=Buffer.concat(chunks);
  if(data.length!==bytes)throw new Error(`Rumoca release is ${data.length} bytes, pinned ${bytes}`);
  if(sha256(data)!==expected)throw new Error('Rumoca release sha256 differs from the pin');
  return data;
}

/** Entries of a zip (stored or deflated; zip64 sizes and offsets supported), read from its central directory. */
export function readZip(data){
  let end=data.length-22;
  while(end>=0&&data.readUInt32LE(end)!==0x06054b50)end--;
  if(end<0)throw new Error('not a zip: no end of central directory');
  let count=data.readUInt16LE(end+10),offset=data.readUInt32LE(end+16);
  if(offset===0xffffffff||count===0xffff){
    const locator=end-20;
    if(data.readUInt32LE(locator)!==0x07064b50)throw new Error('zip64 locator missing');
    const z64=Number(data.readBigUInt64LE(locator+8));
    if(data.readUInt32LE(z64)!==0x06064b50)throw new Error('zip64 end record missing');
    count=Number(data.readBigUInt64LE(z64+32));offset=Number(data.readBigUInt64LE(z64+48));
  }
  const entries=[];
  for(let i=0,p=offset;i<count;i++){
    if(data.readUInt32LE(p)!==0x02014b50)throw new Error('bad central directory entry');
    const method=data.readUInt16LE(p+10),nameLength=data.readUInt16LE(p+28),extraLength=data.readUInt16LE(p+30);
    const commentLength=data.readUInt16LE(p+32);
    let compressed=data.readUInt32LE(p+20),size=data.readUInt32LE(p+24),local=data.readUInt32LE(p+42);
    const name=data.subarray(p+46,p+46+nameLength).toString('utf8');
    // zip64 extra field (id 1): only the fields saturated in the fixed header are present, in this order.
    for(let x=p+46+nameLength,stop=x+extraLength;x+4<=stop;){
      const id=data.readUInt16LE(x),length=data.readUInt16LE(x+2);
      if(id===1){
        let q=x+4;
        if(size===0xffffffff){size=Number(data.readBigUInt64LE(q));q+=8;}
        if(compressed===0xffffffff){compressed=Number(data.readBigUInt64LE(q));q+=8;}
        if(local===0xffffffff){local=Number(data.readBigUInt64LE(q));}
      }
      x+=4+length;
    }
    entries.push({name,method,compressed,size,local});
    p+=46+nameLength+extraLength+commentLength;
  }
  return entries.map(entry=>({...entry,read(){
    const h=entry.local;
    if(data.readUInt32LE(h)!==0x04034b50)throw new Error(`bad local header: ${entry.name}`);
    const start=h+30+data.readUInt16LE(h+26)+data.readUInt16LE(h+28);
    const raw=data.subarray(start,start+entry.compressed);
    const out=entry.method===0?Buffer.from(raw):entry.method===8?inflateRawSync(raw):null;
    if(!out)throw new Error(`unsupported zip method ${entry.method}: ${entry.name}`);
    if(out.length!==entry.size)throw new Error(`zip entry size mismatch: ${entry.name}`);
    return out;
  }}));
}

/** Extract the entries under PREFIX/ into DEST. Any absolute, parent-escaping or backslash path refuses the zip. */
export async function extractVariant(data,prefix,dest){
  const wanted=[];
  for(const entry of readZip(data)){
    const name=entry.name;
    if(isAbsolute(name)||name.includes('\\')||name.split('/').includes('..'))throw new Error(`unsafe zip path: ${name}`);
    if(name.startsWith(`${prefix}/`)&&!name.endsWith('/'))wanted.push(entry);
  }
  if(!wanted.length)throw new Error(`zip has no ${prefix}/ entries`);
  for(const entry of wanted){
    const target=normalize(join(dest,entry.name));
    if(!target.startsWith(normalize(dest)+sep))throw new Error(`zip path escapes the destination: ${entry.name}`);
    await mkdir(dirname(target),{recursive:true});
    await writeFile(target,entry.read());
  }
  return wanted.length;
}
