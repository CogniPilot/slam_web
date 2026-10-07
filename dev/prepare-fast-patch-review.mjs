// A complementary original-function proof; full160x90 admission stays separate.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const [directory]=process.argv.slice(2);
if(!directory)throw Error('Expected owned OUTPUT_DIRECTORY');
const sha=b=>createHash('sha256').update(b).digest('hex');
const original=fs.readFileSync('models/Vision/Features/FastNativeFrame.mo','utf8');
const fixtures=fs.readFileSync('dev/artifacts/fast-native-frame/independent-fixtures.json');
if(JSON.parse(fixtures).sourceSha256!==sha(original))throw Error('Independent fixture source changed');
const wrapper='\nmodel FastPatchNativeProbe\n  input Real gray[7,7] = fill(0.0,7,7);\n  output Real score;\nequation\n  score = FastPatchScore(gray);\nend FastPatchNativeProbe;\n';
const baseline=original+wrapper,needle='responses[1] := 0.0;';
if(original.split(needle).length!==2)throw Error('Expected exactly one editable score floor');
const edited=baseline.replace(needle,'responses[1] := 1.0;');
fs.mkdirSync(directory,{recursive:true});
for(const [name,value]of [['baseline.mo',baseline],['edited.mo',edited]])fs.writeFileSync(path.join(directory,name),value);
const report={schemaVersion:1,model:'FastPatchNativeProbe',originalSourceSha256:sha(original),fixtureSha256:sha(fixtures),
  sources:[{file:'baseline.mo',sha256:sha(baseline)},{file:'edited.mo',sha256:sha(edited)}],
  edit:{replace:needle,with:'responses[1] := 1.0;',meaning:'Raise the initial ordered maximum floor to one; positive independent scores18 and255 stay unchanged, all zero scores become one.'},
  scope:'Original FAST function, original7x7 patch and independent23 raw-bit cases. Complementary function proof only; no reduced fullframe substitute, full160x90 compilation still required.'};
fs.writeFileSync(path.join(directory,'source-identity.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
