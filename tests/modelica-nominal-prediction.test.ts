import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import init,* as rumoca from '@cognipilot/rumoca';

type Quaternion=[number,number,number,number];
type Matrix=number[][];
const quaternionMultiply=(a:Quaternion,b:Quaternion):Quaternion=>[
  a[0]*b[0]-a[1]*b[1]-a[2]*b[2]-a[3]*b[3],
  a[0]*b[1]+a[1]*b[0]+a[2]*b[3]-a[3]*b[2],
  a[0]*b[2]-a[1]*b[3]+a[2]*b[0]+a[3]*b[1],
  a[0]*b[3]+a[1]*b[2]-a[2]*b[1]+a[3]*b[0]
];
function quaternionIncrement(omega:number[],h:number):Quaternion {
  const norm=Math.hypot(...omega),angle=norm*h*.5;
  const scale=norm===0?h*.5:Math.sin(angle)/norm;
  return [Math.cos(angle),omega[0]*scale,omega[1]*scale,omega[2]*scale];
}
function rotation(q:Quaternion):Matrix {
  const [w,x,y,z]=q;
  return [[1-2*(y*y+z*z),2*(x*y-w*z),2*(x*z+w*y)],
    [2*(x*y+w*z),1-2*(x*x+z*z),2*(y*z-w*x)],
    [2*(x*z-w*y),2*(y*z+w*x),1-2*(x*x+y*y)]];
}
const apply=(r:Matrix,v:number[])=>r.map(row=>row.reduce((sum,value,i)=>sum+value*v[i],0));

// Quaternion composition provides an independent rotation oracle rather than
// repeating the Modelica Rodrigues matrix construction.
it('Modelica nominal prediction preserves held-IMU motion, bias correction, and rejected-step recovery',async()=>{
  await init({module_or_path:readFileSync('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm')});
  const source=readFileSync('models/Estimation/Inertial/ES15NominalPrediction.mo','utf8');
  const session=rumoca.WasmSimulationSession.withInteractiveOptions(source,'ES15NominalPrediction',.1,'rk-like',1e-10,1e-10,'[]');
  let time=0;
  const position=[1.4,-.8,2.3],velocity=[.7,-.2,.4],gravity=[0,0,-9.81];
  const accelBias=[.13,-.07,.04],gyroBias=[.03,-.02,.01];
  const evaluate=(q:Quaternion,force:number[],omega:number[],h:number)=>{
    const inputs:[string,number][]=[['h',h]];
    rotation(q).forEach((row,i)=>row.forEach((v,j)=>inputs.push([`rotation[${i+1},${j+1}]`,v])));
    const vectors={position,velocity,gravity,accel_bias:accelBias,gyro_bias:gyroBias,
      accel:force.map((v,i)=>v+accelBias[i]),gyro:omega.map((v,i)=>v+gyroBias[i])};
    for(const [name,values] of Object.entries(vectors))values.forEach((v,i)=>inputs.push([`${name}[${i+1}]`,v]));
    session.set_inputs(JSON.stringify(inputs));session.advance_to(time+=.1);
    const values=JSON.parse(session.state_json()).values;
    const vector=(name:string)=>[1,2,3].map(i=>values[`${name}[${i}]`]);
    const matrix=(name:string)=>[1,2,3].map(i=>[1,2,3].map(j=>values[`${name}[${i},${j}]`]));
    return {valid:values.valid,position:vector('next_position'),velocity:vector('next_velocity'),
      force:vector('force'),omega:vector('omega'),rotation:matrix('next_rotation')};
  };
  const compare=(actual:number[],expected:number[],tolerance=3e-12)=>{
    expect(actual.length).toBe(expected.length);
    actual.forEach((v,i)=>{expect(Number.isFinite(v)).toBe(true);expect(Math.abs(v-expected[i])).toBeLessThan(tolerance);});
  };
  try {
    const cases=[
      {q:[1,0,0,0] as Quaternion,force:[0,0,9.81],omega:[0,0,0],h:1/90},
      {q:quaternionIncrement([.31,-.44,.7],1),force:[1.3,-2.1,8.6],omega:[.4,-.3,.8],h:1/90},
      {q:quaternionIncrement([-.9,.6,.2],1),force:[-2.4,.7,10.2],omega:[1e-9,-2e-9,3e-9],h:.02},
      {q:quaternionIncrement([.5,.3,-.7],1),force:[.3,-.9,9.3],omega:[4,-2,1],h:.02},
      {q:quaternionIncrement([.1,-.2,.3],1),force:[2,1,8],omega:[2,1,-1],h:.00001}
    ];
    for(const fixture of cases){
      const {q,force,omega,h}=fixture,result=evaluate(q,force,omega,h);
      const middle=rotation(quaternionMultiply(q,quaternionIncrement(omega,h*.5)));
      const acceleration=apply(middle,force).map((v,i)=>v+gravity[i]);
      expect(result.valid).toBe(1);compare(result.force,force);compare(result.omega,omega);
      compare(result.rotation.flat(),rotation(quaternionMultiply(q,quaternionIncrement(omega,h))).flat());
      compare(result.position,position.map((v,i)=>v+velocity[i]*h+.5*acceleration[i]*h*h));
      compare(result.velocity,velocity.map((v,i)=>v+acceleration[i]*h));
    }
    const q=quaternionIncrement([.4,-.7,.2],1),r=rotation(q);
    // Gravity expressed in body coordinates makes a tilted, stationary body
    // stationary in the map frame after bias removal.
    const stationaryForce=r[0].map((_,j)=>9.81*r[2][j]);
    const stationary=evaluate(q,stationaryForce,[0,0,0],1/90);
    compare(stationary.velocity,velocity);compare(stationary.position,position.map((v,i)=>v+velocity[i]/90));
    for(const {h,omega} of [{h:0,omega:[0,0,0]},{h:-.01,omega:[0,0,0]},
      {h:.021,omega:[0,0,0]},{h:.02,omega:[7,0,0]}]){
      const rejected=evaluate(q,[1,2,9.81],omega,h);expect(rejected.valid).toBe(0);
      compare(rejected.position,position);compare(rejected.velocity,velocity);compare(rejected.rotation.flat(),r.flat());
    }
    const recovered=evaluate([1,0,0,0],[0,0,9.81],[0,0,0],1/90);
    expect(recovered.valid).toBe(1);compare(recovered.velocity,velocity);
  } finally {session.free();}
},60_000);
