// Import the exact reviewed commit object; never mint a new identity/message.
import{execFileSync}from'node:child_process';import{readFile,mkdir}from'node:fs/promises';
import{join,resolve}from'node:path';import{createHash}from'node:crypto';
const[repository,output]=process.argv.slice(2);if(!output||process.argv.length!==4)throw Error('Usage: prepare-office-canonical.mjs BASE_REPOSITORY NEW_OUTPUT');
const base='3e04d9ed9b29888bdb61ee91167d71b38df81389',commit='34c26cb4b3ad6f16a072582115acc68d35178d1f',tree='2fbaf4097235a7b27ba007eabe1f98150320f2ae';
const root=resolve(output);await mkdir(root);
const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
execFileSync('git',['clone','--shared','--no-checkout',resolve(repository),root],{stdio:'inherit'});
git('checkout','--detach',base);
execFileSync('git',['-C',root,'apply','--index',resolve('scripts/office-anchor-source.patch')]);
if(git('write-tree')!==tree)throw Error('Canonical source tree mismatch');
const raw=await readFile('scripts/office-anchor-commit.txt'),id=createHash('sha1').update(Buffer.concat([Buffer.from('commit '+raw.length+'\0'),raw])).digest('hex');
if(id!==commit)throw Error('Reviewed canonical commit bytes differ');
const header=raw.toString('utf8').split('\n\n')[0];
if(!header.startsWith('tree '+tree+'\nparent '+base+'\n')||header.split('\n').filter(x=>x.startsWith('parent ')).length!==1)throw Error('Canonical parent/tree mismatch');
const imported=execFileSync('git',['-C',root,'hash-object','-t','commit','-w','--stdin'],{input:raw,encoding:'utf8'}).trim();
if(imported!==commit)throw Error('Imported canonical object differs');
git('checkout','--detach',commit);if(git('status','--porcelain'))throw Error('Canonical source is not clean');
console.log(JSON.stringify({commit,tree,parent:base,scope:'Imported existing independently reviewed source object, no new commit minted.'}));
