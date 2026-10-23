// Baseline export identity gate, never a candidate-policy acceptance result.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {readExport} from './slam-native-manifest.mjs';
const [exportRoot,manifestPath,binarySha256,output]=process.argv.slice(2);
if(!output||!/^[a-f0-9]{64}$/.test(binarySha256??''))throw Error('Usage: check-office-baseline-export.mjs EXPORT_ROOT CAPTURE_MANIFEST EXPECTED_BINARY_SHA NEW_OUTPUT');
await mkdir(output);const sha=b=>createHash('sha256').update(b).digest('hex');
const receipt={status:'running',binarySha256,mismatches:[],files:[],
 scope:'Exact baseline export comparison against the immutable captured 424 delivery. Not a changed-policy or office-loop result.'};
try{
 const manifestBytes=await readFile(manifestPath),manifest=JSON.parse(manifestBytes),expected=manifest.profiles['424x240'];
 const directory=join(exportRoot,'profiles','424x240'),profile=JSON.parse(await readFile(join(directory,'profile.json')));
 receipt.captureManifestSha256=sha(manifestBytes);receipt.exportProfile=profile;
 const requireEqual=(name,actual,wanted)=>{if(!isDeepStrictEqual(actual,wanted))receipt.mismatches.push({name,
   actualSha256:sha(JSON.stringify(actual)??'undefined'),expectedSha256:sha(JSON.stringify(wanted)??'undefined')});};
 requireEqual('binarySha256',profile.binarySha256,binarySha256);
 requireEqual('exporterRevision',profile.revision,'278475ff0d39f648f7b98c76abdc4da9a712ee62');
 requireEqual('modelicaRevision',profile.modelicaRevision,'3e04d9ed9b29888bdb61ee91167d71b38df81389');
 requireEqual('resetSha256',profile.resetSha256,'6e614cc25574c99a4c9659184c974b813f95fb954ff81399499a5a0ead6be4b1');
 requireEqual('baseSourceSha256',profile.baseSourceSha256,manifest.baseSourceSha256);
 requireEqual('profileSourceSha256',profile.sourceSha256,expected.sourceSha256);
 for(const [key,folder] of [['initialize','init-named'],['step','step-named']]){
  const wanted=expected.models[key],actual=await readExport(wanted.model,join(directory,folder));
  const {files,parameters,...layout}=wanted;
  requireEqual(key+'.layout',actual.layout,layout);
  const named=Object.keys(actual.files).map(file=>file.replace(/\.(wasm|bin)$/,'')).sort();
  requireEqual(key+'.fileSet',named,Object.keys(files).sort());
  for(const [name,bytes] of Object.entries(actual.files)){
   const field=name.replace(/\.(wasm|bin)$/,''),binding=files[field];
   const digest=sha(bytes);requireEqual(key+'.'+name+'.hash',digest,binding?.sha256);requireEqual(key+'.'+name+'.bytes',bytes.length,binding?.bytes);
   receipt.files.push({model:key,file:name,sha256:digest,bytes:bytes.length});
  }
 }
 receipt.status=receipt.mismatches.length?'failed':'pass';if(receipt.status!=='pass')process.exitCode=1;
}catch(error){receipt.status='failed';receipt.error=String(error);process.exitCode=1;}
finally{await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,mismatches:receipt.mismatches,error:receipt.error??null}));}
