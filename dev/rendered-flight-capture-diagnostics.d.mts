export const captureFailureFields:readonly string[];
export interface CaptureFailureReceipt {
  epoch:number;
  stages:Record<string,number>;
  executed:string[];
  refusedAt:'frame'|'binding'|'policy'|'policyHold'|'graphCapture'|'mapping'|null;
}
export function parseCaptureFailureTrace(trace:string):CaptureFailureReceipt[];
