// A future browser adapter must drive the complete editable Modelica backend
// from RGB-D/body IMU observations, never truth poses or fixture loop edges.
// Keeping an explicit refusal prevents a propagation-only backend from being
// reported as passing full tracking, mapping or loop closure acceptance.
export async function fullModelicaScenario(name:string):Promise<any>{
  throw new Error(`Full Modelica sensor-only scenario adapter is pending: ${name}`);
}
export const graphLandmarks=Array.from({length:24},(_,i)=>[[-.8,-.2,.4,.9][i%4],[-.7,.1,.8][Math.floor(i/4)%3],[-.3,.4][Math.floor(i/12)]]);
export function closedPoseFixture(count:number){return Array.from({length:count},(_,i)=>{const phase=2*Math.PI*i/(count-1);return {position:[Math.sin(phase),1-Math.cos(phase),.2*Math.sin(2*phase)],rotationVector:[.04*Math.sin(phase),.05*Math.sin(2*phase),.15*Math.sin(phase)],positionDrift:[.035*i,.02*i,0],yawDrift:.015*i};});}
export const noiseIntegralFixture={duration:2,accelerationNoise:.2,accelerationBiasNoise:.03,positionVariance:.2**2*2**3/3+.03**2*2**5/20,velocityVariance:.2**2*2+.03**2*2**3/3,crossVariance:.2**2*2**2/2+.03**2*2**4/8};
