export const LOOP_CLOSURE_PARAMETERS = [
  {key:'loopMinimumSimilarity',label:'Minimum appearance similarity',value:.35,min:0,max:1,step:.01,help:'Higher values require more similar visual-word histograms.'},
  {key:'loopMinimumAge',label:'Minimum revisit age (s)',value:5,min:0,max:1e6,step:.5,help:'Ignore recent keyframes when looking for a revisit.'},
  {key:'loopMaximumPoseInnovation',label:'Maximum loop motion disagreement (m)',value:2,min:.000001,max:1e6,step:.1,help:'Largest translation discrepancy allowed by the retained-pose consistency screen.'},
  {key:'loopPoseConsistencySquared',label:'Pose consistency gate (squared)',value:9,min:.000001,max:1e6,step:1,help:'Uncertainty-normalized gate for disagreement with the retained poses.'},
  {key:'loopPoseConsistency',label:'Check loop pose consistency',value:true,help:'Reject repeated-looking places when their relative motion disagrees with the estimator.'},
  {key:'loopMinimumInliers',label:'Minimum geometric inliers',value:12,min:3,max:350,step:1,help:'Minimum matched 3D points that agree with the fitted motion.'},
  {key:'loopMinimumFraction',label:'Minimum inlier fraction',value:.5,min:.001,max:1,step:.01,help:'Required share of descriptor matches supporting the motion.'},
  {key:'loopMaximumNormalizedSquared',label:'Calibrated residual gate (squared)',value:9,min:.000001,max:1e6,step:1,help:'Uncertainty-normalized geometric threshold used with calibrated residuals.'},
  {key:'loopCalibratedResiduals',label:'Use calibrated residuals',value:true,help:'Weight geometric errors by the RGB-D measurement uncertainty. Disable to use the metric distance and RMS limits.'},
  {key:'loopInlierDistance',label:'Metric inlier distance (m)',value:.08,min:.000001,max:10,step:.01,help:'Geometric threshold when calibrated residuals are disabled.'},
  {key:'loopMaximumRms',label:'Metric registration RMS limit (m)',value:.03,min:0,max:10,step:.005,help:'Error limit in metric mode; must not exceed the inlier distance.'},
  {key:'minimumInterval',label:'Minimum keyframe interval (s)',value:.5,min:.000001,max:1e4,step:.1,help:'Wait at least this long before capturing another keyframe.'},
  {key:'maximumInterval',label:'Maximum keyframe interval (s)',value:2,min:.000001,max:1e4,step:.1,help:'Request a keyframe after this interval when its observations qualify.'},
  {key:'translationThreshold',label:'Keyframe translation (m)',value:.6,min:0,max:1e4,step:.1,help:'Translation that can trigger a new keyframe.'},
  {key:'rotationThreshold',label:'Keyframe rotation (rad)',value:.25,min:0,max:Math.PI,step:.01,help:'Rotation that can trigger a new keyframe; 0.25 rad is about 14°.'},
] as const;
export type LoopClosureParameter=typeof LOOP_CLOSURE_PARAMETERS[number]['key'];
type BooleanParameter='loopCalibratedResiduals'|'loopPoseConsistency';
export type LoopClosureSettings=Record<Exclude<LoopClosureParameter,BooleanParameter>,number>&Record<BooleanParameter,boolean>;
export const DEFAULT_LOOP_CLOSURE_SETTINGS:Readonly<LoopClosureSettings>=Object.freeze(
  Object.fromEntries(LOOP_CLOSURE_PARAMETERS.map(field=>[field.key,field.value])) as LoopClosureSettings);

export function checkedLoopClosureSettings(value:unknown=undefined):LoopClosureSettings {
  if(value!==undefined&&(!value||typeof value!=='object'||Array.isArray(value)))throw Error('Invalid loop-closure settings');
  const input=(value??{}) as Record<string,unknown>;
  for(const key of Object.keys(input))if(!LOOP_CLOSURE_PARAMETERS.some(field=>field.key===key))throw Error(`Unknown loop-closure parameter: ${key}`);
  const settings={...DEFAULT_LOOP_CLOSURE_SETTINGS,...input} as LoopClosureSettings;
  for(const field of LOOP_CLOSURE_PARAMETERS){
    if(field.key==='loopCalibratedResiduals'||field.key==='loopPoseConsistency'){
      if(typeof settings[field.key]!=='boolean')throw Error(`${field.label} must be true or false`);
      continue;
    }
    const n=settings[field.key];
    if(typeof n!=='number'||!Number.isFinite(n)||n<field.min||n>field.max||field.key==='loopMinimumInliers'&&!Number.isInteger(n))
      throw Error(`${field.label} must be ${field.min}–${field.max}${field.key==='loopMinimumInliers'?' (a whole number)':''}`);
  }
  if(settings.loopMaximumRms>settings.loopInlierDistance)throw Error('Maximum registration RMS must not exceed the inlier distance');
  if(settings.maximumInterval<settings.minimumInterval)throw Error('Maximum keyframe interval must be at least the minimum interval');
  return settings;
}

export function defaultLoopClosureSettings(settings:LoopClosureSettings){
  return LOOP_CLOSURE_PARAMETERS.every(field=>settings[field.key]===field.value);
}
