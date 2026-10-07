// Reference trace decoding only. Numerical owners remain Modelica functions.
export const captureFailureFields=Object.freeze([
  'frameAccepted','frameReason','policyValid','captureRequested','policyReason','captureAccepted','captureReason',
  'retrievalReason','sequentialReason','graphReason','sequentialMatches','sequentialInliers',
  'projectionConfigurationValid','projectionPoseValid','projectedCandidates','invalidProjectedCandidates',
  'mappingAccepted','mappingReason','catalogUpdateReason','catalogReason','correctionReason',
  'updateReason','mapReason','anchorReason','invalidMapCandidates','frameBound'
]);

export function parseCaptureFailureTrace(trace){
  const lines=trace.split(/\r?\n/).filter(line=>line.startsWith('RENDERED_FLIGHT_CAPTURE_FAILURE'));
  if(lines.length>1)throw Error('Expected only the first capture failure receipt');
  return lines.map(line=>{
    const match=line.match(/^RENDERED_FLIGHT_CAPTURE_FAILURE epoch=(\d+) stages=(.*)$/);
    if(!match)throw Error('Malformed capture failure receipt');
    const epoch=Number(match[1]),cells=match[2].split(',');
    if(!Number.isSafeInteger(epoch)||cells.length!==captureFailureFields.length
      ||cells.some(cell=>!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(cell)))
      throw Error('Malformed capture failure epoch or stage inventory');
    const values=cells.map(Number);
    if(values.some(value=>!Number.isSafeInteger(value)||value<0))throw Error('Invalid capture failure stage value');
    const stages=Object.fromEntries(captureFailureFields.map((field,index)=>[field,values[index]]));
    for(const name of ['frameAccepted','policyValid','captureRequested','captureAccepted',
      'projectionConfigurationValid','projectionPoseValid','mappingAccepted','frameBound'])
      if(stages[name]!==0&&stages[name]!==1)throw Error('Invalid capture failure flag: '+name);
    if(stages.frameBound>stages.frameAccepted||stages.captureRequested>stages.policyValid)
      throw Error('Capture failure receipt violates admission prerequisites');
    const zero=(start,end)=>values.slice(start,end).every(value=>value===0);
    if(!stages.frameBound&&!zero(2,25)
      ||!stages.captureRequested&&!zero(5,25)
      ||!stages.captureAccepted&&!zero(12,25))
      throw Error('Unexecuted capture failure stages must remain zero');
    for(const [accepted,reason] of [['frameAccepted','frameReason'],['captureRequested','policyReason'],
      ['captureAccepted','captureReason'],['mappingAccepted','mappingReason']])
      if(stages[accepted]===1&&stages[reason]!==0)throw Error('Accepted capture failure stage has a refusal reason');
    const executed=['frame'];
    if(stages.frameAccepted)executed.push('binding');
    if(stages.frameBound)executed.push('policy');
    if(stages.captureRequested)executed.push('graphCapture');
    if(stages.captureAccepted)executed.push('projection','mapping');
    const refusedAt=!stages.frameAccepted?'frame':!stages.frameBound?'binding':!stages.policyValid?'policy'
      :!stages.captureRequested?'policyHold':!stages.captureAccepted?'graphCapture'
      :!stages.mappingAccepted?'mapping':null;
    return {epoch,stages,executed,refusedAt};
  });
}
