import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(process.argv[2]??resolve(homedir(),'scratch/slam_web/tmp/rgbd-keyframe-retrieval-source'));
mkdirSync(output,{recursive:true});
const names=['models/Estimation/Localization/RGBDRegistrationUncertainty.mo','models/LoopClosure/RGBDKeyframes.mo','models/LoopClosure/RGBDBagOfWords.mo',
  'models/LoopClosure/RGBDKeyframeRetrieval.mo','tests/compiler-probes/fixtures/components/RGBDKeyframeRetrievalStep.mo'];
const sha=source=>createHash('sha256').update(source).digest('hex');
const files=names.map(name=>({path:name,source:readFileSync(resolve(app,name),'utf8')}));
const source=files.map(file=>file.source).join('\n');
writeFileSync(resolve(output,'source.mo'),source);
writeFileSync(resolve(output,'source-manifest.json'),JSON.stringify({model:'RGBDKeyframeRetrievalStep',
  sourceSha256:sha(source),sources:files.map(file=>({path:file.path,sha256:sha(file.source)})),
  scope:'Full catalog-bound appearance query and prepared capture; no geometric constraint admission',
  compiled:false,browserIntegrated:false,fullSlam:false},null,2)+'\n');
console.log(JSON.stringify({directory:output,model:'RGBDKeyframeRetrievalStep',sourceSha256:sha(source)}));
