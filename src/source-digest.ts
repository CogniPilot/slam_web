/** Source/artifact identity shared by compiler and execution paths. */
export async function bytesDigest(bytes:Uint8Array<ArrayBuffer>){
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
}
export function sourceDigest(source:string){return bytesDigest(new TextEncoder().encode(source));}
