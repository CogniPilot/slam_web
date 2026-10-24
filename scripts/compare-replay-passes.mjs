// Pass-2 gate: native outputs must be identical to pass 1 for all 1251 frames before any pass-2 snapshot is used.
// Usage: node compare-replay-passes.mjs PASS1_CAPTURE PASS2_CAPTURE NEW_OUTPUT
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {createHash} from 'node:crypto';
const digest=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const canon=v=>Array.isArray(v)?'['+v.map(canon).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}':JSON.stringify(v);
const [a,b,out]=process.argv.slice(2);if(!out)throw Error('Usage: compare-replay-passes.mjs PASS1 PASS2 NEW_OUTPUT');await mkdir(out);
const list=async d=>(await readdir(join(d,'frames'))).filter(n=>/^\d{4}\.json$/.test(n)).sort();
const [na,nb]=await Promise.all([list(a),list(b)]);
const receipt={check:'phase-b-pass-equality',compares:'every top-level frame field (identical field sets) plus raw RGB and depth bytes; only nativeTrace.comparisonDeclaredOutputs is excluded',frames:na.length,firstDifference:null,status:'pass'};
if(na.length!==1251||nb.length!==1251||na.join()!==nb.join())receipt.status='refused',receipt.firstDifference='frame set';
else for(const n of na){
  const [fa,fb]=await Promise.all([a,b].map(async d=>JSON.parse(await readFile(join(d,'frames',n),'utf8'))));
  // Compare everything the estimator produced; snapshot-plan fields are the only permitted addition in pass 2.
  // Inputs (Vale r4 review): the command and image metadata in the frame record, and the raw RGB and depth bytes.
  const stem=n.slice(0,4);
  for(const kind of ['rgb','depth']){
    const [ha,hb]=await Promise.all([a,b].map(d=>digest(join(d,'frames',`${stem}-${kind}.bin`))));
    if(ha!==hb){receipt.status='refused';receipt.firstDifference={frame:n,field:kind+' image bytes'};break;}
  }
  if(receipt.status!=='pass')break;
  // Every top-level field is compared (Vale r6 review: 'image' and 'index' were missing); the field sets must be identical too.
  const keys=Object.keys(fa).sort();
  if(keys.join()!==Object.keys(fb).sort().join()){receipt.status='refused';receipt.firstDifference={frame:n,field:'field set'};break;}
  for(const k of keys){
    const x=k==='nativeTrace'?{...fa[k],comparisonDeclaredOutputs:undefined}:fa[k],y=k==='nativeTrace'?{...fb[k],comparisonDeclaredOutputs:undefined}:fb[k];
    if(canon(x)!==canon(y)){receipt.status='refused';receipt.firstDifference={frame:n,field:k};break;}
  }
  if(receipt.status!=='pass')break;
}
await writeFile(join(out,'pass-equality-receipt.json'),JSON.stringify(receipt,null,1)+'\n',{flag:'wx'});
console.log(JSON.stringify(receipt));if(receipt.status!=='pass')process.exitCode=2;
