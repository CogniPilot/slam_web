import {it,expect} from 'vitest';
import {parseCaptureFailureTrace} from '../dev/rendered-flight-capture-diagnostics.mjs';

// Handcrafted trace controls; unexecuted zero padding is not acceptance.
const policyHold=[1,0,1,0,5,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1];
const graphFailure=[1,0,1,1,0,0,4,0,6,4,21,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1];
const mapFailure=[1,0,1,1,0,1,0,0,0,0,21,19,1,1,19,0,0,5,4,0,0,4,0,0,0,1];
const receipt=(values:number[],epoch='76')=>'RENDERED_FLIGHT_CAPTURE_FAILURE epoch='+epoch+' stages='+values.join(',');

it('distinguishes graph refusal from a later map refusal and a policy hold',()=>{
  expect(parseCaptureFailureTrace(receipt(graphFailure))[0]).toMatchObject({epoch:76,refusedAt:'graphCapture',
    executed:['frame','binding','policy','graphCapture']});
  expect(parseCaptureFailureTrace(receipt(mapFailure))[0]).toMatchObject({refusedAt:'mapping',
    executed:['frame','binding','policy','graphCapture','projection','mapping'],stages:{mappingReason:5,updateReason:4}});
  expect(parseCaptureFailureTrace(receipt(policyHold))[0]).toMatchObject({refusedAt:'policyHold',executed:['frame','binding','policy']});
  expect(parseCaptureFailureTrace('RENDERED_FLIGHT_REPLAY_END observations=45 captures=45\n')).toEqual([]);
});

it('keeps binding refusal distinct from an executed policy or map stage',()=>{
  const values=[...policyHold];values[2]=values[4]=values[25]=0;
  expect(parseCaptureFailureTrace(receipt(values))[0]).toMatchObject({refusedAt:'binding',executed:['frame','binding']});
  values[0]=0;values[1]=2;
  expect(parseCaptureFailureTrace(receipt(values))[0]).toMatchObject({refusedAt:'frame',executed:['frame']});
});

it('rejects truncated, duplicate, nonfinite, fractional and stale successful stages',()=>{
  expect(()=>parseCaptureFailureTrace(receipt(mapFailure.slice(0,12)))).toThrow('inventory');
  expect(()=>parseCaptureFailureTrace(receipt(graphFailure)+'\n'+receipt(graphFailure))).toThrow('first');
  for(const value of [NaN,Infinity,-1,.5]){
    const values=[...mapFailure];values[10]=value;
    expect(()=>parseCaptureFailureTrace(receipt(values))).toThrow();
  }
  const stale=[...graphFailure];stale[12]=1;
  expect(()=>parseCaptureFailureTrace(receipt(stale))).toThrow('Unexecuted');
  const inconsistent=[...mapFailure];inconsistent[16]=1;
  expect(()=>parseCaptureFailureTrace(receipt(inconsistent))).toThrow('refusal reason');
});
